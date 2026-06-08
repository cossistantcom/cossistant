import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const findSimilarKnowledgeMock = mock((async () => []) as (
	...args: unknown[]
) => Promise<unknown[]>);

mock.module("@api/db/queries/vector-search", () => ({
	findSimilarKnowledge: findSimilarKnowledgeMock,
}));

const modulePromise = import("./knowledge");

const website = {
	id: "site-1",
	name: "Acme Support",
	slug: "acme",
	domain: "acme.test",
	defaultLanguage: "en",
	organizationId: "org-1",
	teamId: "team-1",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	deletedAt: null,
} as never;

describe("searchSupportKnowledge", () => {
	afterAll(() => {
		mock.restore();
	});

	beforeEach(() => {
		findSimilarKnowledgeMock.mockReset();
	});

	it("clips content while preserving search metadata", async () => {
		const content = `${"A".repeat(1400)} finished`;
		findSimilarKnowledgeMock.mockResolvedValue([
			{
				id: "chunk-1",
				content,
				metadata: { title: "Billing" },
				similarity: 0.82,
				sourceType: "knowledge",
				knowledgeId: "knowledge-1",
				visitorId: null,
				contactId: null,
				chunkIndex: 0,
				sourceTitle: null,
				sourceUrl: "https://docs.example.com/billing",
			},
		]);

		const { searchSupportKnowledge } = await modulePromise;
		const result = await searchSupportKnowledge({} as never, {
			website,
			query: "How does billing work?",
			limit: 4,
			minSimilarity: 0.3,
			maxContentLength: 1200,
		});

		expect(result.results).toHaveLength(1);
		expect(result.results[0]?.content.length).toBeLessThanOrEqual(1200);
		expect(result.results[0]?.content.endsWith("...")).toBe(true);
		expect(result.results[0]?.title).toBe("Billing");
		expect(result.retrievalQuality).toBe("high");
		expect(findSimilarKnowledgeMock).toHaveBeenCalledWith(
			{},
			"How does billing work?",
			"site-1",
			{
				knowledgeId: undefined,
				limit: 4,
				minSimilarity: 0.3,
			}
		);
	});

	it("uses conservative pagination bounds", async () => {
		findSimilarKnowledgeMock.mockResolvedValue([]);

		const { searchSupportKnowledge } = await modulePromise;
		await searchSupportKnowledge({} as never, {
			website,
			query: "Anything",
			limit: 50,
			minSimilarity: 0.3,
		});

		expect(findSimilarKnowledgeMock).toHaveBeenCalledWith(
			{},
			"Anything",
			"site-1",
			{
				knowledgeId: undefined,
				limit: 20,
				minSimilarity: 0.3,
			}
		);
	});
});
