import type { AvailableAIAgent, AvailableHumanAgent } from "@plasma/types";
import type {
	TimelineItem,
	TimelinePartEvent,
} from "@plasma/types/api/timeline-item";
import { resolveDashboardHumanAgentDisplay } from "./human-agent-display";
import { getVisitorNameWithFallback } from "./visitors";

export type TimelineEventDisplay = {
	actorName: string;
	actionText: string;
	avatarType: "ai" | "human" | "visitor";
	avatarImage?: string | null;
	avatarFallbackName: string;
};

// Minimal visitor type needed for timeline event display
// We only use id, contact.name, contact.email, and contact.image
type MinimalVisitorForEvent = {
	id: string;
	contact?: {
		name?: string | null;
		email?: string | null;
		image?: string | null;
	} | null;
};

type EventDisplayParams = {
	event: TimelinePartEvent;
	availableAIAgents: AvailableAIAgent[];
	availableHumanAgents: AvailableHumanAgent[];
	visitor?: MinimalVisitorForEvent | null;
};

export function extractEventPart(
	item: TimelineItem | null | undefined
): TimelinePartEvent | null {
	if (!item || item.type !== "event") {
		return null;
	}

	const eventPart = item.parts.find(
		(part): part is TimelinePartEvent => part.type === "event"
	);

	return eventPart || null;
}

function getActorName(params: EventDisplayParams): {
	actorName: string;
	avatarType: TimelineEventDisplay["avatarType"];
	avatarImage?: string | null;
	avatarFallbackName: string;
} {
	const { event, availableAIAgents, availableHumanAgents, visitor } = params;
	const visitorName = visitor ? getVisitorNameWithFallback(visitor) : "Visitor";

	if (event.eventType === "visitor_identified") {
		return {
			actorName: visitorName,
			avatarType: "visitor",
			avatarImage: visitor?.contact?.image,
			avatarFallbackName: visitorName,
		};
	}

	if (event.actorAiAgentId) {
		const aiAgent = availableAIAgents.find(
			(agent) => agent.id === event.actorAiAgentId
		);

		const actorName = aiAgent?.name || "AI agent";

		return {
			actorName,
			avatarType: "ai",
			avatarImage: aiAgent?.image ?? null,
			avatarFallbackName: actorName,
		};
	}

	const humanAgent = availableHumanAgents.find(
		(agent) => agent.id === event.actorUserId
	);
	const humanDisplay = resolveDashboardHumanAgentDisplay({
		id: humanAgent?.id ?? event.actorUserId ?? "unknown-member",
		name: humanAgent?.name ?? null,
	});

	return {
		actorName: humanDisplay.displayName,
		avatarType: "human",
		avatarImage: humanAgent?.image,
		avatarFallbackName: humanDisplay.displayName,
	};
}

export function buildTimelineEventDisplay(
	params: EventDisplayParams
): TimelineEventDisplay {
	const { event } = params;
	const actor = getActorName(params);

	const defaultAction = (() => {
		switch (event.eventType) {
			case "assigned":
				return "assigned the conversation";
			case "unassigned":
				return "unassigned the conversation";
			case "participant_requested":
				return "requested a team member to join";
			case "participant_joined":
				return "joined the conversation";
			case "participant_left":
				return "left the conversation";
			case "status_changed":
				return "changed the status";
			case "priority_changed":
				return "changed the priority";
			case "tag_added":
				return "added a tag";
			case "tag_removed":
				return "removed a tag";
			case "resolved":
				return "resolved the conversation";
			case "reopened":
				return "reopened the conversation";
			case "visitor_blocked":
				return "blocked the visitor";
			case "visitor_unblocked":
				return "unblocked the visitor";
			case "visitor_identified":
				return "identified, new contact created";
			case "ai_paused":
				return "paused AI answers";
			case "ai_resumed":
				return "resumed AI answers";
			default:
				return "performed an action";
		}
	})();

	return {
		...actor,
		actionText: event.message ?? defaultAction,
	} satisfies TimelineEventDisplay & {
		actionText: string;
	};
}

export function buildTimelineEventPreview(params: EventDisplayParams): string {
	const display = buildTimelineEventDisplay(params);
	const parts = [display.actorName, display.actionText].filter(Boolean);

	return parts.join(" ");
}
