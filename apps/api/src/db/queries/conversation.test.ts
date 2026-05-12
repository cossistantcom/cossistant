import { describe, expect, it } from "bun:test";
import {
	listConversations,
	mapTimelineRowToTimelineItem,
} from "./conversation";
import {
	canVisitorAccessConversation,
	getConversationVisibleVisitorIds,
} from "./conversation-access";

type MockSelectResult = Record<string, unknown>[];
type MockQueryChain = {
	from: () => MockQueryChain;
	leftJoin: () => MockQueryChain;
	innerJoin: () => MockQueryChain;
	where: () => MockQueryChain;
	orderBy: () => MockQueryChain;
	limit: () => MockQueryChain;
	offset: () => Promise<MockSelectResult>;
	then: (
		resolve: (value: MockSelectResult) => unknown,
		reject?: (reason: unknown) => unknown
	) => Promise<unknown>;
};

function createQueryDbHarness(selectResults: MockSelectResult[]) {
	const selectMock = () => {
		const result = selectResults.shift() ?? [];
		let chain: MockQueryChain;
		chain = {
			from: () => chain,
			leftJoin: () => chain,
			innerJoin: () => chain,
			where: () => chain,
			orderBy: () => chain,
			limit: () => chain,
			offset: async () => result,
			// biome-ignore lint/suspicious/noThenProperty: drizzle query chains are awaitable in production.
			then: (
				resolve: (value: MockSelectResult) => unknown,
				reject?: (reason: unknown) => unknown
			) => Promise.resolve(result).then(resolve, reject),
		};
		return chain;
	};

	return {
		db: {
			select: selectMock,
		},
		selectMock,
	};
}

function createAccessVisitorRow(
	overrides: Partial<{
		id: string;
		contactId: string | null;
		activeContactId: string | null;
	}> = {}
) {
	return {
		id: "visitor-current",
		contactId: null,
		activeContactId: null,
		...overrides,
	};
}

function createConversationRow(
	overrides: Partial<Record<string, unknown>> = {}
) {
	return {
		id: "conv-1",
		title: null,
		metadata: null,
		createdAt: "2026-04-07T10:00:00.000Z",
		updatedAt: "2026-04-07T11:00:00.000Z",
		visitorId: "visitor-current",
		websiteId: "site-1",
		channel: "widget",
		status: "open",
		visitorRating: null,
		visitorRatingAt: null,
		priority: "normal",
		prioritySource: null,
		sentiment: null,
		sentimentConfidence: null,
		sentimentSource: null,
		deletedAt: null,
		organizationId: "org-1",
		...overrides,
	};
}

describe("mapTimelineRowToTimelineItem", () => {
	it("maps tool timeline rows and derives tool name from parts", () => {
		const row = {
			id: "01HROW00000000000000000000",
			conversationId: "conv-1",
			organizationId: "org-1",
			visibility: "private",
			type: "tool",
			text: "Tool call: searchKnowledgeBase",
			parts: [
				{
					type: "tool-searchKnowledgeBase",
					toolCallId: "call-1",
					toolName: "searchKnowledgeBase",
					input: { query: "pricing" },
					state: "partial",
				},
			],
			userId: null,
			visitorId: "visitor-1",
			aiAgentId: "ai-1",
			createdAt: "2026-01-01T00:00:00.000Z",
			deletedAt: null,
		} as never;

		const mapped = mapTimelineRowToTimelineItem(row);

		expect(mapped).not.toBeNull();
		expect(mapped?.type).toBe("tool");
		expect(mapped?.tool).toBe("searchKnowledgeBase");
	});

	it("returns null for rows with invalid parts", () => {
		const row = {
			id: "01HROW00000000000000000000",
			conversationId: "conv-1",
			organizationId: "org-1",
			visibility: "private",
			type: "tool",
			text: "Tool call: searchKnowledgeBase",
			parts: [
				{
					type: "tool-searchKnowledgeBase",
					toolCallId: "call-1",
					toolName: "searchKnowledgeBase",
					// input is required for tool parts, so this should fail parsing
					state: "partial",
				},
			],
			userId: null,
			visitorId: "visitor-1",
			aiAgentId: "ai-1",
			createdAt: "2026-01-01T00:00:00.000Z",
			deletedAt: null,
		} as never;

		const mapped = mapTimelineRowToTimelineItem(row);
		expect(mapped).toBeNull();
	});
});

