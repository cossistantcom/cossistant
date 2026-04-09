import { z } from "@hono/zod-openapi";
import {
	ConversationPriority,
	ConversationSentiment,
	ConversationStatus,
} from "../enums";
import { conversationSchema, conversationSeenSchema } from "../schemas";
import { apiTimestampSchema, nullableApiTimestampSchema } from "./common";
import { conversationClarificationSummarySchema } from "./knowledge-clarification";
import { timelineItemSchema } from "./timeline-item";
import { visitorProfileSchema } from "./visitor";

export const createConversationRequestSchema = z
	.object({
		visitorId: z.string().optional().openapi({
			description:
				"Visitor ID, if not provided you must provide a visitorId in the headers.",
		}),
		conversationId: z.string().optional().openapi({
			description:
				"Optional idempotency key for conversation creation. If provided, it is scoped to one organization+website+visitor owner tuple; retries with the same tuple reuse the existing conversation.",
		}),
		defaultTimelineItems: z.array(timelineItemSchema).openapi({
			description: "Default timeline items to initiate the conversation with",
		}),
		channel: z.string().default("widget").openapi({
			description: "Which channel the conversation is from",
			default: "widget",
		}),
	})
	.openapi({
		description: "Body for creating a conversation.",
	});

export type CreateConversationRequestBody = z.infer<
	typeof createConversationRequestSchema
>;

export const createConversationResponseSchema = z
	.object({
		initialTimelineItems: z.array(timelineItemSchema),
		conversation: conversationSchema,
	})
	.openapi({
		description: "Body including created conversation and default messages",
	});

export type CreateConversationResponseBody = z.infer<
	typeof createConversationResponseSchema
>;

export const createConversationConflictCodeSchema = z.enum([
	"CONVERSATION_ID_CONFLICT",
	"TIMELINE_ITEM_ID_CONFLICT",
]);

export type CreateConversationConflictCode = z.infer<
	typeof createConversationConflictCodeSchema
>;

export const createConversationConflictResponseSchema = z
	.object({
		code: createConversationConflictCodeSchema,
		error: z.string(),
	})
	.openapi({
		description:
			"Conflict response when conversationId is already claimed by a different visitor or tenant.",
	});

export type CreateConversationConflictResponseBody = z.infer<
	typeof createConversationConflictResponseSchema
>;

export const listConversationsRequestSchema = z
	.object({
		visitorId: z.string().optional().openapi({
			description: "Visitor ID to fetch conversations for.",
		}),
		page: z.coerce.number().min(1).default(1).openapi({
			description: "Page number for pagination",
			default: 1,
		}),
		limit: z.coerce.number().min(1).max(100).default(6).openapi({
			description: "Number of conversations per page",
			default: 6,
		}),
		status: z.enum(["open", "closed"]).optional().openapi({
			description: "Filter by conversation status",
		}),
		orderBy: z.enum(["createdAt", "updatedAt"]).default("updatedAt").openapi({
			description: "Field to order conversations by",
			default: "updatedAt",
		}),
		order: z.enum(["asc", "desc"]).default("desc").openapi({
			description: "Order direction",
			default: "desc",
		}),
	})
	.openapi({
		description: "Query parameters for listing conversations",
	});

export type ListConversationsRequest = z.infer<
	typeof listConversationsRequestSchema
>;

export const listConversationsResponseSchema = z
	.object({
		conversations: z.array(conversationSchema),
		pagination: z.object({
			page: z.number(),
			limit: z.number(),
			total: z.number(),
			totalPages: z.number(),
			hasMore: z.boolean(),
		}),
	})
	.openapi({
		description: "Paginated list of conversations",
	});

export type ListConversationsResponse = z.infer<
	typeof listConversationsResponseSchema
>;

