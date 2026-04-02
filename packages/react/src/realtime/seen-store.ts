import {
	applyConversationSeenEvent as applyEvent,
	createSeenStore,
	hydrateConversationSeen as hydrateStore,
	type SeenActorType,
	type SeenEntry,
	type SeenState,
	upsertConversationSeen as upsertStore,
} from "@plasma/core";
import type { RealtimeEvent } from "@plasma/types/realtime-events";
import type { ConversationSeen } from "@plasma/types/schemas";
import { useRef, useSyncExternalStore } from "react";

/** Module-level singleton shared by the dashboard and the SDK widget. */
export const seenStoreSingleton = createSeenStore();

type Selector<T> = (state: SeenState) => T;

type EqualityChecker<T> = (previous: T, next: T) => boolean;

function useSelector<TSelected>(
	selector: Selector<TSelected>,
	isEqual: EqualityChecker<TSelected> = Object.is
): TSelected {
	const selectionRef = useRef<TSelected>(undefined);

	const subscribe = (onStoreChange: () => void) =>
		seenStoreSingleton.subscribe(() => {
			onStoreChange();
		});

	const snapshot = useSyncExternalStore(
		subscribe,
		seenStoreSingleton.getState,
		seenStoreSingleton.getState
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
 * Public hook for subscribing to slices of the shared "seen" store.
 */
export function useSeenStore<TSelected>(
	selector: Selector<TSelected>,
	isEqual?: EqualityChecker<TSelected>
): TSelected {
	return useSelector(selector, isEqual);
}

/**
 * Seeds the seen store with initial data, typically from the REST API or SSR.
 */
export function hydrateConversationSeen(
	conversationId: string,
	entries: ConversationSeen[]
) {
	hydrateStore(seenStoreSingleton, conversationId, entries);
}

/**
 * Inserts or updates a seen entry for the provided actor.
 */
export function upsertConversationSeen(options: {
	conversationId: string;
	actorType: SeenActorType;
	actorId: string;
	lastSeenAt: Date;
}) {
	upsertStore(seenStoreSingleton, {
		...options,
		lastSeenAt: options.lastSeenAt.toISOString(),
	});
}

/**
 * Applies realtime `conversationSeen` events to the store while optionally
 * ignoring the local visitor/user.
 */
export function applyConversationSeenEvent(
	event: RealtimeEvent<"conversationSeen">,
	options?: {
		ignoreVisitorId?: string | null;
		ignoreUserId?: string | null;
		ignoreAiAgentId?: string | null;
	}
) {
	applyEvent(seenStoreSingleton, event, options);
}
