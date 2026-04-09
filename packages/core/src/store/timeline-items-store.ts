import type { RealtimeEvent } from "@plasma/types";
import {
	type TimelineItem,
	timelineItemPartsSchema,
} from "@plasma/types/api/timeline-item";
import { createStore, type Store } from "./create-store";

type TimelineItemCreatedEvent = RealtimeEvent<"timelineItemCreated">;
type TimelineItemUpdatedEvent = RealtimeEvent<"timelineItemUpdated">;

export type ConversationTimelineItemsState = {
	items: TimelineItem[];
	hasNextPage: boolean;
	nextCursor?: string;
};

export type TimelineItemsState = {
	conversations: Record<string, ConversationTimelineItemsState>;
};

const INITIAL_STATE: TimelineItemsState = {
	conversations: {},
};

function sortTimelineItems(items: TimelineItem[]): TimelineItem[] {
	return [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function isSameTimelineItem(a: TimelineItem, b: TimelineItem): boolean {
	if (a === b) {
		return true;
	}

	if (a.parts.length !== b.parts.length) {
		return false;
	}

	for (let index = 0; index < a.parts.length; index++) {
		const aPart = a.parts[index];
		const bPart = b.parts[index];
		if (JSON.stringify(aPart) !== JSON.stringify(bPart)) {
			return false;
		}
	}

	return (
		a.id === b.id &&
		a.conversationId === b.conversationId &&
		a.organizationId === b.organizationId &&
		a.visibility === b.visibility &&
		a.type === b.type &&
		a.text === b.text &&
		a.tool === b.tool &&
		a.userId === b.userId &&
		a.visitorId === b.visitorId &&
		a.aiAgentId === b.aiAgentId &&
		a.deletedAt === b.deletedAt &&
		new Date(a.createdAt).getTime() === new Date(b.createdAt).getTime()
	);
}

function mergeTimelineItems(
	existing: TimelineItem[],
	incoming: TimelineItem[]
): TimelineItem[] {
	if (incoming.length === 0) {
		return existing;
	}

	const byId = new Map<string, TimelineItem>();
	for (const item of existing) {
		if (item.id) {
			byId.set(item.id, item);
		}
	}

	let changed = false;
	for (const item of incoming) {
		if (!item.id) {
			continue;
		}
		const previous = byId.get(item.id);
		const isIdentical = previous ? isSameTimelineItem(previous, item) : false;
		if (previous && isIdentical) {
			// Reuse existing reference when payload is identical so React subscribers
			// don't re-render on no-op updates (e.g. optimistic + realtime echo).
			byId.set(item.id, previous);
			continue;
		}

		if (!isIdentical) {
			changed = true;
		}
		byId.set(item.id, item);
	}

	if (!changed && byId.size === existing.length) {
		let orderStable = true;
		for (const item of existing) {
			if (item.id && byId.get(item.id) !== item) {
				orderStable = false;
				break;
			}
		}

		if (orderStable) {
			return existing;
		}
	}

	return sortTimelineItems(Array.from(byId.values()));
}

function applyPage(
	state: TimelineItemsState,
	conversationId: string,
	page: Pick<
		ConversationTimelineItemsState,
		"items" | "hasNextPage" | "nextCursor"
	>
): TimelineItemsState {
	const existing = state.conversations[conversationId];
	const mergedItems = mergeTimelineItems(existing?.items ?? [], page.items);

	if (
		existing &&
		existing.items === mergedItems &&
		existing.hasNextPage === page.hasNextPage &&
		existing.nextCursor === page.nextCursor
	) {
		return state;
	}

	return {
		...state,
		conversations: {
			...state.conversations,
			[conversationId]: {
				items: mergedItems,
				hasNextPage: page.hasNextPage,
				nextCursor: page.nextCursor,
			},
		},
	};
}

function applyTimelineItem(
	state: TimelineItemsState,
	item: TimelineItem
): TimelineItemsState {
	const existing = state.conversations[item.conversationId];
	const mergedItems = mergeTimelineItems(existing?.items ?? [], [item]);

	if (existing && existing.items === mergedItems) {
		return state;
	}

	return {
		...state,
		conversations: {
			...state.conversations,
			[item.conversationId]: {
				items: mergedItems,
				hasNextPage: existing?.hasNextPage ?? false,
				nextCursor: existing?.nextCursor,
			},
		},
	};
}

function removeTimelineItem(
	state: TimelineItemsState,
	conversationId: string,
	itemId: string
): TimelineItemsState {
	const existing = state.conversations[conversationId];
	if (!existing) {
		return state;
	}

	const index = existing.items.findIndex((item) => item.id === itemId);
	if (index === -1) {
		return state;
	}

	const nextItems = existing.items
		.slice(0, index)
		.concat(existing.items.slice(index + 1));

	const nextConversation: ConversationTimelineItemsState = {
		...existing,
		items: nextItems,
	};

	return {
		...state,
		conversations: {
			...state.conversations,
			[conversationId]: nextConversation,
		},
	};
}

function finalizeTimelineItem(
	state: TimelineItemsState,
	conversationId: string,
	optimisticId: string,
	item: TimelineItem
): TimelineItemsState {
	const withoutOptimistic = removeTimelineItem(
		state,
		conversationId,
		optimisticId
	);
	return applyTimelineItem(withoutOptimistic, item);
}

function isTimelineItemPart(
	part: unknown
): part is TimelineItem["parts"][number] {
	return (
		typeof part === "object" &&
		part !== null &&
		"type" in part &&
		typeof part.type === "string"
	);
}

function normalizeTimelineItemParts(parts: unknown): TimelineItem["parts"] {
	if (!Array.isArray(parts)) {
		return [];
	}

	return parts.filter(isTimelineItemPart);
}

// Normalize timeline item created event
function normalizeRealtimeTimelineItem(
	event: TimelineItemCreatedEvent | TimelineItemUpdatedEvent
): TimelineItem {
	const raw = event.payload.item;

	return {
		id: raw.id,
		conversationId: raw.conversationId,
		organizationId: raw.organizationId,
		visibility: raw.visibility,
		type: raw.type,
		text: raw.text ?? null,
		parts: normalizeTimelineItemParts(raw.parts),
		tool: raw.tool ?? null,
		userId: raw.userId,
		visitorId: raw.visitorId,
		aiAgentId: raw.aiAgentId,
		createdAt: raw.createdAt,
		deletedAt: raw.deletedAt ?? null,
	};
}

export type TimelineItemsStore = Store<TimelineItemsState> & {
	ingestPage(
		conversationId: string,
		page: ConversationTimelineItemsState
	): void;
	ingestTimelineItem(item: TimelineItem): void;
	ingestRealtimeTimelineItem(event: TimelineItemCreatedEvent): TimelineItem;
	ingestRealtimeUpdatedTimelineItem(
		event: TimelineItemUpdatedEvent
	): TimelineItem;
	removeTimelineItem(conversationId: string, itemId: string): void;
	finalizeTimelineItem(
		conversationId: string,
		optimisticId: string,
		item: TimelineItem
	): void;
	clearConversation(conversationId: string): void;
};

export function createTimelineItemsStore(
	initialState: TimelineItemsState = INITIAL_STATE
): TimelineItemsStore {
	const store = createStore<TimelineItemsState>(initialState);

	return {
		...store,
		ingestPage(conversationId, page) {
			store.setState((state) => applyPage(state, conversationId, page));
		},
		ingestTimelineItem(item) {
			store.setState((state) => applyTimelineItem(state, item));
		},
		ingestRealtimeTimelineItem(event) {
			const item = normalizeRealtimeTimelineItem(event);
			store.setState((state) => applyTimelineItem(state, item));
			return item;
		},
		ingestRealtimeUpdatedTimelineItem(event) {
			const item = normalizeRealtimeTimelineItem(event);
			store.setState((state) => applyTimelineItem(state, item));
			return item;
		},
		removeTimelineItem(conversationId, itemId) {
			store.setState((state) =>
				removeTimelineItem(state, conversationId, itemId)
			);
		},
		finalizeTimelineItem(conversationId, optimisticId, item) {
			store.setState((state) =>
				finalizeTimelineItem(state, conversationId, optimisticId, item)
			);
		},
		clearConversation(conversationId) {
			store.setState((state) => {
				if (!state.conversations[conversationId]) {
					return state;
				}

				const { [conversationId]: _removed, ...rest } = state.conversations;

				return {
					...state,
					conversations: rest,
				} satisfies TimelineItemsState;
			});
		},
	};
}

export function getConversationTimelineItems(
	store: Store<TimelineItemsState>,
	conversationId: string
): ConversationTimelineItemsState | undefined {
	return store.getState().conversations[conversationId];
}
