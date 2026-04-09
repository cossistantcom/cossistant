import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { zodSchema } from "ai";
import {
	sharedCalculateAiCreditChargeMock as calculateAiCreditChargeMock,
	sharedCreateTimelineItemMock as createTimelineItemMock,
	sharedGetMinimumAiCreditChargeMock as getMinimumAiCreditChargeMock,
	sharedResolveClarificationModelForExecutionMock as resolveClarificationModelForExecutionMock,
	sharedUpdateTimelineItemMock as updateTimelineItemMock,
} from "../test-support/shared-module-mocks";

const getAiAgentForWebsiteMock = mock(async () => null);
const getConversationByIdMock = mock(async () => null);
const getConversationTimelineItemsMock = mock(async () => ({ items: [] }));
const getConversationTimelineItemsAfterCursorMock = mock(async () => ({
	items: [],
	nextCursor: null,
}));
const createKnowledgeClarificationRequestMock = mock(async () => null);
const createKnowledgeClarificationSignalMock = mock(async () => null);
const getActiveKnowledgeClarificationForConversationMock = mock(
	async () => null
);
const getActiveKnowledgeClarificationAssociationForConversationMock = mock(
	async () => null
);
const getLatestKnowledgeClarificationForConversationBySourceTriggerMessageIdMock =
	mock(async () => null);
const getJoinableKnowledgeClarificationByTargetKnowledgeIdMock = mock(
	async () => null
);
const getJoinableKnowledgeClarificationByTopicFingerprintMock = mock(
	async () => null
);
const listJoinableKnowledgeClarificationRequestsMissingTopicEmbeddingsMock =
	mock(async () => []);
const listJoinableKnowledgeClarificationVectorMatchesMock = mock(
	async () => []
);
const listKnowledgeClarificationSignalsMock = mock(async () => []);
const listKnowledgeClarificationTurnsMock = mock(async () => []);
const updateKnowledgeClarificationRequestMock = mock(async () => null);
const createKnowledgeClarificationTurnMock = mock(async () => null);
const getKnowledgeClarificationRequestByIdMock = mock(async () => null);
const listKnowledgeClarificationProposalsMock = mock(async () => []);
const getKnowledgeByIdMock = mock(async () => null);
const createKnowledgeMock = mock(async () => null);
const getKnowledgeCountByTypeMock = mock(async () => 0);
const getTotalKnowledgeSizeBytesMock = mock(async () => 0);
const updateKnowledgeMock = mock(async () => null);
const createStructuredOutputModelMock = mock((modelId: string) => ({
	modelId,
}));
const createModelMock = mock((modelId: string) => modelId);
const generateTextMock = mock((async () => ({
	output: null,
	usage: undefined,
})) as (...args: unknown[]) => Promise<unknown>);
const generateEmbeddingMock = mock(async () => new Array(1536).fill(0));
const generateEmbeddingsMock = mock(async (values: string[]) =>
	values.map(() => new Array(1536).fill(0))
);
const streamTextMock = mock((options: unknown) => {
	const resultPromise = Promise.resolve(generateTextMock(options)).then(
		(result) => result as { output?: unknown; usage?: unknown }
	);

	return {
		output: resultPromise.then((result) => result.output ?? null),
		totalUsage: resultPromise.then((result) => result.usage),
	};
});
const outputObjectMock = mock((value: unknown) => value);
class RetryableMockError extends Error {
	static isInstance(error: unknown): error is RetryableMockError {
		return error instanceof RetryableMockError;
	}
}
class APICallErrorMock extends RetryableMockError {}
class EmptyResponseBodyErrorMock extends RetryableMockError {}
class NoContentGeneratedErrorMock extends RetryableMockError {}
class NoObjectGeneratedErrorMock extends RetryableMockError {}
class NoOutputGeneratedErrorMock extends RetryableMockError {}
class NoSuchModelErrorMock extends RetryableMockError {}
const realtimeEmitMock = mock(async () => {});
const ingestAiCreditUsageMock = mock(async () => ({
	status: "ingested" as const,
}));
const ulidMock = mock(() => "usage_evt_1");

mock.module("@api/db/queries/ai-agent", () => ({
	getAiAgentForWebsite: getAiAgentForWebsiteMock,
}));

mock.module("@api/db/queries/conversation", () => ({
	getConversationById: getConversationByIdMock,
	getConversationTimelineItems: getConversationTimelineItemsMock,
	getConversationTimelineItemsAfterCursor:
		getConversationTimelineItemsAfterCursorMock,
}));

mock.module("@api/db/queries/knowledge-clarification", () => ({
	ACTIVE_CONVERSATION_STATUSES: [
		"analyzing",
		"awaiting_answer",
		"retry_required",
		"draft_ready",
	],
	PROPOSAL_STATUSES: [
		"analyzing",
		"awaiting_answer",
		"retry_required",
		"deferred",
		"draft_ready",
	],
	REUSABLE_CONVERSATION_TOPIC_FINGERPRINT_STATUSES: [
		"analyzing",
		"awaiting_answer",
		"retry_required",
		"deferred",
		"draft_ready",
	],
	createKnowledgeClarificationRequest: createKnowledgeClarificationRequestMock,
	createKnowledgeClarificationSignal: createKnowledgeClarificationSignalMock,
	createKnowledgeClarificationTurn: createKnowledgeClarificationTurnMock,
	getActiveKnowledgeClarificationAssociationForConversation:
		getActiveKnowledgeClarificationAssociationForConversationMock,
	getActiveKnowledgeClarificationForConversation:
		getActiveKnowledgeClarificationForConversationMock,
	getLatestKnowledgeClarificationForConversationBySourceTriggerMessageId:
		getLatestKnowledgeClarificationForConversationBySourceTriggerMessageIdMock,
	getJoinableKnowledgeClarificationByTargetKnowledgeId:
		getJoinableKnowledgeClarificationByTargetKnowledgeIdMock,
	getJoinableKnowledgeClarificationByTopicFingerprint:
		getJoinableKnowledgeClarificationByTopicFingerprintMock,
	getKnowledgeClarificationRequestById:
		getKnowledgeClarificationRequestByIdMock,
	listJoinableKnowledgeClarificationRequestsMissingTopicEmbeddings:
		listJoinableKnowledgeClarificationRequestsMissingTopicEmbeddingsMock,
	listJoinableKnowledgeClarificationVectorMatches:
		listJoinableKnowledgeClarificationVectorMatchesMock,
	listKnowledgeClarificationProposals: listKnowledgeClarificationProposalsMock,
	listKnowledgeClarificationSignals: listKnowledgeClarificationSignalsMock,
	listKnowledgeClarificationTurns: listKnowledgeClarificationTurnsMock,
	updateKnowledgeClarificationRequest: updateKnowledgeClarificationRequestMock,
}));

mock.module("@api/db/queries/knowledge", () => ({
	createKnowledge: createKnowledgeMock,
	getKnowledgeById: getKnowledgeByIdMock,
	getKnowledgeCountByType: getKnowledgeCountByTypeMock,
	getTotalKnowledgeSizeBytes: getTotalKnowledgeSizeBytesMock,
	updateKnowledge: updateKnowledgeMock,
}));

mock.module("@api/lib/ai", () => ({
	APICallError: APICallErrorMock,
	createModel: createModelMock,
	createStructuredOutputModel: createStructuredOutputModelMock,
	EmptyResponseBodyError: EmptyResponseBodyErrorMock,
	generateEmbedding: generateEmbeddingMock,
	generateEmbeddings: generateEmbeddingsMock,
	generateText: generateTextMock,
	NoContentGeneratedError: NoContentGeneratedErrorMock,
	NoObjectGeneratedError: NoObjectGeneratedErrorMock,
	NoOutputGeneratedError: NoOutputGeneratedErrorMock,
	NoSuchModelError: NoSuchModelErrorMock,
	Output: {
		object: outputObjectMock,
	},
	streamText: streamTextMock,
}));

