/**
 * AI SDK v6 Conversion Utilities
 *
 * This module provides utilities for converting between Cossistant's
 * TimelineItem format and Vercel AI SDK v6's UIMessage format.
 *
 * Key concepts:
 * - Cossistant uses TimelineItem with userId/aiAgentId/visitorId
 * - AI SDK uses UIMessage with role: 'user' | 'assistant' | 'system'
 * - Both use a parts array for content
 * - Extensions go in metadata (message level) and providerMetadata/callProviderMetadata (part level)
 */

import type {
	TimelineItem,
	TimelineItemParts,
	ToolTimelineLogType,
} from "@plasma/types";

// ============================================================================
// AI SDK TYPES (re-export for convenience)
// ============================================================================

/**
 * AI SDK UIMessage part types - these are the standard AI SDK v6 parts
 */
export type AISDKTextPart = {
	type: "text";
	text: string;
	state?: "streaming" | "done";
};

export type AISDKReasoningPart = {
	type: "reasoning";
	text: string;
	state?: "streaming" | "done";
	providerMetadata?: Record<string, unknown>;
};

export type AISDKToolPart = {
	type: `tool-${string}`;
	toolCallId: string;
	toolName: string;
	input: Record<string, unknown>;
	output?: unknown;
	state: "partial" | "result" | "error";
	errorText?: string;
	callProviderMetadata?: Record<string, unknown>;
	providerMetadata?: Record<string, unknown>;
};

export type AISDKSourceUrlPart = {
	type: "source-url";
	sourceId: string;
	url: string;
	title?: string;
	providerMetadata?: Record<string, unknown>;
};

export type AISDKSourceDocumentPart = {
	type: "source-document";
	sourceId: string;
	mediaType: string;
	title: string;
	filename?: string;
	providerMetadata?: Record<string, unknown>;
};

export type AISDKStepStartPart = {
	type: "step-start";
};

export type AISDKFilePart = {
	type: "file";
	url: string;
	mediaType: string;
	filename?: string;
};

// ============================================================================
// COSSISTANT METADATA TYPES
// ============================================================================

/**
 * Cossistant-specific metadata stored in UIMessage.metadata
 */
export type CossistantMessageMetadata = {
	conversationId: string;
	organizationId: string;
	visibility: "public" | "private";
	userId: string | null;
	aiAgentId: string | null;
	visitorId: string | null;
	replyToId?: string | null;
	createdAt: string;
	deletedAt?: string | null;
	tool?: string | null;
};

/**
 * Cossistant-specific metadata stored in part.callProviderMetadata/providerMetadata.plasma
 */
export type CossistantToolTimelineMetadata = {
	logType: ToolTimelineLogType;
	triggerMessageId: string;
	workflowRunId: string;
	triggerVisibility?: "public" | "private";
};

export type PlasmaPartMetadata = {
	visibility?: "public" | "private";
	progressMessage?: string;
	knowledgeId?: string;
	toolTimeline?: CossistantToolTimelineMetadata;
};

type AISDKPartMetadataCarrier = {
	providerMetadata?: Record<string, unknown>;
	callProviderMetadata?: Record<string, unknown>;
};

// ============================================================================
// TYPE HELPERS
// ============================================================================

export type AISDKPart =
	| AISDKTextPart
	| AISDKReasoningPart
	| AISDKToolPart
	| AISDKSourceUrlPart
	| AISDKSourceDocumentPart
	| AISDKStepStartPart
	| AISDKFilePart;

type CossistantPart = TimelineItemParts[number];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getMetadataCarrier(
	part: AISDKPartMetadataCarrier
): AISDKPartMetadataCarrier {
	const callProviderMetadata =
		part.callProviderMetadata ?? part.providerMetadata;
	const providerMetadata = part.providerMetadata ?? part.callProviderMetadata;

	return {
		callProviderMetadata,
		providerMetadata,
	};
}

/**
 * Read cossistant part metadata from AI SDK v6-compatible part metadata.
 * Prefers callProviderMetadata but accepts providerMetadata for backward compatibility.
 */
export function getPlasmaPartMetadata(
	part: AISDKPartMetadataCarrier
): PlasmaPartMetadata | undefined {
	const { callProviderMetadata, providerMetadata } = getMetadataCarrier(part);
	const metadata = callProviderMetadata ?? providerMetadata;

	if (!isRecord(metadata)) {
		return;
	}

	const cossistant = metadata.cossistant;
	if (!isRecord(cossistant)) {
		return;
	}

	return cossistant as PlasmaPartMetadata;
}

/**
 * Write cossistant part metadata into both callProviderMetadata and providerMetadata.
 * This keeps AI SDK v6 semantics while remaining backward compatible.
 */
