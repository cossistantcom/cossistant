import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import {
	type AiAgentBackgroundJobData,
	type AiAgentJobData,
	type LifecycleEmailJobData,
	type MessageNotificationJobData,
	QUEUE_NAMES,
	type WebCrawlJobData,
} from "@cossistant/jobs";
import {
	createRedisConnection,
	getBullConnectionOptions,
	getSafeRedisUrl,
} from "@cossistant/redis";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Queue } from "bullmq";
import { Hono } from "hono";

import { env } from "./env";
import { installAiAgentConversationLogRouter } from "./logging/ai-agent-conversation-log-router";
import { startAllWorkers, stopAllWorkers } from "./queues";

if (
	env.AI_AGENT_CONVERSATION_LOG_CAPTURE_ENABLED &&
	process.env.AI_AGENT_CONVERSATION_LOG_CAPTURE_ENABLED == null
) {
	process.env.AI_AGENT_CONVERSATION_LOG_CAPTURE_ENABLED = "true";
}

const conversationLogRouter = installAiAgentConversationLogRouter({
	enabled: env.AI_AGENT_CONVERSATION_LOG_CAPTURE_ENABLED,
	flushIntervalMs: env.AI_AGENT_CONVERSATION_LOG_FLUSH_INTERVAL_MS,
});

// Create Redis connection
const redis = createRedisConnection(env.REDIS_URL);
let workersStarted = false;
let workersStartPromise: Promise<void> | null = null;

async function ensureWorkersStarted(): Promise<void> {
	if (workersStarted) {
		return;
	}

	if (workersStartPromise) {
		await workersStartPromise;
		return;
	}

	workersStartPromise = (async () => {
		console.log("[workers] Redis connected, starting workers...");
		await startAllWorkers({ redisUrl: env.REDIS_URL });
		workersStarted = true;
	})().catch((error) => {
		workersStartPromise = null;
		throw error;
	});

	await workersStartPromise;
}

redis.on("ready", () => {
	void ensureWorkersStarted().catch((error) => {
		console.error("[workers] Failed to start workers", error);
		process.exit(1);
	});
});

// Create Hono app for health checks
const app = new Hono();

app.get("/", (c) => c.json({ status: "ok", service: "workers" }));

app.get("/health", (c) =>
	c.json({ status: "healthy", timestamp: new Date().toISOString() })
);

type ManagedQueue =
	| Queue<MessageNotificationJobData>
	| Queue<AiAgentBackgroundJobData>
	| Queue<AiAgentJobData>
	| Queue<LifecycleEmailJobData>
	| Queue<WebCrawlJobData>;

const bullBoardQueues: ManagedQueue[] = [];
if (env.BULL_BOARD_ENABLED) {
	const boardConnection = getBullConnectionOptions(env.REDIS_URL);
	const messageQueue = new Queue<MessageNotificationJobData>(
		QUEUE_NAMES.MESSAGE_NOTIFICATION,
		{
			connection: boardConnection,
		}
	);
	const lifecycleEmailQueue = new Queue<LifecycleEmailJobData>(
		QUEUE_NAMES.LIFECYCLE_EMAIL,
		{
			connection: boardConnection,
		}
	);
	const aiAgentQueue = new Queue<AiAgentJobData>(QUEUE_NAMES.AI_AGENT, {
		connection: boardConnection,
	});
	const aiAgentBackgroundQueue = new Queue<AiAgentBackgroundJobData>(
		QUEUE_NAMES.AI_AGENT_BACKGROUND,
		{
			connection: boardConnection,
		}
	);
	const webCrawlQueue = new Queue<WebCrawlJobData>(QUEUE_NAMES.WEB_CRAWL, {
		connection: boardConnection,
	});
	bullBoardQueues.push(
		messageQueue,
		lifecycleEmailQueue,
		aiAgentQueue,
		aiAgentBackgroundQueue,
		webCrawlQueue
	);

	const serverAdapter = new HonoAdapter(serveStatic);
	createBullBoard({
		queues: [
			new BullMQAdapter(messageQueue),
			new BullMQAdapter(lifecycleEmailQueue),
			new BullMQAdapter(aiAgentQueue),
			new BullMQAdapter(aiAgentBackgroundQueue),
			new BullMQAdapter(webCrawlQueue),
		],
		serverAdapter,
	});
	const bullBoardBasePath = "/queues";
	serverAdapter.setBasePath(bullBoardBasePath);

	if (env.BULL_BOARD_TOKEN) {
		app.use(`${bullBoardBasePath}/*`, async (c, next) => {
			const headerToken =
				c.req.header("x-bull-board-token") ??
				c.req.header("authorization")?.replace("Bearer ", "");
			if (headerToken !== env.BULL_BOARD_TOKEN) {
				return c.json({ error: "Unauthorized" }, 401);
			}
			await next();
		});
	}

	app.route(bullBoardBasePath, serverAdapter.registerPlugin());
	console.log(
		`[workers] Bull Board enabled at ${bullBoardBasePath} using redis=${getSafeRedisUrl(
			env.REDIS_URL
		)}`
	);
} else {
	console.log("[workers] Bull Board disabled");
}

console.log(`[workers] Starting workers server on port ${env.PORT}`);

const server = serve({
	fetch: app.fetch,
	port: env.PORT,
});

// Graceful shutdown
const shutdown = async () => {
	console.log("[workers] Shutting down...");
	await stopAllWorkers();
	await Promise.all(bullBoardQueues.map((queue) => queue.close()));
	await conversationLogRouter.stop();
	await redis.quit();
	server.close();
	process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
