import { getBehaviorSettings } from "@api/ai-pipeline/shared/settings";
import { getAiAgentById } from "@api/db/queries/ai-agent";
import {
	getConversationById,
	getMessageMetadata,
} from "@api/db/queries/conversation";
import {
	AI_AGENT_BACKGROUND_DELAY_MS,
	AI_AGENT_INITIAL_DELAY_MS,
	AI_AGENT_MAX_RUN_ATTEMPTS,
	AI_AGENT_RETRY_DELAY_MS,
	type AiAgentBackgroundJobData,
	type AiAgentJobData,
	enqueueConversationScopedAiBackgroundJob,
	enqueueConversationScopedAiJob,
	QUEUE_NAMES,
} from "@cossistant/jobs";
import { getSafeRedisUrl, type RedisOptions } from "@cossistant/redis";
import { db } from "@workers/db";
import { env } from "@workers/env";
import { type Job, Queue, Worker } from "bullmq";
import {
	findNextTriggerableMessageAfterCursor,
	type TriggerableMessage,
} from "./next-triggerable-message";
import { PipelineMessageError, runPipelineForMessage } from "./pipeline-runner";

type WorkerConfig = {
	connectionOptions: RedisOptions;
	redisUrl: string;
};

type AiAgentProcessResult = {
	processedMessageId: string | null;
	processedMessageCreatedAt: string | null;
};

const COMPLETED_HOOK_MAX_ATTEMPTS = 3;

function hasBackgroundAnalysisEnabled(
	aiAgentId: Awaited<ReturnType<typeof getAiAgentById>>
): boolean {
	if (!aiAgentId) {
		return false;
	}

	const settings = getBehaviorSettings(aiAgentId);
	return (
		settings.autoGenerateTitle ||
		settings.autoAnalyzeSentiment ||
		settings.canSetPriority ||
		(settings.autoCategorize && settings.canCategorize)
	);
}

function isTriggerableMessage(
	message: Awaited<ReturnType<typeof getMessageMetadata>>,
	conversationId: string
): message is NonNullable<Awaited<ReturnType<typeof getMessageMetadata>>> {
	return Boolean(
		message &&
			message.conversationId === conversationId &&
			(message.userId || message.visitorId)
	);
}