export function setPlasmaPartMetadata(
	part: AISDKPartMetadataCarrier,
	metadata: PlasmaPartMetadata
): AISDKPartMetadataCarrier {
	const { callProviderMetadata, providerMetadata } = getMetadataCarrier(part);
	const nextCallProviderMetadata = {
		...(isRecord(callProviderMetadata) ? callProviderMetadata : {}),
		cossistant: metadata,
	};
	const nextProviderMetadata = {
		...(isRecord(providerMetadata) ? providerMetadata : {}),
		cossistant: metadata,
	};

	return {
		callProviderMetadata: nextCallProviderMetadata,
		providerMetadata: nextProviderMetadata,
	};
}

/**
 * Read tool timeline metadata from cossistant part metadata.
 */
export function getCossistantToolTimelineMetadata(
	part: AISDKPartMetadataCarrier
): CossistantToolTimelineMetadata | undefined {
	return getPlasmaPartMetadata(part)?.toolTimeline;
}

/**
 * Write tool timeline metadata into cossistant part metadata.
 */
export function setCossistantToolTimelineMetadata(
	part: AISDKPartMetadataCarrier,
	toolTimeline: CossistantToolTimelineMetadata
): AISDKPartMetadataCarrier {
	const existing = getPlasmaPartMetadata(part) ?? {};
	return setPlasmaPartMetadata(part, {
		...existing,
		toolTimeline,
	});
}

// Type guards for Cossistant parts
function isTextPart(
	part: CossistantPart
): part is CossistantPart & { type: "text"; text: string } {
	return part.type === "text" && "text" in part;
}

function isReasoningPart(
	part: CossistantPart
): part is CossistantPart & { type: "reasoning"; text: string } {
	return part.type === "reasoning" && "text" in part;
}

function isSourceUrlPart(part: CossistantPart): part is CossistantPart & {
	type: "source-url";
	sourceId: string;
	url: string;
} {
	return part.type === "source-url" && "sourceId" in part && "url" in part;
}

function isSourceDocumentPart(part: CossistantPart): part is CossistantPart & {
	type: "source-document";
	sourceId: string;
	mediaType: string;
	title: string;
} {
	return (
		part.type === "source-document" &&
		"sourceId" in part &&
		"mediaType" in part &&
		"title" in part
	);
}

function isStepStartPart(
	part: CossistantPart
): part is CossistantPart & { type: "step-start" } {
	return part.type === "step-start";
}

function isFilePart(
	part: CossistantPart
): part is CossistantPart & { type: "file"; url: string; mediaType: string } {
	return part.type === "file" && "url" in part && "mediaType" in part;
}

function isImagePart(
	part: CossistantPart
): part is CossistantPart & { type: "image"; url: string; mediaType: string } {
	return part.type === "image" && "url" in part && "mediaType" in part;
}

function isToolPart(part: CossistantPart): part is CossistantPart & {
	type: string;
	toolCallId: string;
	toolName: string;
	input: Record<string, unknown>;
	state: "partial" | "result" | "error";
} {
	return (
		typeof part.type === "string" &&
		part.type.startsWith("tool-") &&
		"toolCallId" in part &&
		"toolName" in part
	);
}

function isEventPart(
	part: CossistantPart
): part is CossistantPart & { type: "event" } {
	return part.type === "event";
}

function isMetadataPart(
	part: CossistantPart
): part is CossistantPart & { type: "metadata" } {
	return part.type === "metadata";
}

// ============================================================================
// CONVERSION: TIMELINE ITEM -> UI MESSAGE
// ============================================================================

/**
 * Cossistant-compatible UIMessage type
 * This is structurally compatible with AI SDK v6 UIMessage
 * but uses our own part types for flexibility
 */
export type CossistantUIMessage = {
	id: string;
	role: "user" | "assistant" | "system";
	metadata: CossistantMessageMetadata;
	parts: AISDKPart[];
};

/**
 * Convert a Cossistant TimelineItem to AI SDK UIMessage format
 *
 * @param item - The Cossistant TimelineItem to convert
 * @returns AI SDK compatible UIMessage with Cossistant metadata
 */
export function toUIMessage(item: TimelineItem): CossistantUIMessage {
	return {
		id: item.id ?? "",
		role: getAISDKRole(item),
		metadata: {
			conversationId: item.conversationId,
			organizationId: item.organizationId,
			visibility: item.visibility,
			userId: item.userId,
			aiAgentId: item.aiAgentId,
			visitorId: item.visitorId,
			createdAt: item.createdAt,
			deletedAt: item.deletedAt ?? null,
			tool: item.tool ?? null,
		},
		parts: item.parts.map(toAISDKPart).filter(Boolean) as AISDKPart[],
	};
}

