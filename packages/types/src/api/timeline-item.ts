import { z } from "@hono/zod-openapi";

import {
	ConversationEventType,
	ConversationTimelineType,
	TimelineItemVisibility,
} from "../enums";
import { TOOL_TIMELINE_LOG_TYPE } from "../tool-timeline-policy";
import {
	apiTimestampInputSchema,
	apiTimestampSchema,
	nullableApiTimestampSchema,
} from "./common";

// ============================================================================
// AI SDK v6 COMPATIBLE PART SCHEMAS
// These follow Vercel AI SDK v6 patterns for UIMessagePart types.
// Cossistant extensions use providerMetadata/callProviderMetadata.cossistant namespace.
// ============================================================================

// ----------------------------------------------------------------------------
// Cossistant Provider Metadata (extension point for all parts)
// ----------------------------------------------------------------------------
const cossistantToolTimelineMetadataSchema = z.object({
	logType: z
		.enum([
			TOOL_TIMELINE_LOG_TYPE.CUSTOMER_FACING,
			TOOL_TIMELINE_LOG_TYPE.LOG,
			TOOL_TIMELINE_LOG_TYPE.DECISION,
		])
		.openapi({
			description:
				"Tool timeline classification: conversation-visible, log-only, or decision stage",
		}),
	triggerMessageId: z.string().openapi({
		description:
			"Message ID that triggered the tool/decision workflow execution",
	}),
	workflowRunId: z.string().openapi({
		description:
			"Workflow run identifier used to correlate tool timeline updates",
	}),
	triggerVisibility: z.enum(["public", "private"]).optional().openapi({
		description:
			"Visibility of the trigger message at the time the tool was executed",
	}),
});

const cossistantProviderMetadataSchema = z
	.object({
		cossistant: z
			.object({
				visibility: z.enum(["public", "private"]).optional().openapi({
					description: "Part-level visibility control for filtering",
				}),
				progressMessage: z.string().optional().openapi({
					description: "Custom progress message to display during execution",
				}),
				knowledgeId: z.string().optional().openapi({
					description: "Reference to a Cossistant knowledge entry",
				}),
				toolTimeline: cossistantToolTimelineMetadataSchema.optional().openapi({
					description:
						"Tool timeline metadata used to classify visibility and trigger linkage",
				}),
			})
			.optional(),
	})
	.passthrough()
	.optional();

// ----------------------------------------------------------------------------
// TEXT PART (AI SDK compatible)
// ----------------------------------------------------------------------------
const textPartSchema = z.object({
	type: z.literal("text").openapi({
		description: "Text content part - matches AI SDK TextUIPart",
	}),
	text: z.string().openapi({
		description: "The text content",
	}),
	state: z.enum(["streaming", "done"]).optional().openapi({
		description:
			"AI SDK state: 'streaming' = still processing, 'done' = complete",
	}),
});

// ----------------------------------------------------------------------------
// REASONING PART (AI SDK compatible - for AI chain-of-thought)
// ----------------------------------------------------------------------------
const reasoningPartSchema = z.object({
	type: z.literal("reasoning").openapi({
		description:
			"AI reasoning/chain-of-thought - matches AI SDK ReasoningUIPart",
	}),
	text: z.string().openapi({
		description: "The reasoning text content",
	}),
	state: z.enum(["streaming", "done"]).optional().openapi({
		description:
			"AI SDK state: 'streaming' = still processing, 'done' = complete",
	}),
	providerMetadata: cossistantProviderMetadataSchema,
});

// ----------------------------------------------------------------------------
// TOOL PART (AI SDK compatible - for tool invocations)
// AI SDK uses type: `tool-${toolName}` pattern, but we use a generic schema
// with toolName field for flexibility. Type checking happens at runtime.
// ----------------------------------------------------------------------------
const toolStateSchema = z.enum(["partial", "result", "error"]).openapi({
	description:
		"AI SDK tool state: 'partial' = executing, 'result' = success, 'error' = failed",
});

