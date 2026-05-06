import { z } from "zod";
import { conversationClarificationSummarySchema } from "./api/knowledge-clarification";
import { supportStateResponseSchema } from "./api/support";
import {
	visitorActivityTypeSchema,
	visitorAttributionSchema,
	visitorCurrentPageSchema,
	visitorResponseSchema,
} from "./api/visitor";
import {
	ConversationEventType,
	ConversationStatus,
	ConversationTimelineType,
	TimelineItemVisibility,
} from "./enums";
import { conversationSchema } from "./schemas";
import { conversationHeaderSchema } from "./trpc/conversation";

export const baseRealtimeEvent = z.object({
	websiteId: z.string(),
	organizationId: z.string(),
	visitorId: z.string().nullable(),
	userId: z.string().nullable(),
});

/**
 * Central event system for real-time communication
 * All WebSocket and Redis Pub/Sub events are defined here
 */
export const realtimeSchema = {
	userConnected: baseRealtimeEvent.extend({
		connectionId: z.string(),
	}),
	userDisconnected: baseRealtimeEvent.extend({
		connectionId: z.string(),
	}),
	visitorConnected: baseRealtimeEvent.extend({
		visitorId: z.string(),
		connectionId: z.string(),
	}),
	visitorDisconnected: baseRealtimeEvent.extend({
		visitorId: z.string(),
		connectionId: z.string(),
	}),
	visitorPresenceUpdate: baseRealtimeEvent.extend({
		visitorId: z.string(),
		userId: z.null(),
		sessionId: z.string(),
		activityType: visitorActivityTypeSchema.or(z.literal("page_sync")),
		attribution: visitorAttributionSchema.nullable().optional(),
		currentPage: visitorCurrentPageSchema.nullable().optional(),
	}),
	userPresenceUpdate: baseRealtimeEvent.extend({
		userId: z.string(),
		status: z.enum(["online", "away", "offline"]),
		lastSeen: z.string(),
	}),
	conversationSeen: baseRealtimeEvent.extend({
		conversationId: z.string(),
		aiAgentId: z.string().nullable(),
		lastSeenAt: z.string(),
		/** The type of actor who marked the conversation as seen */
		actorType: z.enum(["visitor", "user", "ai_agent"]),
		/** The actor's ID (matches one of userId, visitorId, or aiAgentId based on actorType) */
		actorId: z.string(),
	}),
	conversationTyping: baseRealtimeEvent.extend({
		conversationId: z.string(),
		aiAgentId: z.string().nullable(),
		isTyping: z.boolean(),
		visitorPreview: z.string().max(2000).nullable().optional(),
	}),
	timelineItemCreated: baseRealtimeEvent.extend({
		conversationId: z.string(),
		item: z.object({
			id: z.string(),
			conversationId: z.string(),
			organizationId: z.string(),
			visibility: z.enum([
				TimelineItemVisibility.PUBLIC,
				TimelineItemVisibility.PRIVATE,
			]),
			type: z.enum([
				ConversationTimelineType.MESSAGE,
				ConversationTimelineType.EVENT,
				ConversationTimelineType.IDENTIFICATION,
				ConversationTimelineType.TOOL,
			]),
			text: z.string().nullable(),
			parts: z.array(z.unknown()),
			userId: z.string().nullable(),
			visitorId: z.string().nullable(),
			aiAgentId: z.string().nullable(),
			createdAt: z.string(),
			deletedAt: z.string().nullable(),
			tool: z.string().nullable().optional(),
		}),
	}),
	conversationCreated: baseRealtimeEvent.extend({
		conversationId: z.string(),
		conversation: conversationSchema,
		header: conversationHeaderSchema,
	}),
	visitorIdentified: baseRealtimeEvent.extend({
		visitorId: z.string(),
		visitor: visitorResponseSchema,
	}),
	supportStateUpdated: baseRealtimeEvent.extend({
		visitorId: z.string(),
		state: supportStateResponseSchema,
	}),
	conversationEventCreated: baseRealtimeEvent.extend({
		conversationId: z.string(),
		aiAgentId: z.string().nullable(),
		event: z.object({
			id: z.string(),
			conversationId: z.string(),
			organizationId: z.string(),
			type: z.enum([
				ConversationEventType.ASSIGNED,
				ConversationEventType.UNASSIGNED,
				ConversationEventType.PARTICIPANT_REQUESTED,
				ConversationEventType.PARTICIPANT_JOINED,
				ConversationEventType.PARTICIPANT_LEFT,
				ConversationEventType.STATUS_CHANGED,
				ConversationEventType.PRIORITY_CHANGED,
				ConversationEventType.TAG_ADDED,
				ConversationEventType.TAG_REMOVED,
				ConversationEventType.RESOLVED,
				ConversationEventType.REOPENED,
				ConversationEventType.VISITOR_BLOCKED,
				ConversationEventType.VISITOR_UNBLOCKED,
				ConversationEventType.VISITOR_IDENTIFIED,
				ConversationEventType.AI_PAUSED,
				ConversationEventType.AI_RESUMED,
			]),
			actorUserId: z.string().nullable(),
			actorAiAgentId: z.string().nullable(),
			targetUserId: z.string().nullable(),
			targetAiAgentId: z.string().nullable(),
			message: z.string().nullable(),
			metadata: z.record(z.string(), z.unknown()).nullable(),
			createdAt: z.string(),
			updatedAt: z.string(),
			deletedAt: z.string().nullable(),
		}),
	}),
	// Conversation updated (title, sentiment, escalation status changes, status changes)
	conversationUpdated: baseRealtimeEvent.extend({
		conversationId: z.string(),
		updates: z.object({
			title: z.string().nullable().optional(),
			titleSource: z.enum(["ai", "user"]).nullable().optional(),
			visitorTitle: z.string().nullable().optional(),
			visitorTitleLanguage: z.string().nullable().optional(),
			visitorLanguage: z.string().nullable().optional(),
			translationActivatedAt: z.string().nullable().optional(),
			translationChargedAt: z.string().nullable().optional(),
			sentiment: z
				.enum(["positive", "negative", "neutral"])
				.nullable()
				.optional(),
			sentimentConfidence: z.number().nullable().optional(),
			sentimentSource: z.enum(["ai", "user"]).nullable().optional(),
			escalatedAt: z.string().nullable().optional(),
			escalationReason: z.string().nullable().optional(),
			status: z
				.enum([
					ConversationStatus.OPEN,
					ConversationStatus.RESOLVED,
					ConversationStatus.SPAM,
				])
				.optional(),
			priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
			prioritySource: z.enum(["ai", "user"]).nullable().optional(),
			resolvedAt: z.string().nullable().optional(),
			resolvedByUserId: z.string().nullable().optional(),
			resolvedByAiAgentId: z.string().nullable().optional(),
			resolutionTime: z.number().nullable().optional(),
			deletedAt: z.string().nullable().optional(),
			aiPausedUntil: z.string().nullable().optional(),
			activeClarification: conversationClarificationSummarySchema
				.nullable()
				.optional(),
			viewIds: z.array(z.string()).optional(),
		}),
		aiAgentId: z.string().nullable(),
	}),

	// =========================================================================
	// AI AGENT PROCESSING EVENTS
	// For progressive UI updates during AI agent responses
	//
	// AUDIENCE FIELD:
	// - 'all': Send to both dashboard and widget
	// - 'dashboard': Send only to dashboard (human agents)
	//
	// Widget (visitor) connections only receive events with audience='all'
	// =========================================================================

	// Emitted when AI agent starts processing a message
	aiAgentProcessingStarted: baseRealtimeEvent.extend({
		conversationId: z.string(),
		aiAgentId: z.string(),
		workflowRunId: z.string(),
		/** ID of the trigger message that started this workflow */
		triggerMessageId: z.string(),
		/** Initial phase of processing */
		phase: z.string().optional(),
		/** Audience: 'all' = everyone, 'dashboard' = team only */
		audience: z.enum(["all", "dashboard"]).default("dashboard"),
	}),

	// Emitted when AI agent makes a decision about whether to act
	aiAgentDecisionMade: baseRealtimeEvent.extend({
		conversationId: z.string(),
		aiAgentId: z.string(),
		workflowRunId: z.string(),
		/** Whether the AI decided to take action */
		shouldAct: z.boolean(),
		/** Human-readable reason for the decision */
		reason: z.string(),
		/** Response mode: how the AI is responding */
		mode: z.enum([
			"respond_to_visitor",
			"respond_to_command",
			"background_only",
		]),
		/** Audience: 'all' = everyone, 'dashboard' = team only */
		audience: z.enum(["all", "dashboard"]),
	}),

	// Emitted for progress updates during AI agent processing
	aiAgentProcessingProgress: baseRealtimeEvent.extend({
		conversationId: z.string(),
		aiAgentId: z.string(),
		workflowRunId: z.string(),
		/** Current phase: 'thinking', 'searching', 'tool-executing', 'generating', etc. */
		phase: z.string(),
		/** Human-readable message for display (widget sees this) */
		message: z.string().nullable(),
		/** Tool information when phase is tool-related */
		tool: z
			.object({
				toolCallId: z.string(),
				toolName: z.string(),
				/** Tool state: partial (executing), result (success), error (failed) */
				state: z.enum(["partial", "result", "error"]),
			})
			.optional(),
		/** Audience: 'all' = everyone, 'dashboard' = team only */
		audience: z.enum(["all", "dashboard"]).default("all"),
	}),

	// Emitted when AI agent finishes processing
	aiAgentProcessingCompleted: baseRealtimeEvent.extend({
		conversationId: z.string(),
		aiAgentId: z.string(),
		workflowRunId: z.string(),
		/** Whether processing completed successfully, was skipped, cancelled, or errored */
		status: z.enum(["success", "skipped", "cancelled", "error"]),
		/** Action taken (if status is 'success') */
		action: z.string().nullable().optional(),
		/** Reason for skip/cancel/error */
		reason: z.string().nullable().optional(),
		/** Audience: 'all' = everyone, 'dashboard' = team only */
		audience: z.enum(["all", "dashboard"]).default("all"),
	}),

	// =========================================================================
	// TIMELINE ITEM UPDATE EVENTS
	// For updating timeline items with new parts or state changes
	// =========================================================================

	// Emitted when an entire timeline item is updated (e.g., parts added)
	timelineItemUpdated: baseRealtimeEvent.extend({
		conversationId: z.string(),
		item: z.object({
			id: z.string(),
			conversationId: z.string(),
			organizationId: z.string(),
			visibility: z.enum([
				TimelineItemVisibility.PUBLIC,
				TimelineItemVisibility.PRIVATE,
			]),
			type: z.enum([
				ConversationTimelineType.MESSAGE,
				ConversationTimelineType.EVENT,
				ConversationTimelineType.IDENTIFICATION,
				ConversationTimelineType.TOOL,
			]),
			text: z.string().nullable(),
			parts: z.array(z.unknown()),
			userId: z.string().nullable(),
			visitorId: z.string().nullable(),
			aiAgentId: z.string().nullable(),
			createdAt: z.string(),
			deletedAt: z.string().nullable(),
			tool: z.string().nullable().optional(),
		}),
	}),

	// Emitted for granular part updates (e.g., tool state changes)
	timelineItemPartUpdated: baseRealtimeEvent.extend({
		conversationId: z.string(),
		timelineItemId: z.string(),
		/** Index of the part in the parts array */
		partIndex: z.number(),
		/** The updated part data */
		part: z.unknown(),
	}),
	// Web crawling events
	crawlStarted: baseRealtimeEvent.extend({
		linkSourceId: z.string(),
		url: z.string(),
		discoveredPages: z.array(
			z.object({
				url: z.string(),
				title: z.string().nullable(),
				depth: z.number(),
			})
		),
		totalPagesCount: z.number(),
	}),
	crawlProgress: baseRealtimeEvent.extend({
		linkSourceId: z.string(),
		url: z.string(),
		page: z.object({
			url: z.string(),
			title: z.string().nullable(),
			status: z.enum(["pending", "crawling", "completed", "failed"]),
			sizeBytes: z.number().optional(),
			error: z.string().nullable().optional(),
		}),
		completedCount: z.number(),
		totalCount: z.number(),
	}),
	crawlCompleted: baseRealtimeEvent.extend({
		linkSourceId: z.string(),
		url: z.string(),
		crawledPagesCount: z.number(),
		totalSizeBytes: z.number(),
		failedPagesCount: z.number(),
	}),
	crawlFailed: baseRealtimeEvent.extend({
		linkSourceId: z.string(),
		url: z.string(),
		error: z.string(),
	}),
	// Link source updated (for status changes, etc.)
	linkSourceUpdated: baseRealtimeEvent.extend({
		linkSourceId: z.string(),
		status: z.enum(["pending", "mapping", "crawling", "completed", "failed"]),
		discoveredPagesCount: z.number().optional(),
		crawledPagesCount: z.number().optional(),
		totalSizeBytes: z.number().optional(),
		errorMessage: z.string().nullable().optional(),
	}),
	// Emitted after map phase with all discovered URLs (for real-time tree display)
	crawlPagesDiscovered: baseRealtimeEvent.extend({
		linkSourceId: z.string(),
		pages: z.array(
			z.object({
				url: z.string(),
				path: z.string(),
				depth: z.number(),
			})
		),
	}),
	// Emitted when each page completes scraping (for real-time updates)
	crawlPageCompleted: baseRealtimeEvent.extend({
		linkSourceId: z.string(),
		page: z.object({
			url: z.string(),
			title: z.string().nullable(),
			sizeBytes: z.number(),
			knowledgeId: z.string(),
		}),
	}),

	// =========================================================================
	// AI TRAINING EVENTS
	// For knowledge base embedding generation and progress tracking
	// =========================================================================

	// Emitted when AI training starts
	trainingStarted: baseRealtimeEvent.extend({
		aiAgentId: z.string(),
		totalItems: z.number(),
	}),

	// Emitted for progress updates during AI training
	trainingProgress: baseRealtimeEvent.extend({
		aiAgentId: z.string(),
		processedItems: z.number(),
		totalItems: z.number(),
		currentItem: z
			.object({
				id: z.string(),
				title: z.string().nullable(),
				type: z.enum(["url", "faq", "article"]),
			})
			.optional(),
		percentage: z.number(),
	}),

	// Emitted when AI training completes successfully
	trainingCompleted: baseRealtimeEvent.extend({
		aiAgentId: z.string(),
		totalItems: z.number(),
		totalChunks: z.number(),
		duration: z.number(), // milliseconds
	}),

	// Emitted when AI training fails
	trainingFailed: baseRealtimeEvent.extend({
		aiAgentId: z.string(),
		error: z.string(),
	}),
} as const;

export type RealtimeEventType = keyof typeof realtimeSchema;

export type RealtimeEventPayload<T extends RealtimeEventType> = z.infer<
	(typeof realtimeSchema)[T]
>;

export type RealtimeEvent<T extends RealtimeEventType> = {
	type: T;
	payload: RealtimeEventPayload<T>;
};

export type AnyRealtimeEvent = {
	[K in RealtimeEventType]: RealtimeEvent<K>;
}[RealtimeEventType];

export type RealtimeEventData<T extends RealtimeEventType> =
	RealtimeEventPayload<T>;

/**
 * Validates an event against its schema
 */
export function validateRealtimeEvent<T extends RealtimeEventType>(
	type: T,
	data: unknown
): RealtimeEventPayload<T> {
	const schema = realtimeSchema[type];
	return schema.parse(data) as RealtimeEventPayload<T>;
}

/**
 * Type guard to check if a string is a valid event type
 */
export function isValidEventType(type: unknown): type is RealtimeEventType {
	return typeof type === "string" && type in realtimeSchema;
}

export function getEventPayload<T extends RealtimeEventType>(
	event: RealtimeEvent<T>
): RealtimeEventPayload<T> {
	return event.payload;
}
