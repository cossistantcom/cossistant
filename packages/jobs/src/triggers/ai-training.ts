import { getSafeRedisUrl, type RedisOptions } from "@plasma/redis";
import { type JobsOptions, Queue } from "bullmq";
import {
	type AiTrainingJobData,
	generateAiTrainingJobId,
	QUEUE_NAMES,
} from "../types";
import { addUniqueJob } from "../utils/unique-job";

// Retry configuration for AI training jobs
// 2 attempts with exponential backoff starting at 30 seconds
const AI_TRAINING_RETRY_ATTEMPTS = 2;
const AI_TRAINING_RETRY_BASE_DELAY_MS = 30 * 1000; // 30 seconds base

type TriggerConfig = {
	connection: RedisOptions;
	redisUrl: string;
};

export function createAiTrainingTriggers({
	connection,
	redisUrl,
}: TriggerConfig) {
	const queueName = QUEUE_NAMES.AI_TRAINING;
	let queue: Queue<AiTrainingJobData> | null = null;
	let readyPromise: Promise<void> | null = null;
	const safeRedisUrl = getSafeRedisUrl(redisUrl);

	const buildConnectionOptions = (): RedisOptions => ({
		...connection,
		tls: connection.tls ? { ...connection.tls } : undefined,
	});

	function getQueue(): Queue<AiTrainingJobData> {
		if (!queue) {
			console.log(
				`[jobs:ai-training] Using queue=${queueName} redis=${safeRedisUrl}`
			);
			queue = new Queue<AiTrainingJobData>(queueName, {
				connection: buildConnectionOptions(),
				defaultJobOptions: {
					removeOnComplete: { count: 100 },
					removeOnFail: { count: 100 }, // Keep failed jobs for investigation
				},
			});
		}

		return queue;
	}

	async function ensureQueueReady(): Promise<Queue<AiTrainingJobData>> {
		const q = getQueue();
		if (!readyPromise) {
			readyPromise = q
				.waitUntilReady()
				.then(() => {
					console.log(
						"[jobs:ai-training] Queue connection ready for producers"
					);
				})
				.catch((error) => {
					console.error(
						"[jobs:ai-training] Failed to initialize queue connection",
						error
					);
					throw error;
				});
		}
		await readyPromise;
		return q;
	}

	async function enqueueAiTraining(data: AiTrainingJobData): Promise<string> {
		const q = await ensureQueueReady();
		const jobId = generateAiTrainingJobId(data.aiAgentId);

		const jobOptions: JobsOptions = {
			jobId,
			attempts: AI_TRAINING_RETRY_ATTEMPTS,
			backoff: {
				type: "exponential",
				delay: AI_TRAINING_RETRY_BASE_DELAY_MS,
			},
		};

		const result = await addUniqueJob({
			queue: q,
			jobId,
			jobName: "ai-training",
			data,
			options: jobOptions,
			logPrefix: "[jobs:ai-training]",
		});

		if (result.status === "skipped") {
			return result.existingJob.id ?? jobId;
		}

		const [state, counts] = await Promise.all([
			result.job.getState().catch(() => "unknown"),
			q.getJobCounts("delayed", "waiting", "active").catch(() => null),
		]);

		const countSummary = counts
			? `| counts delayed:${counts.delayed} waiting:${counts.waiting} active:${counts.active}`
			: "";

		console.log(
			`[jobs:ai-training] Enqueued job ${jobId} for AI agent ${data.aiAgentId} (state:${state}) ${countSummary}`
		);

		return result.job.id ?? jobId;
	}

	async function cancelAiTraining(aiAgentId: string): Promise<boolean> {
		const q = await ensureQueueReady();
		const jobId = generateAiTrainingJobId(aiAgentId);

		const job = await q.getJob(jobId);
		if (job) {
			await job.remove();
			console.log(
				`[jobs:ai-training] Cancelled job ${jobId} for AI agent ${aiAgentId}`
			);
			return true;
		}

		return false;
	}

	return {
		enqueueAiTraining,
		cancelAiTraining,
		close: async (): Promise<void> => {
			if (queue) {
				await queue.close();
				queue = null;
				readyPromise = null;
			}
		},
	};
}
