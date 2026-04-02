import type { DatabaseClient } from "@api/db";
import {
	contact,
	conversation,
	conversationTimelineItem,
	member,
	teamMember,
} from "@api/db/schema";
import { ConversationTimelineType } from "@plasma/types";
import type { ConversationHardLimitCutoff } from "@plasma/types/trpc/conversation-hard-limit";

export type { ConversationHardLimitCutoff } from "@plasma/types/trpc/conversation-hard-limit";
export { isConversationAfterHardLimitCutoff } from "@plasma/types/trpc/conversation-hard-limit";

import { and, asc, count, eq, gte, isNull } from "drizzle-orm";

export const HARD_LIMIT_ROLLING_WINDOW_DAYS = 30;

const HARD_LIMIT_ROLLING_WINDOW_MS =
	HARD_LIMIT_ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export type ConversationHardLimitCutoffResult = {
	reached: boolean;
	cutoff: ConversationHardLimitCutoff | null;
	hasOverflow: boolean;
};

export function getHardLimitRollingWindowStart(now: Date = new Date()): string {
	return new Date(now.getTime() - HARD_LIMIT_ROLLING_WINDOW_MS).toISOString();
}

function resolveWindowStart(windowStart?: string): string {
	return windowStart ?? getHardLimitRollingWindowStart();
}

/**
 * Get the count of messages for a website
 * Messages are stored in conversationTimelineItem where type = 'MESSAGE'
 * Note: conversationTimelineItem doesn't have websiteId directly, so we join with conversation
 */
export async function getMessageCount(
	db: DatabaseClient,
	params: {
		websiteId: string;
		organizationId: string;
	}
): Promise<number> {
	const result = await db
		.select({ count: count() })
		.from(conversationTimelineItem)
		.innerJoin(
			conversation,
			eq(conversation.id, conversationTimelineItem.conversationId)
		)
		.where(
			and(
				eq(conversation.websiteId, params.websiteId),
				eq(conversationTimelineItem.organizationId, params.organizationId),
				eq(conversationTimelineItem.type, ConversationTimelineType.MESSAGE),
				isNull(conversationTimelineItem.deletedAt),
				isNull(conversation.deletedAt)
			)
		);

	return result[0]?.count ?? 0;
}

/**
 * Get the count of messages in the rolling hard-limit window.
 */
export async function getRollingWindowMessageCount(
	db: DatabaseClient,
	params: {
		websiteId: string;
		organizationId: string;
		windowStart?: string;
	}
): Promise<number> {
	const windowStart = resolveWindowStart(params.windowStart);

	const result = await db
		.select({ count: count() })
		.from(conversationTimelineItem)
		.innerJoin(
			conversation,
			eq(conversation.id, conversationTimelineItem.conversationId)
		)
		.where(
			and(
				eq(conversation.websiteId, params.websiteId),
				eq(conversation.organizationId, params.organizationId),
				eq(conversationTimelineItem.organizationId, params.organizationId),
				eq(conversationTimelineItem.type, ConversationTimelineType.MESSAGE),
				gte(conversationTimelineItem.createdAt, windowStart),
				isNull(conversationTimelineItem.deletedAt)
			)
		);

	return result[0]?.count ?? 0;
}

/**
 * Get the count of contacts for a website
 */
export async function getContactCount(
	db: DatabaseClient,
	params: {
		websiteId: string;
		organizationId: string;
	}
): Promise<number> {
	const result = await db
		.select({ count: count() })
		.from(contact)
		.where(
			and(
				eq(contact.websiteId, params.websiteId),
				eq(contact.organizationId, params.organizationId),
				isNull(contact.deletedAt)
			)
		);

	return result[0]?.count ?? 0;
}

/**
 * Get the count of conversations for a website
 */
export async function getConversationCount(
	db: DatabaseClient,
	params: {
		websiteId: string;
		organizationId: string;
	}
): Promise<number> {
	const result = await db
		.select({ count: count() })
		.from(conversation)
		.where(
			and(
				eq(conversation.websiteId, params.websiteId),
				eq(conversation.organizationId, params.organizationId),
				isNull(conversation.deletedAt)
			)
		);

	return result[0]?.count ?? 0;
}

/**
 * Get the count of conversations in the rolling hard-limit window.
 */
export async function getRollingWindowConversationCount(
	db: DatabaseClient,
	params: {
		websiteId: string;
		organizationId: string;
		windowStart?: string;
	}
): Promise<number> {
	const windowStart = resolveWindowStart(params.windowStart);

	const result = await db
		.select({ count: count() })
		.from(conversation)
		.where(
			and(
				eq(conversation.websiteId, params.websiteId),
				eq(conversation.organizationId, params.organizationId),
				gte(conversation.createdAt, windowStart)
			)
		);

	return result[0]?.count ?? 0;
}

