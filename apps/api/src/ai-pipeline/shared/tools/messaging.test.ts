import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { PipelineToolContext } from "./contracts";

const sendPublicMessageMock = mock((async () => ({
	messageId: "msg-1",
	created: true,
	paused: false,
})) as (...args: unknown[]) => Promise<{
	messageId: string;
	created: boolean;
	paused: boolean;
}>);

const addInternalNoteMock = mock((async () => ({
	noteId: "note-1",
	created: true,
})) as (...args: unknown[]) => Promise<{ noteId: string; created: boolean }>);

mock.module("../actions/send-message", () => ({
	sendMessage: sendPublicMessageMock,
}));

mock.module("../actions/internal-note", () => ({
	addInternalNote: addInternalNoteMock,
}));

const modulePromise = import("./messaging");
const originalSetTimeout = globalThis.setTimeout;
const setTimeoutMock = mock((handler: TimerHandler, _delay?: number) => {
	if (typeof handler === "function") {
		handler();
	}
	return {
		unref() {
			return this;
		},
		ref() {
			return this;
		},
	} as never;
});

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
	return (
		typeof value === "object" && value !== null && Symbol.asyncIterator in value
	);
}

async function resolveToolResult<T>(value: T | AsyncIterable<T>): Promise<T> {
	if (!isAsyncIterable<T>(value)) {
		return value;
	}

	for await (const chunk of value) {
		return chunk;
	}

	throw new Error("Tool returned an empty async iterable");
}

function createContext(): PipelineToolContext {
	return {
		db: {} as never,
		conversation: {
			id: "conv-1",
			organizationId: "org-1",
			websiteId: "site-1",
			visitorId: "visitor-1",
		} as never,
		conversationId: "conv-1",
		organizationId: "org-1",
		websiteId: "site-1",
		visitorId: "visitor-1",
		aiAgentId: "ai-1",
		aiAgentName: "Agent",
		visitorName: "Visitor",
		workflowRunId: "wf-1",
		triggerMessageId: "trigger-1",
		allowPublicMessages: true,
		pipelineKind: "primary",
		mode: "respond_to_visitor",
		isEscalated: false,
		canCategorize: false,
		canRequestKnowledgeClarification: true,
		availableViews: [],
		runtimeState: {
			finalAction: null,
			publicMessagesSent: 0,
			toolCallCounts: {},
			successfulToolCallCounts: {},
			failedToolCallCounts: {},
			chargeableToolCallCounts: {},
			mutationToolCallCounts: {},
			toolExecutions: [],
			immediateKnowledgeGapClarificationHandled: false,
			publicSendSequence: 0,
			privateSendSequence: 0,
			sentPublicMessageIds: new Set<string>(),
			lastToolError: null,
		},
	};
}

describe("sendMessage tool contract", () => {
	beforeEach(() => {
		sendPublicMessageMock.mockReset();
		addInternalNoteMock.mockReset();
		setTimeoutMock.mockClear();
		globalThis.setTimeout =
			setTimeoutMock as unknown as typeof globalThis.setTimeout;
		sendPublicMessageMock.mockResolvedValue({
			messageId: "msg-1",
			created: true,
			paused: false,
		});
	});

	afterEach(() => {
		globalThis.setTimeout = originalSetTimeout;
	});

	it("allows up to three public sends and rejects the fourth", async () => {
		const { createSendMessageTool } = await modulePromise;
		const ctx = createContext();
		const sendMessage = createSendMessageTool(ctx);

		if (!sendMessage.execute) {
			throw new Error("Expected execute handler for sendMessage");
		}

		sendPublicMessageMock
			.mockResolvedValueOnce({
				messageId: "msg-1",
				created: true,
				paused: false,
			})
			.mockResolvedValueOnce({
				messageId: "msg-2",
				created: true,
				paused: false,
			})
			.mockResolvedValueOnce({
				messageId: "msg-3",
				created: true,
				paused: false,
			});

		const first = await resolveToolResult(
			await sendMessage.execute(
				{ message: "First bubble" } as never,
				{} as never
			)
		);
		const second = await resolveToolResult(
			await sendMessage.execute(
				{ message: "Second bubble" } as never,
				{} as never
			)
		);
		const third = await resolveToolResult(
			await sendMessage.execute(
				{ message: "Third bubble" } as never,
				{} as never
			)
		);
		const fourth = await resolveToolResult(
			await sendMessage.execute(
				{ message: "Fourth bubble" } as never,
				{} as never
			)
		);

		expect(first.success).toBe(true);
		expect(second.success).toBe(true);
		expect(third.success).toBe(true);
		expect(fourth.success).toBe(false);
		expect(fourth.error).toContain("at most 3 times");
		expect(ctx.runtimeState.publicMessagesSent).toBe(3);
		expect(ctx.runtimeState.publicSendSequence).toBe(3);
		expect(ctx.runtimeState.publicReplyTexts).toEqual([
			"First bubble",
			"Second bubble",
			"Third bubble",
		]);
		expect(sendPublicMessageMock).toHaveBeenCalledTimes(3);
	});

	it("inserts a natural delay before the second and third sends", async () => {
		const { createSendMessageTool } = await modulePromise;
		const ctx = createContext();
		const sendMessage = createSendMessageTool(ctx);

		if (!sendMessage.execute) {
			throw new Error("Expected execute handler for sendMessage");
		}

		sendPublicMessageMock
			.mockResolvedValueOnce({
				messageId: "msg-1",
				created: true,
				paused: false,
			})
			.mockResolvedValueOnce({
				messageId: "msg-2",
				created: true,
				paused: false,
			})
			.mockResolvedValueOnce({
				messageId: "msg-3",
				created: true,
				paused: false,
			});

		await resolveToolResult(
			await sendMessage.execute(
				{ message: "First bubble" } as never,
				{} as never
			)
		);
		await resolveToolResult(
			await sendMessage.execute(
				{ message: "Second bubble" } as never,
				{} as never
			)
		);
		await resolveToolResult(
			await sendMessage.execute(
				{ message: "Third bubble" } as never,
				{} as never
			)
		);

		expect(setTimeoutMock.mock.calls.map((call) => call[1])).toEqual([
			900, 900,
		]);
	});

	it("does not advance the public send sequence on a paused send", async () => {
		const { createSendMessageTool } = await modulePromise;
		const ctx = createContext();
		const sendMessage = createSendMessageTool(ctx);

		if (!sendMessage.execute) {
			throw new Error("Expected execute handler for sendMessage");
		}

		sendPublicMessageMock.mockResolvedValueOnce({
			messageId: "msg-paused",
			created: false,
			paused: true,
		});

		const result = await resolveToolResult(
			await sendMessage.execute({ message: "First try" } as never, {} as never)
		);

		expect(result.success).toBe(false);
		expect(ctx.runtimeState.publicMessagesSent).toBe(0);
		expect(ctx.runtimeState.publicSendSequence).toBe(0);
	});

	it("stops typing before a public send", async () => {
		const { createSendMessageTool } = await modulePromise;
		const stopTypingMock = mock(async () => {});
		const ctx = createContext();
		ctx.stopTyping = stopTypingMock;
		const sendMessage = createSendMessageTool(ctx);

		if (!sendMessage.execute) {
			throw new Error("Expected execute handler for sendMessage");
		}

		const result = await resolveToolResult(
			await sendMessage.execute({ message: "Answer" } as never, {} as never)
		);

		expect(result.success).toBe(true);
		expect(stopTypingMock).toHaveBeenCalledTimes(1);
	});
});
