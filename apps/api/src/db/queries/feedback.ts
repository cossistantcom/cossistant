import type { Database } from "@api/db";
import { and, count, desc, eq, isNull } from "drizzle-orm";
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
	page: number;
	limit: number;
};

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
		.orderBy(desc(feedback.createdAt))
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