const toolPartSchema = z.object({
	type: z
		.string()
		.regex(/^tool-.+$/)
		.openapi({
			description: "Tool type following AI SDK pattern: tool-{toolName}",
		}),
	toolCallId: z.string().openapi({
		description: "Unique identifier for this tool invocation",
	}),
	toolName: z.string().openapi({
		description: "Name of the tool being invoked",
	}),
	input: z.record(z.string(), z.unknown()).openapi({
		description: "Input parameters passed to the tool",
	}),
	output: z.unknown().optional().openapi({
		description: "Output returned by the tool (when state is 'result')",
	}),
	state: toolStateSchema,
	errorText: z.string().optional().openapi({
		description: "Error message when state is 'error'",
	}),
	callProviderMetadata: cossistantProviderMetadataSchema,
	providerMetadata: cossistantProviderMetadataSchema,
});

// ----------------------------------------------------------------------------
// SOURCE URL PART (AI SDK compatible - for citations)
// ----------------------------------------------------------------------------
const sourceUrlPartSchema = z.object({
	type: z.literal("source-url").openapi({
		description: "URL source citation - matches AI SDK SourceUrlUIPart",
	}),
	sourceId: z.string().openapi({
		description: "Unique identifier for this source",
	}),
	url: z.string().url().openapi({
		description: "URL of the source",
	}),
	title: z.string().optional().openapi({
		description: "Title of the source",
	}),
	providerMetadata: cossistantProviderMetadataSchema,
});

// ----------------------------------------------------------------------------
// SOURCE DOCUMENT PART (AI SDK compatible - for document citations)
// ----------------------------------------------------------------------------
const sourceDocumentPartSchema = z.object({
	type: z.literal("source-document").openapi({
		description:
			"Document source citation - matches AI SDK SourceDocumentUIPart",
	}),
	sourceId: z.string().openapi({
		description: "Unique identifier for this source",
	}),
	mediaType: z.string().openapi({
		description: "IANA media type of the document",
	}),
	title: z.string().openapi({
		description: "Title of the document",
	}),
	filename: z.string().optional().openapi({
		description: "Filename of the document",
	}),
	providerMetadata: cossistantProviderMetadataSchema,
});

// ----------------------------------------------------------------------------
// STEP START PART (AI SDK compatible - for multi-step boundaries)
// ----------------------------------------------------------------------------
const stepStartPartSchema = z.object({
	type: z.literal("step-start").openapi({
		description: "Step boundary marker - matches AI SDK StepStartUIPart",
	}),
});

// ----------------------------------------------------------------------------
// FILE PART (AI SDK compatible)
// ----------------------------------------------------------------------------
const filePartSchema = z.object({
	type: z.literal("file").openapi({
		description: "File attachment - matches AI SDK FileUIPart",
	}),
	url: z.string().openapi({
		description: "URL of the file (can be hosted URL or Data URL)",
	}),
	mediaType: z.string().openapi({
		description: "IANA media type of the file",
	}),
	filename: z.string().optional().openapi({
		description: "Original filename",
	}),
	// Cossistant extension: additional file metadata
	size: z.number().optional().openapi({
		description: "Size of the file in bytes",
	}),
});

// ----------------------------------------------------------------------------
// IMAGE PART (Cossistant extension - more detailed than AI SDK file)
// ----------------------------------------------------------------------------
const imagePartSchema = z.object({
	type: z.literal("image").openapi({
		description: "Image attachment with dimensions",
	}),
	url: z.string().openapi({
		description: "URL of the image",
	}),
	mediaType: z.string().openapi({
		description: "IANA media type of the image",
	}),
	// Use lowercase 'filename' for AI SDK consistency
	// Note: Legacy data may have 'fileName' - conversion utilities handle both
	filename: z.string().optional().openapi({
		description: "Original filename of the image",
	}),
	size: z.number().optional().openapi({
		description: "Size of the image in bytes",
	}),
	width: z.number().optional().openapi({
		description: "Width of the image in pixels",
	}),
	height: z.number().optional().openapi({
		description: "Height of the image in pixels",
	}),
});