export function createAiAgentWorker({
	connectionOptions,
	redisUrl,
}: WorkerConfig) {
	const queueName = QUEUE_NAMES.AI_AGENT;
	const safeRedisUrl = getSafeRedisUrl(redisUrl);
	let worker: Worker<AiAgentJobData> | null = null;
	let schedulerQueue: Queue<AiAgentJobData> | null = null;
	let backgroundSchedulerQueue: Queue<AiAgentBackgroundJobData> | null = null;

	const buildConnectionOptions = (): RedisOptions => ({
		...connectionOptions,
		tls: connectionOptions.tls ? { ...connectionOptions.tls } : undefined,
	});

	async function resolveTargetMessageForJob(params: {
		job: Job<AiAgentJobData>;
		conversation: Awaited<ReturnType<typeof getConversationById>>;
	}): Promise<TriggerableMessage | null> {
		const afterCreatedAt =
			params.conversation?.aiAgentLastProcessedMessageCreatedAt ?? null;
		const afterId = params.conversation?.aiAgentLastProcessedMessageId ?? null;

		if (params.conversation && afterCreatedAt && afterId) {
			return findNextTriggerableMessageAfterCursor({
				db,
				organizationId: params.conversation.organizationId,
				conversationId: params.conversation.id,
				afterCreatedAt,
				afterId,
			});
		}

		const queuedMessage = await getMessageMetadata(db, {
			messageId: params.job.data.messageId,
			organizationId: params.job.data.organizationId,
		});

		if (!isTriggerableMessage(queuedMessage, params.job.data.conversationId)) {
			return null;
		}

		return {
			id: queuedMessage.id,
			createdAt: queuedMessage.createdAt,
		};
	}

	async function enqueueNextPendingJobFromConversation(params: {
		job: Job<AiAgentJobData>;
		conversation: NonNullable<Awaited<ReturnType<typeof getConversationById>>>;
	}): Promise<void> {
		if (!schedulerQueue) {
			return;
		}

		const afterCreatedAt =
			params.conversation.aiAgentLastProcessedMessageCreatedAt;
		const afterId = params.conversation.aiAgentLastProcessedMessageId;

		if (!(afterCreatedAt && afterId)) {
			return;
		}

		const nextMessage = await findNextTriggerableMessageAfterCursor({
			db,
			organizationId: params.conversation.organizationId,
			conversationId: params.conversation.id,
			afterCreatedAt,
			afterId,
		});

		if (!nextMessage) {
			return;
		}

		const { openRouterByokRetry: _openRouterByokRetry, ...baseJobData } =
			params.job.data;
		await enqueueConversationScopedAiJob({
			queue: schedulerQueue,
			data: {
				...baseJobData,
				messageId: nextMessage.id,
				messageCreatedAt: nextMessage.createdAt,
				runAttempt: 0,
			},
			delayMs: 0,
		});
	}

	async function retryCompletedHook(
		label: string,
		fn: (attempt: number) => Promise<void>
	): Promise<void> {
		let lastError: unknown;

		for (
			let attempt = 1;
			attempt <= COMPLETED_HOOK_MAX_ATTEMPTS;
			attempt += 1
		) {
			try {
				await fn(attempt);
				return;
			} catch (error) {
				lastError = error;
				console.warn(
					`[worker:ai-agent] ${label} failed attempt ${attempt}/${COMPLETED_HOOK_MAX_ATTEMPTS}`,
					error
				);
			}
		}

		throw lastError ?? new Error(`[worker:ai-agent] ${label} failed`);
	}

	async function enqueueRecoveryJobFromCursor(
		job: Job<AiAgentJobData>
	): Promise<void> {
		if (!schedulerQueue) {
			return;
		}

		const conversation = await getConversationById(db, {
			conversationId: job.data.conversationId,
		});
		if (!conversation) {
			return;
		}

		await enqueueNextPendingJobFromConversation({
			job,
			conversation,
		});
	}

	async function runCompletedBookkeeping(
		job: Job<AiAgentJobData>,
		result: AiAgentProcessResult
	): Promise<void> {
		if (!(result.processedMessageId && result.processedMessageCreatedAt)) {
			return;
		}
		if (!schedulerQueue) {
			return;
		}

		const conversation = await getConversationById(db, {
			conversationId: job.data.conversationId,
		});

		if (!conversation) {
			return;
		}

		await enqueueNextPendingJobFromConversation({
			job,
			conversation,
		});
	}

	async function processAiAgentJob(
		job: Job<AiAgentJobData>
	): Promise<AiAgentProcessResult> {
		const { conversationId, aiAgentId } = job.data;
		const conversation = await getConversationById(db, { conversationId });
		if (!conversation) {
			return {
				processedMessageId: null,
				processedMessageCreatedAt: null,
			};
		}

		const targetMessage = await resolveTargetMessageForJob({
			job,
			conversation,
		});
		if (!targetMessage) {
			return {
				processedMessageId: null,
				processedMessageCreatedAt: null,
			};
		}

		const pipelineParams: Parameters<typeof runPipelineForMessage>[0] = {
			db,
			conversation: {
				id: conversation.id,
				websiteId: conversation.websiteId,
				organizationId: conversation.organizationId,
				visitorId: conversation.visitorId,
			},
			aiAgentId,
			jobId: String(job.id ?? `job-${Date.now()}`),
			message: targetMessage,
		};
		if (job.data.openRouterByokRetry) {
			pipelineParams.openRouterByokRetry = job.data.openRouterByokRetry;
		}

		const runResult = await runPipelineForMessage(pipelineParams);

		return {
			processedMessageId: runResult.processedMessageId,
			processedMessageCreatedAt: runResult.processedMessageCreatedAt,
		};
	}

	async function scheduleBackgroundPipeline(
		job: Job<AiAgentJobData>,
		result: AiAgentProcessResult
	): Promise<void> {
		if (!(result.processedMessageId && result.processedMessageCreatedAt)) {
			return;
		}

		if (!backgroundSchedulerQueue) {
			return;
		}

		const aiAgent = await getAiAgentById(db, {
			aiAgentId: job.data.aiAgentId,
		});
		if (!hasBackgroundAnalysisEnabled(aiAgent)) {
			return;
		}

		await enqueueConversationScopedAiBackgroundJob({
			queue: backgroundSchedulerQueue,
			data: {
				conversationId: job.data.conversationId,
				websiteId: job.data.websiteId,
				organizationId: job.data.organizationId,
				aiAgentId: job.data.aiAgentId,
				sourceMessageId: result.processedMessageId,
				sourceMessageCreatedAt: result.processedMessageCreatedAt,
			},
			delayMs: AI_AGENT_BACKGROUND_DELAY_MS,
		});
	}

	async function handleCompleted(
		job: Job<AiAgentJobData>,
		result: AiAgentProcessResult
	): Promise<void> {
		try {
			await retryCompletedHook("completed hook bookkeeping", async () => {
				await runCompletedBookkeeping(job, result);
			});
		} catch (error) {
			console.error(
				"[worker:ai-agent] completed hook bookkeeping exhausted retries",
				error
			);
			await enqueueRecoveryJobFromCursor(job);
		}

		try {
			await retryCompletedHook("background scheduling", async () => {
				await scheduleBackgroundPipeline(job, result);
			});
		} catch (error) {
			console.error(
				"[worker:ai-agent] background scheduling exhausted retries",
				error
			);
		}
	}

	async function handleFailed(
		job: Job<AiAgentJobData>,
		error: Error
	): Promise<void> {
		if (!schedulerQueue) {
			return;
		}

		const runAttempt = job.data.runAttempt ?? 0;
		if (runAttempt >= AI_AGENT_MAX_RUN_ATTEMPTS - 1) {
			console.error(
				`[worker:ai-agent] max retry attempts reached; preserving DB cursor for conversation ${job.data.conversationId}`
			);
			return;
		}

		const failedMessage =
			error instanceof PipelineMessageError
				? error.failedMessage
				: {
						id: job.data.messageId,
						createdAt: job.data.messageCreatedAt,
					};
		const openRouterByokRetry =
			error instanceof PipelineMessageError
				? error.openRouterByokRetry
				: job.data.openRouterByokRetry;
		const retryData = {
			...job.data,
			messageId: failedMessage.id,
			messageCreatedAt: failedMessage.createdAt,
			runAttempt: runAttempt + 1,
		};
		if (openRouterByokRetry) {
			retryData.openRouterByokRetry = openRouterByokRetry;
		}

		await enqueueConversationScopedAiJob({
			queue: schedulerQueue,
			data: retryData,
			delayMs: AI_AGENT_RETRY_DELAY_MS,
		});
	}

	return {
		start: async () => {
			if (worker) {
				return;
			}

			console.log(
				`[worker:ai-agent] Using queue=${queueName} redis=${safeRedisUrl}`
			);

			schedulerQueue = new Queue<AiAgentJobData>(queueName, {
				connection: buildConnectionOptions(),
			});

			await schedulerQueue.waitUntilReady();

			backgroundSchedulerQueue = new Queue<AiAgentBackgroundJobData>(
				QUEUE_NAMES.AI_AGENT_BACKGROUND,
				{
					connection: buildConnectionOptions(),
				}
			);

			await backgroundSchedulerQueue.waitUntilReady();

			worker = new Worker<AiAgentJobData>(
				queueName,
				(job) => processAiAgentJob(job),
				{
					connection: buildConnectionOptions(),
					concurrency: env.AI_AGENT_CONCURRENCY,
				}
			);

			worker.on("completed", (job, result) => {
				if (!(job && result)) {
					return;
				}
				void handleCompleted(job, result as AiAgentProcessResult).catch(
					(error) => {
						console.error("[worker:ai-agent] completed hook failed", error);
					}
				);
			});

			worker.on("failed", (job, error) => {
				if (!job) {
					return;
				}
				void handleFailed(job, error as Error).catch((retryError) => {
					console.error(
						"[worker:ai-agent] failed hook retry failed",
						retryError
					);
				});
				console.error("[worker:ai-agent] Job failed", error);
			});

			worker.on("error", (error) => {
				console.error("[worker:ai-agent] Worker error", error);
			});

			await worker.waitUntilReady();
			console.log(
				`[worker:ai-agent] Worker started with concurrency=${env.AI_AGENT_CONCURRENCY} delay=${AI_AGENT_INITIAL_DELAY_MS}ms`
			);
		},
		stop: async () => {
			await Promise.all([
				(async () => {
					if (!worker) {
						return;
					}
					await worker.close();
					worker = null;
					console.log("[worker:ai-agent] Worker stopped");
				})(),
				(async () => {
					if (!schedulerQueue) {
						return;
					}
					await schedulerQueue.close();
					schedulerQueue = null;
				})(),
				(async () => {
					if (!backgroundSchedulerQueue) {
						return;
					}
					await backgroundSchedulerQueue.close();
					backgroundSchedulerQueue = null;
				})(),
			]);
		},
	};
}
