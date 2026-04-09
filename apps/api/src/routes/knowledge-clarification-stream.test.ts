import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

const REQUEST_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const FAQ_REQUEST_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
const KNOWLEDGE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAX";

const routeModulePromise = import("./knowledge-clarification-stream");

function createRequestRecord(overrides: Record<string, unknown> = {}) {
	return {
		id: REQUEST_ID,
		organizationId: "org-1",
		websiteId: "site-1",
		aiAgentId: "ai-1",
		conversationId: "conv-1",
		source: "conversation",
		status: "awaiting_answer",
		topicSummary: "Billing clarification",
		engagementMode: "owner",
		linkedConversationCount: 1,
		stepIndex: 1,
		maxSteps: 3,
		targetKnowledgeId: null,
		targetKnowledgeSummary: null,
		questionPlan: null,
		currentQuestion: "What plan are they asking about?",
		currentSuggestedAnswers: ["Free", "Pro", "Enterprise"],
		currentQuestionInputMode: "suggested_answers",
		currentQuestionScope: "narrow_detail",
		draftFaqPayload: null,
		lastError: null,
		createdAt: "2026-04-02T00:00:00.000Z",
		updatedAt: "2026-04-02T00:00:00.000Z",
		...overrides,
	};
}

function createQuestionStep() {
	return {
		kind: "question" as const,
		request: createRequestRecord({
			status: "awaiting_answer",
		}),
		question: "What plan are they asking about?",
		suggestedAnswers: ["Free", "Pro", "Enterprise"] as [string, string, string],
		inputMode: "suggested_answers" as const,
		questionScope: "narrow_detail" as const,
	};
}

function createDraftStep() {
	return {
		kind: "draft_ready" as const,
		request: createRequestRecord({
			id: FAQ_REQUEST_ID,
			conversationId: null,
			source: "faq",
			status: "draft_ready",
			currentQuestion: null,
			currentSuggestedAnswers: null,
			currentQuestionInputMode: null,
			currentQuestionScope: null,
			draftFaqPayload: {
				title: "Billing",
				question: "How does billing work?",
				answer: "Billing happens monthly.",
				categories: ["Billing"],
				relatedQuestions: [],
			},
		}),
		draftFaqPayload: {
			title: "Billing",
			question: "How does billing work?",
			answer: "Billing happens monthly.",
			categories: ["Billing"],
			relatedQuestions: [],
		},
	};
}

function createRetryStep() {
	return {
		kind: "retry_required" as const,
		request: createRequestRecord({
			status: "retry_required",
			currentQuestion: null,
			currentSuggestedAnswers: null,
			currentQuestionInputMode: null,
			currentQuestionScope: null,
			lastError: "No output generated.",
		}),
	};
}

async function* createTextStream(...chunks: string[]) {
	for (const chunk of chunks) {
		yield chunk;
	}
}

function createJsonEnvelope(step: ReturnType<typeof createQuestionStep>) {
	return {
		requestId: step.request.id,
		decision: {
			kind: "question" as const,
			topicSummary: step.request.topicSummary,
			questionPlan: step.request.questionPlan,
			question: step.question,
			suggestedAnswers: step.suggestedAnswers,
			inputMode: step.inputMode,
			questionScope: step.questionScope,
			draftFaqPayload: null,
			lastError: step.request.lastError,
		},
		status:
			step.request.status === "analyzing"
				? ("analyzing" as const)
				: ("awaiting_answer" as const),
		updatedAt: step.request.updatedAt,
		request: step.request,
	};
}

function createAuthenticatedApp(router: any) {
	const app = new Hono<{
		Variables: {
			user: { id: string } | null;
			session: { id: string } | null;
		};
	}>();

	app.use("*", async (c, next) => {
		c.set("user", { id: "user-1" });
		c.set("session", { id: "session-1" });
		await next();
	});
	app.route("/", router);

	return app;
}

function buildWebsiteRequest(body: Record<string, unknown>): Request {
	return buildRouteRequest({
		body,
		method: "POST",
	});
}

