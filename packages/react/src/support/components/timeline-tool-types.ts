import type { TimelineItem } from "@plasma/types/api/timeline-item";
import type React from "react";

export type ConversationTimelineToolProps = {
	item: TimelineItem;
	conversationId: string;
	showTerminalIndicator?: boolean;
};

export type ConversationTimelineToolDefinition = {
	component: React.ComponentType<ConversationTimelineToolProps>;
};

export type ConversationTimelineTools = Record<
	string,
	ConversationTimelineToolDefinition
>;
