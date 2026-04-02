import type { RealtimeEvent } from "@plasma/types/realtime-events";
import type { ConversationSeen } from "@plasma/types/schemas";
import { createStore, type Store } from "./create-store";

export type SeenActorType = "visitor" | "user" | "ai_agent";

export type SeenEntry = {
	actorType: SeenActorType;
	actorId: string;
	lastSeenAt: string;
};

export type ConversationSeenState = Record<string, SeenEntry>;

export type SeenState = {
	conversations: Record<string, ConversationSeenState>;
};

const INITIAL_STATE: SeenState = {
	conversations: {},
};

type UpsertSeenOptions = {
	conversationId: string;
	actorType: SeenActorType;
	actorId: string;
	lastSeenAt: string;
};

function makeKey(
	conversationId: string,
	actorType: SeenActorType,
	actorId: string
): string {
	return `${conversationId}:${actorType}:${actorId}`;
}

function hasSameEntries(
	existing: ConversationSeenState | undefined,
	next: ConversationSeenState
): boolean {
	if (!existing) {
		return false;
	}

	const existingKeys = Object.keys(existing);
	const nextKeys = Object.keys(next);

	if (existingKeys.length !== nextKeys.length) {
		return false;
	}

	for (const key of nextKeys) {
		const previous = existing[key];
		const incoming = next[key];

		if (!(previous && incoming)) {
			return false;
		}

		if (
			previous.actorType !== incoming.actorType ||
			previous.actorId !== incoming.actorId ||
			new Date(previous.lastSeenAt).getTime() !==
				new Date(incoming.lastSeenAt).getTime()
		) {
			return false;
		}
	}

	return true;
}

export type SeenStore = Store<SeenState> & {
	upsert(options: UpsertSeenOptions): void;
	hydrate(conversationId: string, entries: ConversationSeen[]): void;
	clear(conversationId: string): void;
};

type ActorIdentity = {
	actorType: SeenActorType;
	actorId: string;
};

/**
 * Input type for resolving actor identity from either:
 * - ConversationSeen (has userId/visitorId/aiAgentId)
 * - RealtimeEvent<"conversationSeen"> payload (has actorType/actorId plus userId/visitorId/aiAgentId)
 */
type SeenEntryInput = {
	userId?: string | null;
	visitorId?: string | null;
	aiAgentId?: string | null;
	actorType?: SeenActorType | string;
	actorId?: string;
};

function resolveActorIdentity(entry: SeenEntryInput): ActorIdentity | null {
	if (entry.actorType && entry.actorId) {
		return {
			actorType: entry.actorType as SeenActorType,
			actorId: entry.actorId,
		} satisfies ActorIdentity;
	}

	if (entry.userId) {
		return { actorType: "user", actorId: entry.userId } satisfies ActorIdentity;
	}

	if (entry.aiAgentId) {
		return {
			actorType: "ai_agent",
			actorId: entry.aiAgentId,
		} satisfies ActorIdentity;
	}

	if (entry.visitorId) {
		return {
			actorType: "visitor",
			actorId: entry.visitorId,
		} satisfies ActorIdentity;
	}

	return null;
}

export function createSeenStore(
	initialState: SeenState = INITIAL_STATE
): SeenStore {
	const store = createStore<SeenState>({
		conversations: { ...initialState.conversations },
	});

	return {
		...store,
		upsert({ conversationId, actorType, actorId, lastSeenAt }) {
			store.setState((state) => {
				const existingConversation = state.conversations[conversationId] ?? {};
				const key = makeKey(conversationId, actorType, actorId);
				const previous = existingConversation[key];

				if (
					previous &&
					new Date(previous.lastSeenAt).getTime() >=
						new Date(lastSeenAt).getTime()
				) {
					return state;
				}

				const nextConversation: ConversationSeenState = {
					...existingConversation,
					[key]: {
						actorType,
						actorId,
						lastSeenAt,
					},
				};

				return {
					conversations: {
						...state.conversations,
						[conversationId]: nextConversation,
					},
				} satisfies SeenState;
			});
		},
		hydrate(conversationId, entries) {
			store.setState((state) => {
				if (entries.length === 0) {
					if (!(conversationId in state.conversations)) {
						return state;
					}
					const nextConversations = { ...state.conversations };
					delete nextConversations[conversationId];
					return { conversations: nextConversations } satisfies SeenState;
				}

				const existing = state.conversations[conversationId] ?? {};
				const nextEntries: ConversationSeenState = {
					...existing,
				};

				for (const entry of entries) {
					const identity = resolveActorIdentity(entry);

					if (!identity) {
						continue;
					}

					const key = makeKey(
						conversationId,
						identity.actorType,
						identity.actorId
					);
					const previous = existing[key];
					const incomingTimestamp = new Date(entry.lastSeenAt).getTime();
					const previousTimestamp = previous
						? new Date(previous.lastSeenAt).getTime()
						: null;

					if (
						previous &&
						previousTimestamp !== null &&
						!Number.isNaN(previousTimestamp) &&
						!Number.isNaN(incomingTimestamp) &&
						previousTimestamp > incomingTimestamp
					) {
						nextEntries[key] = previous;
						continue;
					}

					nextEntries[key] = {
						actorType: identity.actorType,
						actorId: identity.actorId,
						lastSeenAt: entry.lastSeenAt,
					} satisfies SeenEntry;
				}

				if (hasSameEntries(existing, nextEntries)) {
					return state;
				}

				if (Object.keys(nextEntries).length === 0) {
					const nextConversations = { ...state.conversations };
					delete nextConversations[conversationId];
					return { conversations: nextConversations } satisfies SeenState;
				}

				return {
					conversations: {
						...state.conversations,
						[conversationId]: nextEntries,
					},
				} satisfies SeenState;
			});
		},
		clear(conversationId) {
			store.setState((state) => {
				if (!(conversationId in state.conversations)) {
					return state;
				}

				const nextConversations = { ...state.conversations };
				delete nextConversations[conversationId];

				return { conversations: nextConversations } satisfies SeenState;
			});
		},
	} satisfies SeenStore;
}

export function hydrateConversationSeen(
	store: SeenStore,
	conversationId: string,
	entries: ConversationSeen[]
): void {
	store.hydrate(conversationId, entries);
}

export function upsertConversationSeen(
	store: SeenStore,
	options: UpsertSeenOptions
): void {
	store.upsert(options);
}

export function applyConversationSeenEvent(
	store: SeenStore,
	event: RealtimeEvent<"conversationSeen">,
	options: {
		ignoreVisitorId?: string | null;
		ignoreUserId?: string | null;
		ignoreAiAgentId?: string | null;
	} = {}
): void {
	const { payload } = event;
	const identity = resolveActorIdentity(payload);

	if (!identity) {
		return;
	}

	if (
		(identity.actorType === "visitor" &&
			options.ignoreVisitorId &&
			identity.actorId === options.ignoreVisitorId) ||
		(identity.actorType === "user" &&
			options.ignoreUserId &&
			identity.actorId === options.ignoreUserId) ||
		(identity.actorType === "ai_agent" &&
			options.ignoreAiAgentId &&
			identity.actorId === options.ignoreAiAgentId)
	) {
		return;
	}

	const lastSeenAt = payload.lastSeenAt;

	upsertConversationSeen(store, {
		conversationId: payload.conversationId,
		actorType: identity.actorType,
		actorId: identity.actorId,
		lastSeenAt,
	});
}