function buildRouteRequest(params: {
	method: string;
	body?: Record<string, unknown>;
	headers?: Record<string, string>;
}): Request {
	return new Request("http://localhost/stream-step", {
		method: params.method,
		headers: {
			...(params.body
				? {
						"Content-Type": "application/json",
					}
				: {}),
			...params.headers,
		},
		body: params.body ? JSON.stringify(params.body) : undefined,
	});
}

function buildPreflightRequest(
	origin: string,
	requestHeaders = "content-type"
) {
	return buildRouteRequest({
		method: "OPTIONS",
		headers: {
			Origin: origin,
			"Access-Control-Request-Method": "POST",
			"Access-Control-Request-Headers": requestHeaders,
		},
	});
}

function createDeps() {
	const transactionMock = mock(
		async (callback: (tx: unknown) => Promise<unknown>) => callback({} as never)
	);
	const createKnowledgeClarificationTurnMock = mock(async () => {});
	const getKnowledgeClarificationRequestByIdMock = mock(async () =>
		createRequestRecord()
	);
	const listKnowledgeClarificationTurnsMock = mock(async () => [
		{
			id: "turn-1",
			requestId: REQUEST_ID,
			role: "ai_question",
			question: "What plan are they asking about?",
			suggestedAnswers: ["Free", "Pro", "Enterprise"],
			selectedAnswer: null,
			freeAnswer: null,
			createdAt: "2026-04-02T00:00:00.000Z",
			updatedAt: "2026-04-02T00:00:00.000Z",
		},
	]);
	const updateKnowledgeClarificationRequestMock = mock(async () =>
		createRequestRecord({
			status: "analyzing",
			updatedAt: "2026-04-02T00:00:05.000Z",
		})
	);
	const getAiAgentForWebsiteMock = mock(async () => ({
		id: "ai-1",
		name: "Support AI",
	}));
	const getKnowledgeByIdMock = mock(async () => ({
		id: KNOWLEDGE_ID,
		websiteId: "site-1",
		type: "faq",
		payload: {
			question: "How does billing work?",
		},
	}));
	const getWebsiteBySlugWithAccessMock = mock(async () => ({
		id: "site-1",
		organizationId: "org-1",
	}));
	const createKnowledgeClarificationAuditEntryMock = mock(async () => {});
	const emitConversationClarificationUpdateMock = mock(async () => {});
	const loadKnowledgeClarificationRuntimeMock = mock(async () => ({
		aiAgent: { id: "ai-1", name: "Support AI" },
		conversation: {
			id: "conv-1",
			websiteId: "site-1",
			organizationId: "org-1",
		},
		targetKnowledge: null,
	}));
	const prepareConversationKnowledgeClarificationStartMock = mock(async () => ({
		kind: "stream" as const,
		request: createRequestRecord({
			status: "analyzing",
			updatedAt: "2026-04-02T00:00:05.000Z",
		}),
		created: true,
		resolution: "created" as const,
	}));
	const prepareFaqKnowledgeClarificationStartMock = mock(async () => ({
		kind: "stream" as const,
		request: createDraftStep().request,
		created: true,
		resolution: "created" as const,
	}));
	const startKnowledgeClarificationStepStreamMock = mock((async () => ({
		textStream: createTextStream(
			'{"kind":"question","topicSummary":"Billing clarification","question":"What plan are they asking about?"',
			',"suggestedAnswers":["Free","Pro","Enterprise"],"inputMode":"suggested_answers","questionScope":"narrow_detail","questionPlan":null,"draftFaqPayload":null,"lastError":null}'
		),
		finalize: async () => createQuestionStep(),
	})) as (...args: unknown[]) => Promise<unknown>);
	const loadConversationContextMock = mock(async () => ({
		website: { id: "site-1", organizationId: "org-1" },
		conversation: {
			id: "conv-1",
			websiteId: "site-1",
			organizationId: "org-1",
		},
	}));
	const toKnowledgeClarificationStreamStepResponseMock = mock(
		(
			step:
				| ReturnType<typeof createQuestionStep>
				| ReturnType<typeof createDraftStep>
				| ReturnType<typeof createRetryStep>
		) => {
			if (step.kind === "draft_ready") {
				return {
					requestId: step.request.id,
					decision: {
						kind: "draft_ready" as const,
						topicSummary: step.request.topicSummary,
						questionPlan: step.request.questionPlan,
						question: null,
						suggestedAnswers: null,
						inputMode: null,
						questionScope: null,
						draftFaqPayload: step.draftFaqPayload,
						lastError: step.request.lastError,
					},
					status: "draft_ready" as const,
					updatedAt: step.request.updatedAt,
					request: step.request,
				};
			}

			if (step.kind === "retry_required") {
				return {
					requestId: step.request.id,
					decision: {
						kind: "retry_required" as const,
						topicSummary: step.request.topicSummary,
						questionPlan: step.request.questionPlan,
						question: null,
						suggestedAnswers: null,
						inputMode: null,
						questionScope: null,
						draftFaqPayload: null,
						lastError: step.request.lastError,
					},
					status: "retry_required" as const,
					updatedAt: step.request.updatedAt,
					request: step.request,
				};
			}

			return createJsonEnvelope(step);
		}
	);

	return {
		db: {
			transaction: transactionMock,
		} as never,
		transactionMock,
		createKnowledgeClarificationTurnMock,
		getKnowledgeClarificationRequestByIdMock,
		listKnowledgeClarificationTurnsMock,
		updateKnowledgeClarificationRequestMock,
		getAiAgentForWebsiteMock,
		getKnowledgeByIdMock,
		getWebsiteBySlugWithAccessMock,
		createKnowledgeClarificationAuditEntryMock,
		emitConversationClarificationUpdateMock,
		loadKnowledgeClarificationRuntimeMock,
		prepareConversationKnowledgeClarificationStartMock,
		prepareFaqKnowledgeClarificationStartMock,
		startKnowledgeClarificationStepStreamMock,
		loadConversationContextMock,
		toKnowledgeClarificationStreamStepResponseMock,
	};
}