/**
 * Efficiently checks whether the rolling-window message limit is reached.
 * Uses OFFSET(limit - 1) to avoid counting every row on hot enforcement paths.
 */
export async function isRollingWindowMessageLimitReached(
	db: DatabaseClient,
	params: {
		websiteId: string;
		organizationId: string;
		limit: number | null;
		windowStart?: string;
	}
): Promise<boolean> {
	if (params.limit === null) {
		return false;
	}

	if (params.limit <= 0) {
		return true;
	}

	const windowStart = resolveWindowStart(params.windowStart);

	const rows = await db
		.select({
			id: conversationTimelineItem.id,
		})
		.from(conversationTimelineItem)
		.innerJoin(
			conversation,
			eq(conversation.id, conversationTimelineItem.conversationId)
		)
		.where(
			and(
				eq(conversation.websiteId, params.websiteId),
				eq(conversation.organizationId, params.organizationId),
				eq(conversationTimelineItem.organizationId, params.organizationId),
				eq(conversationTimelineItem.type, ConversationTimelineType.MESSAGE),
				gte(conversationTimelineItem.createdAt, windowStart),
				isNull(conversationTimelineItem.deletedAt)
			)
		)
		.orderBy(
			asc(conversationTimelineItem.createdAt),
			asc(conversationTimelineItem.id)
		)
		.offset(params.limit - 1)
		.limit(1);

	return rows.length > 0;
}

/**
 * Returns the Nth conversation (N = limit) in the rolling window, plus whether
 * any conversation exists after it (overflow), to support dashboard lock logic.
 */
export async function getRollingWindowConversationHardLimitCutoff(
	db: DatabaseClient,
	params: {
		websiteId: string;
		organizationId: string;
		limit: number | null;
		windowStart?: string;
	}
): Promise<ConversationHardLimitCutoffResult> {
	if (params.limit === null) {
		return {
			reached: false,
			cutoff: null,
			hasOverflow: false,
		};
	}

	if (params.limit <= 0) {
		return {
			reached: true,
			cutoff: null,
			hasOverflow: true,
		};
	}

	const windowStart = resolveWindowStart(params.windowStart);

	const rows = await db
		.select({
			id: conversation.id,
			createdAt: conversation.createdAt,
		})
		.from(conversation)
		.where(
			and(
				eq(conversation.websiteId, params.websiteId),
				eq(conversation.organizationId, params.organizationId),
				gte(conversation.createdAt, windowStart)
			)
		)
		.orderBy(asc(conversation.createdAt), asc(conversation.id))
		.offset(params.limit - 1)
		.limit(2);

	const cutoff = rows[0];

	if (!cutoff) {
		return {
			reached: false,
			cutoff: null,
			hasOverflow: false,
		};
	}

	return {
		reached: true,
		cutoff: {
			id: cutoff.id,
			createdAt: cutoff.createdAt,
		},
		hasOverflow: rows.length > 1,
	};
}

/**
 * Get the count of team members for a website
 * Counts team members of the website's team
 */
export async function getTeamMemberCount(
	db: DatabaseClient,
	params: {
		teamId: string;
		organizationId: string;
	}
): Promise<number> {
	const [teamUsers, organizationMembers] = await Promise.all([
		db
			.select({
				userId: teamMember.userId,
			})
			.from(teamMember)
			.where(eq(teamMember.teamId, params.teamId)),
		db
			.select({
				userId: member.userId,
				role: member.role,
			})
			.from(member)
			.where(eq(member.organizationId, params.organizationId)),
	]);

	const ids = new Set(teamUsers.map((row) => row.userId));

	for (const organizationMember of organizationMembers) {
		const roles = organizationMember.role
			.split(",")
			.map((role) => role.trim().toLowerCase());
		if (roles.includes("owner") || roles.includes("admin")) {
			ids.add(organizationMember.userId);
		}
	}

	return ids.size;
}

/**
 * Get all usage counts for a website in a single call
 */
export async function getWebsiteUsageCounts(
	db: DatabaseClient,
	params: {
		websiteId: string;
		organizationId: string;
		teamId: string;
	}
): Promise<{
	messages: number;
	contacts: number;
	conversations: number;
	teamMembers: number;
}> {
	const [messages, contacts, conversations, teamMembers] = await Promise.all([
		getMessageCount(db, params),
		getContactCount(db, params),
		getConversationCount(db, params),
		getTeamMemberCount(db, {
			teamId: params.teamId,
			organizationId: params.organizationId,
		}),
	]);

	return {
		messages,
		contacts,
		conversations,
		teamMembers,
	};
}
