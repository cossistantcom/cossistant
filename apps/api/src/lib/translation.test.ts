import { beforeEach, describe, expect, it, mock } from "bun:test";

const createModelRawMock = mock((modelId: string) => ({ modelId }));
const createModelRawForWebsiteMock = mock(async (modelId: string) => ({
	model: { modelId, source: "website" },
	billingSource: "customer_openrouter" as const,
}));
const runWithOpenRouterByokFallbackMock = mock(
	async (params: {
		modelId: string;
		operation: (resolution: {
			model: { modelId: string; source: "website" };
			billingSource: "cossistant" | "customer_openrouter";
		}) => Promise<unknown>;
	}) => ({
		result: await params.operation({
			model: { modelId: params.modelId, source: "website" },
			billingSource: "customer_openrouter" as const,
		}),
		billingSource: "customer_openrouter" as const,
	})
);
const generateTextMock = mock((async () => ({
	text: "translated",
})) as (...args: unknown[]) => Promise<unknown>);
const ingestAiCreditUsageMock = mock(async () => ({
	status: "ingested" as const,
}));
const emitConversationTranslationUpdateMock = mock(async () => {});
const recordOpenRouterByokSuccessMock = mock(async () => {});
const recordOpenRouterByokFailureMock = mock(async () => {});

mock.module("@api/lib/ai", () => ({
	createModelRaw: createModelRawMock,
	createModelRawForWebsite: createModelRawForWebsiteMock,
	generateText: generateTextMock,
	runWithOpenRouterByokFallback: runWithOpenRouterByokFallbackMock,
}));

mock.module("@api/lib/ai-credits/polar-meter", () => ({
	ingestAiCreditUsage: ingestAiCreditUsageMock,
}));

mock.module("@api/utils/conversation-realtime", () => ({
	emitConversationTranslationUpdate: emitConversationTranslationUpdateMock,
}));

mock.module("@api/lib/openrouter-byok/resolver", () => ({
	recordOpenRouterByokFailure: recordOpenRouterByokFailureMock,
	recordOpenRouterByokSuccess: recordOpenRouterByokSuccessMock,
}));

const translationModulePromise = import("./translation");

function createConversationRecord(
	overrides: Partial<Record<string, unknown>> = {}
) {
	return {
		id: "conv_1",
		title: "Billing question",
		visitorTitle: null,
		visitorTitleLanguage: null,
		visitorLanguage: null,
		translationActivatedAt: null,
		translationChargedAt: null,
		organizationId: "org_1",
		websiteId: "site_1",
		visitorId: "visitor_1",
		channel: "widget",
		status: "open",
		metadata: null,
		createdAt: "2026-04-11T10:00:00.000Z",
		updatedAt: "2026-04-11T10:00:00.000Z",
		deletedAt: null,
		visitorRating: null,
		visitorRatingAt: null,
		...overrides,
	};
}

function createDbHarness(updateResults: unknown[]) {
	const queuedResults = [...updateResults];

	const updateMock = mock(() => {
		const result = queuedResults.shift();
		const operation = {
			set: mock(() => operation),
			where: mock(() => operation),
			returning: mock(async () => result ?? []),
		};

		return operation;
	});

	return {
		db: {
			update: updateMock,
		},
		updateMock,
	};
}