// ============================================================================
// COSSISTANT-SPECIFIC PART SCHEMAS
// These are Cossistant-specific parts not in AI SDK
// ============================================================================

const timelinePartTranslationSchema = z.object({
	type: z.literal("translation").openapi({
		description:
			"Stored translation for a timeline item message, scoped to an audience",
	}),
	text: z.string().openapi({
		description: "Translated text content",
	}),
	sourceLanguage: z.string().openapi({
		description: "Detected/source language of the original message",
	}),
	targetLanguage: z.string().openapi({
		description: "Language of the translated text",
	}),
	audience: z.enum(["team", "visitor"]).openapi({
		description: "Audience this translated text is meant for",
	}),
	mode: z.enum(["auto", "manual"]).openapi({
		description:
			"Whether this translation was created automatically or manually",
	}),
	modelId: z.string().nullable().optional().openapi({
		description: "Model identifier used to generate the translation, if any",
	}),
});

const timelinePartEventSchema = z.object({
	type: z.literal("event").openapi({
		description: "Type of timeline part - always 'event' for event parts",
	}),
	eventType: z
		.enum([
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
		])
		.openapi({
			description: "Type of event that occurred",
		}),
	actorUserId: z.string().nullable().openapi({
		description: "User that triggered the event, if applicable",
	}),
	actorAiAgentId: z.string().nullable().openapi({
		description: "AI agent that triggered the event, if applicable",
	}),
	targetUserId: z.string().nullable().openapi({
		description: "User targeted by the event, if applicable",
	}),
	targetAiAgentId: z.string().nullable().openapi({
		description: "AI agent targeted by the event, if applicable",
	}),
	message: z.string().nullable().optional().openapi({
		description: "Optional human readable message attached to the event",
	}),
});

const timelinePartMetadataSchema = z.object({
	type: z.literal("metadata").openapi({
		description: "Type of timeline part - always 'metadata' for metadata parts",
	}),
	source: z.enum(["email", "widget", "api"]).openapi({
		description: "Source channel through which the message was created",
	}),
});

const timelinePartFeedbackSchema = z.object({
	type: z.literal("feedback").openapi({
		description: "Type of timeline part - always 'feedback' for feedback parts",
	}),
	feedbackId: z.string().openapi({
		description: "Feedback record associated with this timeline item",
	}),
	rating: z.number().int().min(1).max(5).openapi({
		description: "Visitor rating from 1 to 5",
	}),
	topic: z.string().nullable().optional().openapi({
		description: "Structured feedback topic selected by the visitor",
	}),
	trigger: z.string().nullable().optional().openapi({
		description: "What triggered this feedback",
	}),
	source: z.string().openapi({
		description: "Source channel where the feedback was collected",
	}),
});

// ============================================================================
// TIMELINE ITEM PARTS UNION
// Combines AI SDK compatible parts with Cossistant-specific parts
// ============================================================================

export const timelineItemPartsSchema = z
	.array(
		z.union([
			// AI SDK compatible parts
			textPartSchema,
			reasoningPartSchema,
			toolPartSchema,
			sourceUrlPartSchema,
			sourceDocumentPartSchema,
			stepStartPartSchema,
			filePartSchema,
			imagePartSchema,
			// Cossistant-specific parts
			timelinePartTranslationSchema,
			timelinePartEventSchema,
			timelinePartMetadataSchema,
			timelinePartFeedbackSchema,
		])
	)
	.openapi({
		description:
			"Array of timeline parts that make up the timeline item content. Includes AI SDK compatible parts (text, reasoning, tool-*, source-url, source-document, step-start, file, image) and Cossistant-specific parts (event, metadata, feedback).",
	});