async function createTestApp(deps: ReturnType<typeof createDeps>) {
	const { createKnowledgeClarificationStreamRouter } = await routeModulePromise;
	const router = createKnowledgeClarificationStreamRouter({
		db: deps.db,
		createKnowledgeClarificationTurn:
			deps.createKnowledgeClarificationTurnMock as never,
		getKnowledgeClarificationRequestById:
			deps.getKnowledgeClarificationRequestByIdMock as never,
		listKnowledgeClarificationTurns:
			deps.listKnowledgeClarificationTurnsMock as never,
		updateKnowledgeClarificationRequest:
			deps.updateKnowledgeClarificationRequestMock as never,
		getAiAgentForWebsite: deps.getAiAgentForWebsiteMock as never,
		getKnowledgeById: deps.getKnowledgeByIdMock as never,
		getWebsiteBySlugWithAccess: deps.getWebsiteBySlugWithAccessMock as never,
		createKnowledgeClarificationAuditEntry:
			deps.createKnowledgeClarificationAuditEntryMock as never,
		emitConversationClarificationUpdate:
			deps.emitConversationClarificationUpdateMock as never,
		loadKnowledgeClarificationRuntime:
			deps.loadKnowledgeClarificationRuntimeMock as never,
		prepareConversationKnowledgeClarificationStart:
			deps.prepareConversationKnowledgeClarificationStartMock as never,
		prepareFaqKnowledgeClarificationStart:
			deps.prepareFaqKnowledgeClarificationStartMock as never,
		startKnowledgeClarificationStepStream:
			deps.startKnowledgeClarificationStepStreamMock as never,
		loadConversationContext: deps.loadConversationContextMock as never,
		toKnowledgeClarificationStreamStepResponse:
			deps.toKnowledgeClarificationStreamStepResponseMock as never,
	});

	return createAuthenticatedApp(router);
}

