import { beforeEach, describe, expect, it, mock } from "bun:test";

const getWebsiteBySlugWithAccessMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const getKnowledgeClarificationRequestByIdMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const updateKnowledgeClarificationRequestMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const createKnowledgeMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const getKnowledgeByIdMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const getKnowledgeCountByTypeMock = mock(
	(async () => 0) as (...args: unknown[]) => Promise<number>
);
const getTotalKnowledgeSizeBytesMock = mock(
	(async () => 0) as (...args: unknown[]) => Promise<number>
);
const updateKnowledgeMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);

mock.module("@api/db/queries/website", () => ({
	getWebsiteBySlugWithAccess: getWebsiteBySlugWithAccessMock,
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
	getActiveKnowledgeClarificationForConversation: mock(async () => null),
	getKnowledgeClarificationRequestById:
		getKnowledgeClarificationRequestByIdMock,
	listActiveKnowledgeClarificationSummariesForConversations: mock(
		async () => new Map()
	),
	listKnowledgeClarificationProposals: mock(async () => []),
	listKnowledgeClarificationTurns: mock(async () => []),
	updateKnowledgeClarificationRequest: updateKnowledgeClarificationRequestMock,
}));

mock.module("@api/db/queries/knowledge", () => ({
	createKnowledge: createKnowledgeMock,
	getKnowledgeById: getKnowledgeByIdMock,
	getKnowledgeCountByType: getKnowledgeCountByTypeMock,
	getTotalKnowledgeSizeBytes: getTotalKnowledgeSizeBytesMock,
	updateKnowledge: updateKnowledgeMock,
}));

mock.module("@api/services/knowledge-clarification", () => ({
	createKnowledgeClarificationAuditEntry: mock(async () => {}),
	emitConversationClarificationUpdate: mock(async () => {}),
	loadKnowledgeClarificationRuntime: mock(async () => ({
		conversation: null,
	})),
	serializeKnowledgeClarificationRequest: mock((value: unknown) => value),
}));

const modulePromise = Promise.all([
	import("../init"),
	import("./knowledge-clarification"),
]);

function createWebsite() {
	return {
		id: "01JQJ2V0A00000000000000002",
		organizationId: "01JQJ2V0A00000000000000001",
		slug: "acme",
	} as never;
}

function createRequest(overrides: Record<string, unknown> = {}) {
	return {
		id: "01JQJ2V0A00000000000000010",
		organizationId: "01JQJ2V0A00000000000000001",
		websiteId: "01JQJ2V0A00000000000000002",
		aiAgentId: "01JQJ2V0A00000000000000003",
		conversationId: "conv_1",
		source: "conversation",
		status: "awaiting_answer",
		topicSummary: "Clarify billing timing",
		stepIndex: 1,
		maxSteps: 3,
		targetKnowledgeId: null,
		currentQuestion: "Does the billing change immediately?",
		currentSuggestedAnswers: ["Immediately", "Later", "It depends"],
		currentQuestionInputMode: "suggested_answers",
		currentQuestionScope: "narrow_detail",
		draftFaqPayload: null,
		lastError: null,
		createdAt: "2026-03-17T10:00:00.000Z",
		updatedAt: "2026-03-17T10:00:00.000Z",
		...overrides,
	};
}

async function createCaller() {
	const [{ createCallerFactory }, { knowledgeClarificationRouter }] =
		await modulePromise;
	const createCallerFactoryForRouter = createCallerFactory(
		knowledgeClarificationRouter
	);

	return createCallerFactoryForRouter({
		db: {} as never,
		user: { id: "user_1" } as never,
		session: { id: "session_1" } as never,
		geo: {} as never,
		headers: new Headers(),
	});
}

describe("knowledgeClarification router", () => {
	beforeEach(() => {
		getWebsiteBySlugWithAccessMock.mockReset();
		getKnowledgeClarificationRequestByIdMock.mockReset();
		updateKnowledgeClarificationRequestMock.mockReset();
		createKnowledgeMock.mockReset();
		getKnowledgeByIdMock.mockReset();
		getKnowledgeCountByTypeMock.mockReset();
		getTotalKnowledgeSizeBytesMock.mockReset();
		updateKnowledgeMock.mockReset();

		getWebsiteBySlugWithAccessMock.mockResolvedValue(createWebsite());
		getKnowledgeClarificationRequestByIdMock.mockResolvedValue(createRequest());
		updateKnowledgeClarificationRequestMock.mockImplementation((async (
			_db: unknown,
			input: { updates: Record<string, unknown> }
		) =>
			createRequest({
				status: input.updates.status ?? "awaiting_answer",
				draftFaqPayload: input.updates.draftFaqPayload ?? null,
			})) as (...args: unknown[]) => Promise<unknown>);
	});

	it("rejects approving a clarification that is not draft-ready", async () => {
		const caller = await createCaller();

		await expect(
			caller.approveDraft({
				websiteSlug: "acme",
				requestId: "01JQJ2V0A00000000000000010",
				draft: {
					title: "Billing timing",
					question: "When does billing change take effect?",
					answer: "At the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			})
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "This clarification draft is no longer ready to approve",
		});
	});

	it("rejects deferring an applied clarification", async () => {
		getKnowledgeClarificationRequestByIdMock.mockResolvedValueOnce(
			createRequest({
				status: "applied",
				currentQuestion: null,
				currentSuggestedAnswers: null,
				currentQuestionInputMode: null,
				currentQuestionScope: null,
			})
		);
		const caller = await createCaller();

		await expect(
			caller.defer({
				websiteSlug: "acme",
				requestId: "01JQJ2V0A00000000000000010",
			})
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "This clarification request can no longer be changed",
		});
	});

	it("rejects dismissing an already-dismissed clarification", async () => {
		getKnowledgeClarificationRequestByIdMock.mockResolvedValueOnce(
			createRequest({
				status: "dismissed",
				currentQuestion: null,
				currentSuggestedAnswers: null,
				currentQuestionInputMode: null,
				currentQuestionScope: null,
			})
		);
		const caller = await createCaller();

		await expect(
			caller.dismiss({
				websiteSlug: "acme",
				requestId: "01JQJ2V0A00000000000000010",
			})
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "This clarification request can no longer be changed",
		});
	});

	it("returns a null proposal when the clarification request no longer exists", async () => {
		getKnowledgeClarificationRequestByIdMock.mockResolvedValueOnce(null);
		const caller = await createCaller();

		const result = await caller.getProposal({
			websiteSlug: "acme",
			requestId: "01JQJ2V0A00000000000000010",
		});

		expect(result).toEqual({
			request: null,
		});
	});
});