export const listInboxConversationsRequestSchema = z
	.object({
		limit: z.coerce.number().int().min(1).max(500).default(50).openapi({
			description: "Maximum number of conversations to return per page.",
			default: 50,
		}),
		cursor: z.string().nullable().optional().openapi({
			description:
				"Opaque cursor returned by the previous inbox response, or null for the first page.",
		}),
	})
	.openapi({
		description: "Query parameters for listing inbox conversations.",
	});

export type ListInboxConversationsRequest = z.infer<
	typeof listInboxConversationsRequestSchema
>;

const conversationInboxStatusSchema = z.enum([
	ConversationStatus.OPEN,
	ConversationStatus.RESOLVED,
	ConversationStatus.SPAM,
]);

const conversationInboxPrioritySchema = z.enum([
	ConversationPriority.LOW,
	ConversationPriority.NORMAL,
	ConversationPriority.HIGH,
	ConversationPriority.URGENT,
]);

const conversationInboxSentimentSchema = z
	.enum([
		ConversationSentiment.POSITIVE,
		ConversationSentiment.NEGATIVE,
		ConversationSentiment.NEUTRAL,
	])
	.nullable();

export const conversationInboxItemSchema = z
	.object({
		id: z.string().openapi({
			description: "Unique identifier for the conversation.",
		}),
		status: conversationInboxStatusSchema.openapi({
			description: "Current status of the conversation.",
		}),
		priority: conversationInboxPrioritySchema.openapi({
			description: "Current priority level of the conversation.",
		}),
		organizationId: z.string().openapi({
			description: "Organization that owns the conversation.",
		}),
		visitorId: z.string().openapi({
			description: "Visitor who owns the conversation.",
		}),
		visitor: visitorProfileSchema.openapi({
			description: "Visitor profile summary for the conversation.",
		}),
		websiteId: z.string().openapi({
			description: "Website that owns the conversation.",
		}),
		channel: z.string().openapi({
			description: "Channel where the conversation started.",
			example: "widget",
		}),
		title: z.string().nullable().openapi({
			description: "Conversation title if one has been generated or set.",
		}),
		titleSource: z.enum(["ai", "user"]).nullable().openapi({
			description: "Whether the title was set by AI or a user.",
		}),
		sentiment: conversationInboxSentimentSchema.openapi({
			description: "Most recent inferred conversation sentiment.",
		}),
		sentimentConfidence: z.number().nullable().openapi({
			description: "Confidence score for the inferred sentiment, if available.",
		}),
		resolutionTime: z.number().nullable().openapi({
			description:
				"Resolution time in seconds once the conversation has been resolved.",
		}),
		visitorRating: z.number().int().min(1).max(5).nullable().openapi({
			description: "Visitor satisfaction rating, if one has been submitted.",
		}),
		visitorRatingAt: nullableApiTimestampSchema.openapi({
			description: "When the visitor rating was submitted.",
		}),
		startedAt: nullableApiTimestampSchema.openapi({
			description: "When the conversation was considered started.",
		}),
		firstResponseAt: nullableApiTimestampSchema.openapi({
			description: "When the first response was sent, if available.",
		}),
		resolvedAt: nullableApiTimestampSchema.openapi({
			description: "When the conversation was resolved, if applicable.",
		}),
		resolvedByUserId: z.string().nullable().openapi({
			description: "User who resolved the conversation, if applicable.",
		}),
		resolvedByAiAgentId: z.string().nullable().openapi({
			description: "AI agent that resolved the conversation, if applicable.",
		}),
		escalatedAt: nullableApiTimestampSchema.openapi({
			description: "When the conversation was escalated, if applicable.",
		}),
		escalatedByAiAgentId: z.string().nullable().openapi({
			description: "AI agent that escalated the conversation, if applicable.",
		}),
		escalationReason: z.string().nullable().openapi({
			description: "Reason provided for the escalation, if applicable.",
		}),
		escalationHandledAt: nullableApiTimestampSchema.openapi({
			description: "When the escalation was handled, if applicable.",
		}),
		escalationHandledByUserId: z.string().nullable().openapi({
			description: "User who handled the escalation, if applicable.",
		}),
		aiPausedUntil: nullableApiTimestampSchema.openapi({
			description: "If AI replies are paused, when the pause expires.",
		}),
		createdAt: apiTimestampSchema.openapi({
			description: "When the conversation record was created.",
		}),
		updatedAt: apiTimestampSchema.openapi({
			description: "When the conversation record was last updated.",
		}),
		deletedAt: nullableApiTimestampSchema.openapi({
			description: "When the conversation was archived, if applicable.",
		}),
		lastMessageAt: nullableApiTimestampSchema.openapi({
			description:
				"Timestamp of the latest message-like activity in the thread.",
		}),
		lastSeenAt: nullableApiTimestampSchema.openapi({
			description:
				"User-specific last-seen timestamp when available, otherwise null.",
		}),
		lastMessageTimelineItem: timelineItemSchema.nullable().openapi({
			description: "Latest message timeline item for the conversation, if any.",
		}),
		lastTimelineItem: timelineItemSchema.nullable().openapi({
			description:
				"Latest timeline item for the conversation, including private events.",
		}),
		activeClarification: conversationClarificationSummarySchema
			.nullable()
			.openapi({
				description:
					"Active knowledge clarification summary linked to the conversation, if any.",
			}),
		dashboardLocked: z.boolean().optional().openapi({
			description:
				"Whether the dashboard has hard-limited access to the conversation.",
		}),
		dashboardLockReason: z
			.union([z.literal("conversation_limit"), z.null()])
			.optional()
			.openapi({
				description: "Why the dashboard access is locked, when applicable.",
			}),
		viewIds: z.array(z.string()).openapi({
			description: "View identifiers associated with the conversation.",
		}),
		seenData: z.array(conversationSeenSchema).openapi({
			description: "Seen-state records associated with the conversation.",
		}),
	})
	.openapi({
		description: "Conversation summary returned by the inbox listing endpoint.",
	});

