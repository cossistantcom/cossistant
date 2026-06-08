import { beforeEach, describe, expect, it, mock } from "bun:test";

const actualDrizzleOrm = await import("drizzle-orm");

const generateEmbeddingMock = mock(async () => [0.1, 0.2, 0.3]);
const eqMock = mock((left: unknown, right: unknown) => ({
	type: "eq",
	left,
	right,
}));
const gtMock = mock((left: unknown, right: unknown) => ({
	type: "gt",
	left,
	right,
}));
const isNullMock = mock((value: unknown) => ({
	type: "isNull",
	value,
}));
const andMock = mock((...conditions: unknown[]) => ({
	type: "and",
	conditions,
}));
const descMock = mock((value: unknown) => ({
	type: "desc",
	value,
}));
const cosineDistanceMock = mock((left: unknown, right: unknown) => ({
	type: "cosineDistance",
	left,
	right,
}));
const sqlMock = mock((strings: TemplateStringsArray, ...values: unknown[]) => {
	const sqlFragment = {
		type: "sql",
		strings: [...strings],
		values,
		mapWith: () => sqlFragment,
	};
	return sqlFragment;
});
(sqlMock as typeof sqlMock & { raw: typeof actualDrizzleOrm.sql.raw }).raw =
	actualDrizzleOrm.sql.raw;

const chunkTable = {
	id: "chunk.id",
	content: "chunk.content",
	metadata: "chunk.metadata",
	similarity: "chunk.similarity",
	sourceType: "chunk.sourceType",
	knowledgeId: "chunk.knowledgeId",
	visitorId: "chunk.visitorId",
	contactId: "chunk.contactId",
	chunkIndex: "chunk.chunkIndex",
	embedding: "chunk.embedding",
	websiteId: "chunk.websiteId",
};

const knowledgeTable = {
	id: "knowledge.id",
	deletedAt: "knowledge.deletedAt",
	sourceTitle: "knowledge.sourceTitle",
	sourceUrl: "knowledge.sourceUrl",
};

mock.module("@api/lib/embedding-client", () => ({
	generateEmbedding: generateEmbeddingMock,
}));

mock.module("../schema", () => ({
	chunk: chunkTable,
	knowledge: knowledgeTable,
}));

mock.module("drizzle-orm", () => ({
	...actualDrizzleOrm,
	and: andMock,
	cosineDistance: cosineDistanceMock,
	desc: descMock,
	eq: eqMock,
	gt: gtMock,
	isNull: isNullMock,
	sql: sqlMock,
}));

const modulePromise = import("./vector-search");

describe("findSimilarKnowledge", () => {
	beforeEach(() => {
		generateEmbeddingMock.mockReset();
		generateEmbeddingMock.mockResolvedValue([0.1, 0.2, 0.3]);
		eqMock.mockClear();
		gtMock.mockClear();
		isNullMock.mockClear();
		andMock.mockClear();
		descMock.mockClear();
		cosineDistanceMock.mockClear();
		sqlMock.mockClear();
	});

	it("joins knowledge rows and filters out deleted parents", async () => {
		const limitMock = mock(async () => [
			{
				id: "chunk-1",
				content: "Export data from settings.",
				metadata: { title: "Export data" },
				similarity: 0.91,
				sourceType: "knowledge",
				knowledgeId: "knowledge-1",
				visitorId: null,
				contactId: null,
				chunkIndex: 0,
			},
		]);
		const orderByMock = mock(() => ({
			limit: limitMock,
		}));
		const whereMock = mock(() => ({
			orderBy: orderByMock,
		}));
		const innerJoinMock = mock(() => ({
			where: whereMock,
		}));
		const fromMock = mock(() => ({
			innerJoin: innerJoinMock,
		}));
		const selectMock = mock(() => ({
			from: fromMock,
		}));

		const { findSimilarKnowledge } = await modulePromise;
		const result = await findSimilarKnowledge(
			{
				select: selectMock,
			} as never,
			"export data",
			"site-1",
			{
				knowledgeId: "knowledge-1",
				minSimilarity: 0.7,
				limit: 5,
			}
		);

		expect(result).toHaveLength(1);
		expect(generateEmbeddingMock).toHaveBeenCalledWith("export data");
		expect(innerJoinMock).toHaveBeenCalledWith(
			knowledgeTable,
			expect.objectContaining({
				type: "eq",
				left: chunkTable.knowledgeId,
				right: knowledgeTable.id,
			})
		);
		expect(isNullMock).toHaveBeenCalledWith(knowledgeTable.deletedAt);
		expect(eqMock).toHaveBeenCalledWith(chunkTable.sourceType, "knowledge");
		expect(eqMock).toHaveBeenCalledWith(chunkTable.websiteId, "site-1");
		expect(eqMock).toHaveBeenCalledWith(chunkTable.knowledgeId, "knowledge-1");
		expect(gtMock).toHaveBeenCalledTimes(1);
		expect(limitMock).toHaveBeenCalledTimes(1);
	});
});
