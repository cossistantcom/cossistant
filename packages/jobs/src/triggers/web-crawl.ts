import { getSafeRedisUrl, type RedisOptions } from "@plasma/redis";
import { type JobsOptions, Queue } from "bullmq";
import {
	generateWebCrawlJobId,
	QUEUE_NAMES,
	type WebCrawlJobData,
} from "../types";
import { addUniqueJob } from "../utils/unique-job";

// Retry configuration for web crawl jobs
// 3 attempts with exponential backoff starting at 1 minute
const WEB_CRAWL_RETRY_ATTEMPTS = 3;
const WEB_CRAWL_RETRY_BASE_DELAY_MS = 60 * 1000; // 1 minute base

type TriggerConfig = {
	connection: RedisOptions;
	redisUrl: string;
};

export function createWebCrawlTriggers({
	connection,
	redisUrl,
}: TriggerConfig) {
	const queueName = QUEUE_NAMES.WEB_CRAWL;
	let queue: Queue<WebCrawlJobData> | null = null;
	let readyPromise: Promise<void> | null = null;
	const safeRedisUrl = getSafeRedisUrl(redisUrl);

	const buildConnectionOptions = (): RedisOptions => ({
		...connection,
		tls: connection.tls ? { ...connection.tls } : undefined,
	});

	function getQueue(): Queue<WebCrawlJobData> {
		if (!queue) {
			console.log(
				`[jobs:web-crawl] Using queue=${queueName} redis=${safeRedisUrl}`
			);
			queue = new Queue<WebCrawlJobData>(queueName, {
				connection: buildConnectionOptions(),
				defaultJobOptions: {
					removeOnComplete: { count: 100 },
					removeOnFail: { count: 100 }, // Keep failed jobs for investigation
				},
			});
		}

		return queue;
	}

	async function ensureQueueReady(): Promise<Queue<WebCrawlJobData>> {
		const q = getQueue();
		if (!readyPromise) {
			readyPromise = q
				.waitUntilReady()
				.then(() => {
					console.log("[jobs:web-crawl] Queue connection ready for producers");
				})
				.catch((error) => {
					console.error(
						"[jobs:web-crawl] Failed to initialize queue connection",
						error
					);
					throw error;
				});
		}
		await readyPromise;
		return q;
	}

	async function enqueueWebCrawl(data: WebCrawlJobData): Promise<string> {
		const q = await ensureQueueReady();
		const jobId = generateWebCrawlJobId(data.linkSourceId);

		const jobOptions: JobsOptions = {
			jobId,
			attempts: WEB_CRAWL_RETRY_ATTEMPTS,
			backoff: {
				type: "exponential",
				delay: WEB_CRAWL_RETRY_BASE_DELAY_MS,
			},
		};

		const result = await addUniqueJob({
			queue: q,
			jobId,
			jobName: "web-crawl",
			data,
			options: jobOptions,
			logPrefix: "[jobs:web-crawl]",
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
			`[jobs:web-crawl] Enqueued job ${jobId} for link source ${data.linkSourceId} (state:${state}) ${countSummary}`
		);

		return result.job.id ?? jobId;
	}

	async function cancelWebCrawl(linkSourceId: string): Promise<boolean> {
		const q = await ensureQueueReady();
		const jobId = generateWebCrawlJobId(linkSourceId);

		const job = await q.getJob(jobId);
		if (job) {
			await job.remove();
			console.log(
				`[jobs:web-crawl] Cancelled job ${jobId} for link source ${linkSourceId}`
			);
			return true;
		}

		return false;
	}

	return {
		enqueueWebCrawl,
		cancelWebCrawl,
		close: async (): Promise<void> => {
			if (queue) {
				await queue.close();
				queue = null;
				readyPromise = null;
			}
		},
	};
}
