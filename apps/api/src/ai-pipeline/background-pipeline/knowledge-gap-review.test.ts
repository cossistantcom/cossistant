import { beforeEach, describe, expect, it, mock } from "bun:test";
import { ConversationTimelineType } from "@cossistant/types";

const getActiveKnowledgeClarificationForConversationMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<{ id: string } | null>
);
const getConversationTimelineItemsMock = mock(async () => ({
	items: [],
	nextCursor: null,
}));
const createModelMock = mock((modelId: string) => modelId);
const createModelForWebsiteMock = mock(async (modelId: string) => ({
	model: createModelMock(modelId),
	billingSource: "cossistant" as const,
}));
const runWithOpenRouterByokFallbackMock = mock(
	async (params: {
		modelId: string;
		operation: (resolution: {
			model: string;
			billingSource: "cossistant";
		}) => Promise<unknown>;
	}) => ({
		result: await params.operation({
			model: createModelMock(params.modelId),
			billingSource: "cossistant" as const,
		}),
		billingSource: "cossistant" as const,
	})
);
const generateTextMock = mock((async () => ({
	output: {
		action: "skip",
		reason: "No clear KB gap",
		topicSummary: null,
	},
})) as (...args: unknown[]) => Promise<{
	output: {
		action: "create" | "skip";
		reason: string;
		topicSummary: string | null;
	};
}>);
const resolveModelForExecutionMock = mock((modelId: string) => ({
	modelIdResolved: modelId,
}));
const requestKnowledgeClarificationMock = mock(async () => ({
	requestId: "req_1",
	created: true,
	status: "awaiting_answer" as const,
}));

mock.module("@api/db/queries/knowledge-clarification", () => ({
	getActiveKnowledgeClarificationForConversation:
		getActiveKnowledgeClarificationForConversationMock,
}));

mock.module("@api/db/queries/conversation", () => ({
	getConversationTimelineItems: getConversationTimelineItemsMock,
}));

mock.module("@api/lib/ai", () => ({
	createModel: createModelMock,
	createModelForWebsite: createModelForWebsiteMock,
	generateText: generateTextMock,
	runWithOpenRouterByokFallback: runWithOpenRouterByokFallbackMock,
	Output: {
		object: (params: unknown) => params,
	},
}));

mock.module("@api/lib/openrouter-byok/resolver", () => ({
	recordOpenRouterByokFailure: mock(async () => {}),
	recordOpenRouterByokSuccess: mock(async () => {}),
}));

mock.module("@api/lib/ai-credits/config", () => ({
	resolveModelForExecution: resolveModelForExecutionMock,
}));

mock.module("../shared/actions/request-knowledge-clarification", () => ({
	requestKnowledgeClarification: requestKnowledgeClarificationMock,
}));

const modulePromise = import("./knowledge-gap-review");

function createToolTimelineItem(params: {
	workflowRunId: string;
	createdAt: string;
	retrievalQuality: "none" | "weak" | "strong";
	clarificationSignal: "immediate" | "background_review" | "none";
	maxSimilarity: number | null;
}) {
	return {
		type: ConversationTimelineType.TOOL,
		createdAt: params.createdAt,
		visibility: "private",
		parts: [
			{
				toolName: "searchKnowledgeBase",
				state: "result",
				output: {
					data: {
						query: "billing timing",
						questionContext: "When does the billing change apply?",
						totalFound: params.maxSimilarity === null ? 0 : 1,
						maxSimilarity: params.maxSimilarity,
						retrievalQuality: params.retrievalQuality,
						clarificationSignal: params.clarificationSignal,
					},
				},
				providerMetadata: {
					cossistant: {
						toolTimeline: {
							workflowRunId: params.workflowRunId,
							triggerMessageId: "msg-prev",
						},
					},
				},
			},
		],
	} as never;
}

function createParams() {
	return {
		db: {} as never,
		input: {
			conversationId: "conv-1",
			websiteId: "site-1",
			organizationId: "org-1",
			aiAgentId: "ai-1",
			sourceMessageId: "msg-2",
			sourceMessageCreatedAt: "2026-03-13T10:05:00.000Z",
			workflowRunId: "wf-current",
			jobId: "job-1",
		},
		intake: {
			aiAgent: {
				id: "ai-1",
				name: "Agent",
				model: "moonshotai/kimi-k2.5",
				behaviorSettings: {
					canRequestKnowledgeClarification: true,
				},
			},
			conversation: {
				id: "conv-1",
				organizationId: "org-1",
				websiteId: "site-1",
				visitorId: "visitor-1",
			},
			conversationHistory: [
				{
					content: "The billing change happens next cycle.",
					senderType: "human_agent" as const,
					visibility: "public" as const,
				},
			],
			triggerMessage: {
				messageId: "msg-2",
				content: "It should only change on the next invoice.",
				senderType: "human_agent" as const,
				visibility: "public" as const,
				timestamp: "2026-03-13T10:05:00.000Z",
			},
		},
	};
}

