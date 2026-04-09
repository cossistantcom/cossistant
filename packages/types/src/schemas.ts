import { z } from "zod";
import { apiTimestampSchema, nullableApiTimestampSchema } from "./api/common";
import { timelineItemSchema } from "./api/timeline-item";
import { ConversationEventType, ConversationStatus } from "./enums";

export const viewSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	prompt: z.string().nullable(),
	organizationId: z.string(),
	websiteId: z.string(),
	createdAt: apiTimestampSchema,
	updatedAt: apiTimestampSchema,
	deletedAt: nullableApiTimestampSchema,
});

export type InboxView = z.infer<typeof viewSchema>;

export const conversationSchema = z.object({
	id: z.string(),
	title: z.string().optional(),
	createdAt: apiTimestampSchema,
	updatedAt: apiTimestampSchema,
	visitorId: z.string(),
	websiteId: z.string(),
	status: z
		.enum([
			ConversationStatus.OPEN,
			ConversationStatus.RESOLVED,
			ConversationStatus.SPAM,
		])
		.default(ConversationStatus.OPEN),
	visitorRating: z.number().int().min(1).max(5).nullable().optional(),
	visitorRatingAt: nullableApiTimestampSchema.optional(),
	deletedAt: nullableApiTimestampSchema.default(null),
	visitorLastSeenAt: nullableApiTimestampSchema.optional(),
	lastTimelineItem: timelineItemSchema.optional(),
});

export type Conversation = z.infer<typeof conversationSchema>;

export const conversationSeenSchema = z.object({
	id: z.string(),
	conversationId: z.string(),
	userId: z.string().nullable(),
	visitorId: z.string().nullable(),
	aiAgentId: z.string().nullable(),
	lastSeenAt: apiTimestampSchema,
	createdAt: apiTimestampSchema,
	updatedAt: apiTimestampSchema,
	deletedAt: nullableApiTimestampSchema,
});

export type ConversationSeen = z.infer<typeof conversationSeenSchema>;
