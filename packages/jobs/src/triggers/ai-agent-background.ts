import { getSafeRedisUrl, type RedisOptions } from "@plasma/redis";
import { Queue } from "bullmq";
import {
	AI_AGENT_BACKGROUND_DELAY_MS,
	type EnqueueConversationScopedAiBackgroundJobResult,
	enqueueConversationScopedAiBackgroundJob,
} from "../ai-agent-background-job-scheduler";
import { type AiAgentBackgroundJobData, QUEUE_NAMES } from "../types";

type TriggerConfig = {
	connection: RedisOptions;
	redisUrl: string;
};

export type EnqueueAiAgentBackgroundResult =
	EnqueueConversationScopedAiBackgroundJobResult;

export function createAiAgentBackgroundTriggers({
	connection,
	redisUrl,
}: TriggerConfig) {
	const queueName = QUEUE_NAMES.AI_AGENT_BACKGROUND;
	let queue: Queue<AiAgentBackgroundJobData> | null = null;
	let readyPromise: Promise<void> | null = null;
	const safeRedisUrl = getSafeRedisUrl(redisUrl);

	const buildConnectionOptions = (): RedisOptions => ({
		...connection,
		tls: connection.tls ? { ...connection.tls } : undefined,
	});

	function getQueue(): Queue<AiAgentBackgroundJobData> {
		if (!queue) {
			console.log(
				`[jobs:ai-agent-background] Using queue=${queueName} redis=${safeRedisUrl}`
			);
			queue = new Queue<AiAgentBackgroundJobData>(queueName, {
				connection: buildConnectionOptions(),
			});
		}

		return queue;
	}

	async function ensureQueueReady(): Promise<Queue<AiAgentBackgroundJobData>> {
		const q = getQueue();
		if (!readyPromise) {
			readyPromise = q
				.waitUntilReady()
				.then(() => {
					console.log(
						"[jobs:ai-agent-background] Queue connection ready for producers"
					);
				})
				.catch((error) => {
					console.error(
						"[jobs:ai-agent-background] Failed to initialize queue connection",
						error
					);
					throw error;
				});
		}
		await readyPromise;
		return q;
	}

	async function enqueueAiAgentBackgroundJob(
		data: AiAgentBackgroundJobData,
		overrides?: { delayMs?: number }
	): Promise<EnqueueAiAgentBackgroundResult> {
		const q = await ensureQueueReady();
		return enqueueConversationScopedAiBackgroundJob({
			queue: q,
			data,
			delayMs: overrides?.delayMs ?? AI_AGENT_BACKGROUND_DELAY_MS,
		});
	}

	return {
		enqueueAiAgentBackgroundJob,
		close: async (): Promise<void> => {
			if (queue) {
				await queue.close();
				queue = null;
				readyPromise = null;
			}
		},
	};
}

export { AI_AGENT_BACKGROUND_JOB_OPTIONS } from "../ai-agent-background-job-scheduler";