export type ConversationInboxItem = z.infer<typeof conversationInboxItemSchema>;

export const listInboxConversationsResponseSchema = z
	.object({
		items: z.array(conversationInboxItemSchema).openapi({
			description: "Inbox conversations for the authenticated website.",
		}),
		nextCursor: z.string().nullable().openapi({
			description:
				"Cursor for the next page, or null when the current page is final.",
		}),
	})
	.openapi({
		description: "Cursor-paginated inbox conversations.",
	});

export type ListInboxConversationsResponse = z.infer<
	typeof listInboxConversationsResponseSchema
>;

export const getConversationRequestSchema = z
	.object({
		conversationId: z.string().openapi({
			description: "The ID of the conversation to retrieve",
		}),
	})
	.openapi({
		description: "Parameters for retrieving a single conversation",
	});

export type GetConversationRequest = z.infer<
	typeof getConversationRequestSchema
>;

export const getConversationResponseSchema = z
	.object({
		conversation: conversationSchema,
	})
	.openapi({
		description: "Response containing a single conversation",
	});

export type GetConversationResponse = z.infer<
	typeof getConversationResponseSchema
>;

export const markConversationSeenRequestSchema = z
	.object({
		visitorId: z.string().optional().openapi({
			description:
				"Visitor ID associated with the conversation. Optional if provided via the X-Visitor-Id header.",
		}),
	})
	.openapi({
		description:
			"Body for marking a conversation as seen. Either visitorId must be provided via body or headers.",
	});

export type MarkConversationSeenRequestBody = z.infer<
	typeof markConversationSeenRequestSchema
>;

export const markConversationSeenResponseSchema = z
	.object({
		conversationId: z.string().openapi({
			description: "The ID of the conversation that was marked as seen",
		}),
		lastSeenAt: apiTimestampSchema.openapi({
			description:
				"Timestamp indicating when the visitor last saw the conversation",
		}),
	})
	.openapi({
		description: "Response confirming the conversation has been marked as seen",
	});

export type MarkConversationSeenResponseBody = z.infer<
	typeof markConversationSeenResponseSchema
