import { beforeEach, describe, expect, it, mock } from "bun:test";

const safelyExtractRequestDataMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);
const safelyExtractRequestQueryMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);
const validateResponseMock = mock(<T>(value: T) => value);

const createKnowledgeMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const deleteKnowledgeMock = mock(
	(async () => false) as (...args: unknown[]) => Promise<unknown>
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
const listKnowledgeMock = mock((async () => ({
	items: [],
	pagination: {
		page: 1,
		limit: 20,
		total: 0,
		hasMore: false,
	},
})) as (...args: unknown[]) => Promise<unknown>);
const updateKnowledgeMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const syncLinkSourceStatsFromKnowledgeMock = mock((async () => {}) as (
	...args: unknown[]
) => Promise<void>);
const getPlanForWebsiteMock = mock((async () => ({
	features: {
		"ai-agent-training-faqs": null,
		"ai-agent-training-files": null,
		"ai-agent-training-mb": null,
	},
})) as (...args: unknown[]) => Promise<unknown>);
const findSimilarKnowledgeMock = mock((async () => []) as (
	...args: unknown[]
) => Promise<unknown[]>);

mock.module("@api/utils/validate", () => ({
	safelyExtractRequestData: safelyExtractRequestDataMock,
	safelyExtractRequestQuery: safelyExtractRequestQueryMock,
	validateResponse: validateResponseMock,
}));

mock.module("@api/db/queries/knowledge", () => ({
	createKnowledge: createKnowledgeMock,
	deleteKnowledge: deleteKnowledgeMock,
	getKnowledgeById: getKnowledgeByIdMock,
	getKnowledgeCountByType: getKnowledgeCountByTypeMock,
	getTotalKnowledgeSizeBytes: getTotalKnowledgeSizeBytesMock,
	listKnowledge: listKnowledgeMock,
	updateKnowledge: updateKnowledgeMock,
}));

mock.module("@api/db/queries/link-source", () => ({
	syncLinkSourceStatsFromKnowledge: syncLinkSourceStatsFromKnowledgeMock,
}));

mock.module("@api/lib/plans/access", () => ({
	getPlanForWebsite: getPlanForWebsiteMock,
}));

mock.module("@api/db/queries/vector-search", () => ({
	findSimilarKnowledge: findSimilarKnowledgeMock,
}));

mock.module("../middleware", () => ({
	protectedPrivateApiKeyMiddleware: [],
}));

const knowledgeRouterModulePromise = import("./knowledge");

function createKnowledgeEntry(
	overrides: Partial<Record<string, unknown>> = {}
) {
	return {
		id: "01JG00000000000000000000A",
		organizationId: "org-1",
		websiteId: "site-1",
		aiAgentId: null,
		linkSourceId: null,
		type: "faq",
		sourceUrl: null,
		sourceTitle: "Pricing FAQ",
		origin: "manual",
		createdBy: "api_key_key-1",
		contentHash: "hash-1",
		payload: {
			question: "How does billing work?",
			answer: "Monthly.",
			categories: [],
			relatedQuestions: [],
		},
		metadata: null,
		isIncluded: true,
		sizeBytes: 64,
		createdAt: "2026-04-01T00:00:00.000Z",
		updatedAt: "2026-04-01T00:00:00.000Z",
		deletedAt: null,
		...overrides,
	};
}

describe("knowledge REST router", () => {
	beforeEach(() => {
		safelyExtractRequestDataMock.mockReset();
		safelyExtractRequestQueryMock.mockReset();
		validateResponseMock.mockReset();
		createKnowledgeMock.mockReset();
		deleteKnowledgeMock.mockReset();
		getKnowledgeByIdMock.mockReset();
		getKnowledgeCountByTypeMock.mockReset();
		getTotalKnowledgeSizeBytesMock.mockReset();
		listKnowledgeMock.mockReset();
		updateKnowledgeMock.mockReset();
		syncLinkSourceStatsFromKnowledgeMock.mockReset();
		getPlanForWebsiteMock.mockReset();
		findSimilarKnowledgeMock.mockReset();

		validateResponseMock.mockImplementation((value) => value);
		createKnowledgeMock.mockResolvedValue(createKnowledgeEntry());
		deleteKnowledgeMock.mockResolvedValue(true);
		getKnowledgeByIdMock.mockResolvedValue(createKnowledgeEntry());
		getKnowledgeCountByTypeMock.mockResolvedValue(0);
		getTotalKnowledgeSizeBytesMock.mockResolvedValue(0);
		listKnowledgeMock.mockResolvedValue({
			items: [createKnowledgeEntry()],
			pagination: {
				page: 1,
				limit: 20,
				total: 1,
				hasMore: false,
			},
		});
		updateKnowledgeMock.mockResolvedValue(
			createKnowledgeEntry({
				sourceTitle: "Updated title",
				payload: {
					question: "Updated?",
					answer: "Yes.",
					categories: [],
					relatedQuestions: [],
				},
			})
		);
		syncLinkSourceStatsFromKnowledgeMock.mockResolvedValue(undefined);
		getPlanForWebsiteMock.mockResolvedValue({
			features: {
				"ai-agent-training-faqs": null,
				"ai-agent-training-files": null,
				"ai-agent-training-mb": null,
			},
		});
		findSimilarKnowledgeMock.mockResolvedValue([]);
	});

	it("lists knowledge entries with normalized AI agent and inclusion filters", async () => {
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			website: { id: "site-1", organizationId: "org-1" },
			query: {
				type: "faq",
				aiAgentId: "null",
				isIncluded: "true",
				linkSourceId: undefined,
				page: 1,
				limit: 20,
			},
		});

		const { knowledgeRouter } = await knowledgeRouterModulePromise;
		const response = await knowledgeRouter.request(
			new Request(
				"http://localhost/?type=faq&aiAgentId=null&isIncluded=true&page=1&limit=20",
				{
					method: "GET",
				}
			)
		);

		expect(response.status).toBe(200);
		expect(listKnowledgeMock).toHaveBeenCalledWith(
			{},
			{
				organizationId: "org-1",
				websiteId: "site-1",
				type: "faq",
				aiAgentId: null,
				isIncluded: true,
				linkSourceId: undefined,
				page: 1,
				limit: 20,
			}
		);
	});

	it("gets a single knowledge entry", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			website: { id: "site-1", organizationId: "org-1" },
		});

		const { knowledgeRouter } = await knowledgeRouterModulePromise;
		const response = await knowledgeRouter.request(
			new Request("http://localhost/01JG00000000000000000000A", {
				method: "GET",
			})
		);

		expect(response.status).toBe(200);
		expect(getKnowledgeByIdMock).toHaveBeenCalledWith(
			{},
			{
				id: "01JG00000000000000000000A",
				websiteId: "site-1",
			}
		);
	});

	it("searches knowledge with retrieval provenance", async () => {
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			website: { id: "site-1", organizationId: "org-1" },
			query: {
				query: "billing setup",
				limit: 4,
				minSimilarity: 0.4,
				knowledgeId: "01JG00000000000000000000A",
			},
		});
		findSimilarKnowledgeMock.mockResolvedValue([
			{
				id: "chunk-1",
				content:
					"Billing details can be updated from Settings, then Billing, then Payment method.",
				metadata: {
					title: "Billing FAQ",
					sourceUrl: "https://docs.test/billing",
				},
				similarity: 0.82,
				sourceType: "knowledge",
				knowledgeId: "01JG00000000000000000000A",
				visitorId: null,
				contactId: null,
				chunkIndex: 0,
				sourceTitle: "Billing guide",
				sourceUrl: "https://docs.test/billing",
			},
		]);

		const { knowledgeRouter } = await knowledgeRouterModulePromise;
		const response = await knowledgeRouter.request(
			new Request("http://localhost/search?query=billing%20setup", {
				method: "GET",
			})
		);
		const payload = (await response.json()) as {
			query: string;
			results: Array<{ title: string | null; sourceUrl: string | null }>;
			totalFound: number;
			retrievalQuality: string;
		};

		expect(response.status).toBe(200);
		expect(findSimilarKnowledgeMock).toHaveBeenCalledWith(
			{},
			"billing setup",
			"site-1",
			{
				knowledgeId: "01JG00000000000000000000A",
				limit: 4,
				minSimilarity: 0.4,
			}
		);
		expect(payload).toMatchObject({
			query: "billing setup",
			totalFound: 1,
			retrievalQuality: "high",
		});
		expect(payload.results[0]).toMatchObject({
			title: "Billing guide",
			sourceUrl: "https://docs.test/billing",
		});
	});

	it("creates a knowledge entry through the private API", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			website: { id: "site-1", organizationId: "org-1" },
			apiKey: { id: "key-1" },
			body: {
				aiAgentId: null,
				type: "faq",
				sourceUrl: null,
				sourceTitle: "Pricing FAQ",
				origin: "manual",
				payload: {
					question: "How does billing work?",
					answer: "Monthly.",
					categories: [],
					relatedQuestions: [],
				},
				metadata: null,
			},
		});

		const { knowledgeRouter } = await knowledgeRouterModulePromise;
		const requestBody = {
			aiAgentId: null,
			type: "faq",
			sourceUrl: null,
			sourceTitle: "Pricing FAQ",
			origin: "manual",
			payload: {
				question: "How does billing work?",
				answer: "Monthly.",
				categories: [],
				relatedQuestions: [],
			},
			metadata: null,
		};
		const response = await knowledgeRouter.request(
			new Request("http://localhost/", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(requestBody),
			})
		);

		expect(response.status).toBe(201);
		expect(createKnowledgeMock).toHaveBeenCalledWith(
			{},
			expect.objectContaining({
				organizationId: "org-1",
				websiteId: "site-1",
				createdBy: "api_key_key-1",
				type: "faq",
			})
		);
	});

	it("updates a knowledge entry", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			website: { id: "site-1", organizationId: "org-1" },
			body: {
				sourceTitle: "Updated title",
				payload: {
					question: "Updated?",
					answer: "Yes.",
					categories: [],
					relatedQuestions: [],
				},
			},
		});

		const { knowledgeRouter } = await knowledgeRouterModulePromise;
		const response = await knowledgeRouter.request(
			new Request("http://localhost/01JG00000000000000000000A", {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({}),
			})
		);

		expect(response.status).toBe(200);
		expect(updateKnowledgeMock).toHaveBeenCalledWith(
			{},
			expect.objectContaining({
				id: "01JG00000000000000000000A",
				websiteId: "site-1",
				sourceTitle: "Updated title",
			})
		);
	});

	it("deletes a knowledge entry", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			website: { id: "site-1", organizationId: "org-1" },
		});

		const { knowledgeRouter } = await knowledgeRouterModulePromise;
		const response = await knowledgeRouter.request(
			new Request("http://localhost/01JG00000000000000000000A", {
				method: "DELETE",
			})
		);

		expect(response.status).toBe(204);
		expect(deleteKnowledgeMock).toHaveBeenCalledWith(
			{},
			{
				id: "01JG00000000000000000000A",
				websiteId: "site-1",
			}
		);
	});

	it("returns 403 when create would exceed the FAQ plan limit", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			website: { id: "site-1", organizationId: "org-1" },
			apiKey: { id: "key-1" },
			body: {
				aiAgentId: null,
				type: "faq",
				sourceUrl: null,
				sourceTitle: "Pricing FAQ",
				origin: "manual",
				payload: {
					question: "How does billing work?",
					answer: "Monthly.",
					categories: [],
					relatedQuestions: [],
				},
				metadata: null,
			},
		});
		getPlanForWebsiteMock.mockResolvedValueOnce({
			features: {
				"ai-agent-training-faqs": 1,
				"ai-agent-training-files": null,
				"ai-agent-training-mb": null,
			},
		});
		getKnowledgeCountByTypeMock.mockResolvedValueOnce(1);

		const { knowledgeRouter } = await knowledgeRouterModulePromise;
		const requestBody = {
			aiAgentId: null,
			type: "faq",
			sourceUrl: null,
			sourceTitle: "Pricing FAQ",
			origin: "manual",
			payload: {
				question: "How does billing work?",
				answer: "Monthly.",
				categories: [],
				relatedQuestions: [],
			},
			metadata: null,
		};
		const response = await knowledgeRouter.request(
			new Request("http://localhost/", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(requestBody),
			})
		);

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			error: "FORBIDDEN",
			message:
				"You have reached the limit of 1 FAQs for your plan. Please upgrade to add more.",
		});
		expect(createKnowledgeMock).toHaveBeenCalledTimes(0);
	});

	it("returns 403 when update would exceed the knowledge size limit", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			website: { id: "site-1", organizationId: "org-1" },
			body: {
				payload: {
					question: "A much longer question that exceeds the limit?",
					answer:
						"This answer is intentionally long enough to trip the configured size cap.",
					categories: [],
					relatedQuestions: [],
				},
			},
		});
		getKnowledgeByIdMock.mockResolvedValueOnce(
			createKnowledgeEntry({
				sizeBytes: 64,
			})
		);
		getPlanForWebsiteMock.mockResolvedValueOnce({
			features: {
				"ai-agent-training-faqs": null,
				"ai-agent-training-files": null,
				"ai-agent-training-mb": 0.0001,
			},
		});
		getTotalKnowledgeSizeBytesMock.mockResolvedValueOnce(64);

		const { knowledgeRouter } = await knowledgeRouterModulePromise;
		const response = await knowledgeRouter.request(
			new Request("http://localhost/01JG00000000000000000000A", {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({}),
			})
		);

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			error: "FORBIDDEN",
			message:
				"Updating this entry would exceed your 0.0001MB knowledge base limit. Please upgrade for more storage.",
		});
		expect(updateKnowledgeMock).toHaveBeenCalledTimes(0);
	});
});
