import type { Database } from "@api/db";
import { and, asc, count, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { generateULID } from "../../utils/db/ids";
import { feedback } from "../schema";

export type FeedbackInsert = {
	organizationId: string;
	websiteId: string;
	rating: number;
	topic?: string;
	comment?: string;
	trigger?: string;
	source?: string;
	conversationId?: string;
	visitorId?: string;
	contactId?: string;
};

export type FeedbackListParams = {
	organizationId: string;
	websiteId: string;
	trigger?: string;
	source?: string;
	conversationId?: string;
	visitorId?: string;
	contactId?: string;
	topic?: string;
	rating?: number;
	createdAtFrom?: string;
	createdAtTo?: string;
	order?: "asc" | "desc";
	page: number;
	limit: number;
};

export type FeedbackSummaryParams = Omit<
	FeedbackListParams,
	"limit" | "order" | "page"
>;

export async function createFeedback(
	db: Database,
	data: FeedbackInsert
): Promise<typeof feedback.$inferSelect> {
	const now = new Date().toISOString();
	const id = generateULID();

	const [inserted] = await db
		.insert(feedback)
		.values({
			id,
			organizationId: data.organizationId,
			websiteId: data.websiteId,
			conversationId: data.conversationId ?? null,
			visitorId: data.visitorId ?? null,
			contactId: data.contactId ?? null,
			rating: data.rating,
			topic: data.topic ?? null,
			comment: data.comment ?? null,
			trigger: data.trigger ?? null,
			source: data.source ?? "widget",
			createdAt: now,
			updatedAt: now,
		})
		.returning();

	if (!inserted) {
		throw new Error("Failed to create feedback");
	}

	return inserted;
}

export async function updateFeedbackConversationId(
	db: Database,
	params: { id: string; websiteId: string; conversationId: string }
): Promise<typeof feedback.$inferSelect> {
	const now = new Date().toISOString();
	const [updated] = await db
		.update(feedback)
		.set({
			conversationId: params.conversationId,
			updatedAt: now,
		})
		.where(
			and(
				eq(feedback.id, params.id),
				eq(feedback.websiteId, params.websiteId),
				isNull(feedback.deletedAt)
			)
		)
		.returning();

	if (!updated) {
		throw new Error("Failed to link feedback to conversation");
	}

	return updated;
}

export async function listFeedback(
	db: Database,
	params: FeedbackListParams
): Promise<{
	items: (typeof feedback.$inferSelect)[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
		hasMore: boolean;
	};
}> {
	const { organizationId, websiteId, page, limit } = params;
	const offset = (page - 1) * limit;

	// Build filter conditions
	const conditions = [
		eq(feedback.organizationId, organizationId),
		eq(feedback.websiteId, websiteId),
		isNull(feedback.deletedAt),
	];

	if (params.trigger) {
		conditions.push(eq(feedback.trigger, params.trigger));
	}
	if (params.source) {
		conditions.push(eq(feedback.source, params.source));
	}
	if (params.conversationId) {
		conditions.push(eq(feedback.conversationId, params.conversationId));
	}
	if (params.visitorId) {
		conditions.push(eq(feedback.visitorId, params.visitorId));
	}
	if (params.contactId) {
		conditions.push(eq(feedback.contactId, params.contactId));
	}
	if (params.topic) {
		conditions.push(eq(feedback.topic, params.topic));
	}
	if (params.rating) {
		conditions.push(eq(feedback.rating, params.rating));
	}
	if (params.createdAtFrom) {
		conditions.push(gte(feedback.createdAt, params.createdAtFrom));
	}
	if (params.createdAtTo) {
		conditions.push(lt(feedback.createdAt, params.createdAtTo));
	}

	const whereClause = and(...conditions);

	// Get total count
	const [countResult] = await db
		.select({ total: count() })
		.from(feedback)
		.where(whereClause);

	const total = countResult?.total ?? 0;

	// Get items
	const items = await db
		.select()
		.from(feedback)
		.where(whereClause)
		.orderBy(
			params.order === "asc"
				? asc(feedback.createdAt)
				: desc(feedback.createdAt)
		)
		.limit(limit)
		.offset(offset);

	const totalPages = Math.ceil(total / limit);

	return {
		items,
		pagination: {
			page,
			limit,
			total,
			totalPages,
			hasMore: page < totalPages,
		},
	};
}

export async function getFeedbackSummary(
	db: Database,
	params: FeedbackSummaryParams
): Promise<{
	total: number;
	averageRating: number | null;
	byRating: Array<{ rating: number; count: number }>;
	byTopic: Array<{ topic: string | null; count: number }>;
	byTrigger: Array<{ trigger: string | null; count: number }>;
}> {
	const conditions = [
		eq(feedback.organizationId, params.organizationId),
		eq(feedback.websiteId, params.websiteId),
		isNull(feedback.deletedAt),
	];

	if (params.trigger) {
		conditions.push(eq(feedback.trigger, params.trigger));
	}
	if (params.source) {
		conditions.push(eq(feedback.source, params.source));
	}
	if (params.conversationId) {
		conditions.push(eq(feedback.conversationId, params.conversationId));
	}
	if (params.visitorId) {
		conditions.push(eq(feedback.visitorId, params.visitorId));
	}
	if (params.contactId) {
		conditions.push(eq(feedback.contactId, params.contactId));
	}
	if (params.topic) {
		conditions.push(eq(feedback.topic, params.topic));
	}
	if (params.rating) {
		conditions.push(eq(feedback.rating, params.rating));
	}
	if (params.createdAtFrom) {
		conditions.push(gte(feedback.createdAt, params.createdAtFrom));
	}
	if (params.createdAtTo) {
		conditions.push(lt(feedback.createdAt, params.createdAtTo));
	}

	const whereClause = and(...conditions);

	const [summary] = await db
		.select({
			total: count(),
			averageRating: sql<number | null>`avg(${feedback.rating})`,
		})
		.from(feedback)
		.where(whereClause);

	const byRating = await db
		.select({
			rating: feedback.rating,
			count: count(),
		})
		.from(feedback)
		.where(whereClause)
		.groupBy(feedback.rating)
		.orderBy(asc(feedback.rating));

	const byTopic = await db
		.select({
			topic: feedback.topic,
			count: count(),
		})
		.from(feedback)
		.where(whereClause)
		.groupBy(feedback.topic)
		.orderBy(desc(count()));

	const byTrigger = await db
		.select({
			trigger: feedback.trigger,
			count: count(),
		})
		.from(feedback)
		.where(whereClause)
		.groupBy(feedback.trigger)
		.orderBy(desc(count()));

	return {
		total: Number(summary?.total ?? 0),
		averageRating:
			summary?.averageRating === null || summary?.averageRating === undefined
				? null
				: Number(summary.averageRating),
		byRating: byRating.map((row) => ({
			rating: row.rating,
			count: Number(row.count),
		})),
		byTopic: byTopic.map((row) => ({
			topic: row.topic,
			count: Number(row.count),
		})),
		byTrigger: byTrigger.map((row) => ({
			trigger: row.trigger,
			count: Number(row.count),
		})),
	};
}

export async function getWebsiteFeedbackSatisfactionAggregate(
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
			average: sql<number | null>`AVG(((${feedback.rating} - 1) / 4.0) * 100)`,
			count: sql<number>`COUNT(*)`,
		})
		.from(feedback)
		.where(
			and(
				eq(feedback.organizationId, params.organizationId),
				eq(feedback.websiteId, params.websiteId),
				isNull(feedback.deletedAt),
				gte(feedback.createdAt, params.dateFrom),
				lt(feedback.createdAt, params.dateTo)
			)
		);

	return {
		average: result?.average ?? null,
		count: Number(result?.count ?? 0),
	};
}