export const timelineItemSchema = z.object({
	id: z.string().optional().openapi({
		description: "Unique identifier for the timeline item",
	}),
	conversationId: z.string().openapi({
		description: "ID of the conversation this timeline item belongs to",
	}),
	organizationId: z.string().openapi({
		description: "ID of the organization this timeline item belongs to",
	}),
	visibility: z
		.enum([TimelineItemVisibility.PUBLIC, TimelineItemVisibility.PRIVATE])
		.openapi({
			description: "Visibility level of the timeline item",
		}),
	type: z
		.enum([
			ConversationTimelineType.MESSAGE,
			ConversationTimelineType.EVENT,
			ConversationTimelineType.IDENTIFICATION,
			ConversationTimelineType.TOOL,
		])
		.openapi({
			description:
				"Type of timeline item - message, event, identification, or tool call",
		}),
	text: z.string().nullable().openapi({
		description: "Main text content of the timeline item",
	}),
	tool: z.string().nullable().optional().openapi({
		description: "Optional tool identifier associated with this timeline item",
	}),
	parts: timelineItemPartsSchema,
	userId: z.string().nullable().openapi({
		description: "ID of the user who created this timeline item, if applicable",
	}),
	aiAgentId: z.string().nullable().openapi({
		description:
			"ID of the AI agent that created this timeline item, if applicable",
	}),
	visitorId: z.string().nullable().openapi({
		description:
			"ID of the visitor who created this timeline item, if applicable",
	}),
	createdAt: apiTimestampSchema.openapi({
		description: "ISO 8601 timestamp when the timeline item was created",
	}),
	deletedAt: nullableApiTimestampSchema.optional().openapi({
		description:
			"ISO 8601 timestamp when the timeline item was deleted, if applicable",
	}),
});

export type timelineItemSchema = z.infer<typeof timelineItemSchema>;

export type TimelineItem = z.infer<typeof timelineItemSchema>;
export type TimelineItemParts = z.infer<typeof timelineItemPartsSchema>;

export const timelineItemCreateInputSchema = z
	.object({
		id: z.string().optional().openapi({
			description: "Optional client-generated ID for the timeline item",
		}),
		type: z
			.enum([
				ConversationTimelineType.MESSAGE,
				ConversationTimelineType.EVENT,
				ConversationTimelineType.IDENTIFICATION,
				ConversationTimelineType.TOOL,
			])
			.default(ConversationTimelineType.MESSAGE)
			.openapi({
				description: "Type of timeline item - defaults to MESSAGE",
				default: ConversationTimelineType.MESSAGE,
			}),
		text: z.string().nullable().openapi({
			description:
				"Main text content of the timeline item. Use null for non-text items when no human-readable text is needed.",
		}),
		parts: timelineItemPartsSchema.optional(),
		visibility: z
			.enum([TimelineItemVisibility.PUBLIC, TimelineItemVisibility.PRIVATE])
			.default(TimelineItemVisibility.PUBLIC)
			.openapi({
				description: "Visibility level of the timeline item",
				default: TimelineItemVisibility.PUBLIC,
			}),
		tool: z.string().nullable().optional().openapi({
			description:
				"Optional tool identifier when sending non-message timeline items",
		}),
		userId: z.string().nullable().optional().openapi({
			description: "ID of the user creating this timeline item",
		}),
		aiAgentId: z.string().nullable().optional().openapi({
			description: "ID of the AI agent creating this timeline item",
		}),
		visitorId: z.string().nullable().optional().openapi({
			description: "ID of the visitor creating this timeline item",
		}),
		createdAt: apiTimestampInputSchema.optional().openapi({
			description:
				"Optional client-authored timestamp. When omitted, the server assigns the timestamp. Historical timestamps are allowed. Timestamps more than 5 minutes in the future are rejected.",
		}),
	})
	.openapi({
		description:
			"Client-settable timeline item fields for conversation bootstrap and timeline item creation.",
	});

export type TimelineItemCreateInput = z.infer<
	typeof timelineItemCreateInputSchema
>;