mock.module("@api/lib/ai-credits/config", () => ({
	calculateAiCreditCharge: calculateAiCreditChargeMock,
	getMinimumAiCreditCharge: getMinimumAiCreditChargeMock,
	resolveClarificationModelForExecution:
		resolveClarificationModelForExecutionMock,
	resolveModelForExecution: resolveClarificationModelForExecutionMock,
}));

mock.module("@api/realtime/emitter", () => ({
	realtime: {
		emit: realtimeEmitMock,
	},
}));

mock.module("@api/lib/ai-credits/polar-meter", () => ({
	ingestAiCreditUsage: ingestAiCreditUsageMock,
}));

mock.module("@api/utils/timeline-item", () => ({
	createTimelineItem: createTimelineItemMock,
	updateTimelineItem: updateTimelineItemMock,
}));

mock.module("ulid", () => ({
	ulid: ulidMock,
}));

const modulePromise = import("./knowledge-clarification");

function createContextSnapshot(overrides: Record<string, unknown> = {}) {
	return {
		sourceTrigger: {
			messageId: "msg_1",
			text: "When does the billing change take effect?",
			senderType: "visitor",
			visibility: "public",
			createdAt: "2026-03-13T09:55:00.000Z",
		},
		relevantTranscript: [
			{
				messageId: "msg_1",
				content: "When does the billing change take effect?",
				senderType: "visitor",
				visibility: "public",
				timestamp: "2026-03-13T09:55:00.000Z",
			},
			{
				messageId: "msg_2",
				content: "I think it should wait until the next invoice.",
				senderType: "human_agent",
				visibility: "public",
				timestamp: "2026-03-13T09:56:00.000Z",
			},
		],
		kbSearchEvidence: [],
		linkedFaq: null,
		...overrides,
	} as never;
}

function createAiAgent(overrides: Record<string, unknown> = {}) {
	return {
		id: "agent_1",
		organizationId: "org_1",
		websiteId: "site_1",
		name: "Support Agent",
		model: "moonshotai/kimi-k2-0905",
		basePrompt: "You are helpful.",
		temperature: 0.4,
		maxOutputTokens: 1200,
		behaviorSettings: {},
		...overrides,
	} as never;
}

function createConversation(overrides: Record<string, unknown> = {}) {
	return {
		id: "conv_1",
		organizationId: "org_1",
		websiteId: "site_1",
		visitorId: "visitor_1",
		...overrides,
	} as never;
}

function createRequest(overrides: Record<string, unknown> = {}) {
	return {
		id: "clar_req_1",
		organizationId: "org_1",
		websiteId: "site_1",
		aiAgentId: "agent_1",
		conversationId: "conv_1",
		source: "conversation",
		status: "awaiting_answer",
		topicSummary: "Clarify billing timing",
		sourceTriggerMessageId: "msg_1",
		topicFingerprint: "topic_fp_1",
		stepIndex: 1,
		maxSteps: 3,
		contextSnapshot: createContextSnapshot(),
		targetKnowledgeId: null,
		questionPlan: null,
		draftFaqPayload: null,
		currentQuestionInputMode: "suggested_answers",
		currentQuestionScope: "narrow_detail",
		lastError: null,
		createdAt: "2026-03-13T10:00:00.000Z",
		updatedAt: "2026-03-13T10:00:00.000Z",
		...overrides,
	} as never;
}

function createAnalyzingRequest(overrides: Record<string, unknown> = {}) {
	return createRequest({
		status: "analyzing",
		stepIndex: 1,
		...overrides,
	});
}

function createDraftReadyRequest(overrides: Record<string, unknown> = {}) {
	return createRequest({
		status: "draft_ready",
		stepIndex: 1,
		draftFaqPayload: createDraftOutput().draftFaqPayload,
		...overrides,
	});
}

function createTurn(overrides: Record<string, unknown> = {}) {
	return {
		id: "turn_1",
		requestId: "clar_req_1",
		role: "ai_question",
		question: "When does the billing change take effect?",
		suggestedAnswers: [
			"Immediately",
			"At the next billing cycle",
			"It depends on the plan",
		],
		selectedAnswer: null,
		freeAnswer: null,
		createdAt: "2026-03-13T10:00:00.000Z",
		updatedAt: "2026-03-13T10:00:00.000Z",
		...overrides,
	} as never;
}

function createPlannedQuestion(overrides: Record<string, unknown> = {}) {
	return {
		id: "plan_q_1",
		question: "When does the billing change take effect?",
		suggestedAnswers: [
			"Immediately",
			"At the next billing cycle",
			"It depends on the plan",
		],
		inputMode: "suggested_answers",
		questionScope: "narrow_detail",
		missingFact: "When the billing change takes effect",
		whyItMatters: "That determines the FAQ timing answer.",
		...overrides,
	} as const;
}

function createQuestionOutput(overrides: Record<string, unknown> = {}) {
	const {
		id = "plan_q_1",
		question = "Should the change wait for the next billing cycle?",
		suggestedAnswers = [
			"Yes, always",
			"No, it is immediate",
			"It depends on the plan",
		],
		inputMode = "suggested_answers",
		questionScope = "narrow_detail",
		missingFact = "Whether the billing change always waits for the next billing cycle",
		whyItMatters = "That determines how the FAQ should describe timing.",
		topicSummary = "Clarify billing timing",
		...rest
	} = overrides;

	return {
		kind: "question",
		topicSummary,
		missingFact,
		whyItMatters,
		questionPlan: [
			{
				id,
				question,
				suggestedAnswers,
				inputMode,
				questionScope,
				missingFact,
				whyItMatters,
			},
		],
		question,
		suggestedAnswers,
		inputMode,
		questionScope,
		draftFaqPayload: null,
		...rest,
	} as const;
}

function createEvaluationOutput(overrides: Record<string, unknown> = {}) {
	return {
		topicSummary: "Clarify billing timing",
		outcome: "continue",
		reason: "One queued question still matters.",
		nextQuestionId: "plan_q_2",
		coveredQuestionIds: [],
		...overrides,
	} as const;
}

function createDraftOutput(overrides: Record<string, unknown> = {}) {
	return {
		kind: "draft_ready",
		continueClarifying: false,
		inputMode: null,
		questionScope: null,
		groundingSource: null,
		groundingSnippet: null,
		question: null,
		suggestedAnswers: null,
		topicSummary: "Clarify billing timing",
		missingFact: "Exact billing timing",
		whyItMatters: "The FAQ needs a single grounded timing rule.",
		draftFaqPayload: {
			title: "Billing timing",
			question: "When does a billing change take effect?",
			answer: "Billing changes apply at the next billing cycle.",
			categories: ["Billing"],
			relatedQuestions: [],
		},
		...overrides,
	} as const;
}

function createFaqKnowledge(overrides: Record<string, unknown> = {}) {
	return {
		id: "knowledge_1",
		organizationId: "org_1",
		websiteId: "site_1",
		aiAgentId: "agent_1",
		type: "faq",
		sourceTitle: "When do billing changes apply?",
		payload: {
			question: "When do billing changes apply?",
			answer: "Billing changes apply at the next billing cycle.",
			categories: ["Billing"],
			relatedQuestions: ["Can I make a billing change immediately?"],
		},
		...overrides,
	} as never;
}

