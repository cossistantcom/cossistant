import type {
	AvailableAIAgent,
	AvailableHumanAgent,
	TimelinePartEvent,
} from "@plasma/types";
import type React from "react";
import { buildTimelineEventDisplay } from "@/lib/timeline-events";
import { EVENT_RENDERER_MAP, FallbackEventActivity } from "./activity/events";
import type { EventActivityProps, NormalizedEvent } from "./activity/types";

// Minimal visitor type needed for timeline event display
type MinimalVisitorForEvent = {
	id: string;
	contact?: {
		name?: string | null;
		email?: string | null;
		image?: string | null;
	} | null;
};

export type ConversationEventProps = {
	event: TimelinePartEvent;
	createdAt?: string;
	availableAIAgents: AvailableAIAgent[];
	availableHumanAgents: AvailableHumanAgent[];
	visitor?: MinimalVisitorForEvent | null;
	showIcon?: boolean;
	showActorName?: boolean;
	showTerminalIndicator?: boolean;
};

function buildNormalizedEvent(
	display: ReturnType<typeof buildTimelineEventDisplay>,
	event: TimelinePartEvent
): NormalizedEvent {
	return {
		eventType: event.eventType,
		actorName: display.actorName,
		actorType: display.avatarType,
		actorImage: display.avatarImage,
		actionText: display.actionText,
		message: event.message,
	};
}

function formatTimestamp(createdAt: string): string {
	return new Date(createdAt).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});
}

export const ConversationEvent: React.FC<ConversationEventProps> = ({
	event,
	createdAt,
	availableAIAgents,
	availableHumanAgents,
	visitor,
	showIcon = true,
	showActorName = true,
	showTerminalIndicator = false,
}) => {
	const display = buildTimelineEventDisplay({
		event,
		availableAIAgents,
		availableHumanAgents,
		visitor,
	});

	const normalizedEvent = buildNormalizedEvent(display, event);
	const timestamp = createdAt ? formatTimestamp(createdAt) : "";

	const Renderer: React.ComponentType<EventActivityProps> =
		EVENT_RENDERER_MAP[event.eventType] ?? FallbackEventActivity;

	return (
		<Renderer
			event={normalizedEvent}
			showActorName={showActorName}
			showIcon={showIcon}
			showTerminalIndicator={showTerminalIndicator}
			timestamp={timestamp}
		/>
	);
};
