import type { RedisOptions } from "@cossistant/redis";
import { getBullConnectionOptions } from "@cossistant/redis";
import { createAiAgentWorker } from "./ai-agent/worker";
import { createAiAgentBackgroundWorker } from "./ai-agent-background/worker";
import { createAiTrainingWorker } from "./ai-training/worker";
import { createLifecycleEmailWorker } from "./lifecycle-email/worker";
import { createMessageNotificationWorker } from "./message-notification/worker";
import { createWebCrawlWorker } from "./web-crawl/worker";

type WorkerInstance = {
	start: () => Promise<void>;
	stop: () => Promise<void>;
};

const workers: WorkerInstance[] = [];
let workersStarted = false;
let startPromise: Promise<void> | null = null;

/**
 * Start all queue workers
 */
export async function startAllWorkers(params: {
	redisUrl: string;
}): Promise<void> {
	if (workersStarted) {
		console.warn("[workers] startAllWorkers called after startup, skipping");
		return;
	}

	if (startPromise) {
		await startPromise;
		return;
	}

	startPromise = (async () => {
		console.log("[workers] Starting all workers...");
		const connectionOptions: RedisOptions = getBullConnectionOptions(
			params.redisUrl
		);

		const messageNotificationWorker = createMessageNotificationWorker({
			connectionOptions,
			redisUrl: params.redisUrl,
		});
		await messageNotificationWorker.start();
		workers.push(messageNotificationWorker);

		const lifecycleEmailWorker = createLifecycleEmailWorker({
			connectionOptions,
			redisUrl: params.redisUrl,
		});
		await lifecycleEmailWorker.start();
		workers.push(lifecycleEmailWorker);

		const aiAgentWorker = createAiAgentWorker({
			connectionOptions,
			redisUrl: params.redisUrl,
		});
		await aiAgentWorker.start();
		workers.push(aiAgentWorker);

		const aiAgentBackgroundWorker = createAiAgentBackgroundWorker({
			connectionOptions,
			redisUrl: params.redisUrl,
		});
		await aiAgentBackgroundWorker.start();
		workers.push(aiAgentBackgroundWorker);

		const webCrawlWorker = createWebCrawlWorker({
			connectionOptions,
			redisUrl: params.redisUrl,
		});
		await webCrawlWorker.start();
		workers.push(webCrawlWorker);

		const aiTrainingWorker = createAiTrainingWorker({
			connectionOptions,
			redisUrl: params.redisUrl,
		});
		await aiTrainingWorker.start();
		workers.push(aiTrainingWorker);

		console.log("[workers] All workers started");
		workersStarted = true;
	})();

	try {
		await startPromise;
	} catch (error) {
		await Promise.allSettled(workers.map((worker) => worker.stop()));
		workersStarted = false;
		workers.splice(0, workers.length);
		throw error;
	} finally {
		startPromise = null;
	}
}

/**
 * Stop all queue workers gracefully
 */
export async function stopAllWorkers(): Promise<void> {
	if (workers.length === 0) {
		workersStarted = false;
		return;
	}

	console.log("[workers] Stopping all workers...");

	await Promise.all(workers.map((w) => w.stop()));
	workers.splice(0, workers.length);
	workersStarted = false;

	console.log("[workers] All workers stopped");
}
