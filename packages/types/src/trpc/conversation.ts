import { z } from "zod";
import { conversationMetadataSchema } from "../api/conversation-metadata";
import { conversationClarificationSummarySchema } from "../api/knowledge-clarification";
import { timelineItemSchema } from "../api/timeline-item";
import { visitorProfileSchema } from "../api/visitor";
import {
	ConversationFieldSource,
	ConversationPriority,
	ConversationSentiment,
	ConversationStatus,
} from "../enums";
import { conversationSeenSchema } from "../schemas";

export const conversationStatusSchema = z.enum([
	ConversationStatus.OPEN,
	ConversationStatus.RESOLVED,
	ConversationStatus.SPAM,
]);

export const conversationPrioritySchema = z.enum([
	ConversationPriority.LOW,
	ConversationPriority.NORMAL,
	ConversationPriority.HIGH,
	ConversationPriority.URGENT,
]);

export const conversationSentimentSchema = z
	.enum([
		ConversationSentiment.POSITIVE,
		ConversationSentiment.NEGATIVE,
		ConversationSentiment.NEUTRAL,
	])
	.nullable();

export const conversationFieldSourceSchema = z
	.enum([ConversationFieldSource.AI, ConversationFieldSource.USER])
	.nullable();

export const conversationRecordSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	visitorId: z.string(),
	websiteId: z.string(),
	metadata: conversationMetadataSchema.nullable().optional(),
	status: conversationStatusSchema,
	priority: conversationPrioritySchema,
	prioritySource: conversationFieldSourceSchema,
	sentiment: conversationSentimentSchema,
	sentimentConfidence: z.number().nullable(),
	sentimentSource: conversationFieldSourceSchema,
	channel: z.string(),
	title: z.string().nullable(),
	visitorTitle: z.string().nullable().optional(),
	visitorTitleLanguage: z.string().nullable().optional(),
	visitorLanguage: z.string().nullable().optional(),
	titleSource: z.enum(["ai", "user"]).nullable(),
	translationActivatedAt: z.string().nullable().optional(),
	translationChargedAt: z.string().nullable().optional(),
	resolutionTime: z.number().nullable(),
	visitorRating: z.number().int().min(1).max(5).nullable(),
	visitorRatingAt: z.string().nullable(),
	startedAt: z.string().nullable(),
	firstResponseAt: z.string().nullable(),
	resolvedAt: z.string().nullable(),
	lastMessageAt: z.string().nullable(),
	lastMessageBy: z.string().nullable(),
	resolvedByUserId: z.string().nullable(),
	resolvedByAiAgentId: z.string().nullable(),
	// Escalation tracking
	escalatedAt: z.string().nullable(),
	escalatedByAiAgentId: z.string().nullable(),
	escalationReason: z.string().nullable(),
	escalationHandledAt: z.string().nullable(),
	escalationHandledByUserId: z.string().nullable(),
	// AI pause control
	aiPausedUntil: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
	deletedAt: z.string().nullable(),
});

export type ConversationRecordResponse = z.infer<
	typeof conversationRecordSchema
>;

export const conversationMutationResponseSchema = z.object({
	conversation: conversationRecordSchema,
});

export const conversationHeaderSchema = z.object({
	id: z.string(),
	status: conversationStatusSchema,
	priority: conversationPrioritySchema,
	prioritySource: conversationFieldSourceSchema,
	organizationId: z.string(),
	visitorId: z.string(),
	visitor: visitorProfileSchema,
	websiteId: z.string(),
	metadata: conversationMetadataSchema.nullable().optional(),
	channel: z.string(),
	title: z.string().nullable(),
	visitorTitle: z.string().nullable().optional(),
	visitorTitleLanguage: z.string().nullable().optional(),
	visitorLanguage: z.string().nullable().optional(),
	titleSource: z.enum(["ai", "user"]).nullable(),
	translationActivatedAt: z.string().nullable().optional(),
	translationChargedAt: z.string().nullable().optional(),
	sentiment: conversationSentimentSchema,
	sentimentConfidence: z.number().nullable(),
	sentimentSource: conversationFieldSourceSchema,
	resolutionTime: z.number().nullable(),
	visitorRating: z.number().int().min(1).max(5).nullable(),
	visitorRatingAt: z.string().nullable(),
	startedAt: z.string().nullable(),
	firstResponseAt: z.string().nullable(),
	resolvedAt: z.string().nullable(),
	resolvedByUserId: z.string().nullable(),
	resolvedByAiAgentId: z.string().nullable(),
	// Escalation tracking
	escalatedAt: z.string().nullable(),
	escalatedByAiAgentId: z.string().nullable(),
	escalationReason: z.string().nullable(),
	escalationHandledAt: z.string().nullable(),
	escalationHandledByUserId: z.string().nullable(),
	// AI pause control
	aiPausedUntil: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
	deletedAt: z.string().nullable(),
	lastMessageAt: z.string().nullable(),
	lastSeenAt: z.string().nullable(),
	lastMessageTimelineItem: timelineItemSchema.nullable(),
	lastTimelineItem: timelineItemSchema.nullable(),
	activeClarification: conversationClarificationSummarySchema.nullable(),
	dashboardLocked: z.boolean().optional(),
	dashboardLockReason: z
		.union([z.literal("conversation_limit"), z.null()])
		.optional(),
	viewIds: z.array(z.string()),
	seenData: z.array(conversationSeenSchema),
});

export const listConversationHeadersResponseSchema = z.object({
	items: z.array(conversationHeaderSchema),
	nextCursor: z.string().nullable(),
});

export const conversationExportSchema = z.object({
	filename: z.string(),
	content: z.string(),
	mimeType: z.literal("text/plain; charset=utf-8"),
});

export const inboxAnalyticsRangeSchema = z.union([
	z.literal(7),
	z.literal(14),
	z.literal(30),
]);

export const inboxAnalyticsRequestSchema = z.object({
	websiteSlug: z.string(),
	rangeDays: inboxAnalyticsRangeSchema.optional().default(7),
});

export const inboxAnalyticsMetricsSchema = z.object({
	medianResponseTimeSeconds: z.number().nullable(),
	medianResolutionTimeSeconds: z.number().nullable(),
	aiHandledRate: z.number().nullable(),
	satisfactionIndex: z.number().nullable(),
	uniqueVisitors: z.number(),
});

export const inboxAnalyticsResponseSchema = z.object({
	range: z.object({
		rangeDays: inboxAnalyticsRangeSchema,
		currentStart: z.string(),
		currentEnd: z.string(),
		previousStart: z.string(),
		previousEnd: z.string(),
	}),
	current: inboxAnalyticsMetricsSchema,
	previous: inboxAnalyticsMetricsSchema,
});

export type ConversationMutationResponse = z.infer<
	typeof conversationMutationResponseSchema
>;

export type ConversationHeader = z.infer<typeof conversationHeaderSchema>;

export type InboxAnalyticsRequest = z.infer<typeof inboxAnalyticsRequestSchema>;
export type InboxAnalyticsResponse = z.infer<
	typeof inboxAnalyticsResponseSchema
>;
export type ConversationExport = z.infer<typeof conversationExportSchema>;