>;

export const setConversationTypingRequestSchema = z
	.object({
		isTyping: z.boolean().openapi({
			description: "Whether the visitor is currently typing",
		}),
		visitorPreview: z.string().max(2000).optional().openapi({
			description:
				"Optional preview of the visitor's message while typing. Only processed when the visitor is typing.",
		}),
		visitorId: z.string().optional().openapi({
			description:
				"Visitor ID associated with the conversation. Optional if provided via the X-Visitor-Id header.",
		}),
	})
	.openapi({
		description:
			"Body for reporting a visitor typing state. Either visitorId must be provided via body or headers.",
	});

export type SetConversationTypingRequestBody = z.infer<
	typeof setConversationTypingRequestSchema
>;

export const setConversationTypingResponseSchema = z
	.object({
		conversationId: z.string().openapi({
			description: "The ID of the conversation receiving the typing update",
		}),
		isTyping: z.boolean().openapi({
			description: "Echo of the reported typing state",
		}),
		visitorPreview: z.string().nullable().openapi({
			description:
				"Preview text that was forwarded with the typing event, or null when none was sent.",
		}),
		sentAt: apiTimestampSchema.openapi({
			description: "Timestamp when the typing event was recorded",
		}),
	})
	.openapi({
		description: "Response confirming the visitor typing state was recorded",
	});

export type SetConversationTypingResponseBody = z.infer<
	typeof setConversationTypingResponseSchema
>;

export const submitConversationRatingRequestSchema = z
	.object({
		rating: z.number().int().min(1).max(5).openapi({
			description: "Visitor rating for the conversation (1-5)",
			example: 5,
		}),
		comment: z.string().optional().openapi({
			description: "Optional written feedback about the conversation",
		}),
		visitorId: z.string().optional().openapi({
			description:
				"Visitor ID associated with the conversation. Optional if provided via the X-Visitor-Id header.",
		}),
	})
	.openapi({
		description: "Body for submitting a visitor rating on a conversation.",
	});

export type SubmitConversationRatingRequestBody = z.infer<
	typeof submitConversationRatingRequestSchema
>;

export const submitConversationRatingResponseSchema = z
	.object({
		conversationId: z.string().openapi({
			description: "The ID of the conversation that was rated",
		}),
		rating: z.number().int().min(1).max(5).openapi({
			description: "The rating that was saved",
		}),
		ratedAt: apiTimestampSchema.openapi({
			description: "Timestamp when the rating was recorded",
		}),
	})
	.openapi({
		description: "Response confirming the conversation rating was recorded",
	});

export type SubmitConversationRatingResponseBody = z.infer<
	typeof submitConversationRatingResponseSchema
>;

export const getConversationSeenDataResponseSchema = z
	.object({
		seenData: z.array(
			z.object({
				id: z.string().openapi({
					description: "The seen record's unique identifier",
				}),
				conversationId: z.string().openapi({
					description: "The conversation ID",
				}),
				userId: z.string().nullable().openapi({
					description: "The user ID who saw the conversation, if applicable",
				}),
				visitorId: z.string().nullable().openapi({
					description: "The visitor ID who saw the conversation, if applicable",
				}),
				aiAgentId: z.string().nullable().openapi({
					description:
						"The AI agent ID who saw the conversation, if applicable",
				}),
				lastSeenAt: apiTimestampSchema.openapi({
					description: "Timestamp when the conversation was last seen",
				}),
				createdAt: apiTimestampSchema.openapi({
					description: "When the seen record was created",
				}),
				updatedAt: apiTimestampSchema.openapi({
					description: "When the seen record was last updated",
				}),
				deletedAt: nullableApiTimestampSchema.openapi({
					description: "When the seen record was deleted, if applicable",
				}),
			})
		),
	})
	.openapi({
		description: "Response containing seen data for a conversation",
	});

export type GetConversationSeenDataResponse = z.infer<
	typeof getConversationSeenDataResponseSchema
>;
