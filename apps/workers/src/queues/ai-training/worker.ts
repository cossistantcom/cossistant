import {
	getAiAgentById,
	updateAiAgentTrainingStatus,
} from "@api/db/queries/ai-agent";
import { listKnowledgeForTraining } from "@api/db/queries/knowledge";
import { chunk as chunkTable } from "@api/db/schema/chunk";
import { generateEmbeddings } from "@api/lib/embedding-client";
import { generateULID } from "@api/utils/db/ids";
import {
	chunkText,
	extractTextFromKnowledgePayload,
	generateChunkMetadata,
} from "@api/utils/text-chunker";
import { type AiTrainingJobData, QUEUE_NAMES } from "@plasma/jobs";
import type { RedisOptions } from "@plasma/redis";
import { db } from "@workers/db";
import { emitToWebsite } from "@workers/realtime";
import { type Job, Worker } from "bullmq";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

// Batch size for embedding generation (to avoid hitting API limits)
const EMBEDDING_BATCH_SIZE = 20;

const WORKER_CONFIG = {
	concurrency: 1,
	lockDuration: 600_000,
	stalledInterval: 30_000,
	maxStalledCount: 2,
};

type WorkerConfig = {
	connectionOptions: RedisOptions;
	redisUrl: string;
};

export function createAiTrainingWorker({
	connectionOptions,
	redisUrl,
}: WorkerConfig) {
	const queueName = QUEUE_NAMES.AI_TRAINING;
	let worker: Worker<AiTrainingJobData> | null = null;

	return {
		start: async () => {
			console.log(`[ai-training] Starting worker for queue: ${queueName}`);

			const buildConnectionOptions = (): RedisOptions => ({
				...connectionOptions,
				tls: connectionOptions.tls ? { ...connectionOptions.tls } : undefined,
			});

			worker = new Worker<AiTrainingJobData>(
				queueName,
				async (job: Job<AiTrainingJobData>) => {
					await processTrainingJob(job);
				},
				{
					connection: buildConnectionOptions(),
					concurrency: WORKER_CONFIG.concurrency, // Only one training job at a time
					lockDuration: WORKER_CONFIG.lockDuration,
					stalledInterval: WORKER_CONFIG.stalledInterval,
					maxStalledCount: WORKER_CONFIG.maxStalledCount,
				}
			);

			worker.on("completed", (job) => {
				console.log(`[ai-training] Job ${job.id} completed`);
			});

			worker.on("failed", (job, error) => {
				console.error(`[ai-training] Job ${job?.id} failed:`, error);
			});

			await worker.waitUntilReady();
			console.log("[ai-training] Worker ready");
		},
		stop: async () => {
			if (worker) {
				await worker.close();
				worker = null;
			}
			console.log("[ai-training] Worker stopped");
		},
	};
}

