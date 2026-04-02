import type { Database } from "@api/db";
import {
	setConversationAiPausedUntil,
	updateConversationAiCursor,
} from "@api/db/mutations/conversation";
import {
	getConversationById,
	getLatestTriggerableMessage,
} from "@api/db/queries/conversation";
import type { ConversationSelect } from "@api/db/schema/conversation";
import { env } from "@api/env";
import { clearAiAgentRunCursor } from "@plasma/jobs";
import type { Redis } from "@plasma/redis";

const DEFAULT_MANUAL_PAUSE_MINUTES = 15;
type PauseMode = "extend" | "replace";

function getFuturePauseTimeMs(
	pauseUntil: string | null | undefined
): number | null {
	if (!pauseUntil) {
		return null;
	}

	const parsed = Date.parse(pauseUntil);
	if (Number.isNaN(parsed) || parsed <= Date.now()) {
		return null;
	}

	return parsed;
}

function getPauseTtlSeconds(pauseUntil: string): number {
	const pauseTime = Date.parse(pauseUntil);
	if (Number.isNaN(pauseTime)) {
		return 0;
	}

	return Math.max(0, Math.ceil((pauseTime - Date.now()) / 1000));
}

function computePauseUntil(
	currentPauseUntil: string | null | undefined,
	durationMinutes: number,
	mode: PauseMode
): string {
	const now = Date.now();
	const requestedUntil = now + durationMinutes * 60 * 1000;
	if (mode === "replace") {
		return new Date(requestedUntil).toISOString();
	}

	const currentPauseMs = getFuturePauseTimeMs(currentPauseUntil);
	const finalPauseMs =
		currentPauseMs && currentPauseMs > requestedUntil
			? currentPauseMs
			: requestedUntil;

	return new Date(finalPauseMs).toISOString();
}

async function setPauseKey(
	redis: Redis,
	conversationId: string,
	pauseUntil: string
): Promise<void> {
	const ttlSeconds = getPauseTtlSeconds(pauseUntil);
	if (ttlSeconds <= 0) {
		return;
	}

	await redis.set(
		getAiAgentPausedKey(conversationId),
		pauseUntil,
		"EX",
		ttlSeconds
	);
}

export function getAiAgentPausedKey(conversationId: string): string {
	return `ai-agent:paused:${conversationId}`;
}

export function getAiAgentOutboundPublicKey(conversationId: string): string {
	return `ai-agent:outbound-public:${conversationId}`;
}

export async function isAiPausedInRedis(
	redis: Redis,
	conversationId: string
): Promise<boolean> {
	const value = await redis.get(getAiAgentPausedKey(conversationId));
	return value !== null;
}

export async function isAiPausedForConversation(params: {
	db: Database;
	redis: Redis;
	conversationId: string;
	fallbackPausedUntil?: string | null;
	skipDbLookup?: boolean;
}): Promise<boolean> {
	if (await isAiPausedInRedis(params.redis, params.conversationId)) {
		return true;
	}

	const fallbackPauseMs = getFuturePauseTimeMs(params.fallbackPausedUntil);
	if (fallbackPauseMs) {
		await setPauseKey(
			params.redis,
			params.conversationId,
			new Date(fallbackPauseMs).toISOString()
		);
		return true;
	}
	if (params.skipDbLookup) {
		return false;
	}

	const conversation = await getConversationById(params.db, {
		conversationId: params.conversationId,
	});
	const pauseMs = getFuturePauseTimeMs(conversation?.aiPausedUntil ?? null);
	if (!pauseMs) {
		return false;
	}

	await setPauseKey(
		params.redis,
		params.conversationId,
		new Date(pauseMs).toISOString()
	);
	return true;
}

