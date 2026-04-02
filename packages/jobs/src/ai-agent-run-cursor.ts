import type { Redis } from "@plasma/redis";

const RUN_CURSOR_TTL_SECONDS = 86_400; // 24h

export type AiAgentRunCursor = {
	messageId: string;
	messageCreatedAt: string;
};

export function getAiAgentRunCursorKey(conversationId: string): string {
	return `ai-agent:run-cursor:${conversationId}`;
}

export async function getAiAgentRunCursor(
	redis: Redis,
	conversationId: string
): Promise<AiAgentRunCursor | null> {
	const raw = await redis.get(getAiAgentRunCursorKey(conversationId));
	if (!raw) {
		return null;
	}

	try {
		const parsed = JSON.parse(raw) as Partial<AiAgentRunCursor>;
		if (
			typeof parsed.messageId !== "string" ||
			typeof parsed.messageCreatedAt !== "string"
		) {
			return null;
		}
		return {
			messageId: parsed.messageId,
			messageCreatedAt: parsed.messageCreatedAt,
		};
	} catch {
		return null;
	}
}

export async function setAiAgentRunCursorIfAbsent(
	redis: Redis,
	params: {
		conversationId: string;
		messageId: string;
		messageCreatedAt: string;
	}
): Promise<boolean> {
	const key = getAiAgentRunCursorKey(params.conversationId);
	const payload: AiAgentRunCursor = {
		messageId: params.messageId,
		messageCreatedAt: params.messageCreatedAt,
	};

	const result = await redis.set(
		key,
		JSON.stringify(payload),
		"EX",
		RUN_CURSOR_TTL_SECONDS,
		"NX"
	);
	return result === "OK";
}

export async function setAiAgentRunCursor(
	redis: Redis,
	params: {
		conversationId: string;
		messageId: string;
		messageCreatedAt: string;
	}
): Promise<void> {
	const key = getAiAgentRunCursorKey(params.conversationId);
	const payload: AiAgentRunCursor = {
		messageId: params.messageId,
		messageCreatedAt: params.messageCreatedAt,
	};

	await redis.set(key, JSON.stringify(payload), "EX", RUN_CURSOR_TTL_SECONDS);
}

export async function clearAiAgentRunCursor(
	redis: Redis,
	conversationId: string
): Promise<void> {
	await redis.del(getAiAgentRunCursorKey(conversationId));
}

export async function clearAiAgentRunCursorIfMatches(
	redis: Redis,
	params: {
		conversationId: string;
		messageId: string;
		messageCreatedAt: string;
	}
): Promise<boolean> {
	const key = getAiAgentRunCursorKey(params.conversationId);
	const payload = JSON.stringify({
		messageId: params.messageId,
		messageCreatedAt: params.messageCreatedAt,
	} satisfies AiAgentRunCursor);

	// Atomic compare-and-delete to avoid deleting a newer cursor written concurrently.
	const deleted = await redis.eval(
		"if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
		1,
		key,
		payload
	);

	return Number(deleted) === 1;
}
