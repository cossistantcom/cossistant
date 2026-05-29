import { getSafeRedisUrl, type RedisOptions } from "@cossistant/redis";
import { Queue } from "bullmq";
import {
	generateLifecycleEmailJobId,
	type LifecycleEmailJobData,
	QUEUE_NAMES,
} from "../types";

const SCAN_JOB_OPTIONS = {
	removeOnComplete: true,
	removeOnFail: 1000,
	attempts: 3,
	backoff: {
		type: "exponential" as const,
		delay: 30_000,
	},
};

type TriggerConfig = {
	connection: RedisOptions;
	redisUrl: string;
};

export function createLifecycleEmailTriggers({
	connection,
	redisUrl,
}: TriggerConfig) {
	const queueName = QUEUE_NAMES.LIFECYCLE_EMAIL;
	let queue: Queue<LifecycleEmailJobData> | null = null;
	let readyPromise: Promise<void> | null = null;
	const safeRedisUrl = getSafeRedisUrl(redisUrl);

	const buildConnectionOptions = (): RedisOptions => ({
		...connection,
		tls: connection.tls ? { ...connection.tls } : undefined,
	});

	function getQueue(): Queue<LifecycleEmailJobData> {
		if (!queue) {
			console.log(
				`[jobs:lifecycle-email] Using queue=${queueName} redis=${safeRedisUrl}`
			);
			queue = new Queue<LifecycleEmailJobData>(queueName, {
				connection: buildConnectionOptions(),
				defaultJobOptions: {
					removeOnComplete: true,
					removeOnFail: 1000,
				},
			});
		}

		return queue;
	}

	async function ensureQueueReady(): Promise<Queue<LifecycleEmailJobData>> {
		const q = getQueue();
		if (!readyPromise) {
			readyPromise = q
				.waitUntilReady()
				.then(() => {
					console.log("[jobs:lifecycle-email] Queue connection ready");
				})
				.catch((error) => {
					console.error(
						"[jobs:lifecycle-email] Failed to ready lifecycle email queue",
						error
					);
					throw error;
				});
		}

		await readyPromise;
		return q;
	}

	async function enqueue(data: LifecycleEmailJobData, delay = 0) {
		const q = await ensureQueueReady();
		const suffix =
			data.kind === "send_batch"
				? data.batchId
				: new Date().toISOString().slice(0, 16);
		const jobId = generateLifecycleEmailJobId(data.kind, suffix);

		await q.add(data.kind, data, {
			...SCAN_JOB_OPTIONS,
			jobId,
			delay,
		});

		return jobId;
	}

	return {
		enqueueScan: () => enqueue({ kind: "scan" }),
		enqueueWeeklyDigestScan: () => enqueue({ kind: "weekly_digest_scan" }),
		enqueueLimitScan: () => enqueue({ kind: "limit_scan" }),
		enqueueSendBatch: (data: {
			eventIds: string[];
			batchId: string;
			delayMs?: number;
		}) =>
			enqueue(
				{
					kind: "send_batch",
					eventIds: data.eventIds,
					batchId: data.batchId,
				},
				data.delayMs ?? 0
			),
		close: async (): Promise<void> => {
			if (queue) {
				await queue.close();
				queue = null;
				readyPromise = null;
			}
		},
	};
}
