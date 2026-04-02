import type { RealtimeEvent } from "@plasma/types/realtime-events";
import { createStore, type Store } from "./create-store";

export type TypingActorType = "visitor" | "user" | "ai_agent";

export type TypingEntry = {
	actorType: TypingActorType;
	actorId: string;
	preview: string | null;
	updatedAt: number;
};

export type ConversationTypingState = Record<string, TypingEntry>;

export type TypingState = {
	conversations: Record<string, ConversationTypingState>;
};

const DEFAULT_TTL_MS = 6000;

export type TypingStoreDependencies = {
	now?: () => number;
	setTimeout?: (callback: () => void, delay: number) => unknown;
	clearTimeout?: (id: unknown) => void;
	defaultTtlMs?: number;
};

type TypingOptions = {
	conversationId: string;
	actorType: TypingActorType;
	actorId: string;
};

type SetTypingOptions = TypingOptions & {
	isTyping: boolean;
	preview?: string | null;
	ttlMs?: number;
};

function makeKey(
	conversationId: string,
	actorType: TypingActorType,
	actorId: string
): string {
	return `${conversationId}:${actorType}:${actorId}`;
}

function removeEntry(
	state: TypingState,
	conversationId: string,
	key: string
): TypingState {
	const existingConversation = state.conversations[conversationId];
	if (!(existingConversation && key in existingConversation)) {
		return state;
	}

	const { [key]: _removed, ...rest } = existingConversation;
	if (Object.keys(rest).length === 0) {
		const nextConversations = { ...state.conversations };
		delete nextConversations[conversationId];
		return { conversations: nextConversations } satisfies TypingState;
	}

	return {
		conversations: {
			...state.conversations,
			[conversationId]: rest,
		},
	} satisfies TypingState;
}

export type TypingStore = Store<TypingState> & {
	setTyping(options: SetTypingOptions): void;
	removeTyping(options: TypingOptions): void;
	clearConversation(conversationId: string): void;
};

export function createTypingStore(
	initialState: TypingState = { conversations: {} },
	dependencies: TypingStoreDependencies = {}
): TypingStore {
	const {
		now = () => Date.now(),
		setTimeout: schedule = (callback, delay) =>
			globalThis.setTimeout(callback, delay),
		clearTimeout: clearScheduled = (id) =>
			globalThis.clearTimeout(id as ReturnType<typeof globalThis.setTimeout>),
		defaultTtlMs = DEFAULT_TTL_MS,
	} = dependencies;

	const timers = new Map<string, unknown>();
	const store = createStore<TypingState>({
		conversations: { ...initialState.conversations },
	});

	const clearTimer = (key: string) => {
		const handle = timers.get(key);
		if (!handle) {
			return;
		}
		timers.delete(key);
		clearScheduled(handle);
	};

	const scheduleRemoval = (
		key: string,
		options: TypingOptions,
		ttl: number
	) => {
		clearTimer(key);
		const handle = schedule(() => {
			timers.delete(key);
			store.setState((state) =>
				removeEntry(state, options.conversationId, key)
			);
		}, ttl);
		timers.set(key, handle);
	};

	return {
		...store,
		setTyping({
			conversationId,
			actorType,
			actorId,
			isTyping,
			preview = null,
			ttlMs,
		}) {
			const key = makeKey(conversationId, actorType, actorId);

			if (!isTyping) {
				clearTimer(key);
				store.setState((state) => removeEntry(state, conversationId, key));
				return;
			}

			const entry: TypingEntry = {
				actorType,
				actorId,
				preview: preview ?? null,
				updatedAt: now(),
			};

			store.setState((state) => {
				const existingConversation = state.conversations[conversationId];

				const nextConversation: ConversationTypingState = {
					...(existingConversation ? { ...existingConversation } : {}),
					[key]: entry,
				};

				return {
					conversations: {
						...state.conversations,
						[conversationId]: nextConversation,
					},
				} satisfies TypingState;
			});

			const timeoutMs = ttlMs ?? defaultTtlMs;
			scheduleRemoval(key, { conversationId, actorType, actorId }, timeoutMs);
		},
		removeTyping({ conversationId, actorType, actorId }) {
			const key = makeKey(conversationId, actorType, actorId);
			clearTimer(key);
			store.setState((state) => removeEntry(state, conversationId, key));
		},
		clearConversation(conversationId) {
			const conversation = store.getState().conversations[conversationId];
			if (!conversation) {
				return;
			}

			for (const key of Object.keys(conversation)) {
				clearTimer(key);
			}

			store.setState((state) => {
				if (!(conversationId in state.conversations)) {
					return state;
				}

				const nextConversations = { ...state.conversations };
				delete nextConversations[conversationId];
				return { conversations: nextConversations } satisfies TypingState;
			});
		},
	} satisfies TypingStore;
}

export function setTypingState(
	store: TypingStore,
	options: SetTypingOptions
): void {
	store.setTyping(options);
}

export function clearTypingState(
	store: TypingStore,
	options: TypingOptions
): void {
	store.removeTyping(options);
}

export function applyConversationTypingEvent(
	store: TypingStore,
	event: RealtimeEvent<"conversationTyping">,
	options: {
		ignoreVisitorId?: string | null;
		ignoreUserId?: string | null;
		ignoreAiAgentId?: string | null;
		ttlMs?: number;
	} = {}
): void {
	const { payload } = event;
	let actorType: TypingActorType | null = null;
	let actorId: string | null = null;

	// IMPORTANT: Check aiAgentId BEFORE visitorId because the event payload
	// always includes visitorId (for routing purposes), even for AI agent typing.
	// The presence of aiAgentId specifically identifies AI agent typing.
	if (payload.userId) {
		actorType = "user";
		actorId = payload.userId;
	} else if (payload.aiAgentId) {
		actorType = "ai_agent";
		actorId = payload.aiAgentId;
	} else if (payload.visitorId) {
		actorType = "visitor";
		actorId = payload.visitorId;
	}

	if (!(actorType && actorId)) {
		return;
	}

	if (
		(actorType === "visitor" &&
			payload.visitorId &&
			options.ignoreVisitorId &&
			payload.visitorId === options.ignoreVisitorId) ||
		(actorType === "user" &&
			payload.userId &&
			options.ignoreUserId &&
			payload.userId === options.ignoreUserId) ||
		(actorType === "ai_agent" &&
			payload.aiAgentId &&
			options.ignoreAiAgentId &&
			payload.aiAgentId === options.ignoreAiAgentId)
	) {
		return;
	}

	const preview =
		actorType === "visitor" ? (payload.visitorPreview ?? null) : null;

	setTypingState(store, {
		conversationId: payload.conversationId,
		actorType,
		actorId,
		isTyping: payload.isTyping,
		preview,
		ttlMs: options.ttlMs,
	});
}

export function clearTypingFromTimelineItem(
	store: TypingStore,
	event: RealtimeEvent<"timelineItemCreated">
): void {
	const { item } = event.payload;

	if (item.type !== "message") {
		return;
	}

	// Determine who sent this message
	const senderType: TypingActorType | null = item.aiAgentId
		? "ai_agent"
		: item.userId
			? "user"
			: item.visitorId
				? "visitor"
				: null;

	if (senderType) {
		store.clearConversation(item.conversationId);
	}
}

export function getConversationTyping(
	store: Store<TypingState>,
	conversationId: string
): ConversationTypingState | undefined {
	return store.getState().conversations[conversationId];
}
