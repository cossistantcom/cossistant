/**
 * Privacy Filter Utilities
 *
 * This module provides utilities for filtering timeline items and parts
 * based on audience (dashboard vs widget). The dashboard sees everything,
 * while the widget only sees public content.
 *
 * Filtering happens at the API layer, not baked into types.
 */

import type { TimelineItem, TimelineItemParts } from "@plasma/types";
import type {
	AISDKPart,
	PlasmaPartMetadata,
	CossistantUIMessage,
} from "./ai-sdk-utils";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Audience types for filtering
 */
export type Audience = "dashboard" | "widget";

/**
 * Privacy filter options
 */
export type FilterOptions = {
	/**
	 * Whether to include reasoning parts (AI chain-of-thought)
	 * Default: true for dashboard, false for widget
	 */
	includeReasoning?: boolean;

	/**
	 * Whether to include tool parts
	 * Default: true for dashboard, based on visibility for widget
	 */
	includeTools?: boolean;

	/**
	 * Whether to include source attributions
	 * Default: true
	 */
	includeSources?: boolean;
};

/**
 * Default filter options for each audience
 */
const DEFAULT_OPTIONS: Record<Audience, Required<FilterOptions>> = {
	dashboard: {
		includeReasoning: true,
		includeTools: true,
		includeSources: true,
	},
	widget: {
		includeReasoning: false,
		includeTools: true, // but filtered by visibility
		includeSources: true,
	},
};

// ============================================================================
// COSSISTANT UI MESSAGE FILTERING
// ============================================================================

/**
 * Filter a CossistantUIMessage for a specific audience
 *
 * @param message - The message to filter
 * @param audience - The target audience ('dashboard' or 'widget')
 * @param options - Optional filter options
 * @returns The filtered message, or null if the entire message should be hidden
 */
export function filterMessageForAudience(
	message: CossistantUIMessage,
	audience: Audience,
	options?: FilterOptions
): CossistantUIMessage | null {
	const opts = { ...DEFAULT_OPTIONS[audience], ...options };

	// Widget can't see private messages
	if (audience === "widget" && message.metadata.visibility === "private") {
		return null;
	}

	// Filter parts based on audience
	const filteredParts = message.parts.filter((part) =>
		shouldIncludePart(part, audience, opts)
	);

	// If no parts remain, return null (empty message)
	if (filteredParts.length === 0) {
		return null;
	}

	return {
		...message,
		parts: filteredParts,
	};
}

/**
 * Filter multiple messages for an audience
 *
 * @param messages - The messages to filter
 * @param audience - The target audience
 * @param options - Optional filter options
 * @returns Filtered messages (excluding any that become null)
 */
export function filterMessagesForAudience(
	messages: CossistantUIMessage[],
	audience: Audience,
	options?: FilterOptions
): CossistantUIMessage[] {
	return messages
		.map((msg) => filterMessageForAudience(msg, audience, options))
		.filter((msg): msg is CossistantUIMessage => msg !== null);
}

// ============================================================================
// TIMELINE ITEM FILTERING (Direct, without conversion)
// ============================================================================

/**
 * Filter a TimelineItem for a specific audience
 *
 * @param item - The timeline item to filter
 * @param audience - The target audience
 * @param options - Optional filter options
 * @returns The filtered item, or null if the entire item should be hidden
 */
export function filterTimelineItemForAudience(
	item: TimelineItem,
	audience: Audience,
	options?: FilterOptions
): TimelineItem | null {
	const opts = { ...DEFAULT_OPTIONS[audience], ...options };

	// Widget can't see private items
	if (audience === "widget" && item.visibility === "private") {
		return null;
	}

	// Filter parts based on audience
	const filteredParts = item.parts.filter((part) =>
		shouldIncludeTimelineItemPart(part, audience, opts)
	);

	// If no parts remain, return null (empty item)
	if (filteredParts.length === 0) {
		return null;
	}

	return {
		...item,
		parts: filteredParts as TimelineItemParts,
	};
}

/**
 * Filter multiple timeline items for an audience
 *
 * @param items - The timeline items to filter
 * @param audience - The target audience
 * @param options - Optional filter options
 * @returns Filtered items (excluding any that become null)
 */
export function filterTimelineItemsForAudience(
	items: TimelineItem[],
	audience: Audience,
	options?: FilterOptions
): TimelineItem[] {
	return items
		.map((item) => filterTimelineItemForAudience(item, audience, options))
		.filter((item): item is TimelineItem => item !== null);
}

// ============================================================================
// PART-LEVEL FILTERING
// ============================================================================

/**
 * Determine if an AI SDK part should be included based on audience and options
 */
