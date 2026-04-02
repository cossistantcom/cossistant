import type {
	AnyRealtimeEvent,
	RealtimeEvent,
	RealtimeEventData,
	RealtimeEventType,
} from "@plasma/types/realtime-events";
import Redis, { type RedisOptions } from "ioredis";
import { env } from "./env";

const STREAM_KEY = "realtime:dispatch";
const STREAM_MAX_LEN = 10_000;
const STREAM_FIELD = "payload";
const MAX_PUBLISH_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 100;

const instanceId = `worker-${process.pid ?? "pid"}-${Math.random()
	.toString(36)
	.slice(2, 10)}`;

const redisOptions: RedisOptions = {
	lazyConnect: true,
	maxRetriesPerRequest: null,
	enableAutoPipelining: true,
	reconnectOnError: (error) => {
		console.error("[WorkerRealtime] Connection error", error);
		return true;
	},
	retryStrategy: (attempt) => Math.min(1000 * attempt, 5000),
};

let publisher: Redis | null = null;

type DispatchTarget = {
	type: "website";
	id: string;
	exclude?: string[];
};

type DispatchEnvelope = {
	sourceId: string;
	target: DispatchTarget;
	event: AnyRealtimeEvent;
};

function createRedisClient(): Redis {
	const client = new Redis(`${env.REDIS_URL}?family=0`, redisOptions);
	client.on("error", (error) => {
		console.error("[WorkerRealtime] Redis error", error);
	});
	client.on("end", () => {
		console.warn("[WorkerRealtime] Redis connection ended");
	});

	return client;
}

async function getPublisher(): Promise<Redis> {
	if (!publisher) {
		publisher = createRedisClient();
	}

	if (publisher.status === "wait") {
		await publisher.connect();
	}

	return publisher;
}

async function publishEnvelope(envelope: DispatchEnvelope): Promise<void> {
	const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
	for (let attempt = 0; attempt <= MAX_PUBLISH_RETRIES; attempt++) {
		try {
			const client = await getPublisher();
			await client.xadd(
				STREAM_KEY,
				"MAXLEN",
				"~",
				STREAM_MAX_LEN,
				"*",
				STREAM_FIELD,
				JSON.stringify(envelope)
			);
			return; // success
		} catch (error) {
			if (attempt === MAX_PUBLISH_RETRIES) {
				console.error("[WorkerRealtime] Failed to publish event", error);
				throw error;
			}
			const retryDelay = BASE_RETRY_DELAY_MS * 2 ** attempt;
			await sleep(retryDelay);
		}
	}
}

/**
 * Emit a realtime event to all connections for a website
 */
export async function emitToWebsite<T extends RealtimeEventType>(
	websiteId: string,
	type: T,
	payload: RealtimeEventData<T>
): Promise<void> {
	const event: RealtimeEvent<T> = {
		type,
		payload,
	};

	const envelope: DispatchEnvelope = {
		sourceId: instanceId,
		target: {
			type: "website",
			id: websiteId,
		},
		event: event as AnyRealtimeEvent,
	};

	try {
		await publishEnvelope(envelope);
	} catch (error) {
		// Log but don't throw - realtime failures shouldn't break the worker
		console.error(
			`[WorkerRealtime] Failed to emit ${type} for website ${websiteId}`,
			error
		);
	}
}

/**
 * Close the Redis connection (call on worker shutdown)
 */
export async function closeRealtimeConnection(): Promise<void> {
	if (publisher) {
		await publisher.quit();
		publisher = null;
	}
}
