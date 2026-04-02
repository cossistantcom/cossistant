import { getToolLogType, type ToolTimelineLogType } from "@plasma/types";
import type { TimelineItem } from "@plasma/types/api/timeline-item";

type ToolTimelinePart = {
	type: string;
	toolName: string;
	callProviderMetadata?: Record<string, unknown>;
	providerMetadata?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isToolTimelinePart(part: unknown): part is ToolTimelinePart {
	if (!isRecord(part)) {
		return false;
	}

	return (
		typeof part.type === "string" &&
		part.type.startsWith("tool-") &&
		typeof part.toolName === "string"
	);
}

function extractToolPart(item: TimelineItem): ToolTimelinePart | null {
	for (const part of item.parts) {
		if (isToolTimelinePart(part)) {
			return part;
		}
	}

	return null;
}

function toToolTimelineLogType(value: unknown): ToolTimelineLogType | null {
	if (value === "customer_facing" || value === "log" || value === "decision") {
		return value;
	}

	return null;
}

function extractLogTypeFromProviderMetadata(
	metadata: Record<string, unknown> | undefined
): ToolTimelineLogType | null {
	if (!metadata) {
		return null;
	}

	const cossistant = metadata.cossistant;
	if (!isRecord(cossistant)) {
		return null;
	}

	const toolTimeline = cossistant.toolTimeline;
	if (!isRecord(toolTimeline)) {
		return null;
	}

	return toToolTimelineLogType(toolTimeline.logType);
}

export function getToolTimelineLogType(
	item: TimelineItem
): ToolTimelineLogType {
	const toolPart = extractToolPart(item);

	if (toolPart) {
		const metadataLogType =
			extractLogTypeFromProviderMetadata(toolPart.callProviderMetadata) ??
			extractLogTypeFromProviderMetadata(toolPart.providerMetadata);

		if (metadataLogType) {
			return metadataLogType;
		}

		return getToolLogType(toolPart.toolName);
	}

	if (typeof item.tool === "string" && item.tool.length > 0) {
		return getToolLogType(item.tool);
	}

	return "log";
}

export function isCustomerFacingToolTimelineItem(item: TimelineItem): boolean {
	return getToolTimelineLogType(item) === "customer_facing";
}

export function isInternalToolTimelineItem(item: TimelineItem): boolean {
	return !isCustomerFacingToolTimelineItem(item);
}

type ToolTimelineVisibilityOptions = {
	includeInternalLogs?: boolean;
};

export function shouldDisplayToolTimelineItem(
	item: TimelineItem,
	options?: ToolTimelineVisibilityOptions
): boolean {
	if (options?.includeInternalLogs) {
		return true;
	}

	return isCustomerFacingToolTimelineItem(item);
}