describe("knowledgeClarificationStreamRouter", () => {
	let deps: ReturnType<typeof createDeps>;

	beforeEach(() => {
		deps = createDeps();
	});

	it("returns explicit preflight CORS headers for allowed origins", async () => {
		const app = await createTestApp(deps);

		const response = await app.request(
			buildPreflightRequest("https://cossistant.com")
		);

		expect(response.status).toBe(204);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
			"https://cossistant.com"
		);
		expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
			"true"
		);
		expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
			"POST"
		);
		expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
			"content-type"
		);
		expect(response.headers.get("Vary")).toContain("Origin");
	});

	it("adds CORS headers to streamed POST responses for allowed origins", async () => {
		const app = await createTestApp(deps);

		const response = await app.request(
			buildRouteRequest({
				method: "POST",
				headers: {
					Origin: "https://cossistant.com",
				},
				body: {
					action: "start_conversation",
					websiteSlug: "acme",
					conversationId: "conv-1",
					topicSummary: "Billing clarification",
				},
			})
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
			"https://cossistant.com"
		);
		expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
			"true"
		);
		expect(response.headers.get("Vary")).toContain("Origin");

		const payload = await response.json();
		expect(payload).toMatchObject({
			requestId: REQUEST_ID,
			status: "awaiting_answer",
		});
	});

	it("does not echo allow-origin for disallowed origins", async () => {
		const app = await createTestApp(deps);

		const response = await app.request(
			buildPreflightRequest("https://evil.example")
		);

		expect(response.status).toBe(204);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
		expect(response.headers.get("Vary")).toContain("Origin");
	});

	it("streams a partial decision before appending the final request", async () => {
		const { createKnowledgeClarificationStreamRouter } =
			await routeModulePromise;
		const router = createKnowledgeClarificationStreamRouter({
			db: deps.db,
			createKnowledgeClarificationTurn:
				deps.createKnowledgeClarificationTurnMock as never,
			getKnowledgeClarificationRequestById:
				deps.getKnowledgeClarificationRequestByIdMock as never,
			updateKnowledgeClarificationRequest:
				deps.updateKnowledgeClarificationRequestMock as never,
			getAiAgentForWebsite: deps.getAiAgentForWebsiteMock as never,
			getKnowledgeById: deps.getKnowledgeByIdMock as never,
			getWebsiteBySlugWithAccess: deps.getWebsiteBySlugWithAccessMock as never,
			createKnowledgeClarificationAuditEntry:
				deps.createKnowledgeClarificationAuditEntryMock as never,
			emitConversationClarificationUpdate:
				deps.emitConversationClarificationUpdateMock as never,
			loadKnowledgeClarificationRuntime:
				deps.loadKnowledgeClarificationRuntimeMock as never,
			prepareConversationKnowledgeClarificationStart:
				deps.prepareConversationKnowledgeClarificationStartMock as never,
			prepareFaqKnowledgeClarificationStart:
				deps.prepareFaqKnowledgeClarificationStartMock as never,
			startKnowledgeClarificationStepStream:
				deps.startKnowledgeClarificationStepStreamMock as never,
			loadConversationContext: deps.loadConversationContextMock as never,
			toKnowledgeClarificationStreamStepResponse:
				deps.toKnowledgeClarificationStreamStepResponseMock as never,
		});
		const app = createAuthenticatedApp(router);

		const response = await app.request(
			buildWebsiteRequest({
				action: "start_conversation",
				websiteSlug: "acme",
				conversationId: "conv-1",
				topicSummary: "Billing clarification",
			})
		);

		expect(response.status).toBe(200);

		const reader = response.body?.getReader();
		expect(reader).toBeDefined();
		if (!reader) {
			throw new Error("Expected response stream reader");
		}

		const firstChunk = await reader.read();
		expect(firstChunk.done).toBe(false);
		const firstText = new TextDecoder().decode(firstChunk.value);
		expect(firstText).toContain('"decision":');
		expect(firstText).not.toContain('"request":');

		let remainingText = "";
		while (true) {
			const next = await reader.read();
			if (next.done) {
				break;
			}
			remainingText += new TextDecoder().decode(next.value);
		}

		const fullText = firstText + remainingText;
		const parsed = JSON.parse(fullText);
		expect(parsed.request.id).toBe(REQUEST_ID);
		expect(parsed.decision.kind).toBe("question");
		expect(parsed.status).toBe("awaiting_answer");
	});

	it("routes answer through the shared interactive handler", async () => {
		const { createKnowledgeClarificationStreamRouter } =
			await routeModulePromise;
		const router = createKnowledgeClarificationStreamRouter({
			db: deps.db,
			createKnowledgeClarificationTurn:
				deps.createKnowledgeClarificationTurnMock as never,
			getKnowledgeClarificationRequestById:
				deps.getKnowledgeClarificationRequestByIdMock as never,
			updateKnowledgeClarificationRequest:
				deps.updateKnowledgeClarificationRequestMock as never,
			getAiAgentForWebsite: deps.getAiAgentForWebsiteMock as never,
			getKnowledgeById: deps.getKnowledgeByIdMock as never,
			getWebsiteBySlugWithAccess: deps.getWebsiteBySlugWithAccessMock as never,
			createKnowledgeClarificationAuditEntry:
				deps.createKnowledgeClarificationAuditEntryMock as never,
			emitConversationClarificationUpdate:
				deps.emitConversationClarificationUpdateMock as never,
			loadKnowledgeClarificationRuntime:
				deps.loadKnowledgeClarificationRuntimeMock as never,
			prepareConversationKnowledgeClarificationStart:
				deps.prepareConversationKnowledgeClarificationStartMock as never,
			prepareFaqKnowledgeClarificationStart:
				deps.prepareFaqKnowledgeClarificationStartMock as never,
			startKnowledgeClarificationStepStream:
				deps.startKnowledgeClarificationStepStreamMock as never,
			loadConversationContext: deps.loadConversationContextMock as never,
			toKnowledgeClarificationStreamStepResponse:
				deps.toKnowledgeClarificationStreamStepResponseMock as never,
		});
		const app = createAuthenticatedApp(router);

		const response = await app.request(
			buildWebsiteRequest({
				action: "answer",
				websiteSlug: "acme",
				requestId: REQUEST_ID,
				expectedStepIndex: 1,
				selectedAnswer: "Pro",
			})
		);

		expect(response.status).toBe(200);
		expect(deps.createKnowledgeClarificationTurnMock).toHaveBeenCalledWith(
			{} as never,
			expect.objectContaining({
				requestId: REQUEST_ID,
				role: "human_answer",
				selectedAnswer: "Pro",
			})
		);
		expect(
			deps.createKnowledgeClarificationAuditEntryMock
		).toHaveBeenCalledWith(
			expect.objectContaining({
				text: "Knowledge clarification answered: Pro",
			})
		);
		expect(
			deps.startKnowledgeClarificationStepStreamMock
		).toHaveBeenCalledTimes(1);
	});

	it("returns the current analyzing step instead of erroring when an answer submit misses the status claim", async () => {
		deps.updateKnowledgeClarificationRequestMock.mockResolvedValue(
			null as never
		);
		deps.getKnowledgeClarificationRequestByIdMock
			.mockResolvedValueOnce(createRequestRecord())
			.mockResolvedValueOnce(
				createRequestRecord({
					status: "analyzing",
					updatedAt: "2026-04-02T00:00:05.000Z",
				})
			);

		const { createKnowledgeClarificationStreamRouter } =
			await routeModulePromise;
		const router = createKnowledgeClarificationStreamRouter({
			db: deps.db,
			createKnowledgeClarificationTurn:
				deps.createKnowledgeClarificationTurnMock as never,
			getKnowledgeClarificationRequestById:
				deps.getKnowledgeClarificationRequestByIdMock as never,
			listKnowledgeClarificationTurns:
				deps.listKnowledgeClarificationTurnsMock as never,
			updateKnowledgeClarificationRequest:
				deps.updateKnowledgeClarificationRequestMock as never,
			getAiAgentForWebsite: deps.getAiAgentForWebsiteMock as never,
			getKnowledgeById: deps.getKnowledgeByIdMock as never,
			getWebsiteBySlugWithAccess: deps.getWebsiteBySlugWithAccessMock as never,
			createKnowledgeClarificationAuditEntry:
				deps.createKnowledgeClarificationAuditEntryMock as never,
			emitConversationClarificationUpdate:
				deps.emitConversationClarificationUpdateMock as never,
			loadKnowledgeClarificationRuntime:
				deps.loadKnowledgeClarificationRuntimeMock as never,
			prepareConversationKnowledgeClarificationStart:
				deps.prepareConversationKnowledgeClarificationStartMock as never,
			prepareFaqKnowledgeClarificationStart:
				deps.prepareFaqKnowledgeClarificationStartMock as never,
			startKnowledgeClarificationStepStream:
				deps.startKnowledgeClarificationStepStreamMock as never,
			loadConversationContext: deps.loadConversationContextMock as never,
			toKnowledgeClarificationStreamStepResponse:
				deps.toKnowledgeClarificationStreamStepResponseMock as never,
		});
		const app = createAuthenticatedApp(router);

		const response = await app.request(
			buildWebsiteRequest({
				action: "answer",
				websiteSlug: "acme",
				requestId: REQUEST_ID,
				expectedStepIndex: 1,
				selectedAnswer: "Pro",
			})
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			requestId: REQUEST_ID,
			status: "analyzing",
			request: {
				id: REQUEST_ID,
				status: "analyzing",
				stepIndex: 1,
			},
		});
		expect(deps.createKnowledgeClarificationTurnMock).not.toHaveBeenCalled();
		expect(
			deps.startKnowledgeClarificationStepStreamMock
		).not.toHaveBeenCalled();
	});

	it("keeps terminal clarification requests as hard errors for answer submits", async () => {
		deps.getKnowledgeClarificationRequestByIdMock.mockResolvedValue(
			createRequestRecord({
				status: "applied",
				currentQuestion: null,
				currentSuggestedAnswers: null,
				currentQuestionInputMode: null,
				currentQuestionScope: null,
			})
		);

		const { createKnowledgeClarificationStreamRouter } =
			await routeModulePromise;
		const router = createKnowledgeClarificationStreamRouter({
			db: deps.db,
			getKnowledgeClarificationRequestById:
				deps.getKnowledgeClarificationRequestByIdMock as never,
			getWebsiteBySlugWithAccess: deps.getWebsiteBySlugWithAccessMock as never,
			updateKnowledgeClarificationRequest:
				deps.updateKnowledgeClarificationRequestMock as never,
		});
		const app = createAuthenticatedApp(router);

		const response = await app.request(
			buildWebsiteRequest({
				action: "answer",
				websiteSlug: "acme",
				requestId: REQUEST_ID,
				expectedStepIndex: 1,
				selectedAnswer: "Pro",
			})
		);

		expect(response.status).toBe(400);
		expect(await response.text()).toContain(
			"This clarification request can no longer be changed"
		);
	});

	it("routes skip through the shared interactive handler", async () => {
		const { createKnowledgeClarificationStreamRouter } =
			await routeModulePromise;
		const router = createKnowledgeClarificationStreamRouter({
			db: deps.db,
			createKnowledgeClarificationTurn:
				deps.createKnowledgeClarificationTurnMock as never,
			getKnowledgeClarificationRequestById:
				deps.getKnowledgeClarificationRequestByIdMock as never,
			updateKnowledgeClarificationRequest:
				deps.updateKnowledgeClarificationRequestMock as never,
			getAiAgentForWebsite: deps.getAiAgentForWebsiteMock as never,
			getKnowledgeById: deps.getKnowledgeByIdMock as never,
			getWebsiteBySlugWithAccess: deps.getWebsiteBySlugWithAccessMock as never,
			createKnowledgeClarificationAuditEntry:
				deps.createKnowledgeClarificationAuditEntryMock as never,
			emitConversationClarificationUpdate:
				deps.emitConversationClarificationUpdateMock as never,
			loadKnowledgeClarificationRuntime:
				deps.loadKnowledgeClarificationRuntimeMock as never,
			prepareConversationKnowledgeClarificationStart:
				deps.prepareConversationKnowledgeClarificationStartMock as never,
			prepareFaqKnowledgeClarificationStart:
				deps.prepareFaqKnowledgeClarificationStartMock as never,
			startKnowledgeClarificationStepStream:
				deps.startKnowledgeClarificationStepStreamMock as never,
			loadConversationContext: deps.loadConversationContextMock as never,
			toKnowledgeClarificationStreamStepResponse:
				deps.toKnowledgeClarificationStreamStepResponseMock as never,
		});
		const app = createAuthenticatedApp(router);

		const response = await app.request(
			buildWebsiteRequest({
				action: "skip",
				websiteSlug: "acme",
				requestId: REQUEST_ID,
				expectedStepIndex: 1,
			})
		);

		expect(response.status).toBe(200);
		expect(deps.createKnowledgeClarificationTurnMock).toHaveBeenCalledWith(
			{} as never,
			expect.objectContaining({
				requestId: REQUEST_ID,
				role: "human_skip",
			})
		);
		expect(
			deps.createKnowledgeClarificationAuditEntryMock
		).toHaveBeenCalledWith(
			expect.objectContaining({
				text: "Knowledge clarification question skipped.",
			})
		);
	});

	it("routes retry through the shared interactive handler without creating a turn", async () => {
		deps.getKnowledgeClarificationRequestByIdMock.mockResolvedValue(
			createRequestRecord({
				status: "retry_required",
				currentQuestion: null,
				currentSuggestedAnswers: null,
				currentQuestionInputMode: null,
				currentQuestionScope: null,
				lastError: "No output generated.",
			})
		);

		const { createKnowledgeClarificationStreamRouter } =
			await routeModulePromise;
		const router = createKnowledgeClarificationStreamRouter({
			db: deps.db,
			createKnowledgeClarificationTurn:
				deps.createKnowledgeClarificationTurnMock as never,
			getKnowledgeClarificationRequestById:
				deps.getKnowledgeClarificationRequestByIdMock as never,
			updateKnowledgeClarificationRequest:
				deps.updateKnowledgeClarificationRequestMock as never,
			getAiAgentForWebsite: deps.getAiAgentForWebsiteMock as never,
			getKnowledgeById: deps.getKnowledgeByIdMock as never,
			getWebsiteBySlugWithAccess: deps.getWebsiteBySlugWithAccessMock as never,
			createKnowledgeClarificationAuditEntry:
				deps.createKnowledgeClarificationAuditEntryMock as never,
			emitConversationClarificationUpdate:
				deps.emitConversationClarificationUpdateMock as never,
			loadKnowledgeClarificationRuntime:
				deps.loadKnowledgeClarificationRuntimeMock as never,
			prepareConversationKnowledgeClarificationStart:
				deps.prepareConversationKnowledgeClarificationStartMock as never,
			prepareFaqKnowledgeClarificationStart:
				deps.prepareFaqKnowledgeClarificationStartMock as never,
			startKnowledgeClarificationStepStream:
				deps.startKnowledgeClarificationStepStreamMock as never,
			loadConversationContext: deps.loadConversationContextMock as never,
			toKnowledgeClarificationStreamStepResponse:
				deps.toKnowledgeClarificationStreamStepResponseMock as never,
		});
		const app = createAuthenticatedApp(router);

		const response = await app.request(
			buildWebsiteRequest({
				action: "retry",
				websiteSlug: "acme",
				requestId: REQUEST_ID,
			})
		);

		expect(response.status).toBe(200);
		expect(deps.createKnowledgeClarificationTurnMock).not.toHaveBeenCalled();
		expect(
			deps.createKnowledgeClarificationAuditEntryMock
		).not.toHaveBeenCalled();
		expect(
			deps.startKnowledgeClarificationStepStreamMock
		).toHaveBeenCalledTimes(1);
	});

	it("closes with a valid retry_required envelope when the model emits no decision chunks", async () => {
		deps.startKnowledgeClarificationStepStreamMock.mockResolvedValue({
			textStream: createTextStream(),
			finalize: async () => createRetryStep(),
		});

		const { createKnowledgeClarificationStreamRouter } =
			await routeModulePromise;
		const router = createKnowledgeClarificationStreamRouter({
			db: deps.db,
			createKnowledgeClarificationTurn:
				deps.createKnowledgeClarificationTurnMock as never,
			getKnowledgeClarificationRequestById:
				deps.getKnowledgeClarificationRequestByIdMock as never,
			updateKnowledgeClarificationRequest:
				deps.updateKnowledgeClarificationRequestMock as never,
			getAiAgentForWebsite: deps.getAiAgentForWebsiteMock as never,
			getKnowledgeById: deps.getKnowledgeByIdMock as never,
			getWebsiteBySlugWithAccess: deps.getWebsiteBySlugWithAccessMock as never,
			createKnowledgeClarificationAuditEntry:
				deps.createKnowledgeClarificationAuditEntryMock as never,
			emitConversationClarificationUpdate:
				deps.emitConversationClarificationUpdateMock as never,
			loadKnowledgeClarificationRuntime:
				deps.loadKnowledgeClarificationRuntimeMock as never,
			prepareConversationKnowledgeClarificationStart:
				deps.prepareConversationKnowledgeClarificationStartMock as never,
			prepareFaqKnowledgeClarificationStart:
				deps.prepareFaqKnowledgeClarificationStartMock as never,
			startKnowledgeClarificationStepStream:
				deps.startKnowledgeClarificationStepStreamMock as never,
			loadConversationContext: deps.loadConversationContextMock as never,
			toKnowledgeClarificationStreamStepResponse:
				deps.toKnowledgeClarificationStreamStepResponseMock as never,
		});
		const app = createAuthenticatedApp(router);

		const response = await app.request(
			buildWebsiteRequest({
				action: "start_faq",
				websiteSlug: "acme",
				knowledgeId: KNOWLEDGE_ID,
			})
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			requestId: REQUEST_ID,
			decision: {
				kind: "retry_required",
				topicSummary: "Billing clarification",
				questionPlan: null,
				question: null,
				suggestedAnswers: null,
				inputMode: null,
				questionScope: null,
				draftFaqPayload: null,
				lastError: "No output generated.",
			},
			status: "retry_required",
			updatedAt: "2026-04-02T00:00:00.000Z",
			request: createRetryStep().request,
		});
	});

	it("returns an immediate JSON step when FAQ deepen reuses an existing clarification", async () => {
		deps.prepareFaqKnowledgeClarificationStartMock.mockResolvedValue({
			kind: "step",
			request: createDraftStep().request,
			step: createDraftStep(),
			created: false,
			resolution: "reused",
		} as never);

		const { createKnowledgeClarificationStreamRouter } =
			await routeModulePromise;
		const router = createKnowledgeClarificationStreamRouter({
			db: deps.db,
			createKnowledgeClarificationTurn:
				deps.createKnowledgeClarificationTurnMock as never,
			getKnowledgeClarificationRequestById:
				deps.getKnowledgeClarificationRequestByIdMock as never,
			updateKnowledgeClarificationRequest:
				deps.updateKnowledgeClarificationRequestMock as never,
			getAiAgentForWebsite: deps.getAiAgentForWebsiteMock as never,
			getKnowledgeById: deps.getKnowledgeByIdMock as never,
			getWebsiteBySlugWithAccess: deps.getWebsiteBySlugWithAccessMock as never,
			createKnowledgeClarificationAuditEntry:
				deps.createKnowledgeClarificationAuditEntryMock as never,
			emitConversationClarificationUpdate:
				deps.emitConversationClarificationUpdateMock as never,
			loadKnowledgeClarificationRuntime:
				deps.loadKnowledgeClarificationRuntimeMock as never,
			prepareConversationKnowledgeClarificationStart:
				deps.prepareConversationKnowledgeClarificationStartMock as never,
			prepareFaqKnowledgeClarificationStart:
				deps.prepareFaqKnowledgeClarificationStartMock as never,
			startKnowledgeClarificationStepStream:
				deps.startKnowledgeClarificationStepStreamMock as never,
			loadConversationContext: deps.loadConversationContextMock as never,
			toKnowledgeClarificationStreamStepResponse:
				deps.toKnowledgeClarificationStreamStepResponseMock as never,
		});
		const app = createAuthenticatedApp(router);

		const response = await app.request(
			buildWebsiteRequest({
				action: "start_faq",
				websiteSlug: "acme",
				knowledgeId: KNOWLEDGE_ID,
			})
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			requestId: FAQ_REQUEST_ID,
			decision: {
				kind: "draft_ready",
				topicSummary: "Billing clarification",
				questionPlan: null,
				question: null,
				suggestedAnswers: null,
				inputMode: null,
				questionScope: null,
				draftFaqPayload: createDraftStep().draftFaqPayload,
				lastError: null,
			},
			status: "draft_ready",
			updatedAt: "2026-04-02T00:00:00.000Z",
			request: createDraftStep().request,
		});
		expect(
			deps.startKnowledgeClarificationStepStreamMock
		).not.toHaveBeenCalled();
	});
});
