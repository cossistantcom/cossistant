/** biome-ignore-all lint/style/noNonNullAssertion: ok here */
import { DEFAULT_PAGE_LIMIT } from "@api/constants";
import type { Database } from "@api/db";
import { getConversationVisibleVisitorIds } from "@api/db/queries/conversation-access";
import { listActiveKnowledgeClarificationSummariesForConversations } from "@api/db/queries/knowledge-clarification";

import {
	contact,
	conversation,
	conversationAssignee,
	conversationSeen,
	conversationTimelineItem,
	conversationView,
	visitor,
} from "@api/db/schema";
import { trackConversationMetricForVisitor } from "@api/lib/tinybird-sdk";
import { generateShortPrimaryId } from "@api/utils/db/ids";

import {
	ConversationStatus,
	ConversationTimelineType,
	TimelineItemVisibility,
	type TimelineItemVisibility as TimelineItemVisibilityEnum,
} from "@cossistant/types";
import {
	type TimelineItem,
	timelineItemPartsSchema,
} from "@cossistant/types/api/timeline-item";
import type { ConversationSeen } from "@cossistant/types/schemas";
import type { ConversationHeader } from "@cossistant/types/trpc/conversation";

import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	gte,
	ilike,
	inArray,
	isNotNull,
	isNull,
	lt,
	lte,
	or,
	sql,
} from "drizzle-orm";

const TIMELINE_ITEM_TYPES: ConversationTimelineType[] = [
	ConversationTimelineType.MESSAGE,
	ConversationTimelineType.EVENT,
	ConversationTimelineType.IDENTIFICATION,
	ConversationTimelineType.TOOL,
];

function isConversationTimelineType(
	value: unknown
): value is ConversationTimelineType {
	return TIMELINE_ITEM_TYPES.includes(value as ConversationTimelineType);
}

type ConversationTimelineItemRow = typeof conversationTimelineItem.$inferSelect;

export async function getConversationTimelineItemByIdForOrganization(
	db: Database,
	params: {
		timelineItemId: string;
		organizationId: string;
	}
): Promise<ConversationTimelineItemRow | null> {
	const [timelineItem] = await db
		.select()
		.from(conversationTimelineItem)
		.where(
			and(
				eq(conversationTimelineItem.id, params.timelineItemId),
				eq(conversationTimelineItem.organizationId, params.organizationId)
			)
		)
		.limit(1);

	return timelineItem ?? null;
}

export type ConversationMessageTranslationRow = {
	id: string;
	text: string | null;
	parts: unknown;
	userId: string | null;
	visitorId: string | null;
	aiAgentId: string | null;
};

export async function getConversationMessageTimelineItemForTranslation(
	db: Database,
	params: {
		timelineItemId: string;
		organizationId: string;
		conversationId: string;
	}
): Promise<ConversationMessageTranslationRow | null> {
	const [row] = await db
		.select({
			id: conversationTimelineItem.id,
			text: conversationTimelineItem.text,
			parts: conversationTimelineItem.parts,
			userId: conversationTimelineItem.userId,
			visitorId: conversationTimelineItem.visitorId,
			aiAgentId: conversationTimelineItem.aiAgentId,
		})
		.from(conversationTimelineItem)
		.where(
			and(
				eq(conversationTimelineItem.id, params.timelineItemId),
				eq(conversationTimelineItem.organizationId, params.organizationId),
				eq(conversationTimelineItem.conversationId, params.conversationId),
				eq(conversationTimelineItem.type, "message"),
				isNull(conversationTimelineItem.deletedAt)
			)
		)
		.limit(1);

	return row ?? null;
}

export async function listConversationMessageTimelineItemsForTranslation(
	db: Database,
	params: {
		timelineItemIds: string[];
		organizationId: string;
		conversationId: string;
	}
): Promise<ConversationMessageTranslationRow[]> {
	if (params.timelineItemIds.length === 0) {
		return [];
	}

	const orderById = new Map(
		params.timelineItemIds.map((id, index) => [id, index] as const)
	);

	const rows = await db
		.select({
			id: conversationTimelineItem.id,
			text: conversationTimelineItem.text,
			parts: conversationTimelineItem.parts,
			userId: conversationTimelineItem.userId,
			visitorId: conversationTimelineItem.visitorId,
			aiAgentId: conversationTimelineItem.aiAgentId,
		})
		.from(conversationTimelineItem)
		.where(
			and(
				inArray(conversationTimelineItem.id, params.timelineItemIds),
				eq(conversationTimelineItem.organizationId, params.organizationId),
				eq(conversationTimelineItem.conversationId, params.conversationId),
				eq(conversationTimelineItem.type, "message"),
				isNull(conversationTimelineItem.deletedAt)
			)
		);

	return rows.sort((left, right) => {
		const leftIndex = orderById.get(left.id) ?? Number.MAX_SAFE_INTEGER;
		const rightIndex = orderById.get(right.id) ?? Number.MAX_SAFE_INTEGER;
		return leftIndex - rightIndex;
	});
}

export async function getConversationSentimentSatisfactionAggregate(
	db: Database,
	params: {
		organizationId: string;
		websiteId: string;
		dateFrom: string;
		dateTo: string;
	}
): Promise<{ average: number | null; count: number }> {
	const [result] = await db
		.select({
			average: sql<number | null>`
				AVG(
					50 + (
						CASE
							WHEN ${conversation.sentiment} = 'positive' THEN 50
							WHEN ${conversation.sentiment} = 'negative' THEN -50
							ELSE 0
						END
					) * COALESCE(${conversation.sentimentConfidence}, 1)
				)
			`,
			count: sql<number>`COUNT(*)`,
		})
		.from(conversation)
		.where(
			and(
				eq(conversation.organizationId, params.organizationId),
				eq(conversation.websiteId, params.websiteId),
				isNull(conversation.deletedAt),
				isNotNull(conversation.sentiment),
				gte(conversation.startedAt, params.dateFrom),
				lt(conversation.startedAt, params.dateTo)
			)
		);

	return {
		average: result?.average ?? null,
		count: Number(result?.count ?? 0),
	};
}

