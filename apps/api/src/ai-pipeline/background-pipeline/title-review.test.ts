import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { BackgroundTitleReviewParams } from "./title-review";

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
		title: "Visitor asked for help",
		confidence: 0.9,
		reason: "Fallback title for a generic help request.",
	},
})) as (...args: unknown[]) => Promise<{
	output: {
		title: string;
		confidence: number;
		reason: string;
	};
}>);
const resolveModelForExecutionMock = mock((modelId: string) => ({
	modelIdResolved: modelId,
}));
const logAiPipelineMock = mock((_params: unknown) => {});
const loadCurrentConversationMock = mock(async () => ({
	id: "conv-1",
	visitorId: "visitor-1",
	title: null as string | null,
	titleSource: null as "ai" | "user" | null,
	visitorLanguage: "es",
}));
const realtimeEmitMock = mock(async () => {});
const createTimelineItemMock = mock(async () => {});
const syncConversationVisitorTitleMock = mock(async () => ({
	visitorTitle: null,
	visitorTitleLanguage: null,
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

mock.module("../logger", () => ({
	logAiPipeline: logAiPipelineMock,
}));

mock.module("../shared/actions/load-current-conversation", () => ({
	loadCurrentConversation: loadCurrentConversationMock,
}));

mock.module("@api/realtime/emitter", () => ({
	realtime: {
		emit: realtimeEmitMock,
	},
}));

mock.module("@api/utils/timeline-item", () => ({
	createTimelineItem: createTimelineItemMock,
}));

mock.module("@api/lib/translation", () => ({
	detectMessageLanguage: mock(() => ({
		language: null,
		confidence: "low",
		source: "unknown",
	})),
	finalizeConversationTranslation: mock(async () => ({ status: "noop" })),
	isAutomaticTranslationEnabled: mock(() => false),
	prepareInboundVisitorTranslation: mock(async () => ({
		visitorLanguage: null,
		translationPart: null,
		translationResult: { status: "skipped", reason: "empty" },
	})),
	prepareOutboundVisitorTranslation: mock(async () => ({
		sourceLanguage: null,
		translationPart: null,
		translationResult: { status: "skipped", reason: "empty" },
	})),
	shouldMaskTypingPreview: mock(() => false),
	syncConversationVisitorTitle: syncConversationVisitorTitleMock,
}));

const modulePromise = import("./title-review");

function createDbMock() {
	const returningMock = mock(async () => [
		{
			id: "conv-1",
			visitorId: "visitor-1",
			titleSource: "ai",
		},
	]);
	const whereMock = mock(() => ({
		returning: returningMock,
	}));
	const setMock = mock(() => ({
		where: whereMock,
	}));
	const updateMock = mock(() => ({
		set: setMock,
	}));

	return {
		db: {
			update: updateMock,
		},
		setMock,
	};
}

function createParams(
	overrides: Partial<BackgroundTitleReviewParams> = {}
): BackgroundTitleReviewParams {
	return {
		db: {} as never,
		aiAgent: {
			id: "ai-1",
			name: "Agent",
			model: "moonshotai/kimi-k2.5",
		} as never,
		conversation: {
			id: "conv-1",
			organizationId: "org-1",
			websiteId: "site-1",
			visitorId: "visitor-1",
			title: null,
			titleSource: null,
			visitorLanguage: "es",
		} as never,
		organizationId: "org-1",
		websiteId: "site-1",
		aiAgentId: "ai-1",
		websiteDefaultLanguage: "en",
		visitorLanguage: "es",
		autoTranslateEnabled: true,
		conversationHistory: [
			{
				messageId: "msg-1",
				content: "I cannot export invoices from billing.",
				senderType: "visitor",
				senderId: "visitor-1",
				senderName: null,
				timestamp: "2026-03-04T10:00:00.000Z",
				visibility: "public",
			},
		],
		triggerMessage: {
			messageId: "msg-1",
			content: "I cannot export invoices from billing.",
			senderType: "visitor",
			senderId: "visitor-1",
			senderName: null,
			timestamp: "2026-03-04T10:00:00.000Z",
			visibility: "public",
		},
		...overrides,
	};
}

describe("runBackgroundTitleReview", () => {
	beforeEach(() => {
		createModelMock.mockReset();
		createModelForWebsiteMock.mockReset();
		runWithOpenRouterByokFallbackMock.mockReset();
		generateTextMock.mockReset();
		resolveModelForExecutionMock.mockReset();
		logAiPipelineMock.mockReset();
		loadCurrentConversationMock.mockReset();
		realtimeEmitMock.mockReset();
		createTimelineItemMock.mockReset();
		syncConversationVisitorTitleMock.mockReset();

		createModelMock.mockImplementation((modelId: string) => modelId);
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
		resolveModelForExecutionMock.mockImplementation((modelId: string) => ({
			modelIdResolved: modelId,
		}));
		generateTextMock.mockResolvedValue({
			output: {
				title: "Visitor asked for help",
				confidence: 0.9,
				reason: "Fallback title for a generic help request.",
			},
		});
		loadCurrentConversationMock.mockResolvedValue({
			id: "conv-1",
			visitorId: "visitor-1",
			title: null,
			titleSource: null,
			visitorLanguage: "es",
		});
		realtimeEmitMock.mockResolvedValue(undefined);
		createTimelineItemMock.mockResolvedValue(undefined);
		syncConversationVisitorTitleMock.mockResolvedValue({
			visitorTitle: null,
			visitorTitleLanguage: null,
		});
	});

	it("sets a concise title when the topic is clear", async () => {
		generateTextMock.mockResolvedValueOnce({
			output: {
				title: "  Invoice export issue  ",
				confidence: 0.91,
				reason: "The visitor is blocked exporting invoices.",
			},
		});

		const { runBackgroundTitleReview } = await modulePromise;
		const { db, setMock } = createDbMock();
		const result = await runBackgroundTitleReview(
			createParams({
				db: db as never,
			})
		);

		expect(result).toEqual({
			status: "updated",
			title: "Invoice export issue",
			reason: "The visitor is blocked exporting invoices.",
		});
		expect(setMock).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Invoice export issue",
				titleSource: "ai",
			})
		);
		expect(syncConversationVisitorTitleMock).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Invoice export issue",
				websiteDefaultLanguage: "en",
				visitorLanguage: "es",
				autoTranslateEnabled: true,
			})
		);
		expect(logAiPipelineMock).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "title_updated",
			})
		);
	});

	it("sets a fallback title when the visitor only says hi", async () => {
		generateTextMock.mockResolvedValueOnce({
			output: {
				title: "Support request",
				confidence: 0.94,
				reason: "Generic model output.",
			},
		});

		const { runBackgroundTitleReview } = await modulePromise;
		const { db, setMock } = createDbMock();
		const result = await runBackgroundTitleReview(
			createParams({
				db: db as never,
				conversationHistory: [],
				triggerMessage: {
					messageId: "msg-1",
					content: "hi",
					senderType: "visitor",
					senderId: "visitor-1",
					senderName: null,
					timestamp: "2026-03-04T10:00:00.000Z",
					visibility: "public",
				},
			})
		);

		expect(result).toEqual({
			status: "updated",
			title: "Visitor said hi",
			reason:
				"Fallback title used after model output was rejected: generic_title",
		});
		expect(setMock).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Visitor said hi",
			})
		);
		expect(logAiPipelineMock).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "title_fallback_used",
			})
		);
	});

	it("sets a fallback title when the visitor only asks for help", async () => {
		generateTextMock.mockRejectedValueOnce(new Error("model unavailable"));

		const { runBackgroundTitleReview } = await modulePromise;
		const { db, setMock } = createDbMock();
		const result = await runBackgroundTitleReview(
			createParams({
				db: db as never,
				conversationHistory: [],
				triggerMessage: {
					messageId: "msg-1",
					content: "can you help?",
					senderType: "visitor",
					senderId: "visitor-1",
					senderName: null,
					timestamp: "2026-03-04T10:00:00.000Z",
					visibility: "public",
				},
			})
		);

		expect(result).toEqual(
			expect.objectContaining({
				status: "updated",
				title: "Visitor asked for help",
			})
		);
		expect(setMock).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Visitor asked for help",
			})
		);
	});

	it("skips user-owned titles without calling the model", async () => {
		const { runBackgroundTitleReview } = await modulePromise;
		const result = await runBackgroundTitleReview(
			createParams({
				conversation: {
					id: "conv-1",
					organizationId: "org-1",
					websiteId: "site-1",
					visitorId: "visitor-1",
					title: "Manual title",
					titleSource: "user",
				} as never,
			})
		);

		expect(result).toEqual({
			status: "skipped",
			reason: "manual_title",
		});
		expect(generateTextMock).not.toHaveBeenCalled();
		expect(loadCurrentConversationMock).not.toHaveBeenCalled();
	});

	it("falls back for generic or low-confidence model titles", async () => {
		const { runBackgroundTitleReview } = await modulePromise;

		generateTextMock.mockResolvedValueOnce({
			output: {
				title: "Support request",
				confidence: 0.95,
				reason: "Generic model output.",
			},
		});
		const genericDb = createDbMock();
		const genericResult = await runBackgroundTitleReview(
			createParams({
				db: genericDb.db as never,
			})
		);

		generateTextMock.mockResolvedValueOnce({
			output: {
				title: "Invoice export issue",
				confidence: 0.5,
				reason: "Uncertain topic.",
			},
		});
		const lowConfidenceDb = createDbMock();
		const lowConfidenceResult = await runBackgroundTitleReview(
			createParams({
				db: lowConfidenceDb.db as never,
			})
		);

		expect(genericResult).toEqual({
			status: "updated",
			title: "Visitor said: I cannot export invoices from billing",
			reason:
				"Fallback title used after model output was rejected: generic_title",
		});
		expect(lowConfidenceResult).toEqual({
			status: "updated",
			title: "Visitor said: I cannot export invoices from billing",
			reason:
				"Fallback title used after model output was rejected: low_confidence",
		});
		expect(logAiPipelineMock).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "title_fallback_used",
			})
		);
	});

	it("falls back to a clear topic later when replacing an AI-owned fallback title", async () => {
		generateTextMock.mockResolvedValueOnce({
			output: {
				title: "Billing export issue",
				confidence: 0.9,
				reason: "The topic changed from greeting to billing export.",
			},
		});
		loadCurrentConversationMock.mockResolvedValueOnce({
			id: "conv-1",
			visitorId: "visitor-1",
			title: "Visitor said hi",
			titleSource: "ai",
			visitorLanguage: "es",
		});

		const { runBackgroundTitleReview } = await modulePromise;
		const { db, setMock } = createDbMock();
		const result = await runBackgroundTitleReview(
			createParams({
				db: db as never,
				conversation: {
					id: "conv-1",
					organizationId: "org-1",
					websiteId: "site-1",
					visitorId: "visitor-1",
					title: "Visitor said hi",
					titleSource: "ai",
				} as never,
			})
		);

		expect(result).toEqual({
			status: "updated",
			title: "Billing export issue",
			reason: "The topic changed from greeting to billing export.",
		});
		expect(setMock).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Billing export issue",
			})
		);
	});
});
