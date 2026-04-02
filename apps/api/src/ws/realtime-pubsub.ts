import { env } from "@api/env";
import {
	type AnyRealtimeEvent,
	isValidEventType,
	type RealtimeEvent,
	validateRealtimeEvent,
} from "@plasma/types/realtime-events";
import Redis, { type RedisOptions } from "ioredis";
import type { DispatchOptions } from "./router";

const STREAM_KEY = "realtime:dispatch";
const STREAM_MAX_LEN = 10_000;
const STREAM_FIELD = "payload";
const STREAM_BLOCK_MS = 5000;
const STREAM_BATCH_SIZE = 50;
const MAX_PUBLISH_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 100;
const CURSOR_PERSIST_INTERVAL_MS = 1000;
const CURSOR_KEY_PREFIX = "realtime:cursor:";

const instanceId = `api-${process.pid ?? "pid"}-${Math.random()
	.toString(36)
	.slice(2, 10)}`;

const redisOptions: RedisOptions = {
	lazyConnect: true,
	maxRetriesPerRequest: null,
	enableAutoPipelining: true,
	reconnectOnError: (error) => {
		console.error("[RealtimeRedis] Connection error", error);
		return true;
	},
	retryStrategy: (attempt) => Math.min(1000 * attempt, 5000),
};

let publisher: Redis | null = null;
let subscriber: Redis | null = null;

type DispatchTarget =
	| {
			type: "connection";
			id: string;
	  }
	| {
			type: "visitor" | "website";
			id: string;
			exclude?: string[];
	  };

type DispatchEnvelope = {
	sourceId: string;
	target: DispatchTarget;
	event: AnyRealtimeEvent;
};

type LocalDispatchers = {
	connection: (connectionId: string, event: AnyRealtimeEvent) => void;
	visitor: (
		visitorId: string,
		event: AnyRealtimeEvent,
		options?: DispatchOptions
	) => void;
	website: (
		websiteId: string,
		event: AnyRealtimeEvent,
		options?: DispatchOptions
	) => void;
};

let dispatchersRef: LocalDispatchers | null = null;
let consumerRunning = false;
let lastSeenId = "$";
let lastProcessedId: string | null = null;
let cursorPersistTimer: ReturnType<typeof setTimeout> | null = null;

const instanceCursorKey = `${CURSOR_KEY_PREFIX}${instanceId}`;

function setInitialLastSeenId(): void {
	lastSeenId = "$";
}

function markProcessed(id: string): void {
	lastProcessedId = id;

	if (cursorPersistTimer) {
		return;
	}

	cursorPersistTimer = setTimeout(() => {
		cursorPersistTimer = null;
		const idToPersist = lastProcessedId;
		if (!idToPersist || idToPersist === "$") {
			return;
		}

		void getPublisher()
			.then((client) => client.set(instanceCursorKey, idToPersist))
			.catch((error) => {
				console.error("[RealtimeStreams] Failed to persist cursor", error);
			});
	}, CURSOR_PERSIST_INTERVAL_MS);
}

function createRedisClient(role: "publisher" | "subscriber"): Redis {
	const client = new Redis(`${env.REDIS_URL}?family=0`, redisOptions);
	client.on("error", (error) => {
		console.error(`[RealtimeRedis] ${role} error`, error);
	});
	client.on("end", () => {
		console.warn(`[RealtimeRedis] ${role} connection ended`);
	});

	return client;
}

async function getPublisher(): Promise<Redis> {
	if (!publisher) {
		publisher = createRedisClient("publisher");
	}

	if (publisher.status === "wait") {
		await publisher.connect();
	}

	return publisher;
}

async function getSubscriber(): Promise<Redis> {
	if (!subscriber) {
		subscriber = createRedisClient("subscriber");
	}

	if (subscriber.status === "wait") {
		await subscriber.connect();
	}

	return subscriber;
}

async function loadCursor(): Promise<void> {
	try {
		const client = await getPublisher();
		const storedCursor = await client.get(instanceCursorKey);
		if (storedCursor) {
			lastSeenId = storedCursor;
			lastProcessedId = storedCursor;
		} else {
			setInitialLastSeenId();
		}
	} catch (error) {
		console.error("[RealtimeStreams] Failed to load cursor", error);
		setInitialLastSeenId();
	}
}

function normalizeExclude(options?: DispatchOptions): string[] | undefined {
	if (!options?.exclude) {
		return;
	}

	return Array.isArray(options.exclude) ? options.exclude : [options.exclude];
}

