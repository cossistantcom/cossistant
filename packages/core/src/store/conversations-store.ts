import type { ListConversationsResponse } from "@plasma/types/api/conversation";
import { createStore, type Store } from "./create-store";

export type ConversationPagination = ListConversationsResponse["pagination"];

// Use the conversation type from the list response which includes visitorLastSeenAt
export type ConversationWithSeen =
	ListConversationsResponse["conversations"][number];

export type ConversationsState = {
	ids: string[];
	byId: Record<string, ConversationWithSeen>;
	pagination: ConversationPagination | null;
};

const INITIAL_STATE: ConversationsState = {
	ids: [],
	byId: {},
	pagination: null,
};

function isSameDate(a: Date | string, b: Date | string): boolean {
	if (a === b) {
		return true;
	}

	const aTime = typeof a === "string" ? new Date(a).getTime() : a.getTime();
	const bTime = typeof b === "string" ? new Date(b).getTime() : b.getTime();

	return aTime === bTime;
}

function isSameConversation(
	a: ConversationWithSeen,
	b: ConversationWithSeen
): boolean {
	// Check basic fields
	const deletedAtMatch =
		!(a.deletedAt || b.deletedAt) ||
		(a.deletedAt && b.deletedAt && isSameDate(a.deletedAt, b.deletedAt));

	// Check visitorLastSeenAt
	const visitorLastSeenAtMatch =
		!(a.visitorLastSeenAt || b.visitorLastSeenAt) ||
		(a.visitorLastSeenAt &&
			b.visitorLastSeenAt &&
			isSameDate(a.visitorLastSeenAt, b.visitorLastSeenAt));

	// Check visitorRatingAt
	const visitorRatingAtMatch =
		!(a.visitorRatingAt || b.visitorRatingAt) ||
		(a.visitorRatingAt &&
			b.visitorRatingAt &&
			isSameDate(a.visitorRatingAt, b.visitorRatingAt));

	const basicMatch =
		a.id === b.id &&
		a.title === b.title &&
		a.status === b.status &&
		a.visitorId === b.visitorId &&
		a.websiteId === b.websiteId &&
		a.visitorRating === b.visitorRating &&
		isSameDate(a.createdAt, b.createdAt) &&
		isSameDate(a.updatedAt, b.updatedAt) &&
		deletedAtMatch &&
		visitorLastSeenAtMatch &&
		visitorRatingAtMatch;

	if (!basicMatch) {
		return false;
	}

	// Check lastTimelineItem - both undefined/null is a match
	if (!(a.lastTimelineItem || b.lastTimelineItem)) {
		return true;
	}

	// One has timeline item, one doesn't - not a match
	if (!(a.lastTimelineItem && b.lastTimelineItem)) {
		return false;
	}

	// Both have timeline items - compare them
	return (
		a.lastTimelineItem.id === b.lastTimelineItem.id &&
		a.lastTimelineItem.text === b.lastTimelineItem.text &&
		isSameDate(a.lastTimelineItem.createdAt, b.lastTimelineItem.createdAt)
	);
}

function mergeMap(
	existing: Record<string, ConversationWithSeen>,
	incoming: ConversationWithSeen[]
): [Record<string, ConversationWithSeen>, boolean] {
	let changed = false;
	let next = existing;

	for (const conversation of incoming) {
		const previous = next[conversation.id];
		if (!(previous && isSameConversation(previous, conversation))) {
			if (!changed) {
				next = { ...next };
				changed = true;
			}
			next[conversation.id] = conversation;
		}
	}

	return [next, changed];
}

function mergeOrder(
	existing: string[],
	incoming: string[],
	page: number
): [string[], boolean] {
	if (incoming.length === 0) {
		return [existing, false];
	}

	if (page <= 1) {
		const rest = existing.filter((id) => !incoming.includes(id));
		const next = [...incoming, ...rest];
		const changed =
			next.length !== existing.length ||
			next.some((value, index) => value !== existing[index]);
		return changed ? [next, true] : [existing, false];
	}

	let changed = false;
	const seen = new Set(existing);
	const next = [...existing];

	for (const id of incoming) {
		if (seen.has(id)) {
			continue;
		}
		seen.add(id);
		next.push(id);
		changed = true;
	}

	return changed ? [next, true] : [existing, false];
}

function isSamePagination(
	a: ConversationPagination | null,
	b: ConversationPagination | null
): boolean {
	if (a === b) {
		return true;
	}
	if (!(a && b)) {
		return !(a || b);
	}
	return (
		a.page === b.page &&
		a.limit === b.limit &&
		a.total === b.total &&
		a.totalPages === b.totalPages &&
		a.hasMore === b.hasMore
	);
}

function applyList(
	state: ConversationsState,
	response: ListConversationsResponse
): ConversationsState {
	const [byId, mapChanged] = mergeMap(state.byId, response.conversations);
	const [ids, idsChanged] = mergeOrder(
		state.ids,
		response.conversations.map((conversation) => conversation.id),
		response.pagination.page
	);
	const paginationChanged = !isSamePagination(
		state.pagination,
		response.pagination
	);

	if (!(mapChanged || idsChanged || paginationChanged)) {
		return state;
	}

	return {
		byId,
		ids,
		pagination: paginationChanged ? response.pagination : state.pagination,
	};
}

function applyConversation(
	state: ConversationsState,
	conversation: ConversationWithSeen
): ConversationsState {
	const previous = state.byId[conversation.id];
	const sameConversation = previous
		? isSameConversation(previous, conversation)
		: false;
	const byId = sameConversation
		? state.byId
		: { ...state.byId, [conversation.id]: conversation };
	const hasId = state.ids.includes(conversation.id);
	const ids = hasId ? state.ids : [...state.ids, conversation.id];

	if (byId === state.byId && ids === state.ids) {
		return state;
	}

	return {
		byId,
		ids,
		pagination: state.pagination,
	};
}

export type ConversationsStore = Store<ConversationsState> & {
	ingestList(response: ListConversationsResponse): void;
	ingestConversation(conversation: ConversationWithSeen): void;
};

export function createConversationsStore(
	initialState: ConversationsState = INITIAL_STATE
): ConversationsStore {
	const store = createStore<ConversationsState>(initialState);

	return {
		...store,
		ingestList(response) {
			store.setState((state) => applyList(state, response));
		},
		ingestConversation(conversation) {
			store.setState((state) => applyConversation(state, conversation));
		},
	};
}

export function getConversations(
	store: Store<ConversationsState>
): ConversationWithSeen[] {
	const state = store.getState();
	return state.ids
		.map((id) => state.byId[id])
		.filter(
			(conversation): conversation is ConversationWithSeen =>
				conversation !== undefined
		);
}

export function getConversationById(
	store: Store<ConversationsState>,
	conversationId: string
): ConversationWithSeen | undefined {
	return store.getState().byId[conversationId];
}

export function getConversationPagination(
	store: Store<ConversationsState>
): ConversationPagination | null {
	return store.getState().pagination;
}
