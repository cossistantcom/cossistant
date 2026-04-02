import {
	SenderType,
	type SenderType as SenderTypeValue,
} from "@plasma/types";
import type {
	TimelineItem,
	TimelinePartEvent,
} from "@plasma/types/api/timeline-item";

export type TimelineItemSender = {
	senderId: string;
	senderType: SenderTypeValue;
};

function extractEventPart(item: TimelineItem): TimelinePartEvent | null {
	if (item.type !== "event") {
		return null;
	}

	const eventPart = item.parts.find(
		(part): part is TimelinePartEvent => part.type === "event"
	);

	return eventPart ?? null;
}

/**
 * Resolve timeline item sender consistently across hooks and primitives.
 * Precedence is user -> AI agent -> visitor so tool and event rows that
 * include multiple IDs are grouped/rendered according to the acting sender.
 */
export function getTimelineItemSender(item: TimelineItem): TimelineItemSender {
	if (item.userId) {
		return { senderId: item.userId, senderType: SenderType.TEAM_MEMBER };
	}

	if (item.aiAgentId) {
		return { senderId: item.aiAgentId, senderType: SenderType.AI };
	}

	if (item.visitorId) {
		return { senderId: item.visitorId, senderType: SenderType.VISITOR };
	}

	const eventPart = extractEventPart(item);
	if (eventPart?.actorUserId) {
		return {
			senderId: eventPart.actorUserId,
			senderType: SenderType.TEAM_MEMBER,
		};
	}

	if (eventPart?.actorAiAgentId) {
		return {
			senderId: eventPart.actorAiAgentId,
			senderType: SenderType.AI,
		};
	}

	return {
		senderId: item.id || "default-sender",
		senderType: SenderType.TEAM_MEMBER,
	};
}
