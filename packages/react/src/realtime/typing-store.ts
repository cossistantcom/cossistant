import {
	applyConversationTypingEvent as applyEvent,
	type ConversationTypingState,
	clearTypingFromTimelineItem as clearFromTimelineItem,
	clearTypingState as clearState,
	createTypingStore,
	setTypingState as setState,
	type TypingActorType,
	type TypingEntry,
	type TypingState,
} from "@plasma/core";
import type { RealtimeEvent } from "@plasma/types/realtime-events";
import { useRef, useSyncExternalStore } from "react";

/** Module-level singleton shared by the dashboard and the SDK widget. */
export const typingStoreSingleton = createTypingStore();

type Selector<T> = (state: TypingState) => T;

type EqualityChecker<T> = (previous: T, next: T) => boolean;

function useSelector<TSelected>(
	selector: Selector<TSelected>,
	isEqual: EqualityChecker<TSelected> = Object.is
): TSelected {
	const selectionRef = useRef<TSelected>(undefined);

	const subscribe = (onStoreChange: () => void) =>
		typingStoreSingleton.subscribe(() => {
			onStoreChange();
		});

	const snapshot = useSyncExternalStore(
		subscribe,
		typingStoreSingleton.getState,
		typingStoreSingleton.getState
	);

	const selected = selector(snapshot);

	if (
		selectionRef.current === undefined ||
		!isEqual(selectionRef.current, selected)
	) {
		selectionRef.current = selected;
	}

	return selectionRef.current as TSelected;
}

/**
 * Hook wrapper for the typing Zustand store used by realtime helpers.
 */
export function useTypingStore<TSelected>(
	selector: Selector<TSelected>,
	isEqual?: EqualityChecker<TSelected>
): TSelected {
	return useSelector(selector, isEqual);
}

/**
 * Manually sets the typing state for a participant, typically in response to
 * local input changes.
 */
export function setTypingState(options: {
	conversationId: string;
	actorType: TypingActorType;
	actorId: string;
	isTyping: boolean;
	preview?: string | null;
	ttlMs?: number;
}) {
	setState(typingStoreSingleton, options);
}

/**
 * Removes typing state entries for a participant.
 */
export function clearTypingState(options: {
	conversationId: string;
	actorType: TypingActorType;
	actorId: string;
}) {
	clearState(typingStoreSingleton, options);
}

/**
 * Applies realtime typing events to the store while supporting exclusions for
 * the current visitor or agents.
 */
export function applyConversationTypingEvent(
	event: RealtimeEvent<"conversationTyping">,
	options?: {
		ignoreVisitorId?: string | null;
		ignoreUserId?: string | null;
		ignoreAiAgentId?: string | null;
		ttlMs?: number;
	}
) {
	applyEvent(typingStoreSingleton, event, options);
}

/**
 * Utility invoked when a timeline item is created to clear stale typing
 * indicators for the sender.
 */
export function clearTypingFromTimelineItem(
	event: RealtimeEvent<"timelineItemCreated">
) {
	clearFromTimelineItem(typingStoreSingleton, event);
}