describe("translation helpers", () => {
	beforeEach(() => {
		createModelRawMock.mockReset();
		createModelRawMock.mockImplementation((modelId: string) => ({ modelId }));
		createModelRawForWebsiteMock.mockReset();
		createModelRawForWebsiteMock.mockImplementation(
			async (modelId: string) => ({
				model: { modelId, source: "website" },
				billingSource: "customer_openrouter" as const,
			})
		);
		runWithOpenRouterByokFallbackMock.mockReset();
		runWithOpenRouterByokFallbackMock.mockImplementation(async (params) => ({
			result: await params.operation({
				model: { modelId: params.modelId, source: "website" },
				billingSource: "customer_openrouter" as const,
			}),
			billingSource: "customer_openrouter" as const,
		}));
		generateTextMock.mockReset();
		generateTextMock.mockResolvedValue({
			text: "translated",
		});
		ingestAiCreditUsageMock.mockReset();
		ingestAiCreditUsageMock.mockResolvedValue({
			status: "ingested" as const,
		});
		emitConversationTranslationUpdateMock.mockReset();
		emitConversationTranslationUpdateMock.mockResolvedValue(undefined);
		recordOpenRouterByokSuccessMock.mockReset();
		recordOpenRouterByokSuccessMock.mockResolvedValue(undefined);
		recordOpenRouterByokFailureMock.mockReset();
		recordOpenRouterByokFailureMock.mockResolvedValue(undefined);
	});

	it("sends a strict fail-safe translation prompt and the raw message body", async () => {
		const { maybeTranslateText } = await translationModulePromise;

		await maybeTranslateText({
			text: "  Hello **team** `{{name}}`\n```ts\nconst a = 1;\n```  ",
			sourceLanguage: "en",
			targetLanguage: "es",
		});

		expect(generateTextMock).toHaveBeenCalledTimes(1);
		expect(generateTextMock.mock.calls[0]?.[0]).toMatchObject({
			model: { modelId: "google/gemini-2.5-flash-lite" },
			temperature: 0,
			system:
				"Translate MESSAGE into es. The message probably uses en. If MESSAGE is already in es, return it unchanged. Return only the translated message. Preserve markdown, URLs, code blocks, placeholders, emoji, punctuation, and line breaks. Do not add quotes, labels, or explanations.",
			prompt: "Hello **team** `{{name}}`\n```ts\nconst a = 1;\n```",
		});
	});

	it("accepts unchanged model output when the text is already in the target language", async () => {
		const { maybeTranslateText } = await translationModulePromise;
		generateTextMock.mockResolvedValueOnce({
			text: "Hola equipo",
		});

		const result = await maybeTranslateText({
			text: "Hola equipo",
			sourceLanguage: "en",
			targetLanguage: "es",
		});

		expect(result).toMatchObject({
			status: "translated",
			text: "Hola equipo",
			sourceLanguage: "en",
			targetLanguage: "es",
			modelId: "google/gemini-2.5-flash-lite",
		});
	});

	it("returns a timeout failure without dropping the translation request", async () => {
		const { maybeTranslateText } = await translationModulePromise;
		generateTextMock.mockImplementationOnce(
			() => new Promise(() => {}) as Promise<unknown>
		);

		const result = await maybeTranslateText({
			text: "Hello there",
			sourceLanguage: "en",
			targetLanguage: "es",
			timeoutMs: 0,
		});

		expect(result).toMatchObject({
			status: "failed",
			reason: "timeout",
			sourceLanguage: "en",
			targetLanguage: "es",
		});
	});

	it("uses website OpenRouter credentials when translation receives AI context", async () => {
		const { maybeTranslateText } = await translationModulePromise;

		const result = await maybeTranslateText({
			text: "Hello there",
			sourceLanguage: "en",
			targetLanguage: "es",
			aiContext: {
				db: {} as never,
				organizationId: "org_1",
				websiteId: "site_1",
			},
		});

		expect(runWithOpenRouterByokFallbackMock).toHaveBeenCalledTimes(1);
		expect(runWithOpenRouterByokFallbackMock.mock.calls[0]?.[0]).toMatchObject({
			modelId: "google/gemini-2.5-flash-lite",
			kind: "raw",
			options: {
				context: {
					organizationId: "org_1",
					websiteId: "site_1",
				},
			},
		});
		expect(createModelRawForWebsiteMock).not.toHaveBeenCalled();
		expect(createModelRawMock).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			status: "translated",
			billingSource: "customer_openrouter",
		});
	});

	it("returns cossistant billing when website translation falls back from BYOK", async () => {
		const { maybeTranslateText } = await translationModulePromise;
		runWithOpenRouterByokFallbackMock.mockImplementationOnce(
			async (params) => ({
				result: await params.operation({
					model: { modelId: params.modelId, source: "website" },
					billingSource: "cossistant" as const,
				}),
				billingSource: "cossistant" as const,
				fallbackFromBillingSource: "customer_openrouter" as const,
				fallbackErrorCode: "openrouter_http_401",
				usedOpenRouterByokFallback: true,
			})
		);

		const result = await maybeTranslateText({
			text: "Hello there",
			sourceLanguage: "en",
			targetLanguage: "es",
			aiContext: {
				db: {} as never,
				organizationId: "org_1",
				websiteId: "site_1",
			},
		});

		expect(result).toMatchObject({
			status: "translated",
			billingSource: "cossistant",
		});
	});

	it("enables automatic translation only when the plan allows it and the website toggle is on", async () => {
		const { isAutomaticTranslationEnabled } = await translationModulePromise;

		expect(
			isAutomaticTranslationEnabled({
				planAllowsAutoTranslate: true,
				websiteAutoTranslateEnabled: true,
			})
		).toBe(true);

		expect(
			isAutomaticTranslationEnabled({
				planAllowsAutoTranslate: true,
				websiteAutoTranslateEnabled: false,
			})
		).toBe(false);

		expect(
			isAutomaticTranslationEnabled({
				planAllowsAutoTranslate: false,
				websiteAutoTranslateEnabled: true,
			})
		).toBe(false);
	});

	it("masks typing previews only for medium or high confidence language mismatches", async () => {
		const { shouldMaskTypingPreview } = await translationModulePromise;

		expect(
			shouldMaskTypingPreview({
				preview: "hola necesito ayuda",
				websiteDefaultLanguage: "en",
				visitorLanguageHint: "es",
			})
		).toBe(true);

		expect(
			shouldMaskTypingPreview({
				preview: "ok",
				websiteDefaultLanguage: "en",
				visitorLanguageHint: "es",
			})
		).toBe(false);

		expect(
			shouldMaskTypingPreview({
				preview: "hello i need help",
				websiteDefaultLanguage: "en",
				visitorLanguageHint: "en",
			})
		).toBe(false);
	});

	it("activates translation once, charges once, and syncs the visitor title", async () => {
		const { finalizeConversationTranslation } = await translationModulePromise;
		const harness = createDbHarness([
			[
				{
					visitorLanguage: "es",
					translationActivatedAt: "2026-04-11T10:01:00.000Z",
					translationChargedAt: "2026-04-11T10:01:00.000Z",
				},
			],
			[
				{
					visitorTitle: "Pregunta de facturacion",
					visitorTitleLanguage: "es",
				},
			],
		]);

		const result = await finalizeConversationTranslation({
			db: harness.db as never,
			conversation: createConversationRecord() as never,
			websiteDefaultLanguage: "en",
			visitorLanguage: "es",
			hasTranslationPart: true,
			chargeCredits: true,
		});

		expect(result).toEqual({
			status: "activated",
			visitorLanguage: "es",
			translationActivatedAt: "2026-04-11T10:01:00.000Z",
			translationChargedAt: "2026-04-11T10:01:00.000Z",
			visitorTitle: "Pregunta de facturacion",
			visitorTitleLanguage: "es",
		});
		expect(ingestAiCreditUsageMock).toHaveBeenCalledTimes(1);
		expect(emitConversationTranslationUpdateMock).toHaveBeenCalledTimes(1);
		const activatedCall = emitConversationTranslationUpdateMock.mock
			.calls[0] as unknown as [Record<string, unknown>] | undefined;
		expect(activatedCall?.[0]).toMatchObject({
			updates: {
				visitorLanguage: "es",
				translationActivatedAt: "2026-04-11T10:01:00.000Z",
				translationChargedAt: "2026-04-11T10:01:00.000Z",
				visitorTitle: "Pregunta de facturacion",
				visitorTitleLanguage: "es",
			},
		});
		expect(harness.updateMock).toHaveBeenCalledTimes(2);
	});

	it("updates only visitorLanguage when no translation part was created", async () => {
		const { finalizeConversationTranslation } = await translationModulePromise;
		const harness = createDbHarness([
			[
				{
					visitorLanguage: "es",
				},
			],
		]);

		const result = await finalizeConversationTranslation({
			db: harness.db as never,
			conversation: createConversationRecord() as never,
			websiteDefaultLanguage: "en",
			visitorLanguage: "es",
			hasTranslationPart: false,
			chargeCredits: true,
		});

		expect(result).toEqual({
			status: "language_updated",
			visitorLanguage: "es",
		});
		expect(ingestAiCreditUsageMock).not.toHaveBeenCalled();
		expect(emitConversationTranslationUpdateMock).toHaveBeenCalledTimes(1);
		const languageUpdateCall = emitConversationTranslationUpdateMock.mock
			.calls[0] as unknown as [Record<string, unknown>] | undefined;
		expect(languageUpdateCall?.[0]).toMatchObject({
			updates: {
				visitorLanguage: "es",
			},
		});
		expect(harness.updateMock).toHaveBeenCalledTimes(1);
	});

	it("can skip realtime emission while still updating translation state", async () => {
		const { finalizeConversationTranslation } = await translationModulePromise;
		const harness = createDbHarness([
			[
				{
					visitorLanguage: "es",
					translationActivatedAt: "2026-04-11T10:01:00.000Z",
					translationChargedAt: "2026-04-11T10:01:00.000Z",
				},
			],
			[
				{
					visitorTitle: "Pregunta de facturacion",
					visitorTitleLanguage: "es",
				},
			],
		]);

		const result = await finalizeConversationTranslation({
			db: harness.db as never,
			conversation: createConversationRecord() as never,
			websiteDefaultLanguage: "en",
			visitorLanguage: "es",
			hasTranslationPart: true,
			chargeCredits: true,
			emitRealtime: false,
		});

		expect(result).toEqual({
			status: "activated",
			visitorLanguage: "es",
			translationActivatedAt: "2026-04-11T10:01:00.000Z",
			translationChargedAt: "2026-04-11T10:01:00.000Z",
			visitorTitle: "Pregunta de facturacion",
			visitorTitleLanguage: "es",
		});
		expect(emitConversationTranslationUpdateMock).not.toHaveBeenCalled();
		expect(harness.updateMock).toHaveBeenCalledTimes(2);
	});

	it("does not ingest translation credits for customer OpenRouter billing", async () => {
		const { finalizeConversationTranslation } = await translationModulePromise;
		const harness = createDbHarness([
			[
				{
					visitorLanguage: "es",
					translationActivatedAt: "2026-04-11T10:01:00.000Z",
					translationChargedAt: null,
				},
			],
			[
				{
					visitorTitle: "Pregunta de facturacion",
					visitorTitleLanguage: "es",
				},
			],
		]);

		const result = await finalizeConversationTranslation({
			db: harness.db as never,
			conversation: createConversationRecord() as never,
			websiteDefaultLanguage: "en",
			visitorLanguage: "es",
			hasTranslationPart: true,
			chargeCredits: true,
			billingSource: "customer_openrouter",
		});

		expect(result).toMatchObject({
			status: "activated",
			translationChargedAt: null,
		});
		expect(ingestAiCreditUsageMock).not.toHaveBeenCalled();
		expect(harness.updateMock).toHaveBeenCalledTimes(2);
	});
});