export async function getFeedbackById(
	db: Database,
	params: { id: string; websiteId: string }
): Promise<typeof feedback.$inferSelect | null> {
	const [result] = await db
		.select()
		.from(feedback)
		.where(
			and(
				eq(feedback.id, params.id),
				eq(feedback.websiteId, params.websiteId),
				isNull(feedback.deletedAt)
			)
		)
		.limit(1);

	return result ?? null;
}

export async function getFeedbackByConversationId(
	db: Database,
	params: { conversationId: string; websiteId: string }
): Promise<typeof feedback.$inferSelect | null> {
	const [result] = await db
		.select()
		.from(feedback)
		.where(
			and(
				eq(feedback.conversationId, params.conversationId),
				eq(feedback.websiteId, params.websiteId),
				isNull(feedback.deletedAt)
			)
		)
		.orderBy(desc(feedback.createdAt))
		.limit(1);

	return result ?? null;
}

export async function deleteFeedback(
	db: Database,
	params: { id: string; websiteId: string }
): Promise<boolean> {
	const now = new Date().toISOString();

	const [result] = await db
		.update(feedback)
		.set({ deletedAt: now, updatedAt: now })
		.where(
			and(
				eq(feedback.id, params.id),
				eq(feedback.websiteId, params.websiteId),
				isNull(feedback.deletedAt)
			)
		)
		.returning({ id: feedback.id });

	return !!result;
}