describe("knowledge clarification usage tracking", () => {
	beforeEach(() => {
		getAiAgentForWebsiteMock.mockReset();
		getConversationByIdMock.mockReset();
		getConversationTimelineItemsMock.mockReset();
		getConversationTimelineItemsAfterCursorMock.mockReset();
		createKnowledgeClarificationRequestMock.mockReset();
		createKnowledgeClarificationSignalMock.mockReset();
		getActiveKnowledgeClarificationForConversationMock.mockReset();
		getActiveKnowledgeClarificationAssociationForConversationMock.mockReset();
		getLatestKnowledgeClarificationForConversationBySourceTriggerMessageIdMock.mockReset();
		getJoinableKnowledgeClarificationByTargetKnowledgeIdMock.mockReset();
		getJoinableKnowledgeClarificationByTopicFingerprintMock.mockReset();
		listJoinableKnowledgeClarificationRequestsMissingTopicEmbeddingsMock.mockReset();
		listJoinableKnowledgeClarificationVectorMatchesMock.mockReset();
		listKnowledgeClarificationSignalsMock.mockReset();
		listKnowledgeClarificationTurnsMock.mockReset();
		updateKnowledgeClarificationRequestMock.mockReset();
		createKnowledgeClarificationTurnMock.mockReset();
		getKnowledgeClarificationRequestByIdMock.mockReset();
		listKnowledgeClarificationProposalsMock.mockReset();
		getKnowledgeByIdMock.mockReset();
		createKnowledgeMock.mockReset();
		getKnowledgeCountByTypeMock.mockReset();
		getTotalKnowledgeSizeBytesMock.mockReset();
		updateKnowledgeMock.mockReset();
		createStructuredOutputModelMock.mockReset();
		generateEmbeddingMock.mockReset();
		generateEmbeddingsMock.mockReset();
		generateTextMock.mockReset();
		streamTextMock.mockReset();
		outputObjectMock.mockReset();
		resolveClarificationModelForExecutionMock.mockReset();
		realtimeEmitMock.mockReset();
		ingestAiCreditUsageMock.mockReset();
		createTimelineItemMock.mockReset();
		ulidMock.mockReset();

		getConversationTimelineItemsMock.mockResolvedValue({ items: [] });
		getConversationTimelineItemsAfterCursorMock.mockResolvedValue({
			items: [],
			nextCursor: null,
		});
		getLatestKnowledgeClarificationForConversationBySourceTriggerMessageIdMock.mockResolvedValue(
			null
		);
		getJoinableKnowledgeClarificationByTargetKnowledgeIdMock.mockResolvedValue(
			null
		);
		getJoinableKnowledgeClarificationByTopicFingerprintMock.mockResolvedValue(
			null
		);
		listJoinableKnowledgeClarificationRequestsMissingTopicEmbeddingsMock.mockResolvedValue(
			[]
		);
		listJoinableKnowledgeClarificationVectorMatchesMock.mockResolvedValue([]);
		listKnowledgeClarificationSignalsMock.mockResolvedValue([]);
		createModelMock.mockImplementation((modelId: string) => modelId);
		createStructuredOutputModelMock.mockImplementation((modelId: string) => ({
			modelId,
		}));
		streamTextMock.mockImplementation((options: unknown) => {
			const resultPromise = Promise.resolve(generateTextMock(options)).then(
				(result) => result as { output?: unknown; usage?: unknown }
			);

			return {
				output: resultPromise.then((result) => result.output ?? null),
				totalUsage: resultPromise.then((result) => result.usage),
			};
		});
		outputObjectMock.mockImplementation((value: unknown) => value);
		resolveClarificationModelForExecutionMock.mockImplementation(
			(modelId: string) => ({
				modelIdOriginal: modelId,
				modelIdResolved: "google/gemini-3-flash-preview",
				modelMigrationApplied: modelId !== "google/gemini-3-flash-preview",
			})
		);
		ingestAiCreditUsageMock.mockResolvedValue({
			status: "ingested",
		});
		ulidMock.mockImplementation(() => "usage_evt_1");
	});

	afterAll(() => {
		mock.restore();
	});

	it("does not bill when an existing unanswered clarification step is reused", async () => {
		const { startConversationKnowledgeClarification } = await modulePromise;
		const request = createRequest();

		getActiveKnowledgeClarificationAssociationForConversationMock.mockResolvedValue(
			{
				conversationId: "conv_1",
				request,
				engagementMode: "owner",
			} as never
		);
		listKnowledgeClarificationTurnsMock.mockResolvedValue([createTurn()]);

		const result = await startConversationKnowledgeClarification({
			db: {} as never,
			organizationId: "org_1",
			websiteId: "site_1",
			aiAgent: createAiAgent(),
			conversation: createConversation(),
			topicSummary: "Clarify billing timing",
			actor: {
				aiAgentId: "agent_1",
			},
		});

		expect(result.created).toBe(false);
		expect(result.step).not.toBeNull();
		const step = result.step;
		if (!step) {
			throw new Error("Expected clarification step to be present");
		}
		expect(step.kind).toBe("question");
		expect(generateTextMock).not.toHaveBeenCalled();
		expect(ingestAiCreditUsageMock).not.toHaveBeenCalled();
	});

	it("suppresses automated duplicates when the same trigger already led to an applied clarification", async () => {
		const { startConversationKnowledgeClarification } = await modulePromise;

		getLatestKnowledgeClarificationForConversationBySourceTriggerMessageIdMock.mockResolvedValue(
			createRequest({
				status: "applied",
				currentQuestionInputMode: null,
				currentQuestionScope: null,
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does billing change take effect?",
					answer: "It changes at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			})
		);
		listKnowledgeClarificationTurnsMock.mockResolvedValue([]);

		const result = await startConversationKnowledgeClarification({
			db: {} as never,
			organizationId: "org_1",
			websiteId: "site_1",
			aiAgent: createAiAgent(),
			conversation: createConversation(),
			topicSummary: "Clarify billing timing",
			actor: {
				aiAgentId: "agent_1",
			},
			contextSnapshot: createContextSnapshot(),
			creationMode: "automation",
		});

		expect(result).toMatchObject({
			created: false,
			resolution: "suppressed_duplicate",
			step: null,
			request: {
				id: "clar_req_1",
				status: "applied",
			},
		});
		expect(createKnowledgeClarificationRequestMock).not.toHaveBeenCalled();
		expect(generateTextMock).not.toHaveBeenCalled();
	});

	it("reuses manual clarifications by topic fingerprint when no trigger message exists", async () => {
		const { startConversationKnowledgeClarification } = await modulePromise;
		const existingRequest = createRequest({
			sourceTriggerMessageId: null,
			topicFingerprint: "topic_fp_manual",
			contextSnapshot: createContextSnapshot({
				sourceTrigger: {
					messageId: null,
					text: "Clarify billing timing",
					senderType: null,
					visibility: null,
					createdAt: null,
				},
			}),
		});

		getJoinableKnowledgeClarificationByTopicFingerprintMock.mockResolvedValue(
			existingRequest
		);
		listKnowledgeClarificationTurnsMock.mockResolvedValue([createTurn()]);

		const result = await startConversationKnowledgeClarification({
			db: {} as never,
			organizationId: "org_1",
			websiteId: "site_1",
			aiAgent: createAiAgent(),
			conversation: createConversation(),
			topicSummary: "Clarify billing timing",
			actor: {
				userId: "user_1",
			},
			contextSnapshot: createContextSnapshot({
				sourceTrigger: {
					messageId: null,
					text: "Clarify billing timing",
					senderType: null,
					visibility: null,
					createdAt: null,
				},
			}),
			creationMode: "manual",
		});

		expect(result.created).toBe(false);
		expect(result.resolution).toBe("reused");
		expect(result.step?.kind).toBe("question");
		expect(createKnowledgeClarificationRequestMock).not.toHaveBeenCalled();
	});

	it("recovers from a trigger-message unique violation by reusing the winning clarification", async () => {
		const { startConversationKnowledgeClarification } = await modulePromise;
		const winningRequest = createRequest();

		createKnowledgeClarificationRequestMock.mockRejectedValueOnce({
			code: "23505",
			constraint: "knowledge_clarification_request_conv_trigger_unique",
		});
		getLatestKnowledgeClarificationForConversationBySourceTriggerMessageIdMock.mockResolvedValue(
			winningRequest
		);
		listKnowledgeClarificationTurnsMock.mockResolvedValue([createTurn()]);

		const result = await startConversationKnowledgeClarification({
			db: {} as never,
			organizationId: "org_1",
			websiteId: "site_1",
			aiAgent: createAiAgent(),
			conversation: createConversation(),
			topicSummary: "Clarify billing timing",
			actor: {
				aiAgentId: "agent_1",
			},
			contextSnapshot: createContextSnapshot(),
			creationMode: "automation",
		});

		expect(result.created).toBe(false);
		expect(result.resolution).toBe("reused");
		expect(result.step?.kind).toBe("question");
		expect(createTimelineItemMock).not.toHaveBeenCalled();
	});

	it("keeps deferred unanswered questions visible in serialized requests", async () => {
		const { serializeKnowledgeClarificationRequest } = await modulePromise;
		const serialized = serializeKnowledgeClarificationRequest({
			request: createRequest({
				status: "deferred",
			}),
			turns: [createTurn()],
		});

		expect(serialized.currentQuestion).toBe(
			"When does the billing change take effect?"
		);
		expect(serialized.currentSuggestedAnswers).toEqual([
			"Immediately",
			"At the next billing cycle",
			"It depends on the plan",
		]);
		expect(serialized.currentQuestionInputMode).toBe("textarea_first");
		expect(serialized.currentQuestionScope).toBe("broad_discovery");
	});

	it("prefers stored question-plan metadata over ordinal heuristics", async () => {
		const { serializeKnowledgeClarificationRequest } = await modulePromise;
		const serialized = serializeKnowledgeClarificationRequest({
			request: createRequest({
				questionPlan: [
					createPlannedQuestion({
						question: "When does the billing change take effect?",
						inputMode: "suggested_answers",
						questionScope: "narrow_detail",
					}),
				],
			}),
			turns: [createTurn()],
		});

		expect(serialized.currentQuestionInputMode).toBe("suggested_answers");
		expect(serialized.currentQuestionScope).toBe("narrow_detail");
	});

	it("emits retry-required conversation clarifications as active retryable summaries", async () => {
		const { emitConversationClarificationUpdate } = await modulePromise;

		await emitConversationClarificationUpdate({
			db: {} as never,
			conversation: createConversation(),
			request: createRequest({
				status: "retry_required",
				currentQuestionInputMode: null,
				currentQuestionScope: null,
			}),
			aiAgentId: null,
			turns: [],
		});

		expect(realtimeEmitMock).toHaveBeenCalledWith(
			"conversationUpdated",
			expect.objectContaining({
				conversationId: "conv_1",
				updates: {
					activeClarification: expect.objectContaining({
						requestId: "clar_req_1",
						status: "retry_required",
						topicSummary: "Clarify billing timing",
						engagementMode: "owner",
						linkedConversationCount: 1,
						question: null,
						currentSuggestedAnswers: null,
						currentQuestionInputMode: null,
						currentQuestionScope: null,
						stepIndex: 1,
						maxSteps: 3,
						progress: null,
						updatedAt: "2026-03-13T10:00:00.000Z",
					}),
				},
			})
		);
	});

	it("tracks clarification-question usage when the model returns the next question", async () => {
		const { runKnowledgeClarificationStep } = await modulePromise;
		const request = createRequest({
			status: "analyzing",
			stepIndex: 0,
		});
		const progressReporterMock = mock((async () => {}) as (
			...args: unknown[]
		) => Promise<void>);
		const consoleInfoMock = mock(() => {});
		const originalConsoleInfo = console.info;
		const nextQuestionTurn = createTurn({
			question: "How does billing timing work today?",
			suggestedAnswers: [
				"Users see the change immediately",
				"It waits until the next billing cycle",
				"It depends on the plan or change type",
			],
		});

		listKnowledgeClarificationTurnsMock
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([nextQuestionTurn]);
		generateTextMock.mockResolvedValue({
			output: createQuestionOutput({
				inputMode: "textarea_first",
				questionScope: "broad_discovery",
				missingFact: "How billing-change handling works today",
				whyItMatters: "That detail determines the final FAQ answer.",
				groundingSource: "topic_anchor",
				groundingSnippet: "Clarify billing timing",
				question: "How does billing timing work today?",
				suggestedAnswers: [
					"Users see the change immediately",
					"It waits until the next billing cycle",
					"It depends on the plan or change type",
				],
			}),
			usage: {
				inputTokens: 120,
				outputTokens: 40,
				totalTokens: 160,
			},
		});
		updateKnowledgeClarificationRequestMock.mockResolvedValue(
			createRequest({
				status: "awaiting_answer",
				stepIndex: 1,
				topicSummary: "Clarify billing timing",
			})
		);

		console.info = consoleInfoMock as typeof console.info;

		try {
			const step = await runKnowledgeClarificationStep({
				db: {} as never,
				request,
				aiAgent: createAiAgent(),
				conversation: createConversation(),
				progressReporter: progressReporterMock,
			});

			const usageCall = createTimelineItemMock.mock.calls[0] as unknown as
				| [Record<string, unknown>]
				| undefined;

			expect(step.kind).toBe("question");
			expect(step).toMatchObject({
				inputMode: "textarea_first",
				questionScope: "broad_discovery",
			});
			expect(ingestAiCreditUsageMock).toHaveBeenCalledTimes(1);
			expect(usageCall?.[0]).toMatchObject({
				conversationId: "conv_1",
				conversationOwnerVisitorId: "visitor_1",
				item: {
					tool: "aiCreditUsage",
					aiAgentId: "agent_1",
					visitorId: "visitor_1",
					parts: [
						{
							input: {
								usageEventId: "usage_evt_1",
								triggerMessageId: "clar_req_1",
								source: "knowledge_clarification",
								phase: "clarification_plan_generation",
								knowledgeClarificationRequestId: "clar_req_1",
								knowledgeClarificationStepIndex: 1,
							},
						},
					],
				},
			});
			expect(resolveClarificationModelForExecutionMock).toHaveBeenCalledWith(
				"moonshotai/kimi-k2-0905"
			);
			expect(createStructuredOutputModelMock).toHaveBeenCalledWith(
				"google/gemini-3-flash-preview"
			);
			expect(
				progressReporterMock.mock.calls.map(
					(call) =>
						(
							call[0] as {
								phase?: string;
							}
						).phase
				)
			).toEqual([
				"loading_context",
				"reviewing_evidence",
				"planning_questions",
				"finalizing_step",
			]);
			expect(progressReporterMock.mock.calls[3]?.[0]).toMatchObject({
				phase: "finalizing_step",
				label: "Finalizing...",
			});
			expect(consoleInfoMock).toHaveBeenCalledWith(
				"[KnowledgeClarification] Step timing",
				expect.objectContaining({
					requestId: "clar_req_1",
					contextMs: expect.any(Number),
					modelMs: expect.any(Number),
					fallbackMs: expect.any(Number),
					totalMs: expect.any(Number),
					attemptCount: 1,
					endedKind: "question",
					toolName: null,
				})
			);
		} finally {
			console.info = originalConsoleInfo;
		}
	});

	it("uses a root object schema with required nullable branch fields", async () => {
		const { runKnowledgeClarificationStep } = await modulePromise;
		const request = createRequest({
			status: "analyzing",
			stepIndex: 0,
		});

		listKnowledgeClarificationTurnsMock.mockResolvedValue([]);
		generateTextMock.mockResolvedValue({
			output: createDraftOutput(),
			usage: {
				inputTokens: 180,
				outputTokens: 60,
				totalTokens: 240,
			},
		});
		updateKnowledgeClarificationRequestMock.mockResolvedValue(
			createRequest({
				status: "draft_ready",
				stepIndex: 0,
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does a billing change take effect?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			})
		);

		await runKnowledgeClarificationStep({
			db: {} as never,
			request,
			aiAgent: createAiAgent(),
			conversation: createConversation(),
		});

		const schema = (
			outputObjectMock.mock.calls[0]?.[0] as { schema?: unknown } | undefined
		)?.schema;
		const jsonSchema = zodSchema(schema as never).jsonSchema as Record<
			string,
			any
		>;

		expect(jsonSchema.type).toBe("object");
		expect(jsonSchema.oneOf).toBeUndefined();
		expect(jsonSchema.anyOf).toBeUndefined();
		expect(jsonSchema.required).toEqual(
			expect.arrayContaining([
				"topicSummary",
				"missingFact",
				"whyItMatters",
				"kind",
				"questionPlan",
				"question",
				"suggestedAnswers",
				"inputMode",
				"questionScope",
				"draftFaqPayload",
			])
		);

		const draftFaqPayloadProperty = jsonSchema.properties
			.draftFaqPayload as Record<string, any>;
		const draftFaqObject = draftFaqPayloadProperty.anyOf.find(
			(entry: Record<string, unknown>) => entry.type === "object"
		) as Record<string, any> | undefined;

		expect(draftFaqObject?.required).toEqual(
			expect.arrayContaining([
				"title",
				"question",
				"answer",
				"categories",
				"relatedQuestions",
			])
		);
		expect(draftFaqObject?.properties?.categories?.default).toBeUndefined();
		expect(
			draftFaqObject?.properties?.relatedQuestions?.default
		).toBeUndefined();
	});

	it("stores a retry-required step after a no-output attempt without cascading fallbacks", async () => {
		const { runKnowledgeClarificationStep } = await modulePromise;
		const request = createRequest({
			status: "analyzing",
			stepIndex: 0,
		});
		const progressReporterMock = mock((async () => {}) as (
			...args: unknown[]
		) => Promise<void>);
		const nextQuestionTurn = createTurn({
			question: "How does billing timing work today?",
			suggestedAnswers: [
				"Users see the change immediately",
				"It waits until the next billing cycle",
				"It depends on the plan or change type",
			],
		});

		listKnowledgeClarificationTurnsMock
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([nextQuestionTurn]);
		generateTextMock.mockRejectedValueOnce(
			new NoOutputGeneratedErrorMock("No output generated.")
		);
		updateKnowledgeClarificationRequestMock.mockResolvedValue(
			createRequest({
				status: "retry_required",
				stepIndex: 1,
				currentQuestion: null,
				currentSuggestedAnswers: null,
				currentQuestionInputMode: null,
				currentQuestionScope: null,
				lastError: "No output generated.",
			})
		);

		const step = await runKnowledgeClarificationStep({
			db: {} as never,
			request,
			aiAgent: createAiAgent(),
			conversation: createConversation(),
			progressReporter: progressReporterMock,
		});

		expect(step.kind).toBe("retry_required");
		expect(
			createStructuredOutputModelMock.mock.calls.map((call) => call[0])
		).toEqual(["google/gemini-3-flash-preview"]);
		expect(
			progressReporterMock.mock.calls.map(
				(call) => (call[0] as { phase?: string } | undefined)?.phase
			)
		).not.toContain("retrying_generation");
	});

	it("stores exhausted provider failures as retry-required requests instead of throwing", async () => {
		const { runKnowledgeClarificationStep } = await modulePromise;
		const request = createRequest({
			status: "analyzing",
			stepIndex: 1,
		});

		listKnowledgeClarificationTurnsMock.mockResolvedValue([]);
		generateTextMock
			.mockRejectedValueOnce(new Error("Provider returned error"))
			.mockRejectedValueOnce(new Error("Gateway timeout"))
			.mockRejectedValueOnce(new Error("No output generated."));
		updateKnowledgeClarificationRequestMock.mockResolvedValue(
			createRequest({
				status: "retry_required",
				currentQuestion: null,
				currentSuggestedAnswers: null,
				currentQuestionInputMode: null,
				currentQuestionScope: null,
				lastError: "Provider returned error",
			})
		);

		const step = await runKnowledgeClarificationStep({
			db: {} as never,
			request,
			aiAgent: createAiAgent(),
			conversation: createConversation(),
		});

		expect(step).toMatchObject({
			kind: "retry_required",
			request: {
				id: "clar_req_1",
				status: "retry_required",
				currentQuestion: null,
				currentSuggestedAnswers: null,
				currentQuestionInputMode: null,
				currentQuestionScope: null,
				lastError: "Provider returned error",
			},
		});
		expect(generateTextMock).toHaveBeenCalledTimes(1);
		expect(updateKnowledgeClarificationRequestMock).toHaveBeenCalledWith(
			{} as never,
			{
				requestId: "clar_req_1",
				updates: {
					status: "retry_required",
					lastError: "Provider returned error",
				},
			}
		);
	});

	it("goes straight to a draft when the planner decides the existing evidence is enough", async () => {
		const { runKnowledgeClarificationStep } = await modulePromise;
		const request = createRequest({
			status: "analyzing",
			stepIndex: 0,
		});

		listKnowledgeClarificationTurnsMock.mockResolvedValue([]);
		generateTextMock.mockResolvedValue({
			output: createDraftOutput({
				whyItMatters:
					"The evidence is already grounded enough to skip clarification questions.",
			}),
			usage: {
				inputTokens: 120,
				outputTokens: 40,
				totalTokens: 160,
			},
		});
		updateKnowledgeClarificationRequestMock.mockResolvedValue(
			createRequest({
				status: "draft_ready",
				stepIndex: 0,
				currentQuestion: null,
				currentSuggestedAnswers: null,
				currentQuestionInputMode: null,
				currentQuestionScope: null,
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does a billing change take effect?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			})
		);

		const step = await runKnowledgeClarificationStep({
			db: {} as never,
			request,
			aiAgent: createAiAgent(),
			conversation: createConversation(),
		});

		expect(step.kind).toBe("draft_ready");
		expect(generateTextMock).toHaveBeenCalledTimes(1);
	});

	it("sanitizes malformed clarification questions before storing them", async () => {
		const { runKnowledgeClarificationStep } = await modulePromise;
		const request = createRequest({
			status: "analyzing",
			stepIndex: 0,
			topicSummary: "Clarify account deletion",
			source: "faq",
			conversationId: null,
		});
		const malformedQuestion =
			'1. What is the exact method for a user to delete their account - do they (a) click a "Delete Account" button in settings, (b) email support with a deletion request, or (c) run a CLI command such as `npx ai-support delete-account`?';
		const sanitizedQuestion =
			"What is the exact method for a user to delete their account?";
		const suggestedAnswers = [
			"Click Delete Account in settings",
			"Email support",
			"Use a CLI command",
		];
		const nextQuestionTurn = createTurn({
			question: sanitizedQuestion,
			suggestedAnswers,
		});

		listKnowledgeClarificationTurnsMock
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([nextQuestionTurn]);
		generateTextMock.mockResolvedValue({
			output: createQuestionOutput({
				question: malformedQuestion,
				suggestedAnswers,
				topicSummary: "Clarify account deletion",
				missingFact: "Which account deletion path users should follow",
				whyItMatters: "That determines the final FAQ answer.",
			}),
			usage: {
				inputTokens: 120,
				outputTokens: 40,
				totalTokens: 160,
			},
		});
		updateKnowledgeClarificationRequestMock.mockResolvedValue(
			createRequest({
				source: "faq",
				conversationId: null,
				status: "awaiting_answer",
				stepIndex: 1,
				topicSummary: "Clarify account deletion",
			})
		);

		const step = await runKnowledgeClarificationStep({
			db: {} as never,
			request,
			aiAgent: createAiAgent(),
			conversation: createConversation(),
		});

		expect(createKnowledgeClarificationTurnMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				question: sanitizedQuestion,
				suggestedAnswers,
			})
		);
		expect(step).toMatchObject({
			kind: "question",
			question: sanitizedQuestion,
			suggestedAnswers,
			inputMode: "suggested_answers",
			questionScope: "narrow_detail",
		});
	});

	it("includes skipped questions in the clarification history sent back to the model", async () => {
		const { runKnowledgeClarificationStep } = await modulePromise;
		const request = createRequest({
			status: "analyzing",
			stepIndex: 1,
		});
		const historyTurns = [
			createTurn({
				question: "Does the billing change immediately?",
			}),
			createTurn({
				id: "turn_2",
				role: "human_skip",
				question: null,
				suggestedAnswers: null,
				selectedAnswer: null,
				freeAnswer: null,
			}),
		];
		const nextQuestionTurn = createTurn({
			id: "turn_3",
			question: "Should the change wait for the next billing cycle?",
		});

		listKnowledgeClarificationTurnsMock
			.mockResolvedValueOnce(historyTurns)
			.mockResolvedValueOnce([...historyTurns, nextQuestionTurn]);
		generateTextMock.mockResolvedValue({
			output: createQuestionOutput({
				id: "plan_q_2",
				question: "Should the change wait for the next billing cycle?",
				suggestedAnswers: [
					"Yes, always",
					"No, it is immediate",
					"It depends on the plan",
				],
				missingFact:
					"Whether the billing change always waits for the next cycle",
				whyItMatters: "That determines how the FAQ should describe timing.",
			}),
			usage: {
				inputTokens: 140,
				outputTokens: 45,
				totalTokens: 185,
			},
		});
		updateKnowledgeClarificationRequestMock.mockResolvedValue(
			createRequest({
				status: "awaiting_answer",
				stepIndex: 2,
				topicSummary: "Clarify billing timing",
			})
		);

		await runKnowledgeClarificationStep({
			db: {} as never,
			request,
			aiAgent: createAiAgent(),
			conversation: createConversation(),
		});

		const promptCall = generateTextMock.mock.calls[0] as
			| [Record<string, unknown>]
			| undefined;

		expect(promptCall?.[0]?.prompt).toContain("Skipped by teammate");
	});

	it("tracks faq-draft-generation usage when the model returns a draft faq", async () => {
		const { runKnowledgeClarificationStep } = await modulePromise;
		const questionPlan = [
			createPlannedQuestion({
				id: "plan_q_1",
				question: "When does the billing change take effect?",
			}),
		];
		const request = createAnalyzingRequest({
			updatedAt: "2026-03-13T10:05:00.000Z",
			questionPlan,
		});

		listKnowledgeClarificationTurnsMock.mockResolvedValue([
			createTurn(),
			createTurn({
				id: "turn_2",
				role: "human_answer",
				question: null,
				suggestedAnswers: null,
				selectedAnswer: "At the next billing cycle",
			}),
		]);
		generateTextMock.mockResolvedValue({
			output: createDraftOutput(),
			usage: {
				inputTokens: 180,
				outputTokens: 60,
				totalTokens: 240,
			},
		});
		updateKnowledgeClarificationRequestMock.mockResolvedValue(
			createDraftReadyRequest({
				questionPlan,
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does a billing change take effect?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			})
		);

		const step = await runKnowledgeClarificationStep({
			db: {} as never,
			request,
			aiAgent: createAiAgent(),
			conversation: createConversation(),
		});

		const usageCall = createTimelineItemMock.mock.calls[0] as unknown as
			| [Record<string, unknown>]
			| undefined;

		expect(step.kind).toBe("draft_ready");
		expect(ingestAiCreditUsageMock).toHaveBeenCalledTimes(1);
		expect(usageCall?.[0]).toMatchObject({
			conversationId: "conv_1",
			conversationOwnerVisitorId: "visitor_1",
			item: {
				tool: "aiCreditUsage",
				aiAgentId: "agent_1",
				visitorId: "visitor_1",
				parts: [
					{
						input: {
							usageEventId: "usage_evt_1",
							triggerMessageId: "clar_req_1",
							source: "knowledge_clarification",
							phase: "faq_draft_generation",
							knowledgeClarificationRequestId: "clar_req_1",
							knowledgeClarificationStepIndex: 1,
						},
					},
				],
			},
		});
	});

	it("skips redundant queued questions and drafts when the evaluator says the answer is sufficient", async () => {
		const { runKnowledgeClarificationStep } = await modulePromise;
		const questionPlan = [
			createPlannedQuestion({
				id: "plan_q_1",
				question: "Does the billing change immediately?",
			}),
			createPlannedQuestion({
				id: "plan_q_2",
				question: "Are annual plans handled differently?",
			}),
		];
		const request = createAnalyzingRequest({
			questionPlan,
		});
		const historyTurns = [
			createTurn({
				question: "Does the billing change immediately?",
			}),
			createTurn({
				id: "turn_2",
				role: "human_answer",
				question: null,
				suggestedAnswers: null,
				selectedAnswer: "At the next billing cycle",
			}),
		];

		listKnowledgeClarificationTurnsMock.mockResolvedValue(historyTurns);
		generateTextMock.mockResolvedValueOnce({
			output: {
				kind: "draft_ready",
				continueClarifying: false,
				topicSummary: "Clarify billing timing",
				missingFact: "Exact billing timing",
				whyItMatters: "The answer is already grounded enough to draft.",
				questionPlan: null,
				question: null,
				suggestedAnswers: null,
				inputMode: null,
				questionScope: null,
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does a billing change take effect?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			},
			usage: {
				inputTokens: 120,
				outputTokens: 40,
				totalTokens: 160,
			},
		});
		updateKnowledgeClarificationRequestMock.mockResolvedValue(
			createDraftReadyRequest({
				questionPlan,
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does a billing change take effect?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			})
		);

		const step = await runKnowledgeClarificationStep({
			db: {} as never,
			request,
			aiAgent: createAiAgent(),
			conversation: createConversation(),
		});
		const usageCalls = createTimelineItemMock.mock.calls as unknown as [
			Record<string, unknown>,
		][];

		expect(step.kind).toBe("draft_ready");
		expect(generateTextMock).toHaveBeenCalledTimes(1);
		expect(ingestAiCreditUsageMock).toHaveBeenCalledTimes(1);
		expect(usageCalls[0]?.[0]).toMatchObject({
			item: {
				parts: [
					{
						input: {
							phase: "faq_draft_generation",
						},
					},
				],
			},
		});
	});

	it("falls back to a draft when the evaluator decides no queued follow-up is still useful", async () => {
		const { runKnowledgeClarificationStep } = await modulePromise;
		const questionPlan = [
			createPlannedQuestion({
				id: "plan_q_1",
				question: "When does the billing change take effect?",
			}),
			createPlannedQuestion({
				id: "plan_q_2",
				question: "Are annual plans handled differently?",
			}),
		];
		const request = createAnalyzingRequest({
			questionPlan,
		});
		const historyTurns = [
			createTurn({
				question: "When does the billing change take effect?",
			}),
			createTurn({
				id: "turn_2",
				role: "human_answer",
				question: null,
				suggestedAnswers: null,
				selectedAnswer: "At the next billing cycle",
			}),
		];

		listKnowledgeClarificationTurnsMock.mockResolvedValue(historyTurns);
		generateTextMock.mockResolvedValueOnce({
			output: {
				kind: "draft_ready",
				continueClarifying: false,
				topicSummary: "Clarify billing timing",
				missingFact: "No additional grounded gap remains",
				whyItMatters:
					"The latest answer is specific enough for a narrow draft.",
				questionPlan: null,
				question: null,
				suggestedAnswers: null,
				inputMode: null,
				questionScope: null,
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does a billing change take effect?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			},
			usage: {
				inputTokens: 120,
				outputTokens: 40,
				totalTokens: 160,
			},
		});
		updateKnowledgeClarificationRequestMock.mockResolvedValue(
			createDraftReadyRequest({
				questionPlan,
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does a billing change take effect?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			})
		);

		const step = await runKnowledgeClarificationStep({
			db: {} as never,
			request,
			aiAgent: createAiAgent(),
			conversation: createConversation(),
		});

		expect(step.kind).toBe("draft_ready");
		expect(generateTextMock).toHaveBeenCalledTimes(1);
	});

	it("goes straight to a draft when the latest answer already resolves the gap", async () => {
		const { runKnowledgeClarificationStep } = await modulePromise;
		const request = createRequest({
			status: "analyzing",
			stepIndex: 1,
		});
		const historyTurns = [
			createTurn({
				question: "When does the billing change take effect?",
			}),
			createTurn({
				id: "turn_2",
				role: "human_answer",
				question: null,
				suggestedAnswers: null,
				selectedAnswer: "At the next billing cycle",
			}),
		];

		listKnowledgeClarificationTurnsMock.mockResolvedValue(historyTurns);
		generateTextMock.mockResolvedValue({
			output: {
				kind: "draft_ready",
				continueClarifying: false,
				topicSummary: "Clarify billing timing",
				missingFact: "No additional grounded gap remains",
				whyItMatters: "The latest answer already resolves the material fact.",
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does a billing change take effect?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			},
			usage: {
				inputTokens: 80,
				outputTokens: 30,
				totalTokens: 110,
			},
		});
		updateKnowledgeClarificationRequestMock.mockResolvedValue(
			createRequest({
				status: "draft_ready",
				stepIndex: 1,
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does a billing change take effect?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			})
		);

		const step = await runKnowledgeClarificationStep({
			db: {} as never,
			request,
			aiAgent: createAiAgent(),
			conversation: createConversation(),
		});

		expect(step.kind).toBe("draft_ready");
		expect(generateTextMock).toHaveBeenCalledTimes(1);
	});

	it("keeps transcript claims separate from grounded facts in the model prompt", async () => {
		const { runKnowledgeClarificationStep } = await modulePromise;
		const request = createRequest({
			status: "analyzing",
			stepIndex: 0,
		});

		listKnowledgeClarificationTurnsMock.mockResolvedValue([]);
		generateTextMock.mockResolvedValue({
			output: {
				kind: "draft_ready",
				continueClarifying: false,
				topicSummary: "Clarify billing timing",
				missingFact: "No additional grounded gap remains",
				whyItMatters: "The prompt should distinguish facts from claims.",
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does a billing change take effect?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			},
			usage: {
				inputTokens: 180,
				outputTokens: 60,
				totalTokens: 240,
			},
		});
		updateKnowledgeClarificationRequestMock.mockResolvedValue(
			createRequest({
				status: "draft_ready",
				stepIndex: 0,
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does a billing change take effect?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			})
		);

		await runKnowledgeClarificationStep({
			db: {} as never,
			request,
			aiAgent: createAiAgent(),
			conversation: createConversation(),
		});

		const promptCall = generateTextMock.mock.calls[0] as
			| [Record<string, unknown>]
			| undefined;
		const prompt = String(promptCall?.[0]?.prompt ?? "");

		expect(prompt).toContain(
			"Transcript claims:\n- Visitor claim: When does the billing change take effect?"
		);
		expect(prompt).not.toContain(
			"Grounded facts:\n- Visitor claim: When does the billing change take effect?"
		);
	});

	it("tells the model to keep clarification questions short and free of inline answers", async () => {
		const { runKnowledgeClarificationStep } = await modulePromise;
		const request = createRequest({
			status: "analyzing",
			stepIndex: 0,
		});

		listKnowledgeClarificationTurnsMock.mockResolvedValue([]);
		generateTextMock.mockResolvedValue({
			output: {
				kind: "draft_ready",
				continueClarifying: false,
				topicSummary: "Clarify billing timing",
				missingFact: "No additional grounded gap remains",
				whyItMatters: "The prompt should constrain question formatting.",
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does a billing change take effect?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			},
			usage: {
				inputTokens: 180,
				outputTokens: 60,
				totalTokens: 240,
			},
		});
		updateKnowledgeClarificationRequestMock.mockResolvedValue(
			createRequest({
				status: "draft_ready",
				stepIndex: 0,
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does a billing change take effect?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			})
		);

		await runKnowledgeClarificationStep({
			db: {} as never,
			request,
			aiAgent: createAiAgent(),
			conversation: createConversation(),
		});

		const promptCall = generateTextMock.mock.calls[0] as
			| [Record<string, unknown>]
			| undefined;
		const systemPrompt = String(promptCall?.[0]?.system ?? "");

		expect(systemPrompt).toContain(
			"Every question must be short, plain-language, and focused on one missing fact."
		);
		expect(systemPrompt).toContain(
			"Suggested answers must have exactly 3 distinct options."
		);
		expect(systemPrompt).toContain(
			"Use textarea_first only for the first broad discovery question in a conversation clarification."
		);
		expect(systemPrompt).toContain(
			"All later questions should use suggested_answers."
		);
	});

	it("frames clarification prompts for the website owner and strips visitor-facing base prompts", async () => {
		const { runKnowledgeClarificationStep } = await modulePromise;
		const request = createRequest({
			status: "analyzing",
			stepIndex: 0,
		});

		listKnowledgeClarificationTurnsMock.mockResolvedValue([]);
		generateTextMock.mockResolvedValue({
			output: {
				kind: "draft_ready",
				continueClarifying: false,
				topicSummary: "Clarify avatar upload flow",
				missingFact: "No additional grounded gap remains",
				whyItMatters: "The prompt should stay owner-facing and internal.",
				draftFaqPayload: {
					title: "Avatar uploads",
					question: "How do users upload a profile photo?",
					answer: "Users can upload a profile photo from account settings.",
					categories: ["Account"],
					relatedQuestions: [],
				},
			},
			usage: {
				inputTokens: 180,
				outputTokens: 60,
				totalTokens: 240,
			},
		});
		updateKnowledgeClarificationRequestMock.mockResolvedValue(
			createRequest({
				status: "draft_ready",
				stepIndex: 0,
				topicSummary: "Clarify avatar upload flow",
				draftFaqPayload: {
					title: "Avatar uploads",
					question: "How do users upload a profile photo?",
					answer: "Users can upload a profile photo from account settings.",
					categories: ["Account"],
					relatedQuestions: [],
				},
			})
		);

		await runKnowledgeClarificationStep({
			db: {} as never,
			request,
			aiAgent: createAiAgent({
				basePrompt:
					"Help the visitor clearly and ask what they already clicked.",
			}),
			conversation: createConversation(),
		});

		const promptCall = generateTextMock.mock.calls[0] as
			| [Record<string, unknown>]
			| undefined;
		const systemPrompt = String(promptCall?.[0]?.system ?? "");
		const prompt = String(promptCall?.[0]?.prompt ?? "");

		expect(systemPrompt).toContain(
			"private internal clarification flow for a website owner or teammate"
		);
		expect(systemPrompt).toContain(
			"This is internal only. Never address the visitor."
		);
		expect(systemPrompt).toContain(
			"Never ask about what the visitor already tried, clicked, searched for, entered, or saw."
		);
		expect(prompt).toContain("Agent name: Support Agent");
		expect(prompt).toContain("Clarification source: conversation");
		expect(prompt).not.toContain(
			"Help the visitor clearly and ask what they already clicked."
		);
	});

	it("uses the clarification model fallback when the configured model is unknown", async () => {
		const { runKnowledgeClarificationStep } = await modulePromise;
		const request = createRequest({
			status: "analyzing",
			stepIndex: 0,
		});

		listKnowledgeClarificationTurnsMock.mockResolvedValue([]);
		generateTextMock.mockResolvedValue({
			output: createDraftOutput({
				missingFact: "No additional grounded gap remains",
				whyItMatters: "The model fallback should still generate a draft.",
			}),
			usage: {
				inputTokens: 180,
				outputTokens: 60,
				totalTokens: 240,
			},
		});
		updateKnowledgeClarificationRequestMock.mockResolvedValue(
			createRequest({
				status: "draft_ready",
				stepIndex: 0,
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does a billing change take effect?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			})
		);

		await runKnowledgeClarificationStep({
			db: {} as never,
			request,
			aiAgent: createAiAgent({
				model: "legacy/unknown-model",
			}),
			conversation: createConversation(),
		});

		expect(resolveClarificationModelForExecutionMock).toHaveBeenCalledWith(
			"legacy/unknown-model"
		);
		expect(createStructuredOutputModelMock).toHaveBeenCalledWith(
			"google/gemini-3-flash-preview"
		);
	});

	it("goes straight to a draft once no queued clarification questions remain", async () => {
		const { runKnowledgeClarificationStep } = await modulePromise;
		const request = createRequest({
			status: "analyzing",
			stepIndex: 3,
			maxSteps: 3,
			questionPlan: [
				createPlannedQuestion({ id: "plan_q_1", question: "Question 1?" }),
				createPlannedQuestion({ id: "plan_q_2", question: "Question 2?" }),
				createPlannedQuestion({ id: "plan_q_3", question: "Question 3?" }),
			],
		});
		const progressReporterMock = mock((async () => {}) as (
			...args: unknown[]
		) => Promise<void>);

		listKnowledgeClarificationTurnsMock.mockResolvedValue([
			createTurn({ id: "turn_1", question: "Question 1?" }),
			createTurn({
				id: "turn_2",
				role: "human_answer",
				question: null,
				suggestedAnswers: null,
				selectedAnswer: "Answer 1",
			}),
			createTurn({ id: "turn_3", question: "Question 2?" }),
			createTurn({
				id: "turn_4",
				role: "human_answer",
				question: null,
				suggestedAnswers: null,
				selectedAnswer: "Answer 2",
			}),
			createTurn({ id: "turn_5", question: "Question 3?" }),
		]);
		generateTextMock.mockResolvedValue({
			output: {
				kind: "draft_ready",
				continueClarifying: true,
				topicSummary: "Clarify billing timing",
				missingFact: "Any remaining edge cases",
				whyItMatters: "The hard cap has been reached.",
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does a billing change take effect?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			},
			usage: {
				inputTokens: 180,
				outputTokens: 60,
				totalTokens: 240,
			},
		});
		updateKnowledgeClarificationRequestMock.mockResolvedValue(
			createRequest({
				status: "draft_ready",
				stepIndex: 3,
				maxSteps: 3,
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does a billing change take effect?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			})
		);

		const step = await runKnowledgeClarificationStep({
			db: {} as never,
			request,
			aiAgent: createAiAgent(),
			conversation: createConversation(),
			progressReporter: progressReporterMock,
		});

		const promptCall = generateTextMock.mock.calls[0] as
			| [Record<string, unknown>]
			| undefined;

		expect(step.kind).toBe("draft_ready");
		expect(promptCall?.[0]?.prompt).toContain("Question budget remaining: 0.");
		expect(
			progressReporterMock.mock.calls.map(
				(call) =>
					(
						call[0] as {
							phase?: string;
						}
					).phase
			)
		).toEqual([
			"loading_context",
			"reviewing_evidence",
			"evaluating_answer",
			"finalizing_step",
		]);
	});

	it("stores linked FAQ context when deepening an existing FAQ", async () => {
		const { startFaqKnowledgeClarification } = await modulePromise;
		const draftRequest = createRequest({
			conversationId: null,
			source: "faq",
			status: "analyzing",
			topicSummary:
				"Clarify the exact FAQ answer for: When do billing changes apply?",
			targetKnowledgeId: "knowledge_1",
		});

		createKnowledgeClarificationRequestMock.mockResolvedValue(draftRequest);
		listKnowledgeClarificationTurnsMock.mockResolvedValue([]);
		generateTextMock.mockResolvedValue({
			output: {
				kind: "draft_ready",
				continueClarifying: false,
				topicSummary:
					"Clarify the exact FAQ answer for: When do billing changes apply?",
				missingFact: "Whether billing changes ever apply immediately",
				whyItMatters: "That keeps the FAQ precise without overpromising.",
				draftFaqPayload: {
					title: "Billing timing",
					question: "When do billing changes apply?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: ["Can I make a billing change immediately?"],
				},
			},
			usage: {
				inputTokens: 140,
				outputTokens: 55,
				totalTokens: 195,
			},
		});
		updateKnowledgeClarificationRequestMock.mockResolvedValue(
			createRequest({
				conversationId: null,
				source: "faq",
				status: "draft_ready",
				topicSummary:
					"Clarify the exact FAQ answer for: When do billing changes apply?",
				targetKnowledgeId: "knowledge_1",
				draftFaqPayload: {
					title: "Billing timing",
					question: "When do billing changes apply?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: ["Can I make a billing change immediately?"],
				},
			})
		);

		const result = await startFaqKnowledgeClarification({
			db: {} as never,
			organizationId: "org_1",
			websiteId: "site_1",
			aiAgent: createAiAgent(),
			topicSummary: "Clarify FAQ: When do billing changes apply?",
			targetKnowledge: createFaqKnowledge(),
		});

		expect(result.step.kind).toBe("draft_ready");
		expect(createKnowledgeClarificationRequestMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				maxSteps: 3,
				topicSummary:
					"Clarify the exact FAQ answer for: When do billing changes apply?",
				contextSnapshot: expect.objectContaining({
					linkedFaq: expect.objectContaining({
						question: "When do billing changes apply?",
					}),
				}),
			})
		);
	});
});
