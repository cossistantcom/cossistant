import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const logAiPipelineMock = mock((_params: unknown) => {});
const runIntakeStepMock = mock((async () => ({
	status: "ready",
	data: {
		aiAgent: { id: "ai-1" },
		modelResolution: {
			modelIdResolved: "moonshotai/kimi-k2.5",
			modelIdOriginal: "moonshotai/kimi-k2.5",
			modelMigrationApplied: false,
		},
		conversation: { id: "conv-1" },
		conversationHistory: [],
		decisionMessages: [],
		generationEntries: [],
		visitorContext: null,
		conversationState: {
			hasHumanAssignee: false,
			assigneeIds: [],
			participantIds: [],
			isEscalated: false,
			escalationReason: null,
		},
		triggerMessageText: "Need help",
		hasLaterHumanMessage: false,
		hasLaterAiMessage: false,
		triggerMessage: {
			messageId: "msg-1",
			senderType: "visitor",
			visibility: "public",
		},
	},
})) as (...args: unknown[]) => Promise<any>);
const runDecisionStepMock = mock((async () => ({
	shouldAct: true,
	reason: "respond",
	mode: "respond_to_visitor",
	humanCommand: null,
	isEscalated: false,
	escalationReason: null,
})) as (...args: unknown[]) => Promise<any>);
const runGenerationRuntimeMock = mock((async () => ({
	status: "completed",
	action: {
		action: "respond",
		reasoning: "ok",
		confidence: 1,
	},
	publicMessagesSent: 1,
	toolCallsByName: {},
	totalToolCalls: 0,
})) as (...args: unknown[]) => Promise<any>);
const maybeCreateImmediateClarificationFromSearchGapMock = mock((async () => ({
	status: "skipped" as const,
	reason: "no_search" as const,
})) as (...args: unknown[]) => Promise<any>);
const createScopeBoundaryRedirectMock = mock((async () => ({
	status: "ready" as const,
	message: "I can help with product or support questions.",
	language: "en",
	modelId: "google/gemini-2.5-flash",
})) as (...args: unknown[]) => Promise<any>);
const sendPublicMessageMock = mock((async () => ({
	messageId: "msg-scope",
	created: true,
	paused: false,
})) as (...args: unknown[]) => Promise<any>);
const baseMinimumCharge = {
	baseCredits: 1,
	modelCredits: 0,
	thinkingCredits: 0,
	toolCredits: 0,
	totalCredits: 1,
	billableToolCount: 0,
	excludedToolCount: 0,
	totalToolCount: 0,
};
const trackGenerationUsageMock = mock(async () => {});
const logGenerationUsageTimelineMock = mock(async () => {});
const emitPipelineSeenMock = mock(async () => {});
const emitPipelineProcessingCompletedMock = mock(async () => {});
const emitPipelineGenerationProgressMock = mock(async () => {});
const emitPipelineToolProgressMock = mock(async () => {});
const emitPipelineTypingStartMock = mock(async () => {});
const emitPipelineTypingStopMock = mock(async () => {});
const typingHeartbeatStartMock = mock(() => {});
const typingHeartbeatStopMock = mock(() => {});

class PipelineTypingHeartbeatMock {
	private isRunning = false;

	async start() {
		if (this.isRunning) {
			return;
		}
		typingHeartbeatStartMock();
		this.isRunning = true;
	}

	async stop() {
		if (!this.isRunning) {
			return;
		}
		typingHeartbeatStopMock();
		this.isRunning = false;
	}

	get running() {
		return this.isRunning;
	}
}

mock.module("../logger", () => ({
	logAiPipeline: logAiPipelineMock,
}));

mock.module("./steps/intake", () => ({
	runIntakeStep: runIntakeStepMock,
}));

mock.module("./steps/decision", () => ({
	runDecisionStep: runDecisionStepMock,
}));

mock.module("../shared/generation", () => ({
	runGenerationRuntime: runGenerationRuntimeMock,
}));

