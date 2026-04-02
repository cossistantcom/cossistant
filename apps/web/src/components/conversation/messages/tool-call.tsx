"use client";

import { useToolDisplayState } from "@plasma/react/support/components";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import { getToolTimelineLogType } from "@/lib/tool-timeline-visibility";
import { resolveToolActivityIcon } from "./activity/action-icon-map";
import {
	DeveloperToolView,
	FallbackToolActivity,
	TOOL_RENDERER_MAP,
} from "./activity/tools";
import type { NormalizedToolCall } from "./activity/types";

type ToolCallMode = "default" | "developer";

type ToolTimelinePart = {
	type: string;
	toolCallId: string;
	toolName: string;
	input: Record<string, unknown>;
	state: "partial" | "result" | "error";
	output?: unknown;
	errorText?: string;
};

type LooseToolTimelinePart = {
	type: string;
	toolCallId?: string;
	toolName?: string;
	input?: unknown;
	state?: ToolTimelinePart["state"];
	output?: unknown;
	errorText?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isToolState(value: unknown): value is ToolTimelinePart["state"] {
	return value === "partial" || value === "result" || value === "error";
}

function isToolTimelinePart(part: unknown): part is ToolTimelinePart {
	if (!isRecord(part)) {
		return false;
	}

	return (
		typeof part.type === "string" &&
		part.type.startsWith("tool-") &&
		typeof part.toolCallId === "string" &&
		typeof part.toolName === "string" &&
		isRecord(part.input) &&
		isToolState(part.state)
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

function extractLooseToolPart(
	item: TimelineItem
): LooseToolTimelinePart | null {
	for (const part of item.parts) {
		if (!isRecord(part)) {
			continue;
		}

		if (typeof part.type !== "string" || !part.type.startsWith("tool-")) {
			continue;
		}

		const partRecord = part as Record<string, unknown>;

		return {
			type: part.type,
			toolCallId:
				typeof partRecord.toolCallId === "string"
					? partRecord.toolCallId
					: undefined,
			toolName:
				typeof partRecord.toolName === "string"
					? partRecord.toolName
					: undefined,
			input: partRecord.input,
			state: isToolState(partRecord.state) ? partRecord.state : undefined,
			output: partRecord.output,
			errorText:
				typeof partRecord.errorText === "string"
					? partRecord.errorText
					: undefined,
		};
	}

	return null;
}

function getFallbackSummary(
	toolName: string,
	state: ToolTimelinePart["state"]
): string {
	if (state === "partial") {
		return `Running ${toolName}`;
	}

	if (state === "result") {
		return `Completed ${toolName}`;
	}

	return `Failed ${toolName}`;
}

function formatTimestamp(createdAt: string): string {
	return new Date(createdAt).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});
}

function buildNormalizedToolCall(
	item: TimelineItem,
	strictPart: ToolTimelinePart | null
): NormalizedToolCall {
	const loosePart = strictPart ? null : extractLooseToolPart(item);
	const toolName =
		strictPart?.toolName ??
		loosePart?.toolName ??
		(typeof item.tool === "string" && item.tool.length > 0
			? item.tool
			: "unknown_tool");
	const state = strictPart?.state ?? loosePart?.state ?? "partial";
	const summaryText =
		typeof item.text === "string" && item.text.trim().length > 0
			? item.text
			: getFallbackSummary(toolName, state);

	return {
		toolCallId:
			strictPart?.toolCallId ??
			loosePart?.toolCallId ??
			item.id ??
			"unknown-call",
		toolName,
		input: strictPart?.input ?? loosePart?.input ?? {},
		state,
		output: strictPart?.output ?? loosePart?.output,
		errorText: strictPart?.errorText ?? loosePart?.errorText,
		summaryText,
		logType: getToolTimelineLogType(item),
		isFallback: !strictPart,
	};
}

export function ToolCall({
	item,
	mode = "default",
	showIcon = true,
	showTerminalIndicator = true,
}: {
	item: TimelineItem;
	mode?: ToolCallMode;
	showIcon?: boolean;
	showTerminalIndicator?: boolean;
}) {
	const strictPart = extractToolPart(item);
	const toolCall = buildNormalizedToolCall(item, strictPart);
	const delayedState = useToolDisplayState({
		state: toolCall.state,
		toolCallId: toolCall.toolCallId,
		minimumLoadingMs: mode === "default" ? undefined : 0,
	});
	const renderedToolCall =
		mode === "default" && delayedState !== toolCall.state
			? { ...toolCall, state: delayedState }
			: toolCall;
	const timestamp = formatTimestamp(item.createdAt);
	const icon = resolveToolActivityIcon(toolCall.toolName);
	if (mode === "developer") {
		return (
			<DeveloperToolView
				icon={icon}
				showIcon={showIcon}
				timestamp={timestamp}
				toolCall={toolCall}
			/>
		);
	}

	const Renderer =
		TOOL_RENDERER_MAP[renderedToolCall.toolName] ?? FallbackToolActivity;
	return (
		<Renderer
			icon={icon}
			showIcon={showIcon}
			showStateIndicator={true}
			showTerminalIndicator={showTerminalIndicator}
			timestamp={timestamp}
			toolCall={renderedToolCall}
		/>
	);
}