describe("runBackgroundKnowledgeGapReview", () => {
	beforeEach(() => {
		getActiveKnowledgeClarificationForConversationMock.mockReset();
		getConversationTimelineItemsMock.mockReset();
		createModelMock.mockReset();
		createModelForWebsiteMock.mockReset();
		runWithOpenRouterByokFallbackMock.mockReset();
		generateTextMock.mockReset();
		resolveModelForExecutionMock.mockReset();
		requestKnowledgeClarificationMock.mockReset();

		getActiveKnowledgeClarificationForConversationMock.mockResolvedValue(null);
		getConversationTimelineItemsMock.mockResolvedValue({
			items: [],
			nextCursor: null,
		});
		createModelForWebsiteMock.mockImplementation(async (modelId: string) => ({
			model: createModelMock(modelId),
			billingSource: "cossistant" as const,
		}));
		runWithOpenRouterByokFallbackMock.mockImplementation(async (params) => ({
			result: await params.operation({
				model: createModelMock(params.modelId),
				billingSource: "cossistant" as const,
			}),
			billingSource: "cossistant" as const,
		}));
		generateTextMock.mockResolvedValue({
			output: {
				action: "skip",
				reason: "No clear KB gap",
				topicSummary: null,
			},
		});
		resolveModelForExecutionMock.mockImplementation((modelId: string) => ({
			modelIdResolved: modelId,
		}));
		requestKnowledgeClarificationMock.mockResolvedValue({
			requestId: "req_1",
			created: true,
			status: "awaiting_answer",
		});
	});

	it("creates a clarification for weak-search teammate-correction cases", async () => {
		getConversationTimelineItemsMock.mockResolvedValueOnce({
			items: [
				createToolTimelineItem({
					workflowRunId: "wf-prev",
					createdAt: "2026-03-13T10:00:00.000Z",
					retrievalQuality: "weak",
					clarificationSignal: "background_review",
					maxSimilarity: 0.61,
				}),
			],
			nextCursor: null,
		});
		generateTextMock.mockResolvedValueOnce({
			output: {
				action: "create",
				reason: "Teammate corrected a weak KB-backed answer.",
				topicSummary: "Clarify when billing changes take effect",
			},
		});

		const { runBackgroundKnowledgeGapReview } = await modulePromise;
		const result = await runBackgroundKnowledgeGapReview(createParams());

		expect(result).toMatchObject({
			status: "created",
			requestId: "req_1",
			topicSummary: "Clarify when billing changes take effect",
		});
		expect(generateTextMock).toHaveBeenCalledTimes(1);
		expect(requestKnowledgeClarificationMock).toHaveBeenCalledWith(
			expect.objectContaining({
				topicSummary: "Clarify when billing changes take effect",
				contextSnapshot: expect.objectContaining({
					sourceTrigger: expect.objectContaining({
						messageId: "msg-2",
						text: "It should only change on the next invoice.",
						senderType: "human_agent",
					}),
					kbSearchEvidence: expect.any(Array),
				}),
			})
		);
	});

	it("skips review when there is no weak search signal and no teammate correction trigger", async () => {
		getConversationTimelineItemsMock.mockResolvedValueOnce({
			items: [
				createToolTimelineItem({
					workflowRunId: "wf-prev",
					createdAt: "2026-03-13T10:00:00.000Z",
					retrievalQuality: "strong",
					clarificationSignal: "none",
					maxSimilarity: 0.82,
				}),
			],
			nextCursor: null,
		});

		const { runBackgroundKnowledgeGapReview } = await modulePromise;
		const result = await runBackgroundKnowledgeGapReview({
			...createParams(),
			intake: {
				...createParams().intake,
				triggerMessage: {
					messageId: "msg-2",
					content: "Thanks",
					senderType: "visitor",
					visibility: "public",
				},
			},
		});

		expect(result).toEqual({
			status: "skipped",
			reason: "no_candidate_gap",
		});
		expect(generateTextMock).not.toHaveBeenCalled();
		expect(requestKnowledgeClarificationMock).not.toHaveBeenCalled();
	});
});