mock.module("./scope-boundary-responder", () => ({
	createScopeBoundaryRedirect: createScopeBoundaryRedirectMock,
}));

mock.module("../shared/actions/send-message", () => ({
	sendMessage: sendPublicMessageMock,
}));

mock.module(
	"../shared/knowledge-gap/post-generation-immediate-clarification",
	() => ({
		maybeCreateImmediateClarificationFromSearchGap:
			maybeCreateImmediateClarificationFromSearchGapMock,
	})
);

mock.module("../shared/usage", () => ({
	trackGenerationUsage: trackGenerationUsageMock,
}));

mock.module("../shared/usage/timeline", () => ({
	logGenerationUsageTimeline: logGenerationUsageTimelineMock,
}));

mock.module("../shared/events", () => ({
	emitPipelineSeen: emitPipelineSeenMock,
	emitPipelineProcessingCompleted: emitPipelineProcessingCompletedMock,
	emitPipelineProcessingCompletedSafely: emitPipelineProcessingCompletedMock,
	emitPipelineGenerationProgress: emitPipelineGenerationProgressMock,
	emitPipelineToolProgress: emitPipelineToolProgressMock,
	emitPipelineTypingStart: emitPipelineTypingStartMock,
	emitPipelineTypingStop: emitPipelineTypingStopMock,
	PipelineTypingHeartbeat: PipelineTypingHeartbeatMock,
}));

const modulePromise = import("./index");

const baseInput = {
	conversationId: "conv-1",
	messageId: "msg-1",
	messageCreatedAt: "2026-03-05T00:00:00.000Z",
	websiteId: "site-1",
	organizationId: "org-1",
	visitorId: "visitor-1",
	aiAgentId: "ai-1",
	workflowRunId: "wf-1",
	jobId: "job-1",
};