// AI SDK compatible part types
export type TextPart = z.infer<typeof textPartSchema>;
export type ReasoningPart = z.infer<typeof reasoningPartSchema>;
export type ToolPart = z.infer<typeof toolPartSchema>;
export type SourceUrlPart = z.infer<typeof sourceUrlPartSchema>;
export type SourceDocumentPart = z.infer<typeof sourceDocumentPartSchema>;
export type StepStartPart = z.infer<typeof stepStartPartSchema>;
export type FilePart = z.infer<typeof filePartSchema>;
export type ImagePart = z.infer<typeof imagePartSchema>;

// Cossistant-specific part types
export type TimelinePartTranslation = z.infer<
	typeof timelinePartTranslationSchema
>;
export type TimelinePartEvent = z.infer<typeof timelinePartEventSchema>;
export type TimelinePartMetadata = z.infer<typeof timelinePartMetadataSchema>;
export type TimelinePartFeedback = z.infer<typeof timelinePartFeedbackSchema>;

// Backward-compatible type aliases (deprecated, use new names)
/** @deprecated Use `FilePart` instead */
export type TimelinePartFile = FilePart;
/** @deprecated Use `ImagePart` instead */
export type TimelinePartImage = ImagePart;
/** @deprecated Use `TextPart` instead */
export type TimelinePartText = TextPart;

// Provider metadata type for extensions
export type CossistantProviderMetadata = z.infer<
	typeof cossistantProviderMetadataSchema
>;
export type CossistantToolTimelineMetadata = z.infer<
	typeof cossistantToolTimelineMetadataSchema
>;

// Tool state type
export type ToolState = z.infer<typeof toolStateSchema>;

// Export schemas for external use
export {
	textPartSchema,
	reasoningPartSchema,
	toolPartSchema,
	toolStateSchema,
	sourceUrlPartSchema,
	sourceDocumentPartSchema,
	stepStartPartSchema,
	filePartSchema,
	imagePartSchema,
	timelinePartTranslationSchema,
	timelinePartEventSchema,
	timelinePartMetadataSchema,
	timelinePartFeedbackSchema,
	cossistantProviderMetadataSchema,
};

// REST API Schemas
export const getConversationTimelineItemsRequestSchema = z
	.object({
		limit: z.coerce.number().min(1).max(100).default(50).openapi({
			description: "Number of timeline items to fetch per page",
			default: 50,
		}),
		cursor: z.string().nullable().optional().openapi({
			description:
				"Cursor for pagination (timestamp_id format from previous response)",
		}),
	})
	.openapi({
		description: "Query parameters for fetching conversation timeline items",
	});

export type GetConversationTimelineItemsRequest = z.infer<
	typeof getConversationTimelineItemsRequestSchema
>;

export const getConversationTimelineItemsResponseSchema = z
	.object({
		items: z.array(timelineItemSchema).openapi({
			description: "Array of timeline items in chronological order",
		}),
		nextCursor: z.string().nullable().openapi({
			description:
				"Cursor for the next page, null if no more items are available",
		}),
		hasNextPage: z.boolean().openapi({
			description: "Whether there are more items available to fetch",
		}),
	})
	.openapi({
		description: "Response containing paginated timeline items",
	});

export type GetConversationTimelineItemsResponse = z.infer<
	typeof getConversationTimelineItemsResponseSchema
>;

// Send Timeline Item (Message) Schemas
export const sendTimelineItemRequestSchema = z
	.object({
		conversationId: z.string().openapi({
			description: "ID of the conversation to send the timeline item to",
		}),
		item: timelineItemCreateInputSchema.openapi({
			description:
				"Timeline item to create. When createdAt is omitted, the server assigns the timestamp. Historical timestamps are allowed. Timestamps more than 5 minutes in the future are rejected.",
		}),
	})
	.openapi({
		description: "Request body for sending a timeline item to a conversation",
	});

export type SendTimelineItemRequest = z.infer<
	typeof sendTimelineItemRequestSchema
>;

export const sendTimelineItemResponseSchema = z
	.object({
		item: timelineItemSchema.openapi({
			description: "The created timeline item",
		}),
	})
	.openapi({
		description: "Response containing the created timeline item",
	});

export type SendTimelineItemResponse = z.infer<
	typeof sendTimelineItemResponseSchema
>;