function handleEnvelope(envelope: DispatchEnvelope | undefined): void {
	if (!envelope) {
		return;
	}

	const dispatchers = dispatchersRef;
	if (!dispatchers) {
		return;
	}

	const { event, target } = envelope;

	if (!isValidEventType(event.type)) {
		console.error("[RealtimePubSub] Ignoring invalid event type", event.type);
		return;
	}

	try {
		validateRealtimeEvent(event.type, event.payload);
	} catch (error) {
		console.error(
			"[RealtimePubSub] Ignoring event with invalid payload",
			error
		);
		return;
	}

	const exclude =
		target.type === "connection"
			? undefined
			: target.exclude?.filter(
					(value): value is string => typeof value === "string"
				);
	const options = exclude?.length
		? ({ exclude } satisfies DispatchOptions)
		: undefined;

	try {
		switch (target.type) {
			case "connection": {
				dispatchers.connection(target.id, event);
				break;
			}
			case "visitor": {
				dispatchers.visitor(target.id, event, options);
				break;
			}
			case "website": {
				dispatchers.website(target.id, event, options);
				break;
			}
			default: {
				const exhaustiveCheck: never = target;
				console.error(
					"[RealtimePubSub] Unsupported dispatch target",
					exhaustiveCheck
				);
			}
		}
	} catch (error) {
		console.error("[RealtimePubSub] Failed to dispatch realtime event", error);
	}
}

function fieldsToRecord(fields: string[]): Record<string, string> {
	const record: Record<string, string> = {};
	for (let index = 0; index < fields.length; index += 2) {
		const key = fields[index];
		const value = fields[index + 1];
		if (typeof key === "string" && typeof value === "string") {
			record[key] = value;
		}
	}

	return record;
}

function parseStreamEntry(fields: string[]): DispatchEnvelope | null {
	const record = fieldsToRecord(fields);
	const payload = record[STREAM_FIELD];

	if (!payload) {
		return null;
	}

	try {
		const parsed = JSON.parse(payload) as DispatchEnvelope;
		return parsed;
	} catch (error) {
		console.error("[RealtimeStreams] Failed to parse payload", error);
		return null;
	}
}

async function processStreamEntries(
	entries: [string, string[]][]
): Promise<void> {
	for (const [id, fields] of entries) {
		const envelope = parseStreamEntry(fields);
		if (!envelope) {
			continue;
		}

		lastSeenId = id;
		markProcessed(id);
		handleEnvelope(envelope);
	}
}

async function runConsumerLoop(): Promise<void> {
	if (!dispatchersRef) {
		return;
	}

	if (consumerRunning) {
		return;
	}

	consumerRunning = true;

	await loadCursor();

	while (dispatchersRef) {
		try {
			const client = await getSubscriber();
			// Work around ioredis typing issue with BLOCK and COUNT parameters
			const response = await (
				client.xread as (
					...args: unknown[]
				) => Promise<[string, [string, string[]][]][] | null>
			)(
				"BLOCK",
				STREAM_BLOCK_MS,
				"COUNT",
				STREAM_BATCH_SIZE,
				"STREAMS",
				STREAM_KEY,
				lastSeenId
			);

			if (!response) {
				continue;
			}

			for (const [, entries] of response) {
				await processStreamEntries(entries);
			}
		} catch (error) {
			console.error("[RealtimeStreams] Consumer loop error", error);
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	}

	consumerRunning = false;
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
				// TODO: route to central logger; avoid console
				// logger.error({ err: error, attempt }, "Failed to publish realtime event");
				throw error;
			}
			const retryDelay = BASE_RETRY_DELAY_MS * 2 ** attempt;
			await sleep(retryDelay);
		}
	}
}

export function initializeRealtimePubSub(dispatchers: LocalDispatchers): void {
	dispatchersRef = dispatchers;

	void runConsumerLoop();
}

export function publishToConnection(
	connectionId: string,
	event: AnyRealtimeEvent
): Promise<void> {
	const envelope: DispatchEnvelope = {
		sourceId: instanceId,
		target: { type: "connection", id: connectionId },
		event,
	};

	return publishEnvelope(envelope);
}

export function publishToVisitor(
	visitorId: string,
	event: AnyRealtimeEvent,
	options?: DispatchOptions
): Promise<void> {
	const exclude = normalizeExclude(options);
	const envelope: DispatchEnvelope = {
		sourceId: instanceId,
		target: {
			type: "visitor",
			id: visitorId,
			exclude,
		},
		event,
	};

	return publishEnvelope(envelope);
}

export function publishToWebsite(
	websiteId: string,
	event: AnyRealtimeEvent,
	options?: DispatchOptions
): Promise<void> {
	const exclude = normalizeExclude(options);
	const envelope: DispatchEnvelope = {
		sourceId: instanceId,
		target: {
			type: "website",
			id: websiteId,
			exclude,
		},
		event,
	};

	return publishEnvelope(envelope);
}
