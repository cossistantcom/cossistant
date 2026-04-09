import { beforeEach, describe, expect, it, mock } from "bun:test";

const realtimeEmitMock = mock((async () => {}) as (
	eventType: string,
	payload: unknown
) => Promise<void>);
const getConversationByIdMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);

mock.module("@api/realtime/emitter", () => ({
	realtime: {
		emit: realtimeEmitMock,
	},
}));

mock.module("@api/db/queries/conversation", () => ({
	getConversationById: getConversationByIdMock,
}));

mock.module("@api/lib/tinybird-sdk", () => ({
	trackConversationMetricForVisitor: mock(async () => {}),
}));

function loadTimelineItemModule() {
	return import(`./timeline-item.ts?test=${Math.random()}`);
}

type DbHarness = {
	db: {
		insert: (...args: unknown[]) => { values: (...args: unknown[]) => unknown };
		update: (...args: unknown[]) => { set: (...args: unknown[]) => unknown };
	};
	insertValuesMock: ReturnType<typeof mock>;
	updateSetMock: ReturnType<typeof mock>;
};

function createDbHarness(params: {
	insertRows?: unknown[];
	updateRows?: unknown[];
}): DbHarness {
	const insertReturningMock = mock(
		(async () => params.insertRows ?? []) as () => Promise<unknown[]>
	);
	const insertValuesMock = mock((() => ({
		returning: insertReturningMock,
	})) as (...args: unknown[]) => { returning: () => Promise<unknown[]> });
	const insertMock = mock((() => ({ values: insertValuesMock })) as (
		...args: unknown[]
	) => {
		values: (...args: unknown[]) => { returning: () => Promise<unknown[]> };
	});

	const updateReturningMock = mock(
		(async () => params.updateRows ?? []) as () => Promise<unknown[]>
	);
	const updateWhereMock = mock((() => ({
		returning: updateReturningMock,
	})) as (...args: unknown[]) => { returning: () => Promise<unknown[]> });
	const updateSetMock = mock((() => ({ where: updateWhereMock })) as (
		...args: unknown[]
	) => {
		where: (...args: unknown[]) => { returning: () => Promise<unknown[]> };
	});
	const updateMock = mock((() => ({ set: updateSetMock })) as (
		...args: unknown[]
	) => {
		set: (...args: unknown[]) => {
			where: (...args: unknown[]) => { returning: () => Promise<unknown[]> };
		};
	});

	return {
		db: {
			insert: insertMock,
			update: updateMock,
		},
		insertValuesMock,
		updateSetMock,
	};
}