/**
 * Convert multiple TimelineItems to UIMessages
 */
export function toUIMessages(items: TimelineItem[]): CossistantUIMessage[] {
	return items.map(toUIMessage);
}

/**
 * Determine AI SDK role from TimelineItem sender fields
 */
function getAISDKRole(item: TimelineItem): "user" | "assistant" | "system" {
	// AI agent messages become assistant
	if (item.aiAgentId) {
		return "assistant";
	}

	// Both visitor and human user messages become user
	// (AI SDK doesn't distinguish between these)
	return "user";
}

/**
 * Convert a Cossistant part to AI SDK part format
 */
function toAISDKPart(part: CossistantPart): AISDKPart | null {
	if (isTextPart(part)) {
		return {
			type: "text",
			text: part.text,
			state: (part as { state?: "streaming" | "done" }).state,
		};
	}

	if (isReasoningPart(part)) {
		return {
			type: "reasoning",
			text: part.text,
			state: (part as { state?: "streaming" | "done" }).state,
			providerMetadata: (part as { providerMetadata?: Record<string, unknown> })
				.providerMetadata,
		};
	}

	if (isSourceUrlPart(part)) {
		return {
			type: "source-url",
			sourceId: part.sourceId,
			url: part.url,
			title: (part as { title?: string }).title,
			providerMetadata: (part as { providerMetadata?: Record<string, unknown> })
				.providerMetadata,
		};
	}

	if (isSourceDocumentPart(part)) {
		return {
			type: "source-document",
			sourceId: part.sourceId,
			mediaType: part.mediaType,
			title: part.title,
			filename: (part as { filename?: string }).filename,
			providerMetadata: (part as { providerMetadata?: Record<string, unknown> })
				.providerMetadata,
		};
	}

	if (isStepStartPart(part)) {
		return {
			type: "step-start",
		};
	}

	if (isFilePart(part)) {
		// Support both 'filename' (new) and 'fileName' (legacy) for backward compatibility
		const typedPart = part as { filename?: string; fileName?: string };
		return {
			type: "file",
			url: part.url,
			mediaType: part.mediaType,
			filename: typedPart.filename ?? typedPart.fileName,
		};
	}

	if (isImagePart(part)) {
		// Convert image to file part (AI SDK uses file for all media)
		// Support both 'filename' (new) and 'fileName' (legacy) for backward compatibility
		const typedPart = part as { filename?: string; fileName?: string };
		return {
			type: "file",
			url: part.url,
			mediaType: part.mediaType,
			filename: typedPart.filename ?? typedPart.fileName,
		};
	}

	if (isToolPart(part)) {
		const typedPart = part as AISDKPartMetadataCarrier;
		const metadataCarrier = getMetadataCarrier(typedPart);

		return {
			type: part.type as `tool-${string}`,
			toolCallId: part.toolCallId,
			toolName: part.toolName,
			input: part.input,
			output: (part as { output?: unknown }).output,
			state: part.state,
			errorText: (part as { errorText?: string }).errorText,
			callProviderMetadata: metadataCarrier.callProviderMetadata,
			providerMetadata: metadataCarrier.providerMetadata,
		};
	}

	// Event and metadata parts are Cossistant-specific, skip for AI SDK
	if (isEventPart(part) || isMetadataPart(part)) {
		return null;
	}

	return null;
}

// ============================================================================
// CONVERSION: UI MESSAGE -> TIMELINE ITEM
// ============================================================================

/**
 * Context required to create a TimelineItem from UIMessage
 */
export type FromUIMessageContext = {
	conversationId: string;
	organizationId: string;
	aiAgentId?: string | null;
	userId?: string | null;
	visitorId?: string | null;
	visibility?: "public" | "private";
};

/**
 * Convert an AI SDK UIMessage to Cossistant TimelineItem format
 *
 * @param message - The AI SDK UIMessage to convert
 * @param context - Context for creating the TimelineItem
 * @returns Cossistant TimelineItem
 */
export function fromUIMessage(
	message: CossistantUIMessage,
	context: FromUIMessageContext
): TimelineItem {
	// Extract metadata if available
	const metadata = message.metadata;

	return {
		id: message.id,
		conversationId: metadata?.conversationId ?? context.conversationId,
		organizationId: metadata?.organizationId ?? context.organizationId,
		visibility: metadata?.visibility ?? context.visibility ?? "public",
		type: "message",
		text: extractTextFromParts(message.parts),
		parts: message.parts
			.map(fromAISDKPart)
			.filter(Boolean) as TimelineItemParts,
		userId: metadata?.userId ?? context.userId ?? null,
		aiAgentId: metadata?.aiAgentId ?? context.aiAgentId ?? null,
		visitorId: metadata?.visitorId ?? context.visitorId ?? null,
		createdAt: metadata?.createdAt ?? new Date().toISOString(),
		deletedAt: metadata?.deletedAt ?? null,
		tool: metadata?.tool ?? null,
	};
}