async function processTrainingJob(job: Job<AiTrainingJobData>): Promise<void> {
	const { websiteId, organizationId, aiAgentId } = job.data;
	const startTime = Date.now();

	console.log(
		`[ai-training] Processing training job for AI agent ${aiAgentId}`
	);

	try {
		// Verify AI agent exists
		const agent = await getAiAgentById(db, { aiAgentId });
		if (!agent) {
			throw new Error(`AI agent ${aiAgentId} not found`);
		}

		// Update status to training
		await updateAiAgentTrainingStatus(db, {
			aiAgentId,
			trainingStatus: "training",
			trainingProgress: 0,
			trainingStartedAt: new Date().toISOString(),
			trainingError: null,
		});

		// Emit training started event
		await emitToWebsite(websiteId, "trainingStarted", {
			websiteId,
			organizationId,
			visitorId: null,
			userId: job.data.triggeredBy,
			aiAgentId,
			totalItems: 0, // Will update after fetching
		});

		// Fetch all knowledge items for training
		const knowledgeItems = await listKnowledgeForTraining(db, { websiteId });
		const totalItems = knowledgeItems.length;

		console.log(`[ai-training] Found ${totalItems} knowledge items to process`);

		if (totalItems === 0) {
			// No items to train, complete immediately
			await updateAiAgentTrainingStatus(db, {
				aiAgentId,
				trainingStatus: "completed",
				trainingProgress: 100,
				trainedItemsCount: 0,
				lastTrainedAt: new Date().toISOString(),
			});

			await emitToWebsite(websiteId, "trainingCompleted", {
				websiteId,
				organizationId,
				visitorId: null,
				userId: job.data.triggeredBy,
				aiAgentId,
				totalItems: 0,
				totalChunks: 0,
				duration: Date.now() - startTime,
			});

			return;
		}

		// --- Incremental training: only re-embed changed knowledge items ---

		// Build a map of existing chunks' contentHash per knowledgeId
		const existingChunks = await db
			.select({
				knowledgeId: chunkTable.knowledgeId,
				contentHash: sql<string>`${chunkTable.metadata}->>'contentHash'`,
			})
			.from(chunkTable)
			.where(
				and(
					eq(chunkTable.websiteId, websiteId),
					eq(chunkTable.sourceType, "knowledge")
				)
			);

		const existingHashByKnowledgeId = new Map<string, string>();
		for (const row of existingChunks) {
			if (row.knowledgeId && row.contentHash) {
				existingHashByKnowledgeId.set(row.knowledgeId, row.contentHash);
			}
		}

		// Delete orphaned chunks (knowledgeIds that no longer exist)
		const currentKnowledgeIds = knowledgeItems.map((k) => k.id);
		if (currentKnowledgeIds.length > 0) {
			await db
				.delete(chunkTable)
				.where(
					and(
						eq(chunkTable.websiteId, websiteId),
						eq(chunkTable.sourceType, "knowledge"),
						notInArray(chunkTable.knowledgeId, currentKnowledgeIds)
					)
				);
		}

		// Filter to only items that need re-embedding
		const itemsToProcess = knowledgeItems.filter((item) => {
			const existingHash = existingHashByKnowledgeId.get(item.id);
			return existingHash !== item.contentHash;
		});

		const skippedItems = totalItems - itemsToProcess.length;
		console.log(
			`[ai-training] Incremental training: ${itemsToProcess.length} changed, ${skippedItems} unchanged (skipped)`
		);

		let processedItems = 0;
		let totalChunks = 0;

		// Process only changed knowledge items
		for (const knowledgeItem of itemsToProcess) {
			// Delete old chunks for this specific knowledge item
			await db
				.delete(chunkTable)
				.where(
					and(
						eq(chunkTable.websiteId, websiteId),
						eq(chunkTable.knowledgeId, knowledgeItem.id),
						eq(chunkTable.sourceType, "knowledge")
					)
				);

			// Extract text content from the knowledge item
			const text = extractTextFromKnowledgePayload(
				knowledgeItem.type as "url" | "faq" | "article",
				knowledgeItem.payload
			);

			if (!text || text.trim().length === 0) {
				console.log(
					`[ai-training] Skipping knowledge item ${knowledgeItem.id} - no text content`
				);
				processedItems++;
				continue;
			}

			// Chunk the text
			const chunks = chunkText(text);

			if (chunks.length === 0) {
				processedItems++;
				continue;
			}

			// Generate metadata for chunks
			const metadata = generateChunkMetadata(
				knowledgeItem.type as "url" | "faq" | "article",
				knowledgeItem.payload,
				knowledgeItem.sourceUrl,
				knowledgeItem.sourceTitle
			);

			// Build a contextual prefix so embeddings carry source semantics
			const contextParts: string[] = [];
			if (knowledgeItem.sourceTitle) {
				contextParts.push(knowledgeItem.sourceTitle);
			}
			if (knowledgeItem.sourceUrl) {
				contextParts.push(knowledgeItem.sourceUrl);
			}
			const contextPrefix =
				contextParts.length > 0
					? `Source: ${contextParts.join(" | ")}\n\n`
					: "";

			// Process chunks in batches for embedding generation
			for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
				const chunkBatch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
				// Prepend source context to each chunk for richer embeddings
				const chunkTexts = chunkBatch.map(
					(c) => `${contextPrefix}${c.content}`
				);

				// Generate embeddings for this batch
				const embeddings = await generateEmbeddings(chunkTexts);

				// Insert chunks into database with contentHash for incremental detection
				const chunkInserts = chunkBatch.map((chunk, batchIndex) => ({
					id: generateULID(),
					websiteId,
					knowledgeId: knowledgeItem.id,
					visitorId: null,
					contactId: null,
					sourceType: "knowledge",
					content: chunk.content,
					embedding: embeddings[batchIndex],
					chunkIndex: chunk.index,
					metadata: {
						...metadata,
						contentHash: knowledgeItem.contentHash,
						startOffset: chunk.startOffset,
						endOffset: chunk.endOffset,
					},
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				}));

				await db.insert(chunkTable).values(chunkInserts);
				totalChunks += chunkBatch.length;
			}

			processedItems++;

			// Calculate progress percentage
			const progress = Math.round(
				(processedItems / itemsToProcess.length) * 100
			);

			// Update progress
			await updateAiAgentTrainingStatus(db, {
				aiAgentId,
				trainingStatus: "training",
				trainingProgress: progress,
			});

			// Emit progress event
			await emitToWebsite(websiteId, "trainingProgress", {
				websiteId,
				organizationId,
				visitorId: null,
				userId: job.data.triggeredBy,
				aiAgentId,
				processedItems,
				totalItems: itemsToProcess.length,
				currentItem: {
					id: knowledgeItem.id,
					title: knowledgeItem.sourceTitle ?? null,
					type: knowledgeItem.type as "url" | "faq" | "article",
				},
				percentage: progress,
			});

			// Update job progress for BullMQ
			await job.updateProgress(progress);

			console.log(
				`[ai-training] Processed ${processedItems}/${itemsToProcess.length} items (${chunks.length} chunks)`
			);
		}

		// Training completed
		const duration = Date.now() - startTime;

		await updateAiAgentTrainingStatus(db, {
			aiAgentId,
			trainingStatus: "completed",
			trainingProgress: 100,
			trainedItemsCount: totalItems,
			lastTrainedAt: new Date().toISOString(),
		});

		await emitToWebsite(websiteId, "trainingCompleted", {
			websiteId,
			organizationId,
			visitorId: null,
			userId: job.data.triggeredBy,
			aiAgentId,
			totalItems,
			totalChunks,
			duration,
		});

		console.log(
			`[ai-training] Training completed: ${totalItems} items, ${totalChunks} chunks in ${duration}ms`
		);
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";

		console.error("[ai-training] Training failed:", error);

		// Update status to failed
		await updateAiAgentTrainingStatus(db, {
			aiAgentId,
			trainingStatus: "failed",
			trainingError: errorMessage,
		});

		// Emit failure event
		await emitToWebsite(websiteId, "trainingFailed", {
			websiteId,
			organizationId,
			visitorId: null,
			userId: job.data.triggeredBy,
			aiAgentId,
			error: errorMessage,
		});

		throw error;
	}
}