describe("contact-aware public conversation access", () => {
	it("keeps anonymous conversation listings scoped to the current visitor", async () => {
		const harness = createQueryDbHarness([
			[createAccessVisitorRow()],
			[{ totalCount: 1 }],
			[
				{
					conversation: createConversationRow({
						id: "conv-current",
						visitorId: "visitor-current",
					}),
					visitorLastSeenAt: null,
				},
			],
			[],
		]);

		const result = await listConversations(harness.db as never, {
			organizationId: "org-1",
			websiteId: "site-1",
			visitorId: "visitor-current",
			page: 1,
			limit: 10,
		});

		expect(result.conversations).toHaveLength(1);
		expect(result.conversations[0]?.visitorId).toBe("visitor-current");
		expect(result.pagination.total).toBe(1);
	});

	it("lists conversations from all visitors linked to the same contact", async () => {
		const harness = createQueryDbHarness([
			[
				createAccessVisitorRow({
					contactId: "contact-1",
					activeContactId: "contact-1",
				}),
			],
			[{ id: "visitor-current" }, { id: "visitor-old" }],
			[{ totalCount: 2 }],
			[
				{
					conversation: createConversationRow({
						id: "conv-current",
						visitorId: "visitor-current",
					}),
					visitorLastSeenAt: null,
				},
				{
					conversation: createConversationRow({
						id: "conv-old",
						visitorId: "visitor-old",
					}),
					visitorLastSeenAt: "2026-04-07T12:00:00.000Z",
				},
			],
			[],
		]);

		const result = await listConversations(harness.db as never, {
			organizationId: "org-1",
			websiteId: "site-1",
			visitorId: "visitor-current",
			page: 1,
			limit: 10,
		});

		expect(result.conversations.map((item) => item.visitorId)).toEqual([
			"visitor-current",
			"visitor-old",
		]);
		expect(result.pagination).toMatchObject({
			page: 1,
			limit: 10,
			total: 2,
			totalPages: 1,
			hasMore: false,
		});
	});

	it("returns no conversations when the current visitor is deleted", async () => {
		const harness = createQueryDbHarness([[], [{ totalCount: 0 }], [], []]);

		const result = await listConversations(harness.db as never, {
			organizationId: "org-1",
			websiteId: "site-1",
			visitorId: "visitor-current",
			page: 1,
			limit: 10,
		});

		expect(result.conversations).toEqual([]);
		expect(result.pagination.total).toBe(0);
	});

	it("falls back to visitor-only scope when the linked contact is deleted", async () => {
		const harness = createQueryDbHarness([
			[
				createAccessVisitorRow({
					contactId: "contact-1",
					activeContactId: null,
				}),
			],
			[{ totalCount: 1 }],
			[
				{
					conversation: createConversationRow({
						id: "conv-current",
						visitorId: "visitor-current",
					}),
					visitorLastSeenAt: null,
				},
			],
			[],
		]);

		const result = await listConversations(harness.db as never, {
			organizationId: "org-1",
			websiteId: "site-1",
			visitorId: "visitor-current",
			page: 1,
			limit: 10,
		});

		expect(result.conversations.map((item) => item.visitorId)).toEqual([
			"visitor-current",
		]);
		expect(result.pagination.total).toBe(1);
	});

	it("keeps pagination tied to the expanded contact-scoped set", async () => {
		const harness = createQueryDbHarness([
			[
				createAccessVisitorRow({
					contactId: "contact-1",
					activeContactId: "contact-1",
				}),
			],
			[{ id: "visitor-current" }, { id: "visitor-old" }],
			[{ totalCount: 4 }],
			[
				{
					conversation: createConversationRow({
						id: "conv-page-2",
						visitorId: "visitor-old",
					}),
					visitorLastSeenAt: null,
				},
			],
			[],
		]);

		const result = await listConversations(harness.db as never, {
			organizationId: "org-1",
			websiteId: "site-1",
			visitorId: "visitor-current",
			page: 2,
			limit: 3,
		});

		expect(result.conversations[0]?.visitorId).toBe("visitor-old");
		expect(result.pagination).toMatchObject({
			page: 2,
			limit: 3,
			total: 4,
			totalPages: 2,
			hasMore: false,
		});
	});

	it("excludes visitors outside the active shared contact scope", async () => {
		const contactScopeHarness = createQueryDbHarness([
			[
				createAccessVisitorRow({
					contactId: "contact-1",
					activeContactId: "contact-1",
				}),
			],
			[{ id: "visitor-current" }, { id: "visitor-old" }],
		]);

		await expect(
			getConversationVisibleVisitorIds(contactScopeHarness.db as never, {
				organizationId: "org-1",
				websiteId: "site-1",
				visitorId: "visitor-current",
			})
		).resolves.toEqual(["visitor-current", "visitor-old"]);

		const unrelatedContactHarness = createQueryDbHarness([
			[
				createAccessVisitorRow({
					contactId: "contact-1",
					activeContactId: "contact-1",
				}),
			],
			[
				createAccessVisitorRow({
					id: "visitor-unrelated",
					contactId: "contact-2",
					activeContactId: "contact-2",
				}),
			],
		]);

		await expect(
			canVisitorAccessConversation(unrelatedContactHarness.db as never, {
				organizationId: "org-1",
				websiteId: "site-1",
				viewerVisitorId: "visitor-current",
				conversationVisitorId: "visitor-unrelated",
			})
		).resolves.toBe(false);

		const otherWebsiteHarness = createQueryDbHarness([
			[
				createAccessVisitorRow({
					contactId: "contact-1",
					activeContactId: "contact-1",
				}),
			],
			[],
		]);

		await expect(
			canVisitorAccessConversation(otherWebsiteHarness.db as never, {
				organizationId: "org-1",
				websiteId: "site-1",
				viewerVisitorId: "visitor-current",
				conversationVisitorId: "visitor-other-website",
			})
		).resolves.toBe(false);

		const wrongTenantContactHarness = createQueryDbHarness([
			[
				createAccessVisitorRow({
					contactId: "contact-1",
					activeContactId: "contact-1",
				}),
			],
			[
				createAccessVisitorRow({
					id: "visitor-wrong-tenant",
					contactId: "contact-1",
					activeContactId: null,
				}),
			],
		]);

		await expect(
			canVisitorAccessConversation(wrongTenantContactHarness.db as never, {
				organizationId: "org-1",
				websiteId: "site-1",
				viewerVisitorId: "visitor-current",
				conversationVisitorId: "visitor-wrong-tenant",
			})
		).resolves.toBe(false);
	});
});
