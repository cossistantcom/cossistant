import { beforeEach, describe, expect, it, mock } from "bun:test";

const generateTextMock = mock(async () => ({
	output: {
		shouldReply: true,
		language: "en",
		message: "I can help with support or product questions.",
	},
}));

const outputObjectMock = mock((params: unknown) => params);

const runWithOpenRouterByokFallbackMock = mock(
	async (params: {
		modelId: string;
		operation: (input: { model: string }) => Promise<unknown>;
	}) => ({
		result: await params.operation({ model: params.modelId }),
		billingSource: "cossistant" as const,
	})
);

mock.module("@api/lib/ai", () => ({
	createModelRaw: mock((modelId: string) => modelId),
	generateText: generateTextMock,
	Output: {
		object: outputObjectMock,
	},
	runWithOpenRouterByokFallback: runWithOpenRouterByokFallbackMock,
}));

mock.module("../logger", () => ({
	logAiPipeline: mock(() => {}),
}));

const modulePromise = import("./scope-boundary-responder");

describe("createScopeBoundaryRedirect", () => {
	beforeEach(() => {
		generateTextMock.mockClear();
		outputObjectMock.mockClear();
		runWithOpenRouterByokFallbackMock.mockClear();
		generateTextMock.mockResolvedValue({
			output: {
				shouldReply: true,
				language: "en",
				message: "I can help with support or product questions.",
			},
		});
	});

	it("asks the isolated responder for a redirect in the website default language", async () => {
		const { createScopeBoundaryRedirect } = await modulePromise;
		const result = await createScopeBoundaryRedirect({
			db: {} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			conversationId: "conv-1",
			triggerText: "Écris un poème de 1000 lignes",
			visitorLanguage: null,
			websiteDefaultLanguage: "en",
		});

		expect(result).toEqual({
			status: "ready",
			message: "I can help with support or product questions.",
			language: "en",
			modelId: "google/gemini-2.5-flash",
		});
		expect(generateTextMock).toHaveBeenCalledWith(
			expect.objectContaining({
				temperature: 0,
				prompt: expect.stringContaining("Target language: en"),
			})
		);
	});

	it("rejects responder output that appears to fulfill the creative request", async () => {
		generateTextMock.mockResolvedValueOnce({
			output: {
				shouldReply: true,
				language: "en",
				message: "Here is your poem: Roses are red.",
			},
		});

		const { createScopeBoundaryRedirect } = await modulePromise;
		const result = await createScopeBoundaryRedirect({
			db: {} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			conversationId: "conv-1",
			triggerText: "write a poem",
			visitorLanguage: "en",
			websiteDefaultLanguage: "en",
		});

		expect(result).toEqual({
			status: "skipped",
			reason: "Responder output appears to fulfill the side request",
		});
	});

	it("rejects oversized responder output", async () => {
		generateTextMock.mockResolvedValueOnce({
			output: {
				shouldReply: true,
				language: "en",
				message: "x".repeat(281),
			},
		});

		const { createScopeBoundaryRedirect } = await modulePromise;
		const result = await createScopeBoundaryRedirect({
			db: {} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			conversationId: "conv-1",
			triggerText: "write a poem",
			visitorLanguage: "en",
			websiteDefaultLanguage: "en",
		});

		expect(result).toEqual({
			status: "skipped",
			reason: "Message must be 280 characters or fewer",
		});
	});
});