function extractToolNameFromParts(parts: unknown[]): string | null {
	for (const part of parts) {
		if (
			typeof part === "object" &&
			part !== null &&
			"type" in part &&
			"toolName" in part &&
			typeof part.type === "string" &&
			part.type.startsWith("tool-") &&
			typeof part.toolName === "string"
		) {
			return part.toolName;
		}
	}

	return null;
}

export function mapTimelineRowToTimelineItem(
	row: ConversationTimelineItemRow
): TimelineItem | null {
	if (!isConversationTimelineType(row.type)) {
		return null;
	}

	const parsedPartsResult = timelineItemPartsSchema.safeParse(row.parts ?? []);

	if (!parsedPartsResult.success) {
		return null;
	}

	const parsedParts = parsedPartsResult.data;

	return {
		id: row.id,
		conversationId: row.conversationId,
		organizationId: row.organizationId,
		visibility: row.visibility,
		type: row.type,
		text: row.text,
		parts: parsedParts,
		userId: row.userId,
		visitorId: row.visitorId,
		aiAgentId: row.aiAgentId,
		createdAt: row.createdAt,
		deletedAt: row.deletedAt,
		tool: extractToolNameFromParts(parsedParts),
	};
}

export type UpsertConversationResult =
	| {
			status: "created";
			conversation: typeof conversation.$inferSelect;
	  }
	| {
			status: "existing";
			conversation: typeof conversation.$inferSelect;
	  }
	| {
			status: "conflict";
			reason: "ownership_mismatch" | "conflict_not_resolvable";
	  };

export async function upsertConversation(
	db: Database,
	params: {
		organizationId: string;
		websiteId: string;
		visitorId: string;
		conversationId?: string;
		channel?: string;
		metadata?: Record<string, string | number | boolean | null>;
		visitorLanguage?: string | null;
	}
): Promise<UpsertConversationResult> {
	const newConversationId = params.conversationId ?? generateShortPrimaryId();
	const now = new Date().toISOString();
	const insertValues: typeof conversation.$inferInsert = {
		id: newConversationId,
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		visitorId: params.visitorId,
		status: ConversationStatus.OPEN,
		createdAt: now,
	};

	if (params.metadata !== undefined) {
		insertValues.metadata = params.metadata;
	}

	insertValues.channel = params.channel ?? "widget";
	if (params.visitorLanguage) {
		insertValues.visitorLanguage = params.visitorLanguage;
	}

	// Upsert conversation
	const [insertedConversation] = await db
		.insert(conversation)
		.values(insertValues)
		.onConflictDoNothing({
			target: conversation.id,
		})
		.returning();

	// Track conversation_started event in Tinybird for analytics (only if actually inserted)
	if (insertedConversation) {
		void trackConversationMetricForVisitor(db, {
			website_id: params.websiteId,
			visitor_id: params.visitorId,
			conversation_id: newConversationId,
			event_type: "conversation_started",
		});

		return {
			status: "created",
			conversation: insertedConversation,
		};
	}

	const [existingConversation] = await db
		.select()
		.from(conversation)
		.where(eq(conversation.id, newConversationId))
		.limit(1);

	if (!existingConversation) {
		return {
			status: "conflict",
			reason: "conflict_not_resolvable",
		};
	}

	const sameOwner =
		existingConversation.organizationId === params.organizationId &&
		existingConversation.websiteId === params.websiteId &&
		existingConversation.visitorId === params.visitorId;

	if (!sameOwner) {
		return {
			status: "conflict",
			reason: "ownership_mismatch",
		};
	}

	return {
		status: "existing",
		conversation: existingConversation,
	};
}

export async function listConversations(
	db: Database,
	params: {
		organizationId: string;
		websiteId: string;
		visitorId: string;
		page?: number;
		limit?: number;
		status?: "open" | "closed";
		orderBy?: "createdAt" | "updatedAt";
		order?: "asc" | "desc";
	}
) {
	const page = params.page ?? 1;
	const limit = params.limit ?? 3;
	const offset = (page - 1) * limit;
	const orderBy = params.orderBy ?? "updatedAt";
	const order = params.order ?? "desc";
	const visibleVisitorIds = await getConversationVisibleVisitorIds(db, {
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		visitorId: params.visitorId,
	});
	const visitorScopeCondition =
		visibleVisitorIds.length === 0
			? sql`false`
			: visibleVisitorIds.length === 1
				? eq(conversation.visitorId, visibleVisitorIds[0]!)
				: inArray(conversation.visitorId, visibleVisitorIds);

	// Build where conditions
	const whereConditions = [
		eq(conversation.organizationId, params.organizationId),
		eq(conversation.websiteId, params.websiteId),
		visitorScopeCondition,
	];

	if (params.status) {
		// Map API status to database status
		const statusMap: Record<string, ConversationStatus> = {
			open: ConversationStatus.OPEN,
			closed: ConversationStatus.RESOLVED,
		};

		const dbStatus = statusMap[params.status];
		if (dbStatus) {
			whereConditions.push(eq(conversation.status, dbStatus));
		}
	}

	// Get total count
	const totalCountResult = await db
		.select({ totalCount: count() })
		.from(conversation)
		.where(and(...whereConditions));

	// Get paginated conversations with visitor's lastSeenAt
	const orderColumn =
		orderBy === "createdAt" ? conversation.createdAt : conversation.updatedAt;
	const orderFn = order === "desc" ? desc : asc;

	const conversationsWithSeen = await db
		.select({
			conversation,
			visitorLastSeenAt: conversationSeen.lastSeenAt,
		})
		.from(conversation)
		.leftJoin(
			conversationSeen,
			and(
				eq(conversationSeen.conversationId, conversation.id),
				eq(conversationSeen.visitorId, params.visitorId)
			)
		)
		.where(and(...whereConditions))
		.orderBy(orderFn(orderColumn))
		.limit(limit)
		.offset(offset);

	// Get conversation IDs for fetching last timeline items
	const conversationIds = conversationsWithSeen.map((c) => c.conversation.id);

	// Fetch last timeline items for each conversation if there are any conversations
	const lastTimelineItemsMap: Record<
		string,
		typeof conversationTimelineItem.$inferSelect
	> = {};

	if (conversationIds.length > 0) {
		// Get the last public message for each conversation (used for preview display)
		const timelineItems = await db
			.select()
			.from(conversationTimelineItem)
			.where(
				and(
					eq(conversationTimelineItem.organizationId, params.organizationId),
					inArray(conversationTimelineItem.conversationId, conversationIds),
					isNull(conversationTimelineItem.deletedAt),
					eq(conversationTimelineItem.type, ConversationTimelineType.MESSAGE),
					eq(conversationTimelineItem.visibility, TimelineItemVisibility.PUBLIC)
				)
			)
			.orderBy(desc(conversationTimelineItem.createdAt));

		// Group timeline items by conversation and take the first (latest) one for each
		for (const item of timelineItems) {
			if (!lastTimelineItemsMap[item.conversationId]) {
				lastTimelineItemsMap[item.conversationId] = item;
			}
		}
	}

	// Add lastTimelineItem and visitorLastSeenAt to each conversation
	const conversationsWithLastTimelineItem = conversationsWithSeen.map(
		({ conversation: conv, visitorLastSeenAt }) => ({
			...conv,
			lastTimelineItem: lastTimelineItemsMap[conv.id] || undefined,
			visitorLastSeenAt: visitorLastSeenAt ?? null,
		})
	);

	const totalCount = Number(totalCountResult.at(0)?.totalCount ?? 0);
	const totalPages = Math.ceil(totalCount / limit);

	return {
		conversations: conversationsWithLastTimelineItem,
		pagination: {
			page,
			limit,
			total: totalCount,
			totalPages,
			hasMore: page < totalPages,
		},
	};
}