function shouldIncludePart(
	part: AISDKPart,
	audience: Audience,
	opts: Required<FilterOptions>
): boolean {
	// Check part visibility from providerMetadata
	const visibility = getPartVisibility(part);
	if (audience === "widget" && visibility === "private") {
		return false;
	}

	// Handle reasoning parts
	if (part.type === "reasoning") {
		return opts.includeReasoning;
	}

	// Handle tool parts
	if (typeof part.type === "string" && part.type.startsWith("tool-")) {
		if (!opts.includeTools) {
			return false;
		}
		// For widget, check if the tool part is marked as public
		if (audience === "widget" && visibility !== "public") {
			return false;
		}
		return true;
	}

	// Handle source parts
	if (part.type === "source-url" || part.type === "source-document") {
		return opts.includeSources;
	}

	// Include all other parts by default
	return true;
}

/**
 * Determine if a TimelineItem part should be included based on audience and options
 */
function shouldIncludeTimelineItemPart(
	part: TimelineItemParts[number],
	audience: Audience,
	opts: Required<FilterOptions>
): boolean {
	// Check part visibility from providerMetadata
	const visibility = getTimelineItemPartVisibility(part);
	if (audience === "widget" && visibility === "private") {
		return false;
	}

	// Handle reasoning parts
	if (part.type === "reasoning") {
		return opts.includeReasoning;
	}

	// Handle tool parts
	if (typeof part.type === "string" && part.type.startsWith("tool-")) {
		if (!opts.includeTools) {
			return false;
		}
		// For widget, check if the tool part is marked as public
		if (audience === "widget" && visibility !== "public") {
			return false;
		}
		return true;
	}

	// Handle source parts
	if (part.type === "source-url" || part.type === "source-document") {
		return opts.includeSources;
	}

	// Include all other parts by default
	return true;
}

/**
 * Extract visibility from an AI SDK part's providerMetadata
 */
function getPartVisibility(part: AISDKPart): "public" | "private" {
	const metadataCarrier = part as {
		callProviderMetadata?: Record<string, unknown>;
		providerMetadata?: Record<string, unknown>;
	};
	const metadata =
		metadataCarrier.callProviderMetadata ?? metadataCarrier.providerMetadata;

	if (metadata) {
		const typedMetadata = metadata as {
			plasma?: PlasmaPartMetadata;
			cossistant?: PlasmaPartMetadata;
		};
		return (
			typedMetadata.plasma?.visibility ??
			typedMetadata.cossistant?.visibility ??
			"public"
		);
	}
	return "public";
}

/**
 * Extract visibility from a TimelineItem part's providerMetadata
 */
function getTimelineItemPartVisibility(
	part: TimelineItemParts[number]
): "public" | "private" {
	if ("providerMetadata" in part || "callProviderMetadata" in part) {
		const typedPart = part as {
			callProviderMetadata?: {
				plasma?: PlasmaPartMetadata;
				cossistant?: PlasmaPartMetadata;
			};
			providerMetadata?: {
				plasma?: PlasmaPartMetadata;
				cossistant?: PlasmaPartMetadata;
			};
		};
		return (
			typedPart.callProviderMetadata?.plasma?.visibility ??
			typedPart.callProviderMetadata?.cossistant?.visibility ??
			typedPart.providerMetadata?.plasma?.visibility ??
			typedPart.providerMetadata?.cossistant?.visibility ??
			"public"
		);
	}
	return "public";
}

// ============================================================================
// PRIVACY PRESETS
// ============================================================================

/**
 * Privacy presets for common use cases
 */
export const PrivacyPresets = {
	/**
	 * TRANSPARENT: Show everything including AI reasoning
	 * Use for: Internal debugging, transparency-focused products
	 */
	TRANSPARENT: {
		includeReasoning: true,
		includeTools: true,
		includeSources: true,
	} satisfies FilterOptions,

	/**
	 * STANDARD: Default widget experience
	 * Use for: Most customer-facing widgets
	 */
	STANDARD: {
		includeReasoning: false,
		includeTools: true,
		includeSources: true,
	} satisfies FilterOptions,

	/**
	 * MINIMAL: Only show text responses
	 * Use for: Simple chatbots, text-only experiences
	 */
	MINIMAL: {
		includeReasoning: false,
		includeTools: false,
		includeSources: false,
	} satisfies FilterOptions,
} as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a message has any visible content for an audience
 */
export function hasVisibleContent(
	message: CossistantUIMessage,
	audience: Audience,
	options?: FilterOptions
): boolean {
	return filterMessageForAudience(message, audience, options) !== null;
}

/**
 * Count visible parts for an audience
 */
export function countVisibleParts(
	message: CossistantUIMessage,
	audience: Audience,
	options?: FilterOptions
): number {
	const filtered = filterMessageForAudience(message, audience, options);
	return filtered?.parts.length ?? 0;
}

/**
 * Extract only text content from a message (for previews, notifications, etc.)
 */
export function extractVisibleText(
	message: CossistantUIMessage,
	audience: Audience
): string | null {
	const filtered = filterMessageForAudience(message, audience);
	if (!filtered) {
		return null;
	}

	const textParts = filtered.parts.filter(
		(part): part is { type: "text"; text: string } => part.type === "text"
	);

	if (textParts.length === 0) {
		return null;
	}
	return textParts.map((p) => p.text).join("\n");
}
