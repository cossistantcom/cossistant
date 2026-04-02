import type { TimelineItem } from "@plasma/types/api/timeline-item";

export type TimelineToolPartState = "partial" | "result" | "error";

export type TimelineToolPart = {
	type: `tool-${string}`;
	toolCallId: string;
	toolName: string;
	state: TimelineToolPartState;
	input: Record<string, unknown>;
	output?: unknown;
	errorText?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isTimelineToolPart(part: unknown): part is TimelineToolPart {
	if (!isRecord(part)) {
		return false;
	}

	return (
		typeof part.type === "string" &&
		part.type.startsWith("tool-") &&
		typeof part.toolCallId === "string" &&
		typeof part.toolName === "string" &&
		(part.state === "partial" ||
			part.state === "result" ||
			part.state === "error") &&
		isRecord(part.input)
	);
}

export function extractToolPart(item: TimelineItem): TimelineToolPart | null {
	for (const part of item.parts) {
		if (isTimelineToolPart(part)) {
			return part;
		}
	}

	return null;
}

export function getToolNameFromTimelineItem(item: TimelineItem): string | null {
	if (item.tool) {
		return item.tool;
	}

	return extractToolPart(item)?.toolName ?? null;
}