export async function getConversationByIdWithLastMessage(
	db: Database,
	params: {
		organizationId: string;
		websiteId: string;
		conversationId: string;
	}
) {
	const [_conversation] = await db
		.select()
		.from(conversation)
		.where(
			and(
				eq(conversation.id, params.conversationId),
				eq(conversation.organizationId, params.organizationId),
				eq(conversation.websiteId, params.websiteId)
			)
		);

	if (!_conversation) {
		return;
	}

	// Fetch the last timeline item for this conversation
	const [lastTimelineItem] = await db
		.select()
		.from(conversationTimelineItem)
		.where(
			and(
				eq(conversationTimelineItem.conversationId, params.conversationId),
				eq(conversationTimelineItem.organizationId, params.organizationId),
				isNull(conversationTimelineItem.deletedAt)
			)
		)
		.orderBy(desc(conversationTimelineItem.createdAt))
		.limit(1);

	return {
		..._conversation,
		lastTimelineItem: lastTimelineItem || undefined,
	};
}

export async function listConversationsHeaders(
	db: Database,
	params: {
		organizationId: string;
		websiteId: string;
		userId?: string | null;
		limit?: number;
		cursor?: string | null;
		orderBy?: "createdAt" | "updatedAt";
		order?: "asc" | "desc";
		status?: ConversationStatus;
		priority?: import("@cossistant/types").ConversationPriority;
		sentiment?: import("@cossistant/types").ConversationSentiment;
		visitorId?: string;
		contactId?: string;
		assignedToUserId?: string;
		viewId?: string;
		createdAtFrom?: string;
		createdAtTo?: string;
		updatedAtFrom?: string;
		updatedAtTo?: string;
		q?: string;
	}
) {
	const limit = params.limit ?? DEFAULT_PAGE_LIMIT;
	const orderBy = params.orderBy ?? "updatedAt";
	const order = params.order ?? "desc";

	// Build where conditions
	const whereConditions = [
		eq(conversation.organizationId, params.organizationId),
		eq(conversation.websiteId, params.websiteId),
	];

	if (params.status) {
		whereConditions.push(eq(conversation.status, params.status));
	}
	if (params.priority) {
		whereConditions.push(eq(conversation.priority, params.priority));
	}
	if (params.sentiment) {
		whereConditions.push(eq(conversation.sentiment, params.sentiment));
	}
	if (params.visitorId) {
		whereConditions.push(eq(conversation.visitorId, params.visitorId));
	}
	if (params.contactId) {
		whereConditions.push(eq(contact.id, params.contactId));
	}
	if (params.createdAtFrom) {
		whereConditions.push(gte(conversation.createdAt, params.createdAtFrom));
	}
	if (params.createdAtTo) {
		whereConditions.push(lt(conversation.createdAt, params.createdAtTo));
	}
	if (params.updatedAtFrom) {
		whereConditions.push(gte(conversation.updatedAt, params.updatedAtFrom));
	}
	if (params.updatedAtTo) {
		whereConditions.push(lt(conversation.updatedAt, params.updatedAtTo));
	}
	if (params.assignedToUserId) {
		whereConditions.push(
			sql`exists (
				select 1
				from ${conversationAssignee}
				where ${conversationAssignee.organizationId} = ${params.organizationId}
				and ${conversationAssignee.conversationId} = ${conversation.id}
				and ${conversationAssignee.userId} = ${params.assignedToUserId}
				and ${conversationAssignee.unassignedAt} is null
			)`
		);
	}
	if (params.viewId) {
		whereConditions.push(
			sql`exists (
				select 1
				from ${conversationView}
				where ${conversationView.organizationId} = ${params.organizationId}
				and ${conversationView.conversationId} = ${conversation.id}
				and ${conversationView.viewId} = ${params.viewId}
				and ${conversationView.deletedAt} is null
			)`
		);
	}
	if (params.q?.trim()) {
		const searchPattern = `%${params.q.trim().replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
		const searchCondition = or(
			ilike(conversation.title, searchPattern),
			ilike(conversation.visitorTitle, searchPattern),
			ilike(contact.name, searchPattern),
			ilike(contact.email, searchPattern)
		);

		if (searchCondition) {
			whereConditions.push(searchCondition);
		}
	}

	// Handle cursor-based pagination more efficiently
	if (params.cursor) {
		// Decode cursor to get the timestamp and ID (format: timestamp_id)
		const cursorParts = params.cursor.split("_");
		if (cursorParts.length === 2) {
			const cursorTimestamp = cursorParts[0];
			const cursorId = cursorParts[1];

			if (cursorTimestamp && cursorId) {
				const cursorDate = new Date(cursorTimestamp).toISOString();

				// Use composite cursor for stable pagination
				const timestampCursorCondition =
					order === "asc"
						? gt(conversation[orderBy], cursorDate)
						: lt(conversation[orderBy], cursorDate);
				const idCursorCondition =
					order === "asc"
						? gt(conversation.id, cursorId)
						: lt(conversation.id, cursorId);
				const cursorCondition = or(
					timestampCursorCondition,
					and(eq(conversation[orderBy], cursorDate), idCursorCondition)
				);
				if (cursorCondition) {
					whereConditions.push(cursorCondition);
				}
			}
		} else {
			// Fallback to old cursor format (just ID)
			const [cursorConversation] = await db
				.select()
				.from(conversation)
				.where(eq(conversation.id, params.cursor))
				.limit(1);

			if (cursorConversation) {
				whereConditions.push(
					order === "asc"
						? gt(conversation[orderBy], cursorConversation[orderBy])
						: lt(conversation[orderBy], cursorConversation[orderBy])
				);
			}
		}
	}

	// Fetch base conversation rows plus visitor/contact metadata
	const results = await db
		.select({
			conversation,
			visitorId: visitor.id,
			visitorLastSeenAt: visitor.lastSeenAt,
			visitorBlockedAt: visitor.blockedAt,
			visitorBlockedByUserId: visitor.blockedByUserId,
			contactId: contact.id,
			contactName: contact.name,
			contactEmail: contact.email,
			contactImage: contact.image,
		})
		.from(conversation)
		.innerJoin(visitor, eq(conversation.visitorId, visitor.id))
		.leftJoin(contact, eq(visitor.contactId, contact.id))
		.where(and(...whereConditions))
		.orderBy(
			order === "asc"
				? asc(conversation[orderBy])
				: desc(conversation[orderBy]),
			order === "asc" ? asc(conversation.id) : desc(conversation.id) // Secondary sort for stable pagination
		)
		.limit(limit + 1);

	// Process results for pagination
	let nextCursor: string | null = null;
	let items = results;

	if (results.length > limit) {
		items = results.slice(0, limit);
		const lastItem = items.at(-1);
		if (lastItem) {
			// Create composite cursor with timestamp and ID
			const timestamp = lastItem.conversation[orderBy];
			nextCursor = `${timestamp}_${lastItem.conversation.id}`;
		}
	}

	const conversationIds = items.map((row) => row.conversation.id);

	const lastTimelineRows =
		conversationIds.length > 0
			? await db
					.select()
					.from(conversationTimelineItem)
					.where(
						and(
							eq(
								conversationTimelineItem.organizationId,
								params.organizationId
							),
							inArray(conversationTimelineItem.conversationId, conversationIds),
							isNull(conversationTimelineItem.deletedAt)
						)
					)
					.orderBy(
						desc(conversationTimelineItem.createdAt),
						desc(conversationTimelineItem.id)
					)
			: [];

	const lastMessageTimelineRows =
		conversationIds.length > 0
			? await db
					.select()
					.from(conversationTimelineItem)
					.where(
						and(
							eq(
								conversationTimelineItem.organizationId,
								params.organizationId
							),
							inArray(conversationTimelineItem.conversationId, conversationIds),
							eq(
								conversationTimelineItem.type,
								ConversationTimelineType.MESSAGE
							),
							isNull(conversationTimelineItem.deletedAt)
						)
					)
					.orderBy(
						desc(conversationTimelineItem.createdAt),
						desc(conversationTimelineItem.id)
					)
			: [];

	const viewRows =
		conversationIds.length > 0
			? await db
					.select({
						conversationId: conversationView.conversationId,
						viewId: conversationView.viewId,
					})
					.from(conversationView)
					.where(
						and(
							eq(conversationView.organizationId, params.organizationId),
							inArray(conversationView.conversationId, conversationIds),
							isNull(conversationView.deletedAt)
						)
					)
			: [];

	const seenRows =
		conversationIds.length > 0
			? await db
					.select({
						id: conversationSeen.id,
						conversationId: conversationSeen.conversationId,
						userId: conversationSeen.userId,
						visitorId: conversationSeen.visitorId,
						aiAgentId: conversationSeen.aiAgentId,
						lastSeenAt: conversationSeen.lastSeenAt,
						createdAt: conversationSeen.createdAt,
						updatedAt: conversationSeen.updatedAt,
					})
					.from(conversationSeen)
					.where(
						and(
							eq(conversationSeen.organizationId, params.organizationId),
							inArray(conversationSeen.conversationId, conversationIds)
						)
					)
					.orderBy(desc(conversationSeen.lastSeenAt))
			: [];
	const activeClarificationSummaryMap =
		await listActiveKnowledgeClarificationSummariesForConversations(db, {
			websiteId: params.websiteId,
			conversationIds,
		});

	const lastTimelineItemsMap = new Map<string, ConversationTimelineItemRow>();
	for (const item of lastTimelineRows) {
		if (lastTimelineItemsMap.has(item.conversationId)) {
			continue;
		}
		lastTimelineItemsMap.set(item.conversationId, item);
	}

	const lastMessageTimelineItemsMap = new Map<
		string,
		ConversationTimelineItemRow
	>();
	for (const item of lastMessageTimelineRows) {
		if (lastMessageTimelineItemsMap.has(item.conversationId)) {
			continue;
		}
		lastMessageTimelineItemsMap.set(item.conversationId, item);
	}

	const viewIdsMap = new Map<string, string[]>();
	for (const view of viewRows) {
		const list = viewIdsMap.get(view.conversationId) ?? [];
		list.push(view.viewId);
		viewIdsMap.set(view.conversationId, list);
	}

	const seenDataMap = new Map<string, ConversationSeen[]>();
	const userLastSeenMap = new Map<string, string | null>();

	for (const seen of seenRows) {
		const collection = seenDataMap.get(seen.conversationId) ?? [];
		collection.push({
			...seen,
			deletedAt: null,
		});
		seenDataMap.set(seen.conversationId, collection);

		if (params.userId && seen.userId === params.userId) {
			const currentLastSeen = userLastSeenMap.get(seen.conversationId);
			const candidate = seen.lastSeenAt ?? null;
			if (!currentLastSeen) {
				userLastSeenMap.set(seen.conversationId, candidate);
			} else if (candidate) {
				const currentDate = new Date(currentLastSeen);
				const candidateDate = new Date(candidate);
				if (candidateDate > currentDate) {
					userLastSeenMap.set(seen.conversationId, candidate);
				}
			}
		}
	}

	const conversationsWithDetails = items.map((row) => {
		const conversationId = row.conversation.id;
		const timelineRow = lastTimelineItemsMap.get(conversationId) ?? null;
		const messageTimelineRow =
			lastMessageTimelineItemsMap.get(conversationId) ?? null;

		const lastTimelineItem = timelineRow
			? mapTimelineRowToTimelineItem(timelineRow)
			: null;
		const lastMessageTimelineItem = messageTimelineRow
			? mapTimelineRowToTimelineItem(messageTimelineRow)
			: null;

		const lastMessageAt =
			messageTimelineRow?.createdAt ??
			timelineRow?.createdAt ??
			row.conversation.lastMessageAt ??
			null;

		return {
			...row.conversation,
			visitor: {
				id: row.visitorId,
				lastSeenAt: row.visitorLastSeenAt ?? null,
				blockedAt: row.visitorBlockedAt ?? null,
				blockedByUserId: row.visitorBlockedByUserId,
				isBlocked: Boolean(row.visitorBlockedAt),
				contact: row.contactId
					? {
							id: row.contactId,
							name: row.contactName,
							email: row.contactEmail,
							image: row.contactImage,
						}
					: null,
			},
			viewIds: viewIdsMap.get(conversationId) ?? [],
			lastMessageAt,
			lastSeenAt: userLastSeenMap.get(conversationId) ?? null,
			lastMessageTimelineItem,
			lastTimelineItem,
			activeClarification:
				activeClarificationSummaryMap.get(conversationId) ?? null,
			seenData: seenDataMap.get(conversationId) ?? [],
		};
	});

	return {
		items: conversationsWithDetails,
		nextCursor,
	};
}

export async function getConversationHeader(
	db: Database,
	params: {
		organizationId: string;
		websiteId: string;
		conversationId: string;
		userId?: string | null;
	}
): Promise<ConversationHeader | null> {
	const [row] = await db
		.select({
			conversation,
			visitorId: visitor.id,
			visitorLastSeenAt: visitor.lastSeenAt,
			visitorBlockedAt: visitor.blockedAt,
			visitorBlockedByUserId: visitor.blockedByUserId,
			contactId: contact.id,
			contactName: contact.name,
			contactEmail: contact.email,
			contactImage: contact.image,
		})
		.from(conversation)
		.innerJoin(visitor, eq(conversation.visitorId, visitor.id))
		.leftJoin(contact, eq(visitor.contactId, contact.id))
		.where(
			and(
				eq(conversation.organizationId, params.organizationId),
				eq(conversation.websiteId, params.websiteId),
				eq(conversation.id, params.conversationId)
			)
		)
		.limit(1);

	if (!row) {
		return null;
	}

	const [lastTimelineRow] = await db
		.select()
		.from(conversationTimelineItem)
		.where(
			and(
				eq(conversationTimelineItem.organizationId, params.organizationId),
				eq(conversationTimelineItem.conversationId, params.conversationId),
				isNull(conversationTimelineItem.deletedAt)
			)
		)
		.orderBy(
			desc(conversationTimelineItem.createdAt),
			desc(conversationTimelineItem.id)
		)
		.limit(1);

	const [lastMessageTimelineRow] = await db
		.select()
		.from(conversationTimelineItem)
		.where(
			and(
				eq(conversationTimelineItem.organizationId, params.organizationId),
				eq(conversationTimelineItem.conversationId, params.conversationId),
				eq(conversationTimelineItem.type, ConversationTimelineType.MESSAGE),
				isNull(conversationTimelineItem.deletedAt)
			)
		)
		.orderBy(
			desc(conversationTimelineItem.createdAt),
			desc(conversationTimelineItem.id)
		)
		.limit(1);

	const viewRows = await db
		.select({
			viewId: conversationView.viewId,
		})
		.from(conversationView)
		.where(
			and(
				eq(conversationView.organizationId, params.organizationId),
				eq(conversationView.conversationId, params.conversationId),
				isNull(conversationView.deletedAt)
			)
		);

	const seenRows = await db
		.select({
			id: conversationSeen.id,
			conversationId: conversationSeen.conversationId,
			userId: conversationSeen.userId,
			visitorId: conversationSeen.visitorId,
			aiAgentId: conversationSeen.aiAgentId,
			lastSeenAt: conversationSeen.lastSeenAt,
			createdAt: conversationSeen.createdAt,
			updatedAt: conversationSeen.updatedAt,
		})
		.from(conversationSeen)
		.where(
			and(
				eq(conversationSeen.organizationId, params.organizationId),
				eq(conversationSeen.conversationId, params.conversationId)
			)
		)
		.orderBy(desc(conversationSeen.lastSeenAt));

	const seenData: ConversationSeen[] = seenRows.map((seen) => ({
		...seen,
		deletedAt: null,
	}));

	const viewIds = viewRows.map((view) => view.viewId);
	const activeClarificationSummaryMap =
		await listActiveKnowledgeClarificationSummariesForConversations(db, {
			websiteId: params.websiteId,
			conversationIds: [params.conversationId],
		});

	const lastTimelineItem = lastTimelineRow
		? mapTimelineRowToTimelineItem(lastTimelineRow)
		: null;
	const lastMessageTimelineItem = lastMessageTimelineRow
		? mapTimelineRowToTimelineItem(lastMessageTimelineRow)
		: null;

	const lastMessageAt =
		lastMessageTimelineRow?.createdAt ??
		lastTimelineRow?.createdAt ??
		row.conversation.lastMessageAt ??
		null;

	const userLastSeenAt = params.userId
		? seenRows.reduce<string | null>((acc, seen) => {
				if (seen.userId !== params.userId || !seen.lastSeenAt) {
					return acc;
				}
				if (!acc) {
					return seen.lastSeenAt;
				}
				return new Date(seen.lastSeenAt) > new Date(acc)
					? seen.lastSeenAt
					: acc;
			}, null)
		: null;

	return {
		...row.conversation,
		visitor: {
			id: row.visitorId,
			lastSeenAt: row.visitorLastSeenAt ?? null,
			blockedAt: row.visitorBlockedAt ?? null,
			blockedByUserId: row.visitorBlockedByUserId,
			isBlocked: Boolean(row.visitorBlockedAt),
			contact: row.contactId
				? {
						id: row.contactId,
						name: row.contactName,
						email: row.contactEmail,
						image: row.contactImage,
					}
				: null,
		},
		viewIds,
		lastMessageAt,
		lastSeenAt: userLastSeenAt ?? null,
		lastMessageTimelineItem,
		lastTimelineItem,
		activeClarification:
			activeClarificationSummaryMap.get(params.conversationId) ?? null,
		seenData,
	} satisfies ConversationHeader;
}

export async function getConversationById(
	db: Database,
	params: {
		conversationId: string;
	}
) {
	// Note: Caching was removed here because mutations (like markRead) return
	// the input conversation record, which could be stale if cached. This caused
	// escalation state (escalatedAt) to be overwritten with stale null values.
	const [_conversation] = await db
		.select()
		.from(conversation)
		.where(eq(conversation.id, params.conversationId))
		.limit(1);

	return _conversation;
}

export async function listConversationViewIds(
	db: Database,
	params: {
		organizationId: string;
		conversationId: string;
	}
) {
	const viewRows = await db
		.select({
			viewId: conversationView.viewId,
		})
		.from(conversationView)
		.where(
			and(
				eq(conversationView.organizationId, params.organizationId),
				eq(conversationView.conversationId, params.conversationId),
				isNull(conversationView.deletedAt)
			)
		);

	return viewRows.map((view) => view.viewId);
}

export async function getConversationSeenData(
	db: Database,
	params: {
		conversationId: string;
		organizationId: string;
	}
) {
	const seenRows = await db
		.select({
			id: conversationSeen.id,
			conversationId: conversationSeen.conversationId,
			userId: conversationSeen.userId,
			visitorId: conversationSeen.visitorId,
			aiAgentId: conversationSeen.aiAgentId,
			lastSeenAt: conversationSeen.lastSeenAt,
			createdAt: conversationSeen.createdAt,
			updatedAt: conversationSeen.updatedAt,
		})
		.from(conversationSeen)
		.where(
			and(
				eq(conversationSeen.organizationId, params.organizationId),
				eq(conversationSeen.conversationId, params.conversationId)
			)
		)
		.orderBy(desc(conversationSeen.lastSeenAt));

	return seenRows.map((seen) => ({
		...seen,
		deletedAt: null,
	}));
}

export async function getConversationTimelineItems(
	db: Database,
	params: {
		organizationId: string;
		conversationId: string;
		websiteId: string;
		limit?: number;
		cursor?: string | Date | null;
		maxCreatedAt?: string | null;
		maxId?: string | null;
		visibility?: TimelineItemVisibilityEnum[];
	}
) {
	const limit = params.limit ?? DEFAULT_PAGE_LIMIT;

	// Build where clause scoped to the conversation
	const whereConditions = [
		eq(conversationTimelineItem.organizationId, params.organizationId),
		eq(conversationTimelineItem.conversationId, params.conversationId),
		isNull(conversationTimelineItem.deletedAt),
	];

	const visibilities = params.visibility;
	if (visibilities?.length) {
		if (visibilities.length === 1) {
			whereConditions.push(
				eq(conversationTimelineItem.visibility, visibilities[0]!)
			);
		} else {
			whereConditions.push(
				inArray(conversationTimelineItem.visibility, visibilities)
			);
		}
	}

	if (params.maxCreatedAt) {
		const maxTimestamp = params.maxCreatedAt;
		if (params.maxId) {
			whereConditions.push(
				or(
					lt(conversationTimelineItem.createdAt, maxTimestamp),
					and(
						eq(conversationTimelineItem.createdAt, maxTimestamp),
						lte(conversationTimelineItem.id, params.maxId)
					)
				)!
			);
		} else {
			whereConditions.push(
				lte(conversationTimelineItem.createdAt, maxTimestamp)
			);
		}
	}

	// When paginating fetch timeline items older than the current batch.
	if (params.cursor) {
		const cursorValue = params.cursor;
		const cursorParts =
			typeof cursorValue === "string" ? cursorValue.split("_") : [];

		if (cursorParts.length === 2) {
			const cursorTimestamp = cursorParts[0];
			const cursorId = cursorParts[1];
			if (cursorTimestamp && cursorId) {
				const cursorDate = new Date(cursorTimestamp);

				if (!Number.isNaN(cursorDate.getTime())) {
					const cursorIso = cursorDate.toISOString();
					whereConditions.push(
						or(
							lt(conversationTimelineItem.createdAt, cursorIso),
							and(
								eq(conversationTimelineItem.createdAt, cursorIso),
								lt(conversationTimelineItem.id, cursorId)
							)
						)!
					);
				}
			}
		} else {
			const cursorDate =
				cursorValue instanceof Date
					? cursorValue
					: new Date(cursorValue as string);

			if (!Number.isNaN(cursorDate.getTime())) {
				whereConditions.push(
					lt(conversationTimelineItem.createdAt, cursorDate.toISOString())
				);
			}
		}
	}

	// Fetch newest timeline items first for efficient backwards pagination.
	const rows = await db
		.select()
		.from(conversationTimelineItem)
		.where(and(...whereConditions))
		.orderBy(
			desc(conversationTimelineItem.createdAt),
			desc(conversationTimelineItem.id)
		)
		.limit(limit + 1);

	const hasNextPage = rows.length > limit;
	const limitedRows = hasNextPage ? rows.slice(0, limit) : rows;
	const nextCursor = hasNextPage
		? (() => {
				const lastRow = limitedRows.at(-1);
				if (!lastRow) {
					return;
				}

				const timestamp = new Date(lastRow.createdAt).toISOString();
				return `${timestamp}_${lastRow.id}`;
			})()
		: undefined;

	const timelineItems = [...limitedRows]
		.reverse()
		.map(mapTimelineRowToTimelineItem)
		.filter((item): item is TimelineItem => item !== null);

	return {
		items: timelineItems,
		nextCursor,
		hasNextPage,
	};
}

export async function getConversationTimelineItemsAfterCursor(
	db: Database,
	params: {
		organizationId: string;
		conversationId: string;
		websiteId: string;
		afterCreatedAt: string;
		afterId: string;
		limit?: number;
		visibility?: TimelineItemVisibilityEnum[];
	}
) {
	const limit = params.limit ?? DEFAULT_PAGE_LIMIT;

	const whereConditions = [
		eq(conversationTimelineItem.organizationId, params.organizationId),
		eq(conversationTimelineItem.conversationId, params.conversationId),
		isNull(conversationTimelineItem.deletedAt),
		or(
			gt(conversationTimelineItem.createdAt, params.afterCreatedAt),
			and(
				eq(conversationTimelineItem.createdAt, params.afterCreatedAt),
				gt(conversationTimelineItem.id, params.afterId)
			)
		)!,
	];

	const visibilities = params.visibility;
	if (visibilities?.length) {
		if (visibilities.length === 1) {
			whereConditions.push(
				eq(conversationTimelineItem.visibility, visibilities[0]!)
			);
		} else {
			whereConditions.push(
				inArray(conversationTimelineItem.visibility, visibilities)
			);
		}
	}

	const rows = await db
		.select()
		.from(conversationTimelineItem)
		.where(and(...whereConditions))
		.orderBy(
			asc(conversationTimelineItem.createdAt),
			asc(conversationTimelineItem.id)
		)
		.limit(limit);

	return rows
		.map(mapTimelineRowToTimelineItem)
		.filter((item): item is TimelineItem => item !== null);
}

/**
 * Get messages after a cursor (createdAt + id), ordered ascending.
 * Used to find the next human-authored message after the conversation cursor.
 */
export async function getConversationMessagesAfterCursor(
	db: Database,
	params: {
		organizationId: string;
		conversationId: string;
		afterCreatedAt?: string | null;
		afterId?: string | null;
		limit?: number;
	}
) {
	const limit = params.limit ?? 500;

	const whereConditions = [
		eq(conversationTimelineItem.organizationId, params.organizationId),
		eq(conversationTimelineItem.conversationId, params.conversationId),
		eq(conversationTimelineItem.type, "message"),
		isNull(conversationTimelineItem.deletedAt),
		// Only human/visitor messages can trigger AI processing.
		or(
			isNotNull(conversationTimelineItem.userId),
			isNotNull(conversationTimelineItem.visitorId)
		)!,
	];

	if (params.afterCreatedAt) {
		const afterTimestamp = params.afterCreatedAt;
		if (params.afterId) {
			whereConditions.push(
				or(
					gt(conversationTimelineItem.createdAt, afterTimestamp),
					and(
						eq(conversationTimelineItem.createdAt, afterTimestamp),
						gt(conversationTimelineItem.id, params.afterId)
					)
				)!
			);
		} else {
			whereConditions.push(
				gt(conversationTimelineItem.createdAt, afterTimestamp)
			);
		}
	}

	return db
		.select({
			id: conversationTimelineItem.id,
			createdAt: conversationTimelineItem.createdAt,
		})
		.from(conversationTimelineItem)
		.where(and(...whereConditions))
		.orderBy(
			asc(conversationTimelineItem.createdAt),
			asc(conversationTimelineItem.id)
		)
		.limit(limit);
}

/**
 * Get the latest triggerable message (human/visitor authored) for a conversation.
 * Used to fast-forward AI cursor when dropping pending backlog.
 */
export async function getLatestTriggerableMessage(
	db: Database,
	params: {
		organizationId: string;
		conversationId: string;
	}
) {
	const [message] = await db
		.select({
			id: conversationTimelineItem.id,
			createdAt: conversationTimelineItem.createdAt,
		})
		.from(conversationTimelineItem)
		.where(
			and(
				eq(conversationTimelineItem.organizationId, params.organizationId),
				eq(conversationTimelineItem.conversationId, params.conversationId),
				eq(conversationTimelineItem.type, "message"),
				isNull(conversationTimelineItem.deletedAt),
				or(
					isNotNull(conversationTimelineItem.userId),
					isNotNull(conversationTimelineItem.visitorId)
				)!
			)
		)
		.orderBy(
			desc(conversationTimelineItem.createdAt),
			desc(conversationTimelineItem.id)
		)
		.limit(1);

	return message ?? null;
}

/**
 * Get a specific message's metadata and sender markers.
 * Used for anchoring workflows and validating trigger eligibility.
 */
export async function getMessageMetadata(
	db: Database,
	params: {
		messageId: string;
		organizationId: string;
	}
) {
	const [message] = await db
		.select({
			id: conversationTimelineItem.id,
			createdAt: conversationTimelineItem.createdAt,
			conversationId: conversationTimelineItem.conversationId,
			userId: conversationTimelineItem.userId,
			visitorId: conversationTimelineItem.visitorId,
			aiAgentId: conversationTimelineItem.aiAgentId,
			visibility: conversationTimelineItem.visibility,
			text: conversationTimelineItem.text,
		})
		.from(conversationTimelineItem)
		.where(
			and(
				eq(conversationTimelineItem.id, params.messageId),
				eq(conversationTimelineItem.organizationId, params.organizationId),
				eq(conversationTimelineItem.type, "message"),
				isNull(conversationTimelineItem.deletedAt)
			)
		)
		.limit(1);

	return message;
}

/**
 * Get metadata for multiple messages in one query.
 * Used by AI worker burst coalescing to inspect head queue segments.
 */
export async function getMessageMetadataBatch(
	db: Database,
	params: {
		messageIds: string[];
		organizationId: string;
	}
) {
	if (params.messageIds.length === 0) {
		return [];
	}

	return db
		.select({
			id: conversationTimelineItem.id,
			createdAt: conversationTimelineItem.createdAt,
			conversationId: conversationTimelineItem.conversationId,
			userId: conversationTimelineItem.userId,
			visitorId: conversationTimelineItem.visitorId,
			aiAgentId: conversationTimelineItem.aiAgentId,
			visibility: conversationTimelineItem.visibility,
			text: conversationTimelineItem.text,
		})
		.from(conversationTimelineItem)
		.where(
			and(
				eq(conversationTimelineItem.organizationId, params.organizationId),
				eq(conversationTimelineItem.type, "message"),
				isNull(conversationTimelineItem.deletedAt),
				inArray(conversationTimelineItem.id, params.messageIds)
			)
		)
		.orderBy(
			asc(conversationTimelineItem.createdAt),
			asc(conversationTimelineItem.id)
		);
}

/**
 * Get the most recent public visitor message ID for a conversation.
 * Used to detect if a newer visitor message arrived during AI generation.
 */
export async function getLatestPublicVisitorMessageId(
	db: Database,
	params: {
		conversationId: string;
		organizationId: string;
	}
): Promise<string | null> {
	const [message] = await db
		.select({ id: conversationTimelineItem.id })
		.from(conversationTimelineItem)
		.where(
			and(
				eq(conversationTimelineItem.conversationId, params.conversationId),
				eq(conversationTimelineItem.organizationId, params.organizationId),
				eq(conversationTimelineItem.type, "message"),
				eq(conversationTimelineItem.visibility, "public"),
				isNotNull(conversationTimelineItem.visitorId),
				isNull(conversationTimelineItem.deletedAt)
			)
		)
		.orderBy(
			desc(conversationTimelineItem.createdAt),
			desc(conversationTimelineItem.id)
		)
		.limit(1);

	return message?.id ?? null;
}

/**
 * Get the most recent public AI message for a conversation.
 * Used for duplicate message suppression.
 */
export async function getLatestPublicAiMessage(
	db: Database,
	params: {
		conversationId: string;
		organizationId: string;
	}
): Promise<{ id: string; text: string | null; createdAt: string } | null> {
	const [message] = await db
		.select({
			id: conversationTimelineItem.id,
			text: conversationTimelineItem.text,
			createdAt: conversationTimelineItem.createdAt,
		})
		.from(conversationTimelineItem)
		.where(
			and(
				eq(conversationTimelineItem.conversationId, params.conversationId),
				eq(conversationTimelineItem.organizationId, params.organizationId),
				eq(conversationTimelineItem.type, "message"),
				eq(conversationTimelineItem.visibility, "public"),
				isNotNull(conversationTimelineItem.aiAgentId),
				isNull(conversationTimelineItem.deletedAt)
			)
		)
		.orderBy(
			desc(conversationTimelineItem.createdAt),
			desc(conversationTimelineItem.id)
		)
		.limit(1);

	return message ?? null;
}

export async function getPublicAiMessagesAfterCursor(
	db: Database,
	params: {
		conversationId: string;
		organizationId: string;
		afterCreatedAt: string;
		afterId: string;
		limit?: number;
	}
): Promise<Array<{ id: string; text: string | null; createdAt: string }>> {
	const limit = params.limit ?? 10;

	return db
		.select({
			id: conversationTimelineItem.id,
			text: conversationTimelineItem.text,
			createdAt: conversationTimelineItem.createdAt,
		})
		.from(conversationTimelineItem)
		.where(
			and(
				eq(conversationTimelineItem.conversationId, params.conversationId),
				eq(conversationTimelineItem.organizationId, params.organizationId),
				eq(conversationTimelineItem.type, "message"),
				eq(conversationTimelineItem.visibility, "public"),
				isNotNull(conversationTimelineItem.aiAgentId),
				isNull(conversationTimelineItem.deletedAt),
				or(
					gt(conversationTimelineItem.createdAt, params.afterCreatedAt),
					and(
						eq(conversationTimelineItem.createdAt, params.afterCreatedAt),
						gt(conversationTimelineItem.id, params.afterId)
					)
				)!
			)
		)
		.orderBy(
			asc(conversationTimelineItem.createdAt),
			asc(conversationTimelineItem.id)
		)
		.limit(limit);
}

/**
 * Get the latest public AI message created after a given cursor.
 * Used by continuation gating to detect if a queued trigger was already covered.
 */
export async function getLatestPublicAiMessageAfterCursor(
	db: Database,
	params: {
		conversationId: string;
		organizationId: string;
		afterCreatedAt: string;
		afterId: string;
	}
): Promise<{ id: string; text: string | null; createdAt: string } | null> {
	const messages = await getPublicAiMessagesAfterCursor(db, {
		...params,
		limit: 10,
	});
	return messages.length > 0 ? (messages[messages.length - 1] ?? null) : null;
}