describe("timeline-item utils", () => {
	beforeEach(() => {
		realtimeEmitMock.mockReset();
		getConversationByIdMock.mockReset();
		getConversationByIdMock.mockResolvedValue(null);
	});

	it("createTimelineItem emits timelineItemCreated with normalized payload", async () => {
		const createdRow = {
			id: "tool-item-1",
			conversationId: "conv-1",
			organizationId: "org-1",
			visibility: "private",
			type: "tool",
			text: "Looking in knowledge base...",
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
			visitorId: null,
			aiAgentId: "ai-1",
			createdAt: "2026-02-07T10:00:00.000Z",
			deletedAt: null,
		};
		const harness = createDbHarness({
			insertRows: [createdRow],
		});
			const { createTimelineItem } = await loadTimelineItemModule();

		const created = await createTimelineItem({
			db: harness.db as never,
			organizationId: "org-1",
			websiteId: "site-1",
			conversationId: "conv-1",
			conversationOwnerVisitorId: "visitor-1",
			item: {
				id: "tool-item-1",
				type: "tool",
				text: "Looking in knowledge base...",
				parts: createdRow.parts,
				aiAgentId: "ai-1",
				visibility: "private",
			},
		});

		expect(created.tool).toBe("searchKnowledgeBase");
		expect(realtimeEmitMock).toHaveBeenCalledTimes(1);
		expect(realtimeEmitMock.mock.calls[0]?.[0]).toBe("timelineItemCreated");
		expect(realtimeEmitMock.mock.calls[0]?.[1]).toMatchObject({
			conversationId: "conv-1",
			websiteId: "site-1",
			organizationId: "org-1",
			visitorId: "visitor-1",
			item: {
				id: "tool-item-1",
				type: "tool",
				tool: "searchKnowledgeBase",
				text: "Looking in knowledge base...",
			},
		});
	});

	it("updateTimelineItem emits timelineItemUpdated with full updated item payload", async () => {
		const updatedRow = {
			id: "tool-item-2",
			conversationId: "conv-2",
			organizationId: "org-1",
			visibility: "private",
			type: "tool",
			text: "Found 2 relevant sources",
			parts: [
				{
					type: "tool-searchKnowledgeBase",
					toolCallId: "call-2",
					toolName: "searchKnowledgeBase",
					input: { query: "refund policy" },
					state: "result",
					output: {
						success: true,
						data: { totalFound: 2 },
					},
				},
			],
			userId: null,
			visitorId: null,
			aiAgentId: "ai-1",
			createdAt: "2026-02-07T10:05:00.000Z",
			deletedAt: null,
		};
		const harness = createDbHarness({
			updateRows: [updatedRow],
		});
			const { updateTimelineItem } = await loadTimelineItemModule();

		const updated = await updateTimelineItem({
			db: harness.db as never,
			organizationId: "org-1",
			websiteId: "site-1",
			conversationId: "conv-2",
			conversationOwnerVisitorId: "visitor-2",
			itemId: "tool-item-2",
			item: {
				text: "Found 2 relevant sources",
				parts: updatedRow.parts,
				tool: "searchKnowledgeBase",
			},
		});

		expect(updated.text).toBe("Found 2 relevant sources");
		expect(updated.tool).toBe("searchKnowledgeBase");
		expect(realtimeEmitMock).toHaveBeenCalledTimes(1);
		expect(realtimeEmitMock.mock.calls[0]?.[0]).toBe("timelineItemUpdated");
		expect(realtimeEmitMock.mock.calls[0]?.[1]).toMatchObject({
			conversationId: "conv-2",
			websiteId: "site-1",
			organizationId: "org-1",
			item: {
				id: "tool-item-2",
				type: "tool",
				text: "Found 2 relevant sources",
			},
		});
	});

	it("send-message path can create message timeline items without serializer reference errors", async () => {
		const createdRow = {
			id: "msg-1",
			conversationId: "conv-3",
			organizationId: "org-1",
			visibility: "public",
			type: "message",
			text: "See [https://acme.dev/pricing](https://acme.dev/pricing)",
			parts: [
				{
					type: "text",
					text: "See [https://acme.dev/pricing](https://acme.dev/pricing)",
				},
			],
			userId: null,
			visitorId: null,
			aiAgentId: "ai-1",
			createdAt: "2026-02-07T10:10:00.000Z",
			deletedAt: null,
		};
		const harness = createDbHarness({
			insertRows: [createdRow],
			updateRows: [],
		});
			const { createMessageTimelineItem } = await loadTimelineItemModule();

		const result = await createMessageTimelineItem({
			db: harness.db as never,
			organizationId: "org-1",
			websiteId: "site-1",
			conversationId: "conv-3",
			conversationOwnerVisitorId: "visitor-3",
			text: "See https://acme.dev/pricing",
			aiAgentId: "ai-1",
			id: "msg-1",
		});

		const insertedValues = harness.insertValuesMock.mock
			.calls[0]?.[0] as Record<string, unknown>;
		expect(insertedValues.text).toBe(
			"See [https://acme.dev/pricing](https://acme.dev/pricing)"
		);
		expect(result.item.id).toBe("msg-1");
		expect(result.actor).toEqual({
			type: "ai_agent",
			aiAgentId: "ai-1",
		});
		expect(realtimeEmitMock).toHaveBeenCalledTimes(1);
		expect(realtimeEmitMock.mock.calls[0]?.[0]).toBe("timelineItemCreated");
		expect(harness.updateSetMock).toHaveBeenCalledTimes(1);
	});
});
