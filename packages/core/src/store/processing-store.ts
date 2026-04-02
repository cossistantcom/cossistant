import type { RealtimeEvent } from "@plasma/types/realtime-events";
import { createStore, type Store } from "./create-store";

export type ProcessingToolState = "partial" | "result" | "error";

export type ConversationProcessingTool = {
	toolCallId: string;
	toolName: string;
	state: ProcessingToolState;
};

export type ConversationProcessingEntry = {
	conversationId: string;
	workflowRunId: string;
	aiAgentId: string;
	phase: string;
	message: string | null;
	tool: ConversationProcessingTool | null;
	audience: "all" | "dashboard";
	updatedAt: number;
};

export type ProcessingState = {
	conversations: Record<string, ConversationProcessingEntry>;
};

const INITIAL_STATE: ProcessingState = {
	conversations: {},
};

const DEFAULT_TTL_MS = 15_000;

export type ProcessingStoreDependencies = {
	now?: () => number;
	setTimeout?: (callback: () => void, delay: number) => unknown;
	clearTimeout?: (id: unknown) => void;
	defaultTtlMs?: number;
};

export type ProcessingStore = Store<ProcessingState> & {
	upsert(
		entry: Omit<ConversationProcessingEntry, "updatedAt">,
		ttlMs?: number
	): void;
	clearConversation(
		conversationId: string,
		options?: {
			workflowRunId?: string;
			aiAgentId?: string;
		}
	): void;
};

function isSameTool(
	a: ConversationProcessingTool | null,
	b: ConversationProcessingTool | null
): boolean {
	if (!(a || b)) {
		return true;
	}

	if (!(a && b)) {
		return false;
	}

	return (
		a.toolCallId === b.toolCallId &&
		a.toolName === b.toolName &&
		a.state === b.state
	);
}

function matchesProcessingEntry(
	existing: ConversationProcessingEntry,
	incoming: ConversationProcessingEntry
): boolean {
	return (
		existing.conversationId === incoming.conversationId &&
		existing.workflowRunId === incoming.workflowRunId &&
		existing.aiAgentId === incoming.aiAgentId &&
		existing.phase === incoming.phase &&
		existing.message === incoming.message &&
		existing.audience === incoming.audience &&
		isSameTool(existing.tool, incoming.tool)
	);
}

function matchesClearOptions(
	entry: ConversationProcessingEntry,
	options: {
		workflowRunId?: string;
		aiAgentId?: string;
	}
): boolean {
	if (options.workflowRunId && entry.workflowRunId !== options.workflowRunId) {
		return false;
	}

	if (options.aiAgentId && entry.aiAgentId !== options.aiAgentId) {
		return false;
	}

	return true;
}

function removeConversation(
	state: ProcessingState,
	conversationId: string
): ProcessingState {
	if (!(conversationId in state.conversations)) {
		return state;
	}

	const nextConversations = { ...state.conversations };
	delete nextConversations[conversationId];
	return { conversations: nextConversations } satisfies ProcessingState;
}

export function createProcessingStore(
	initialState: ProcessingState = INITIAL_STATE,
	dependencies: ProcessingStoreDependencies = {}
): ProcessingStore {
	const {
		now = () => Date.now(),
		setTimeout: schedule = (callback, delay) =>
			globalThis.setTimeout(callback, delay),
		clearTimeout: clearScheduled = (id) =>
			globalThis.clearTimeout(id as ReturnType<typeof globalThis.setTimeout>),
		defaultTtlMs = DEFAULT_TTL_MS,
	} = dependencies;

	const timers = new Map<string, unknown>();
	const store = createStore<ProcessingState>({
		conversations: { ...initialState.conversations },
	});

	const clearTimer = (conversationId: string) => {
		const timer = timers.get(conversationId);
		if (!timer) {
			return;
		}

		timers.delete(conversationId);
		clearScheduled(timer);
	};

	const scheduleRemoval = (conversationId: string, ttlMs: number) => {
		clearTimer(conversationId);
		const timer = schedule(() => {
			timers.delete(conversationId);
			store.setState((state) => removeConversation(state, conversationId));
		}, ttlMs);
		timers.set(conversationId, timer);
	};

	return {
		...store,
		upsert(entry, ttlMs) {
			const nextEntry: ConversationProcessingEntry = {
				...entry,
				updatedAt: now(),
			};

			store.setState((state) => {
				const existing = state.conversations[entry.conversationId];

				if (existing && matchesProcessingEntry(existing, nextEntry)) {
					return {
						conversations: {
							...state.conversations,
							[entry.conversationId]: {
								...existing,
								updatedAt: nextEntry.updatedAt,
							},
						},
					} satisfies ProcessingState;
				}

				return {
					conversations: {
						...state.conversations,
						[entry.conversationId]: nextEntry,
					},
				} satisfies ProcessingState;
			});

			scheduleRemoval(entry.conversationId, ttlMs ?? defaultTtlMs);
		},
		clearConversation(conversationId, options = {}) {
			const existing = store.getState().conversations[conversationId];
			if (!(existing && matchesClearOptions(existing, options))) {
				return;
			}

			clearTimer(conversationId);
			store.setState((state) => removeConversation(state, conversationId));
		},
	} satisfies ProcessingStore;
}

export function applyProcessingProgressEvent(
	store: ProcessingStore,
	event: RealtimeEvent<"aiAgentProcessingProgress">,
	options: { ttlMs?: number } = {}
): void {
	const { payload } = event;

	store.upsert(
		{
			conversationId: payload.conversationId,
			workflowRunId: payload.workflowRunId,
			aiAgentId: payload.aiAgentId,
			phase: payload.phase,
			message: payload.message ?? null,
			tool: payload.tool
				? {
						toolCallId: payload.tool.toolCallId,
						toolName: payload.tool.toolName,
						state: payload.tool.state,
					}
				: null,
			audience: payload.audience,
		},
		options.ttlMs
	);
}

export function applyProcessingCompletedEvent(
	store: ProcessingStore,
	event: RealtimeEvent<"aiAgentProcessingCompleted">
): void {
	store.clearConversation(event.payload.conversationId, {
		workflowRunId: event.payload.workflowRunId,
		aiAgentId: event.payload.aiAgentId,
	});
}

export function clearProcessingFromTimelineItem(
	store: ProcessingStore,
	event: RealtimeEvent<"timelineItemCreated">
): void {
	const { item } = event.payload;

	if (
		item.type === "message" &&
		item.visibility === "public" &&
		item.aiAgentId
	) {
		store.clearConversation(item.conversationId, {
			aiAgentId: item.aiAgentId,
		});
	}
}

export function getConversationProcessing(
	store: Store<ProcessingState>,
	conversationId: string
): ConversationProcessingEntry | undefined {
	return store.getState().conversations[conversationId];
}
