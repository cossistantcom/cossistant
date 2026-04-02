import {
	applyProcessingCompletedEvent as applyCompletedEvent,
	applyProcessingProgressEvent as applyProgressEvent,
	clearProcessingFromTimelineItem as clearFromItem,
	createProcessingStore,
	type ProcessingState,
} from "@plasma/core";
import type { RealtimeEvent } from "@plasma/types/realtime-events";
import { useRef, useSyncExternalStore } from "react";

/** Module-level singleton shared by the dashboard and the SDK widget. */
export const processingStoreSingleton = createProcessingStore();

type Selector<T> = (state: ProcessingState) => T;

type EqualityChecker<T> = (previous: T, next: T) => boolean;

function useSelector<TSelected>(
	selector: Selector<TSelected>,
	isEqual: EqualityChecker<TSelected> = Object.is
): TSelected {
	const selectionRef = useRef<TSelected>(undefined);

	const subscribe = (onStoreChange: () => void) =>
		processingStoreSingleton.subscribe(() => {
			onStoreChange();
		});

	const snapshot = useSyncExternalStore(
		subscribe,
		processingStoreSingleton.getState,
		processingStoreSingleton.getState
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

export function useProcessingStore<TSelected>(
	selector: Selector<TSelected>,
	isEqual?: EqualityChecker<TSelected>
): TSelected {
	return useSelector(selector, isEqual);
}

export function applyProcessingProgressEvent(
	event: RealtimeEvent<"aiAgentProcessingProgress">
) {
	applyProgressEvent(processingStoreSingleton, event);
}

export function applyProcessingCompletedEvent(
	event: RealtimeEvent<"aiAgentProcessingCompleted">
) {
	applyCompletedEvent(processingStoreSingleton, event);
}

export function clearProcessingFromTimelineItem(
	event: RealtimeEvent<"timelineItemCreated">
) {
	clearFromItem(processingStoreSingleton, event);
}
