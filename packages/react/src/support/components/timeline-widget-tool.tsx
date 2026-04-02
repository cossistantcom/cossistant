"use client";

import {
	getWidgetToolDefaultProgressMessage,
	isWidgetTimelineTool,
} from "@plasma/types";
import type React from "react";
import { ToolActivityRow } from "../../primitives/tool-activity-row";
import {
	extractToolPart,
	getToolNameFromTimelineItem,
	type TimelineToolPartState,
} from "../../utils/timeline-tool";
import type { ConversationTimelineToolProps } from "./timeline-tool-types";
import { useToolDisplayState } from "./use-tool-display-state";

type WidgetToolActivityRowProps = {
	text: string;
	state?: TimelineToolPartState;
	details?: React.ReactNode;
	showTerminalIndicator?: boolean;
};

function getGenericToolText(params: {
	toolName: string;
	state: TimelineToolPartState;
	itemText?: string | null;
	errorText?: string;
}): string {
	const { toolName, state, itemText, errorText } = params;
	const trimmedItemText = itemText?.trim();

	if (trimmedItemText) {
		return trimmedItemText;
	}

	if (state === "partial") {
		return (
			getWidgetToolDefaultProgressMessage(toolName) ?? `Running ${toolName}`
		);
	}

	if (state === "error") {
		return errorText?.trim() || `Failed ${toolName}`;
	}

	return `Completed ${toolName}`;
}

export function WidgetToolActivityRow({
	text,
	state = "partial",
	details,
	showTerminalIndicator = true,
}: WidgetToolActivityRowProps): React.ReactElement {
	return (
		<ToolActivityRow
			details={details}
			showTerminalIndicator={showTerminalIndicator}
			state={state}
			text={text}
			tone="widget"
		/>
	);
}

export function GenericWidgetToolTimelineTool({
	item,
	showTerminalIndicator = true,
}: ConversationTimelineToolProps): React.ReactElement | null {
	const toolName = getToolNameFromTimelineItem(item);
	const registeredToolName =
		toolName && isWidgetTimelineTool(toolName) ? toolName : null;
	const toolPart = extractToolPart(item);
	const rawState = toolPart?.state ?? "partial";
	const displayState = useToolDisplayState({
		state: rawState,
		toolCallId:
			toolPart?.toolCallId ?? item.id ?? registeredToolName ?? "unknown-tool",
	});

	if (!registeredToolName) {
		return null;
	}

	return (
		<WidgetToolActivityRow
			showTerminalIndicator={showTerminalIndicator}
			state={displayState}
			text={getGenericToolText({
				toolName: registeredToolName,
				state: displayState,
				itemText: rawState === displayState ? item.text : undefined,
				errorText: toolPart?.errorText,
			})}
		/>
	);
}
