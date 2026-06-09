import { beforeEach, describe, expect, it, mock } from "bun:test";

const getConversationByIdMock = mock(async () => ({
	id: "conv-1",
	organizationId: "org-1",
	websiteId: "site-1",
	visitorId: "visitor-1",
	visitorLanguage: "es",
	translationActivatedAt: null,
	translationChargedAt: null,
	title: "Billing question",
}));
const getPlanForWebsiteMock = mock(async () => ({
	features: { "auto-translate": true },
}));
const prepareOutboundVisitorTranslationMock = mock(async () => ({
	sourceLanguage: "en",
	translationPart: {
		type: "translation" as const,
		text: "Respuesta en espanol",
		sourceLanguage: "en",
		targetLanguage: "es",
		audience: "visitor" as const,
		mode: "auto" as const,
		modelId: "test-model",
	},
	translationResult: {
		status: "translated" as const,
		text: "Respuesta en espanol",
		sourceLanguage: "en",
		targetLanguage: "es",
		modelId: "test-model",
		billingSource: "cossistant" as const,
	},
}));
const finalizeConversationTranslationMock = mock(async () => ({
	status: "noop",
}));
const isAutomaticTranslationEnabledMock = mock(() => true);
const createMessageTimelineItemMock = mock(async () => ({
	item: { id: "msg-1" },
}));
const isAiPausedForConversationMock = mock(async () => false);
const recordOutboundPublicAiMessageAndMaybePauseMock = mock(async () => ({
	paused: false,
	messageCount: 1,
}));

mock.module("@api/db/queries/conversation", () => ({
	getConversationById: getConversationByIdMock,
}));

mock.module("@api/lib/plans/access", () => ({
	getPlanForWebsite: getPlanForWebsiteMock,
}));

mock.module("@api/lib/translation", () => ({
	finalizeConversationTranslation: finalizeConversationTranslationMock,
	isAutomaticTranslationEnabled: isAutomaticTranslationEnabledMock,
	prepareOutboundVisitorTranslation: prepareOutboundVisitorTranslationMock,
}));

mock.module("@api/redis", () => ({
	getRedis: mock(() => ({})),
}));

mock.module("@api/utils/timeline-item", () => ({
	createMessageTimelineItem: createMessageTimelineItemMock,
}));

mock.module("../safety/kill-switch", () => ({
	isAiPausedForConversation: isAiPausedForConversationMock,
	recordOutboundPublicAiMessageAndMaybePause:
		recordOutboundPublicAiMessageAndMaybePauseMock,
}));

const sendMessageModulePath = "./send-message?translation-regression";
const modulePromise = import(sendMessageModulePath) as Promise<
	typeof import("./send-message")
>;

function createDbHarness() {
	const selectOperation = {
		from: mock(() => selectOperation),
		where: mock(() => selectOperation),
		limit: mock(async () => []),
	};
	const websiteFindFirstMock = mock(async () => ({
		id: "site-1",
		defaultLanguage: "en",
		autoTranslateEnabled: true,
	}));

	return {
		db: {
			select: mock(() => selectOperation),
			query: {
				website: {
					findFirst: websiteFindFirstMock,
				},
			},
		},
		websiteFindFirstMock,
	};
}

describe("sendMessage", () => {
	beforeEach(() => {
		getConversationByIdMock.mockClear();
		getPlanForWebsiteMock.mockClear();
		prepareOutboundVisitorTranslationMock.mockClear();
		finalizeConversationTranslationMock.mockClear();
		isAutomaticTranslationEnabledMock.mockClear();
		createMessageTimelineItemMock.mockClear();
		isAiPausedForConversationMock.mockClear();
		recordOutboundPublicAiMessageAndMaybePauseMock.mockClear();
	});

	it("stores the default-language AI original and attaches a visitor translation part", async () => {
		const { sendMessage } = await modulePromise;
		const { db } = createDbHarness();

		const result = await sendMessage({
			db: db as never,
			conversationId: "conv-1",
			organizationId: "org-1",
			websiteId: "site-1",
			visitorId: "visitor-1",
			aiAgentId: "ai-1",
			text: "Default-language reply",
			idempotencyKey: "public:msg-1",
		});

		expect(result).toEqual({
			messageId: "msg-1",
			created: true,
		});
		expect(prepareOutboundVisitorTranslationMock).toHaveBeenCalledWith(
			expect.objectContaining({
				text: "Default-language reply",
				sourceLanguage: "en",
				visitorLanguage: "es",
				mode: "auto",
			})
		);
		expect(createMessageTimelineItemMock).toHaveBeenCalledWith(
			expect.objectContaining({
				text: "Default-language reply",
				aiAgentId: "ai-1",
				extraParts: [
					expect.objectContaining({
						type: "translation",
						text: "Respuesta en espanol",
						audience: "visitor",
						targetLanguage: "es",
					}),
				],
			})
		);
		expect(finalizeConversationTranslationMock).toHaveBeenCalledWith(
			expect.objectContaining({
				visitorLanguage: "es",
				hasTranslationPart: true,
				chargeCredits: true,
				aiAgentId: "ai-1",
			})
		);
	});
});
