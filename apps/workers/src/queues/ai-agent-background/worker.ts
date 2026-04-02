import { runBackgroundPipeline } from "@api/ai-pipeline";
import {
	type AiAgentBackgroundJobData,
	type AiAgentJobData,
	generateAiAgentJobId,
	QUEUE_NAMES,
} from "@plasma/jobs";
import { getSafeRedisUrl, type RedisOptions } from "@plasma/redis";
import { db } from "@workers/db";
import { env } from "@workers/env";
import { type Job, Queue, Worker } from "bullmq";

type WorkerConfig = {
	connectionOptions: RedisOptions;
	redisUrl: string;
};

export function createAiAgentBackgroundWorker({
	connectionOptions,
	redisUrl,
}: WorkerConfig) {
	const queueName = QUEUE_NAMES.AI_AGENT_BACKGROUND;
	const safeRedisUrl = getSafeRedisUrl(redisUrl);
	let worker: Worker<AiAgentBackgroundJobData> | null = null;
	let primaryQueue: Queue<AiAgentJobData> | null = null;

	const buildConnectionOptions = (): RedisOptions => ({
		...connectionOptions,
		tls: connectionOptions.tls ? { ...connectionOptions.tls } : undefined,
	});

	async function isPrimaryPipelineBusy(
		conversationId: string
	): Promise<boolean> {
		if (!primaryQueue) {
			return false;
		}

		const primaryJob = await primaryQueue.getJob(
			generateAiAgentJobId(conversationId)
		);
		if (!primaryJob) {
			return false;
		}

		const state = await primaryJob.getState();
		return state === "active" || state === "waiting" || state === "delayed";
	}

	async function processBackgroundJob(
		job: Job<AiAgentBackgroundJobData>
	): Promise<void> {
		if (await isPrimaryPipelineBusy(job.data.conversationId)) {
			console.log(
				`[worker:ai-agent-background] Skipping ${job.id ?? "unknown-job"}: primary_pipeline_busy`
			);
			return;
		}

		const result = await runBackgroundPipeline({
			db,
			input: {
				...job.data,
				workflowRunId: `ai-bg-${job.data.conversationId}-${Date.now()}`,
				jobId: String(job.id ?? `job-${Date.now()}`),
			},
		});

		if (result.status === "error") {
			throw new Error(result.error ?? "Background pipeline failed");
		}
	}

	return {
		start: async () => {
			if (worker) {
				return;
			}

			console.log(
				`[worker:ai-agent-background] Using queue=${queueName} redis=${safeRedisUrl}`
			);

			primaryQueue = new Queue<AiAgentJobData>(QUEUE_NAMES.AI_AGENT, {
				connection: buildConnectionOptions(),
			});

			await primaryQueue.waitUntilReady();

			worker = new Worker<AiAgentBackgroundJobData>(
				queueName,
				(job) => processBackgroundJob(job),
				{
					connection: buildConnectionOptions(),
					concurrency: env.AI_AGENT_CONCURRENCY,
				}
			);

			worker.on("failed", (job, error) => {
				console.error(
					`[worker:ai-agent-background] Job ${job?.id} failed`,
					error
				);
			});

			worker.on("error", (error) => {
				console.error("[worker:ai-agent-background] Worker error", error);
			});

			await worker.waitUntilReady();
			console.log(
				`[worker:ai-agent-background] Worker started with concurrency=${env.AI_AGENT_CONCURRENCY}`
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
					console.log("[worker:ai-agent-background] Worker stopped");
				})(),
				(async () => {
					if (!primaryQueue) {
						return;
					}
					await primaryQueue.close();
					primaryQueue = null;
				})(),
			]);
		},
	};
}
