import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { PipelineToolContext } from "./contracts";

const escalateActionMock = mock((async () => {}) as (
	...args: unknown[]
) => Promise<void>);
const sendPublicMessageMock = mock((async () => ({
	messageId: "msg-1",
	created: true,
	paused: false,
})) as (...args: unknown[]) => Promise<{
	messageId: string;
	created: boolean;
	paused: boolean;
}>);

mock.module("../actions/escalate", () => ({
	escalate: escalateActionMock,
}));

mock.module("../actions/send-message", () => ({
	sendMessage: sendPublicMessageMock,
}));

mock.module("../actions/update-status", () => ({
	updateStatus: mock(async () => {}),
}));

const modulePromise = import("./finish");

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
		websiteDefaultLanguage: "en",
		visitorLanguage: "en",
		workflowRunId: "wf-1",
		triggerMessageId: "trigger-1",
		allowPublicMessages: true,
		pipelineKind: "primary",
		mode: "respond_to_visitor",
		isEscalated: false,
		canCategorize: false,
		canRequestKnowledgeClarification: true,
		availableViews: [],
		stopTyping: mock(async () => {}),
		debugLogger: {
			log: mock(() => {}),
			warn: mock(() => {}),
			error: mock(() => {}),
		},
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

describe("createEscalateTool", () => {
	beforeEach(() => {
		escalateActionMock.mockReset();
		sendPublicMessageMock.mockReset();
		escalateActionMock.mockResolvedValue(undefined);
		sendPublicMessageMock.mockResolvedValue({
			messageId: "msg-1",
			created: true,
			paused: false,
		});
	});

	it("sends the model-provided handoff after escalating and records the public send", async () => {
		const { createEscalateTool } = await modulePromise;
		const ctx = createContext();
		const escalate = createEscalateTool(ctx);
		const visitorMessage =
			"I can't safely finish this from the information I have, so I'm bringing a teammate into the conversation.";

		if (!escalate.execute) {
			throw new Error("Expected execute handler for escalate");
		}

		const result = await resolveToolResult(
			await escalate.execute(
				{
					reason: "Visitor requested a human",
					visitorMessage,
					reasoning: "Need a teammate",
					confidence: 1,
				} as never,
				{} as never
			)
		);

		expect(result.success).toBe(true);
		expect(result.data).toEqual({
			action: "escalate",
			changed: true,
		});
		expect(escalateActionMock).toHaveBeenCalledWith(
			expect.objectContaining({
				reason: "Visitor requested a human",
				visitorMessage: null,
			})
		);
		expect(sendPublicMessageMock).toHaveBeenCalledWith(
			expect.objectContaining({
				text: visitorMessage,
				idempotencyKey: "public:trigger-1:escalate",
			})
		);
		expect(ctx.runtimeState.publicMessagesSent).toBe(1);
		expect(ctx.runtimeState.publicSendSequence).toBe(1);
		expect(ctx.runtimeState.sentPublicMessageIds.has("msg-1")).toBe(true);
		expect(ctx.runtimeState.publicReplyTexts).toEqual([visitorMessage]);
		expect(ctx.runtimeState.finalAction?.action).toBe("escalate");
	});

	it("stays successful when the handoff message fails after escalation", async () => {
		const { createEscalateTool } = await modulePromise;
		const ctx = createContext();
		const escalate = createEscalateTool(ctx);

		if (!escalate.execute) {
			throw new Error("Expected execute handler for escalate");
		}

		sendPublicMessageMock.mockRejectedValueOnce(
			new Error("Failed to send confirmation")
		);

		const result = await resolveToolResult(
			await escalate.execute(
				{
					reason: "Visitor requested a human",
					visitorMessage:
						"I'm looping in a teammate so we can handle this properly.",
					reasoning: "Need a teammate",
					confidence: 1,
				} as never,
				{} as never
			)
		);

		expect(result.success).toBe(true);
		expect(result.data).toEqual({
			action: "escalate",
			changed: true,
		});
		expect(escalateActionMock).toHaveBeenCalledTimes(1);
		expect(ctx.runtimeState.publicMessagesSent).toBe(0);
		expect(ctx.runtimeState.finalAction?.action).toBe("escalate");
	});

	it("rejects oversized escalation handoffs before mutating the conversation", async () => {
		const { createEscalateTool } = await modulePromise;
		const ctx = createContext();
		const escalate = createEscalateTool(ctx);

		if (!escalate.execute) {
			throw new Error("Expected execute handler for escalate");
		}

		const result = await resolveToolResult(
			await escalate.execute(
				{
					reason: "Visitor requested a human",
					visitorMessage: "x".repeat(1201),
					reasoning: "Need a teammate",
					confidence: 1,
				} as never,
				{} as never
			)
		);

		expect(result.success).toBe(false);
		expect(result.error).toBe("Message must be 1200 characters or fewer");
		expect(escalateActionMock).not.toHaveBeenCalled();
		expect(sendPublicMessageMock).not.toHaveBeenCalled();
		expect(ctx.runtimeState.finalAction).toBeNull();
	});
});
