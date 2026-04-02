import { isWidgetTimelineTool } from "@plasma/types";
import type React from "react";
import type {
	ConversationTimelineToolProps,
	ConversationTimelineTools,
} from "./timeline-tool-types";
import { GenericWidgetToolTimelineTool } from "./timeline-widget-tool";

export function resolveConversationTimelineToolComponent(
	toolName: string | null | undefined,
	tools?: ConversationTimelineTools
): React.ComponentType<ConversationTimelineToolProps> | null {
	if (!toolName) {
		return null;
	}

	const customComponent = tools?.[toolName]?.component;
	if (customComponent) {
		return customComponent;
	}

	return isWidgetTimelineTool(toolName) ? GenericWidgetToolTimelineTool : null;
}