/**
 * Convert multiple UIMessages to TimelineItems
 */
export function fromUIMessages(
	messages: CossistantUIMessage[],
	context: FromUIMessageContext
): TimelineItem[] {
	return messages.map((msg) => fromUIMessage(msg, context));
}

/**
 * Extract plain text content from message parts
 */
function extractTextFromParts(parts: unknown[]): string | null {
	const textParts = parts.filter(
		(part): part is AISDKTextPart =>
			typeof part === "object" &&
			part !== null &&
			"type" in part &&
			part.type === "text"
	);

	if (textParts.length === 0) {
		return null;
	}
	return textParts.map((p) => p.text).join("\n");
}

/**
 * Convert an AI SDK part to Cossistant part format
 */
function fromAISDKPart(part: unknown): CossistantPart | null {
	if (typeof part !== "object" || part === null || !("type" in part)) {
		return null;
	}

	const typedPart = part as { type: string; [key: string]: unknown };

	switch (typedPart.type) {
		case "text":
			return {
				type: "text",
				text: String(typedPart.text ?? ""),
				state: typedPart.state as "streaming" | "done" | undefined,
			};

		case "reasoning":
			return {
				type: "reasoning",
				text: String(typedPart.text ?? ""),
				state: typedPart.state as "streaming" | "done" | undefined,
				providerMetadata: typedPart.providerMetadata as
					| Record<string, unknown>
					| undefined,
			};

		case "source-url":
			return {
				type: "source-url",
				sourceId: String(typedPart.sourceId ?? ""),
				url: String(typedPart.url ?? ""),
				title: typedPart.title as string | undefined,
				providerMetadata: typedPart.providerMetadata as
					| Record<string, unknown>
					| undefined,
			};

		case "source-document":
			return {
				type: "source-document",
				sourceId: String(typedPart.sourceId ?? ""),
				mediaType: String(typedPart.mediaType ?? ""),
				title: String(typedPart.title ?? ""),
				filename: typedPart.filename as string | undefined,
				providerMetadata: typedPart.providerMetadata as
					| Record<string, unknown>
					| undefined,
			};

		case "step-start":
			return {
				type: "step-start",
			};

		case "file":
			return {
				type: "file",
				url: String(typedPart.url ?? ""),
				mediaType: String(typedPart.mediaType ?? ""),
				filename: typedPart.filename as string | undefined,
			};

		default:
			// Handle tool-* pattern
			if (typedPart.type.startsWith("tool-")) {
				const metadataCarrier = getMetadataCarrier({
					callProviderMetadata: typedPart.callProviderMetadata as
						| Record<string, unknown>
						| undefined,
					providerMetadata: typedPart.providerMetadata as
						| Record<string, unknown>
						| undefined,
				});

				return {
					type: typedPart.type,
					toolCallId: String(typedPart.toolCallId ?? ""),
					toolName: String(typedPart.toolName ?? ""),
					input: (typedPart.input as Record<string, unknown>) ?? {},
					output: typedPart.output,
					state:
						(typedPart.state as "partial" | "result" | "error") ?? "partial",
					errorText: typedPart.errorText as string | undefined,
					callProviderMetadata: metadataCarrier.callProviderMetadata,
					providerMetadata: metadataCarrier.providerMetadata,
				};
			}
			return null;
	}
}

// ============================================================================
// HELPER UTILITIES
// ============================================================================

/**
 * Check if a part is an AI SDK compatible part type
 */
export function isAISDKCompatiblePart(part: CossistantPart): boolean {
	if (part.type === "event" || part.type === "metadata") {
		return false;
	}
	return true;
}

/**
 * Extract all sources from a message's parts
 */
export function extractSources(
	parts: AISDKPart[]
): (AISDKSourceUrlPart | AISDKSourceDocumentPart)[] {
	return parts.filter(
		(part): part is AISDKSourceUrlPart | AISDKSourceDocumentPart =>
			part.type === "source-url" || part.type === "source-document"
	);
}

/**
 * Extract all tool calls from a message's parts
 */
export function extractToolCalls(parts: AISDKPart[]): AISDKToolPart[] {
	return parts.filter(
		(part): part is AISDKToolPart =>
			typeof part.type === "string" && part.type.startsWith("tool-")
	);
}

/**
 * Check if any parts are still processing
 */
export function hasProcessingParts(parts: AISDKPart[]): boolean {
	return parts.some((part) => {
		if (
			"state" in part &&
			(part.state === "streaming" || part.state === "partial")
		) {
			return true;
		}
		return false;
	});
}
