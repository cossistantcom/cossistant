import type { TimelineItem } from "@plasma/types/api/timeline-item";
import { useMemo } from "react";

import {
	mapTypingEntriesToParticipants,
	type TimelineTypingParticipant,
} from "./private/typing";
import { useGroupedMessages } from "./private/use-grouped-messages";
import { useConversationProcessing } from "./use-conversation-processing";
import { useConversationSeen } from "./use-conversation-seen";
import { useConversationTyping } from "./use-conversation-typing";

export type ConversationTimelineTypingParticipant = TimelineTypingParticipant;

export type UseConversationTimelineOptions = {
	conversationId: string;
	items: TimelineItem[];
	currentVisitorId?: string;
};

export type UseConversationTimelineReturn = {
	groupedMessages: ReturnType<typeof useGroupedMessages>;
	seenData: ReturnType<typeof useConversationSeen>;
	processing: ReturnType<typeof useConversationProcessing>;
	typingEntries: ReturnType<typeof useConversationTyping>;
	typingParticipants: ConversationTimelineTypingParticipant[];
};

/**
 * Produces grouped timeline items, seen data and typing state suitable for the
 * conversation detail view.
 */
export function useConversationTimeline({
	conversationId,
	items: timelineItems,
	currentVisitorId,
}: UseConversationTimelineOptions): UseConversationTimelineReturn {
	const seenData = useConversationSeen(conversationId);
	const processing = useConversationProcessing(conversationId);
	const typingEntries = useConversationTyping(conversationId, {
		excludeVisitorId: currentVisitorId ?? null,
	});

	const groupedMessages = useGroupedMessages({
		items: timelineItems,
		seenData,
		currentViewerId: currentVisitorId,
	});

	const typingParticipants = useMemo(
		() => mapTypingEntriesToParticipants(typingEntries),
		[typingEntries]
	);

	return {
		groupedMessages,
		seenData,
		processing,
		typingEntries,
		typingParticipants,
	};
}
