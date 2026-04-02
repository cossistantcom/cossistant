import { describe, expect, it } from "bun:test";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import { createTimelineItemsStore } from "./timeline-items-store";

function createTimelineItem(
	overrides: Partial<TimelineItem> = {}
): TimelineItem {
	return {
		id: "01JTESTMESSAGE000000000000",
		conversationId: "CO4GKT9QZ2BJKXMVR",
		organizationId: "org_123",
		visibility: "public",
		type: "message",
		text: "Hello",
		tool: null,
		parts: [{ type: "text", text: "Hello" }],
		userId: null,
		visitorId: "01JTESTVISITOR000000000000",
		aiAgentId: null,
		createdAt: "2026-02-20T00:00:00.000Z",
		deletedAt: null,
		...overrides,
	};
}

describe("timeline-items store dedupe", () => {
	it("does not duplicate identical ingests", () => {
		const store = createTimelineItemsStore();
		const conversationId = "CO4GKT9QZ2BJKXMVR";
		const item = createTimelineItem();

		store.ingestPage(conversationId, {
			items: [item],
			hasNextPage: false,
			nextCursor: undefined,
		});

		store.ingestTimelineItem({
			...item,
			parts: [{ type: "text", text: "Hello" }],
		});

		const items = store.getState().conversations[conversationId]?.items ?? [];
		expect(items).toHaveLength(1);
		expect(items[0]?.id).toBe(item.id);
	});

	it("reuses existing state for identical payloads", () => {
		const store = createTimelineItemsStore();
		const conversationId = "CO4GKT9QZ2BJKXMVR";
		const item = createTimelineItem();

		store.ingestPage(conversationId, {
			items: [item],
			hasNextPage: false,
			nextCursor: undefined,
		});

		const firstState = store.getState();
		const firstConversationState = firstState.conversations[conversationId];
		const firstItem = firstConversationState?.items[0];

		store.ingestPage(conversationId, {
			items: [
				{
					...item,
					parts: [{ type: "text", text: "Hello" }],
				},
			],
			hasNextPage: false,
			nextCursor: undefined,
		});

		const secondState = store.getState();
		const secondConversationState = secondState.conversations[conversationId];
		const secondItem = secondConversationState?.items[0];

		expect(secondState).toBe(firstState);
		expect(secondConversationState).toBe(firstConversationState);
		expect(secondItem).toBe(firstItem);
	});
});
