import { getSafeRedisUrl, type RedisOptions } from "@plasma/redis";
import { Queue } from "bullmq";
import {
	generateMessageNotificationJobId,
	type MessageNotificationDirection,
	type MessageNotificationJobData,
	QUEUE_NAMES,
} from "../types";
import { addDebouncedJob } from "../utils/debounced-job";

// Default delay: 1 minute (in milliseconds)
const DEFAULT_NOTIFICATION_DELAY_MS = 60 * 1000;

// Retry configuration: 6 attempts spread over ~24 hours
// With exponential backoff (base 45 min): 45min, 1.5h, 3h, 6h, 12h = ~23 hours total
const RETRY_ATTEMPTS = 6;
const RETRY_BASE_DELAY_MS = 45 * 60 * 1000; // 45 minutes

type TriggerConfig = {
	connection: RedisOptions;
	redisUrl: string;
};

/**
 * Create message notification queue triggers bound to BullMQ connection options
 */
export function createMessageNotificationTriggers({
	connection,
	redisUrl,
}: TriggerConfig) {
	const queueName = QUEUE_NAMES.MESSAGE_NOTIFICATION;
	let queue: Queue<MessageNotificationJobData> | null = null;
	let readyPromise: Promise<void> | null = null;
	const safeRedisUrl = getSafeRedisUrl(redisUrl);

	const buildConnectionOptions = (): RedisOptions => ({
		...connection,
		tls: connection.tls ? { ...connection.tls } : undefined,
	});

	function getQueue(): Queue<MessageNotificationJobData> {
		if (!queue) {
			console.log(
				`[jobs:message-notification] Using queue=${queueName} redis=${safeRedisUrl}`
			);
			queue = new Queue<MessageNotificationJobData>(queueName, {
				connection: buildConnectionOptions(),
				defaultJobOptions: {
					removeOnComplete: true,
					removeOnFail: 1000, // Keep failed jobs for investigation (auto-cleaned when limit reached)
				},
			});
		}
		return queue;
	}

	async function ensureQueueReady(): Promise<
		Queue<MessageNotificationJobData>
	> {
		const q = getQueue();
		if (!readyPromise) {
			readyPromise = q
				.waitUntilReady()
				.then(() => {
					console.log(
						"[jobs:message-notification] Queue connection ready for producers"
					);
				})
				.catch((error) => {
					console.error(
						"[jobs:message-notification] Failed to ready message notification queue",
						error
					);
					throw error;
				});
		}
		await readyPromise;
		return q;
	}

	async function addJob(
		data: MessageNotificationJobData,
		direction: MessageNotificationDirection
	): Promise<void> {
		const q = await ensureQueueReady();
		const jobId = generateMessageNotificationJobId(
			data.conversationId,
			direction
		);

		// Check for existing job to preserve earlier timestamp (notification-specific logic)
		const existingJob = await q.getJob(jobId);
		let effectiveData = data;

		if (existingJob) {
			const existingState = await existingJob.getState();
			// If completed/failed, preserve earlier timestamp to not miss messages
			if (existingState === "completed" || existingState === "failed") {
				const existingJobData =
					existingJob.data as MessageNotificationJobData | null;
				if (existingJobData?.initialMessageCreatedAt) {
					const existingTs = new Date(
						existingJobData.initialMessageCreatedAt
					).getTime();
					const newTs = new Date(data.initialMessageCreatedAt).getTime();
					if (existingTs < newTs) {
						effectiveData = {
							...data,
							initialMessageCreatedAt: existingJobData.initialMessageCreatedAt,
						};
						console.log(
							`[jobs:message-notification] Preserving earlier timestamp from ${existingState} job`
						);
					}
				}
			}
		}

		const result = await addDebouncedJob({
			queue: q,
			jobId,
			jobName: "notification",
			data: effectiveData,
			options: {
				delay: DEFAULT_NOTIFICATION_DELAY_MS,
				attempts: RETRY_ATTEMPTS,
				backoff: {
					type: "exponential",
					delay: RETRY_BASE_DELAY_MS,
				},
			},
			logPrefix: "[jobs:message-notification]",
		});

		// If skipped due to debouncing, no need to log further
		if (result.status === "skipped") {
			return;
		}

		// Log job creation/replacement
		const [state, counts] = await Promise.all([
			result.job.getState().catch(() => "unknown"),
			q.getJobCounts("delayed", "waiting", "active").catch(() => null),
		]);

		const countSummary = counts
			? `| counts delayed:${counts.delayed} waiting:${counts.waiting} active:${counts.active}`
			: "";

		console.log(
			`[jobs:message-notification] Triggered job ${jobId} for conversation ${data.conversationId} (direction: ${direction}, delay: ${DEFAULT_NOTIFICATION_DELAY_MS}ms, state: ${state}) ${countSummary}`
		);
	}

	return {
		/**
		 * Trigger a delayed email notification when a member sends a message
		 */
		triggerMemberMessageNotification: async (data: {
			conversationId: string;
			messageId: string;
			websiteId: string;
			organizationId: string;
			senderId: string;
			initialMessageCreatedAt: string;
		}): Promise<void> => {
			const direction: MessageNotificationDirection = "member-to-visitor";
			await addJob({ ...data, direction }, direction);
		},

		/**
		 * Trigger a delayed email notification when a visitor sends a message
		 */
		triggerVisitorMessageNotification: async (data: {
			conversationId: string;
			messageId: string;
			websiteId: string;
			organizationId: string;
			visitorId: string;
			initialMessageCreatedAt: string;
		}): Promise<void> => {
			const direction: MessageNotificationDirection = "visitor-to-member";
			await addJob({ ...data, direction }, direction);
		},

		/**
		 * Close the queue producer connection
		 */
		close: async (): Promise<void> => {
			if (queue) {
				await queue.close();
				queue = null;
				readyPromise = null;
			}
		},
	};
}
