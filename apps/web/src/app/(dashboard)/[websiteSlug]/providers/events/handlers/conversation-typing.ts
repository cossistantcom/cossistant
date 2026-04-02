import {
	applyConversationTypingEvent,
	clearTypingFromTimelineItem,
} from "@plasma/react/realtime/typing-store";
import type { RealtimeEvent } from "@plasma/types/realtime-events";
import type { DashboardRealtimeContext } from "../types";

type ConversationTypingEvent = RealtimeEvent<"conversationTyping">;
type TimelineItemCreatedEvent = RealtimeEvent<"timelineItemCreated">;

export function handleConversationTyping({
	event,
	context,
}: {
	event: ConversationTypingEvent;
	context: DashboardRealtimeContext;
}) {
	if (event.payload.websiteId !== context.website.id) {
		return;
	}

	// Update typing store, but ignore events from the current user (their own typing)
	applyConversationTypingEvent(event, {
		ignoreUserId: context.userId,
	});
}

export function handleTimelineItemCreatedTypingClear(
	event: TimelineItemCreatedEvent
) {
	// Clear typing state when a timeline item is created
	clearTypingFromTimelineItem(event);
}
