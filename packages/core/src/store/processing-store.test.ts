import { describe, expect, it, mock } from "bun:test";
import type { RealtimeEvent } from "@plasma/types/realtime-events";
import {
	applyProcessingCompletedEvent,
	createProcessingStore,
} from "./processing-store";

function createProcessingProgressEntry() {
	return {
		conversationId: "conv-1",
		workflowRunId: "wf-1",
		aiAgentId: "ai-1",
		phase: "tool",
		message: "Searching knowledge base...",
		tool: {
			toolCallId: "call-1",
			toolName: "searchKnowledgeBase",
			state: "partial" as const,
		},
		audience: "all" as const,
	};
}

function createCompletedEvent(
	overrides: Partial<
		RealtimeEvent<"aiAgentProcessingCompleted">["payload"]
	> = {}
): RealtimeEvent<"aiAgentProcessingCompleted"> {
	return {
		type: "aiAgentProcessingCompleted",
		payload: {
			websiteId: "site-1",
			organizationId: "org-1",
			visitorId: "visitor-1",
			userId: null,
			conversationId: "conv-1",
			aiAgentId: "ai-1",
			workflowRunId: "wf-1",
			status: "success",
			action: "respond",
			reason: null,
			audience: "all",
			...overrides,
		},
	};
}

describe("processing store", () => {
	it("keeps the TTL alive when completion targets a different workflow", () => {
		let scheduledCallback: (() => void) | null = null;
		const timeoutHandle = { id: "timer-1" };
		const clearTimeoutMock = mock((_id: unknown) => {
			scheduledCallback = null;
		});
		const store = createProcessingStore(undefined, {
			now: () => 100,
			setTimeout: (callback) => {
				scheduledCallback = callback;
				return timeoutHandle;
			},
			clearTimeout: clearTimeoutMock,
		});

		store.upsert(createProcessingProgressEntry());
		applyProcessingCompletedEvent(
			store,
			createCompletedEvent({ workflowRunId: "wf-other" })
		);

		expect(store.getState().conversations["conv-1"]).toBeDefined();
		expect(clearTimeoutMock).not.toHaveBeenCalled();

		scheduledCallback?.();
		expect(store.getState().conversations["conv-1"]).toBeUndefined();
	});

	it("keeps the TTL alive when completion targets a different AI agent", () => {
		let scheduledCallback: (() => void) | null = null;
		const timeoutHandle = { id: "timer-2" };
		const clearTimeoutMock = mock((_id: unknown) => {
			scheduledCallback = null;
		});
		const store = createProcessingStore(undefined, {
			now: () => 100,
			setTimeout: (callback) => {
				scheduledCallback = callback;
				return timeoutHandle;
			},
			clearTimeout: clearTimeoutMock,
		});

		store.upsert(createProcessingProgressEntry());
		applyProcessingCompletedEvent(
			store,
			createCompletedEvent({ aiAgentId: "ai-other" })
		);

		expect(store.getState().conversations["conv-1"]).toBeDefined();
		expect(clearTimeoutMock).not.toHaveBeenCalled();

		scheduledCallback?.();
		expect(store.getState().conversations["conv-1"]).toBeUndefined();
	});

	it("clears the active processing entry when completion matches", () => {
		let scheduledCallback: (() => void) | null = null;
		const timeoutHandle = { id: "timer-3" };
		const clearTimeoutMock = mock((_id: unknown) => {
			scheduledCallback = null;
		});
		const store = createProcessingStore(undefined, {
			now: () => 100,
			setTimeout: (callback) => {
				scheduledCallback = callback;
				return timeoutHandle;
			},
			clearTimeout: clearTimeoutMock,
		});

		store.upsert(createProcessingProgressEntry());
		applyProcessingCompletedEvent(store, createCompletedEvent());

		expect(store.getState().conversations["conv-1"]).toBeUndefined();
		expect(clearTimeoutMock).toHaveBeenCalledTimes(1);
		expect(scheduledCallback).toBeNull();
	});
});
