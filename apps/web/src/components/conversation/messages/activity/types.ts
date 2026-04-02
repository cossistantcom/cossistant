import type { ToolTimelineLogType } from "@plasma/types";
import type { ActivityIcon } from "./activity-wrapper";

// --- Tool activity types (moved from tool-renderers/types.ts) ---

export type ToolCallState = "partial" | "result" | "error";

export type NormalizedToolCall = {
	toolCallId: string;
	toolName: string;
	input: unknown;
	state: ToolCallState;
	output?: unknown;
	errorText?: string;
	summaryText: string;
	logType: ToolTimelineLogType;
	isFallback: boolean;
};

export type ToolActivityProps = {
	toolCall: NormalizedToolCall;
	timestamp: string;
	showIcon?: boolean;
	showStateIndicator?: boolean;
	showTerminalIndicator?: boolean;
	icon?: ActivityIcon;
};

// --- Event activity types ---

export type NormalizedEvent = {
	eventType: string;
	actorName: string;
	actorType: "ai" | "human" | "visitor";
	actorImage?: string | null;
	actionText: string;
	message?: string | null;
};

export type EventActivityProps = {
	event: NormalizedEvent;
	timestamp: string;
	showIcon?: boolean;
	showActorName?: boolean;
	showTerminalIndicator?: boolean;
};