export async function pauseAiForConversation(params: {
	db: Database;
	redis: Redis;
	conversationId: string;
	organizationId: string;
	durationMinutes?: number;
	reason: string;
	mode?: PauseMode;
}): Promise<ConversationSelect | null> {
	const conversation = await getConversationById(params.db, {
		conversationId: params.conversationId,
	});

	if (!conversation || conversation.organizationId !== params.organizationId) {
		return null;
	}

	const durationMinutes =
		params.durationMinutes ?? DEFAULT_MANUAL_PAUSE_MINUTES;
	const mode = params.mode ?? "extend";
	const pauseUntil = computePauseUntil(
		conversation.aiPausedUntil,
		durationMinutes,
		mode
	);
	const updated = await setConversationAiPausedUntil(params.db, {
		conversationId: conversation.id,
		organizationId: conversation.organizationId,
		aiPausedUntil: pauseUntil,
	});

	if (!updated) {
		return null;
	}

	await Promise.all([
		setPauseKey(params.redis, conversation.id, pauseUntil),
		clearAiAgentRunCursor(params.redis, conversation.id),
		params.redis.del(getAiAgentOutboundPublicKey(conversation.id)),
	]);

	const latestTriggerableMessage = await getLatestTriggerableMessage(
		params.db,
		{
			organizationId: conversation.organizationId,
			conversationId: conversation.id,
		}
	);

	if (latestTriggerableMessage) {
		await updateConversationAiCursor(params.db, {
			conversationId: conversation.id,
			organizationId: conversation.organizationId,
			messageId: latestTriggerableMessage.id,
			messageCreatedAt: latestTriggerableMessage.createdAt,
		});
	}

	console.warn(
		`[ai-agent:kill-switch] conv=${conversation.id} | paused_until=${pauseUntil} | reason=${params.reason}`
	);

	return updated;
}

export async function resumeAiForConversation(params: {
	db: Database;
	redis: Redis;
	conversationId: string;
	organizationId: string;
}): Promise<ConversationSelect | null> {
	const updated = await setConversationAiPausedUntil(params.db, {
		conversationId: params.conversationId,
		organizationId: params.organizationId,
		aiPausedUntil: null,
	});

	if (!updated) {
		return null;
	}

	await params.redis.del(getAiAgentPausedKey(params.conversationId));
	await params.redis.del(getAiAgentOutboundPublicKey(params.conversationId));
	console.log(`[ai-agent:kill-switch] conv=${params.conversationId} | resumed`);

	return updated;
}

export async function recordOutboundPublicAiMessageAndMaybePause(params: {
	db: Database;
	redis: Redis;
	conversationId: string;
	organizationId: string;
	messageId: string;
}): Promise<{
	paused: boolean;
	messageCount: number;
	pauseUntil: string | null;
}> {
	const key = getAiAgentOutboundPublicKey(params.conversationId);
	const now = Date.now();
	const rogueWindowMs = env.AI_AGENT_ROGUE_WINDOW_SECONDS * 1000;
	const cutoff = now - rogueWindowMs;
	const ttlSeconds = Math.max(60, env.AI_AGENT_ROGUE_WINDOW_SECONDS * 2);

	const results = await params.redis
		.multi()
		.zadd(key, "NX", now.toString(), params.messageId)
		.zremrangebyscore(key, "0", cutoff.toString())
		.zcard(key)
		.expire(key, ttlSeconds)
		.exec();

	const messageCount = Number(results?.[2]?.[1] ?? 0);
	if (messageCount <= env.AI_AGENT_ROGUE_MAX_PUBLIC_MESSAGES) {
		return {
			paused: false,
			messageCount,
			pauseUntil: null,
		};
	}

	const updatedConversation = await pauseAiForConversation({
		db: params.db,
		redis: params.redis,
		conversationId: params.conversationId,
		organizationId: params.organizationId,
		durationMinutes: env.AI_AGENT_ROGUE_PAUSE_MINUTES,
		reason: "auto-rogue-protection",
	});

	return {
		paused: Boolean(updatedConversation),
		messageCount,
		pauseUntil: updatedConversation?.aiPausedUntil ?? null,
	};
}
