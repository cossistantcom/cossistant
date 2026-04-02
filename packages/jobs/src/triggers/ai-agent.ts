/**
 * AI Agent Job Triggers
 *
 * This module provides functions to enqueue AI agent jobs.
 * Queue orchestration is conversation-scoped via a stable BullMQ jobId.
 */

import { getSafeRedisUrl, type RedisOptions } from "@plasma/redis";
import { Queue } from "bullmq";
import {
	AI_AGENT_INITIAL_DELAY_MS,
	type EnqueueConversationScopedAiJobResult,
	enqueueConversationScopedAiJob,
} from "../ai-agent-job-scheduler";
import { type AiAgentJobData, QUEUE_NAMES } from "../types";

export type EnqueueAiAgentResult = EnqueueConversationScopedAiJobResult;

type TriggerConfig = {
	connection: RedisOptions;
	redisUrl: string;
};

export function createAiAgentTriggers({ connection, redisUrl }: TriggerConfig) {
	const queueName = QUEUE_NAMES.AI_AGENT;
	let queue: Queue<AiAgentJobData> | null = null;
	let readyPromise: Promise<void> | null = null;
	const safeRedisUrl = getSafeRedisUrl(redisUrl);

	const buildConnectionOptions = (): RedisOptions => ({
		...connection,
		tls: connection.tls ? { ...connection.tls } : undefined,
	});

	function getQueue(): Queue<AiAgentJobData> {
		if (!queue) {
			console.log(
				`[jobs:ai-agent] Using queue=${queueName} redis=${safeRedisUrl}`
			);
			queue = new Queue<AiAgentJobData>(queueName, {
				connection: buildConnectionOptions(),
			});
		}

		return queue;
	}

	async function ensureQueueReady(): Promise<Queue<AiAgentJobData>> {
		const q = getQueue();
		if (!readyPromise) {
			readyPromise = q
				.waitUntilReady()
				.then(() => {
					console.log("[jobs:ai-agent] Queue connection ready for producers");
				})
				.catch((error) => {
					console.error(
						"[jobs:ai-agent] Failed to initialize queue connection",
						error
					);
					throw error;
				});
		}
		await readyPromise;
		return q;
	}

	async function enqueueAiAgentJob(
		data: AiAgentJobData,
		overrides?: { delayMs?: number }
	): Promise<EnqueueAiAgentResult> {
		const q = await ensureQueueReady();
		return enqueueConversationScopedAiJob({
			queue: q,
			data,
			delayMs: overrides?.delayMs ?? AI_AGENT_INITIAL_DELAY_MS,
		});
	}

	return {
		enqueueAiAgentJob,
		close: async (): Promise<void> => {
			if (queue) {
				await queue.close();
				queue = null;
				readyPromise = null;
			}
		},
	};
}

export { AI_AGENT_JOB_OPTIONS } from "../ai-agent-job-scheduler";