describe("runPrimaryPipeline generation error/skip behavior", () => {
	afterAll(() => {
		mock.restore();
	});

	beforeEach(() => {
		logAiPipelineMock.mockClear();
		runIntakeStepMock.mockClear();
		runDecisionStepMock.mockClear();
		runGenerationRuntimeMock.mockClear();
		maybeCreateImmediateClarificationFromSearchGapMock.mockClear();
		createScopeBoundaryRedirectMock.mockClear();
		sendPublicMessageMock.mockClear();
		trackGenerationUsageMock.mockClear();
		logGenerationUsageTimelineMock.mockClear();
		emitPipelineSeenMock.mockClear();
		emitPipelineProcessingCompletedMock.mockClear();
		emitPipelineGenerationProgressMock.mockClear();
		emitPipelineToolProgressMock.mockClear();
		emitPipelineTypingStartMock.mockClear();
		emitPipelineTypingStopMock.mockClear();
		typingHeartbeatStartMock.mockClear();
		typingHeartbeatStopMock.mockClear();

		runIntakeStepMock.mockResolvedValue({
			status: "ready",
			data: {
				aiAgent: { id: "ai-1" },
				modelResolution: {
					modelIdResolved: "moonshotai/kimi-k2.5",
					modelIdOriginal: "moonshotai/kimi-k2.5",
					modelMigrationApplied: false,
				},
				conversation: { id: "conv-1" },
				conversationHistory: [],
				decisionMessages: [],
				generationEntries: [],
				visitorContext: null,
				conversationState: {
					hasHumanAssignee: false,
					assigneeIds: [],
					participantIds: [],
					isEscalated: false,
					escalationReason: null,
				},
				triggerMessageText: "Need help",
				hasLaterHumanMessage: false,
				hasLaterAiMessage: false,
				triggerMessage: {
					messageId: "msg-1",
					senderType: "visitor",
					visibility: "public",
				},
			},
		});
		runDecisionStepMock.mockResolvedValue({
			shouldAct: true,
			reason: "respond",
			mode: "respond_to_visitor",
			humanCommand: null,
			isEscalated: false,
			escalationReason: null,
		});
		runGenerationRuntimeMock.mockResolvedValue({
			status: "completed",
			action: {
				action: "respond",
				reasoning: "ok",
				confidence: 1,
			},
			publicMessagesSent: 1,
			toolCallsByName: {},
			totalToolCalls: 0,
		});
		maybeCreateImmediateClarificationFromSearchGapMock.mockResolvedValue({
			status: "skipped",
			reason: "no_search",
		});
		createScopeBoundaryRedirectMock.mockResolvedValue({
			status: "ready",
			message: "I can help with product or support questions.",
			language: "en",
			modelId: "google/gemini-2.5-flash",
		});
		sendPublicMessageMock.mockResolvedValue({
			messageId: "msg-scope",
			created: true,
			paused: false,
		});
		trackGenerationUsageMock.mockResolvedValue(undefined);
	});

	it("surfaces generation timeout as error (not skip)", async () => {
		runGenerationRuntimeMock.mockResolvedValueOnce({
			status: "error",
			action: {
				action: "skip",
				reasoning: "Generation timed out; retryable failure",
				confidence: 1,
			},
			error: "Generation timed out",
			failureCode: "timeout",
			publicMessagesSent: 0,
			toolCallsByName: {},
			totalToolCalls: 0,
			attempts: [
				{
					modelId: "moonshotai/kimi-k2.5",
					attempt: 1,
					outcome: "timeout",
					durationMs: 45_000,
				},
			],
		});

		const { runPrimaryPipeline } = await modulePromise;
		const result = await runPrimaryPipeline({
			db: {} as never,
			input: baseInput,
		});

		expect(result.status).toBe("error");
		expect(result.retryable).toBe(true);
		expect(emitPipelineProcessingCompletedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "error",
				workflowRunId: "wf-1",
			})
		);

		const primaryLogs = logAiPipelineMock.mock.calls
			.map(
				(call) =>
					call[0] as
						| {
								area?: string;
								event?: string;
								fields?: Record<string, unknown>;
						  }
						| undefined
			)
			.filter(
				(
					entry
				): entry is {
					area?: string;
					event?: string;
					fields?: Record<string, unknown>;
				} => Boolean(entry)
			)
			.filter((entry) => entry.area === "primary");

		expect(
			primaryLogs.some(
				(entry) =>
					entry.event === "generation_error" &&
					entry.fields?.failureCode === "timeout"
			)
		).toBe(true);
		expect(
			primaryLogs.some(
				(entry) =>
					entry.event === "skip" && entry.fields?.stage === "generation"
			)
		).toBe(false);
	});

	it("emits generation skip only for explicit skip action", async () => {
		runGenerationRuntimeMock.mockResolvedValueOnce({
			status: "completed",
			action: {
				action: "skip",
				reasoning: "Explicit no-op",
				confidence: 1,
			},
			publicMessagesSent: 0,
			toolCallsByName: {
				skip: 1,
			},
			totalToolCalls: 1,
		});

		const { runPrimaryPipeline } = await modulePromise;
		const result = await runPrimaryPipeline({
			db: {} as never,
			input: baseInput,
		});

		expect(result.status).toBe("skipped");
		expect(result.reason).toBe("Explicit no-op");
		expect(emitPipelineProcessingCompletedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "skipped",
				workflowRunId: "wf-1",
			})
		);

		const primaryLogs = logAiPipelineMock.mock.calls
			.map(
				(call) =>
					call[0] as
						| {
								area?: string;
								event?: string;
								fields?: Record<string, unknown>;
						  }
						| undefined
			)
			.filter(
				(
					entry
				): entry is {
					area?: string;
					event?: string;
					fields?: Record<string, unknown>;
				} => Boolean(entry)
			)
			.filter((entry) => entry.area === "primary");

		expect(
			primaryLogs.some(
				(entry) =>
					entry.event === "skip" &&
					entry.fields?.stage === "generation" &&
					entry.fields?.reason === "Explicit no-op"
			)
		).toBe(true);
		expect(
			primaryLogs.some((entry) => entry.event === "generation_error")
		).toBe(false);
	});

	it("passes generation credit guard mode to usage tracking", async () => {
		runGenerationRuntimeMock.mockResolvedValueOnce({
			status: "completed",
			action: {
				action: "respond",
				reasoning: "ok",
				confidence: 1,
			},
			publicMessagesSent: 1,
			toolCallsByName: {},
			totalToolCalls: 0,
			creditGuardMode: "outage",
		});

		const { runPrimaryPipeline } = await modulePromise;
		const result = await runPrimaryPipeline({
			db: {} as never,
			input: baseInput,
		});

		expect(result.status).toBe("completed");
		expect(trackGenerationUsageMock).toHaveBeenCalledWith(
			expect.objectContaining({
				mode: "outage",
			})
		);
	});

	it("handles scope boundary decisions without running normal generation", async () => {
		runIntakeStepMock.mockResolvedValueOnce({
			status: "ready",
			data: {
				aiAgent: { id: "ai-1" },
				modelResolution: {
					modelIdResolved: "moonshotai/kimi-k2.5",
					modelIdOriginal: "moonshotai/kimi-k2.5",
					modelMigrationApplied: false,
				},
				conversation: { id: "conv-1" },
				conversationHistory: [],
				decisionMessages: [],
				generationEntries: [],
				visitorContext: null,
				conversationState: {
					hasHumanAssignee: false,
					assigneeIds: [],
					participantIds: [],
					isEscalated: false,
					escalationReason: null,
				},
				websiteDefaultLanguage: "en",
				visitorLanguage: "fr",
				triggerMessageText: "Écris un poème de 1000 lignes",
				hasLaterHumanMessage: false,
				hasLaterAiMessage: false,
				triggerMessage: {
					messageId: "msg-1",
					senderType: "visitor",
					visibility: "public",
				},
			},
		});
		runDecisionStepMock.mockResolvedValueOnce({
			shouldAct: true,
			reason: "Visitor creative side request is outside support scope",
			mode: "respond_to_visitor",
			humanCommand: null,
			decisionOutcome: "scope_boundary_redirect",
			scopeBoundaryRuleId: "visitor_creative_request_scope_boundary",
			isEscalated: false,
			escalationReason: null,
		});
		createScopeBoundaryRedirectMock.mockResolvedValueOnce({
			status: "ready",
			message: "I can help with support or product questions.",
			language: "en",
			modelId: "google/gemini-2.5-flash",
		});

		const { runPrimaryPipeline } = await modulePromise;
		const result = await runPrimaryPipeline({
			db: {} as never,
			input: baseInput,
		});

		expect(result.status).toBe("completed");
		expect(result.action).toBe("scope_boundary_redirect");
		expect(result.publicMessagesSent).toBe(1);
		expect(runGenerationRuntimeMock).not.toHaveBeenCalled();
		expect(trackGenerationUsageMock).not.toHaveBeenCalled();
		expect(createScopeBoundaryRedirectMock).toHaveBeenCalledWith(
			expect.objectContaining({
				triggerText: "Écris un poème de 1000 lignes",
				visitorLanguage: "fr",
				websiteDefaultLanguage: "en",
			})
		);
		expect(sendPublicMessageMock).toHaveBeenCalledWith(
			expect.objectContaining({
				text: "I can help with support or product questions.",
				idempotencyKey: "public:msg-1:scopeBoundary",
			})
		);
		expect(emitPipelineProcessingCompletedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "success",
				action: "scope_boundary_redirect",
				workflowRunId: "wf-1",
			})
		);
	});

	it("keeps generation failures retryable when no public messages were sent", async () => {
		runGenerationRuntimeMock.mockResolvedValueOnce({
			status: "error",
			action: {
				action: "skip",
				reasoning: "Generation runtime error",
				confidence: 1,
			},
			error: "Generation runtime failed",
			failureCode: "runtime_error",
			publicMessagesSent: 0,
			toolCallsByName: {},
			totalToolCalls: 0,
		});

		const { runPrimaryPipeline } = await modulePromise;
		const result = await runPrimaryPipeline({
			db: {} as never,
			input: baseInput,
		});

		expect(result.status).toBe("error");
		expect(result.retryable).toBe(true);
	});

	it("advances the cursor after generation errors that happen after durable mutations", async () => {
		runGenerationRuntimeMock.mockResolvedValueOnce({
			status: "error",
			action: {
				action: "skip",
				reasoning: "Escalation confirmation failed after mutation",
				confidence: 1,
			},
			error: "Escalation confirmation failed after mutation",
			failureCode: "runtime_error",
			publicMessagesSent: 0,
			toolCallsByName: {
				escalate: 1,
			},
			mutationToolCallsByName: {
				escalate: 1,
			},
			totalToolCalls: 1,
		});

		const { runPrimaryPipeline } = await modulePromise;
		const result = await runPrimaryPipeline({
			db: {} as never,
			input: baseInput,
		});

		expect(result.status).toBe("error");
		expect(result.retryable).toBe(false);
		expect(result.cursorDisposition).toBe("advance");
	});

	it("starts the typing heartbeat for public runs and stops it once before send cleanup", async () => {
		runGenerationRuntimeMock.mockImplementationOnce(async (input) => {
			const runtimeInput = input as {
				startTyping?: unknown;
				stopTyping?: () => Promise<void>;
			};

			expect(runtimeInput.startTyping).toBeUndefined();
			expect(typeof runtimeInput.stopTyping).toBe("function");

			await runtimeInput.stopTyping?.();

			return {
				status: "completed",
				action: {
					action: "respond",
					reasoning: "ok",
					confidence: 1,
				},
				publicMessagesSent: 1,
				toolCallsByName: {
					sendMessage: 1,
					respond: 1,
				},
				totalToolCalls: 2,
			};
		});

		const { runPrimaryPipeline } = await modulePromise;
		const result = await runPrimaryPipeline({
			db: {} as never,
			input: baseInput,
		});

		expect(result.status).toBe("completed");
		expect(typingHeartbeatStartMock).toHaveBeenCalledTimes(1);
		expect(typingHeartbeatStopMock).toHaveBeenCalledTimes(1);
		expect(emitPipelineTypingStopMock).not.toHaveBeenCalled();
		expect(emitPipelineProcessingCompletedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "success",
				action: "respond",
				workflowRunId: "wf-1",
			})
		);
	});

	it("passes split context fields into decision and generation runtime", async () => {
		runIntakeStepMock.mockResolvedValueOnce({
			status: "ready",
			data: {
				aiAgent: { id: "ai-1" },
				modelResolution: {
					modelIdResolved: "moonshotai/kimi-k2.5",
					modelIdOriginal: "moonshotai/kimi-k2.5",
					modelMigrationApplied: false,
				},
				conversation: { id: "conv-1" },
				conversationHistory: [],
				decisionMessages: [
					{
						messageId: "msg-0",
						content: "Original issue",
						senderType: "visitor",
						senderId: "visitor-1",
						senderName: null,
						timestamp: "2026-03-04T23:59:00.000Z",
						visibility: "public",
						segment: "before_trigger",
					},
					{
						messageId: "msg-1",
						content: "Any update?",
						senderType: "visitor",
						senderId: "visitor-1",
						senderName: null,
						timestamp: "2026-03-05T00:00:00.000Z",
						visibility: "public",
						segment: "trigger",
					},
					{
						messageId: "msg-2",
						content: "I already asked for the visitor's order number.",
						senderType: "human_agent",
						senderId: "user-1",
						senderName: "Support Agent",
						timestamp: "2026-03-05T00:00:30.000Z",
						visibility: "public",
						segment: "after_trigger",
					},
				],
				generationEntries: [
					{
						messageId: "msg-0",
						content: "Original issue",
						senderType: "visitor",
						senderId: "visitor-1",
						senderName: null,
						timestamp: "2026-03-04T23:59:00.000Z",
						visibility: "public",
						segment: "before_trigger",
					},
					{
						messageId: "msg-1",
						content: "Any update?",
						senderType: "visitor",
						senderId: "visitor-1",
						senderName: null,
						timestamp: "2026-03-05T00:00:00.000Z",
						visibility: "public",
						segment: "trigger",
					},
					{
						kind: "tool",
						itemId: "tool-1",
						toolName: "searchKnowledgeBase",
						content:
							'[PRIVATE][TOOL:searchKnowledgeBase] Found 1 source query="order number"',
						timestamp: "2026-03-05T00:00:20.000Z",
						visibility: "private",
						segment: "after_trigger",
					},
					{
						messageId: "msg-2",
						content: "I already asked for the visitor's order number.",
						senderType: "human_agent",
						senderId: "user-1",
						senderName: "Support Agent",
						timestamp: "2026-03-05T00:00:30.000Z",
						visibility: "public",
						segment: "after_trigger",
					},
				],
				visitorContext: null,
				conversationState: {
					hasHumanAssignee: false,
					assigneeIds: [],
					participantIds: [],
					isEscalated: false,
					escalationReason: null,
				},
				triggerMessageText: "Any update?",
				hasLaterHumanMessage: true,
				hasLaterAiMessage: false,
				triggerMessage: {
					messageId: "msg-1",
					senderType: "visitor",
					visibility: "public",
				},
			},
		});

		const { runPrimaryPipeline } = await modulePromise;
		const result = await runPrimaryPipeline({
			db: {} as never,
			input: baseInput,
		});

		expect(result.status).toBe("completed");
		expect(runDecisionStepMock).toHaveBeenCalledWith(
			expect.objectContaining({
				input: expect.objectContaining({
					decisionMessages: expect.arrayContaining([
						expect.objectContaining({
							messageId: "msg-2",
							segment: "after_trigger",
						}),
					]),
					hasLaterHumanMessage: true,
					hasLaterAiMessage: false,
				}),
			})
		);
		expect(runGenerationRuntimeMock).toHaveBeenCalledWith(
			expect.objectContaining({
				generationEntries: expect.arrayContaining([
					expect.objectContaining({
						toolName: "searchKnowledgeBase",
						segment: "after_trigger",
					}),
				]),
				hasLaterHumanMessage: true,
				hasLaterAiMessage: false,
			})
		);
	});

	it("skips generation when the AI credit guard blocks the run", async () => {
		const blockedGuardResult = {
			allowed: false,
			mode: "normal",
			reason: "Insufficient AI credits (required=1, balance=0)",
			blockedReason: "insufficient_credits",
			minimumCharge: baseMinimumCharge,
			balance: 0,
			meterBacked: true,
			meterSource: "polar",
			lastSyncedAt: "2026-03-05T00:00:00.000Z",
		};
		runGenerationRuntimeMock.mockResolvedValueOnce({
			status: "blocked",
			action: {
				action: "skip",
				reasoning: blockedGuardResult.reason,
				confidence: 1,
			},
			publicMessagesSent: 0,
			toolCallsByName: {},
			totalToolCalls: 0,
			billingSource: "cossistant",
			creditGuard: blockedGuardResult,
			creditGuardMode: "normal",
		});

		const { runPrimaryPipeline } = await modulePromise;
		const result = await runPrimaryPipeline({
			db: {} as never,
			input: baseInput,
		});

		expect(result.status).toBe("skipped");
		expect(result.action).toBe("ai_credit_guard_blocked");
		expect(runGenerationRuntimeMock).toHaveBeenCalledTimes(1);
		expect(trackGenerationUsageMock).not.toHaveBeenCalled();
		expect(logGenerationUsageTimelineMock).toHaveBeenCalledWith(
			expect.objectContaining({
				payload: expect.objectContaining({
					blockedReason: "insufficient_credits",
					totalCredits: 1,
				}),
			})
		);
		expect(emitPipelineProcessingCompletedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "skipped",
				reason: "Insufficient AI credits (required=1, balance=0)",
			})
		);
	});
});
