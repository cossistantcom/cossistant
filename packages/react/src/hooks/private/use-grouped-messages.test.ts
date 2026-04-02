import { describe, expect, it } from "bun:test";
import { SenderType } from "@plasma/types";
import type {
	TimelineItem,
	TimelinePartEvent,
} from "@plasma/types/api/timeline-item";
import type { ConversationSeen } from "@plasma/types/schemas";
import {
	buildTimelineReadReceiptData,
	groupTimelineItems,
	prepareTimelineItems,
	TIMELINE_GROUP_WINDOW_MS,
} from "./use-grouped-messages";

const MINUTE_MS = 60 * 1000;

function createTimelineItem(
	overrides: Partial<TimelineItem> = {}
): TimelineItem {
	const base: TimelineItem = {
		id: "item-1",
		conversationId: "conv-1",
		organizationId: "org-1",
		visibility: "public",
		type: "message",
		text: "Hello",
		parts: [],
		userId: null,
		visitorId: "visitor-1",
		aiAgentId: null,
		createdAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
		deletedAt: null,
	};

	return { ...base, ...overrides };
}

function createMessageItem({
	id,
	createdAt,
	userId = null,
	visitorId = null,
	aiAgentId = null,
}: {
	id: string;
	createdAt: string;
	userId?: string | null;
	visitorId?: string | null;
	aiAgentId?: string | null;
}): TimelineItem {
	return createTimelineItem({
		id,
		type: "message",
		userId,
		visitorId,
		aiAgentId,
		createdAt,
		parts: [],
	});
}

function createEventItem({
	id,
	createdAt,
	userId = null,
	visitorId = null,
	aiAgentId = null,
	actorUserId = null,
	actorAiAgentId = null,
	eventType = "assigned",
}: {
	id: string;
	createdAt: string;
	userId?: string | null;
	visitorId?: string | null;
	aiAgentId?: string | null;
	actorUserId?: string | null;
	actorAiAgentId?: string | null;
	eventType?: TimelinePartEvent["eventType"];
}): TimelineItem {
	return createTimelineItem({
		id,
		type: "event",
		userId,
		visitorId,
		aiAgentId,
		createdAt,
		parts: [
			{
				type: "event",
				eventType,
				actorUserId,
				actorAiAgentId,
				targetUserId: null,
				targetAiAgentId: null,
				message: null,
			},
		],
	});
}

function createToolItem({
	id,
	createdAt,
	toolName,
	userId = null,
	visitorId = null,
	aiAgentId = null,
}: {
	id: string;
	createdAt: string;
	toolName: string;
	userId?: string | null;
	visitorId?: string | null;
	aiAgentId?: string | null;
}): TimelineItem {
	return createTimelineItem({
		id,
		type: "tool",
		userId,
		visitorId,
		aiAgentId,
		tool: null,
		createdAt,
		parts: [
			{
				type: `tool-${toolName}`,
				toolCallId: `${id}-call`,
				toolName,
				input: {},
				state: "result",
				result: {},
			},
		],
	});
}

function createIdentificationItem({
	id,
	createdAt,
	userId = null,
	visitorId = null,
	aiAgentId = null,
}: {
	id: string;
	createdAt: string;
	userId?: string | null;
	visitorId?: string | null;
	aiAgentId?: string | null;
}): TimelineItem {
	return createTimelineItem({
		id,
		type: "identification",
		userId,
		visitorId,
		aiAgentId,
		tool: "identification",
		createdAt,
		parts: [],
	});
}

function createSeenEntry(
	overrides: Partial<ConversationSeen> = {}
): ConversationSeen {
	const base: ConversationSeen = {
		id: "seen-1",
		conversationId: "conv-1",
		userId: "user-1",
		visitorId: null,
		aiAgentId: null,
		lastSeenAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
		createdAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
		updatedAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
		deletedAt: null,
	};

	return { ...base, ...overrides };
}

describe("prepareTimelineItems", () => {
	it("keeps already sorted arrays on a fast path", () => {
		const items: TimelineItem[] = [
			createMessageItem({
				id: "msg-1",
				createdAt: "2024-01-01T10:00:00.000Z",
				visitorId: "visitor-1",
			}),
			createMessageItem({
				id: "msg-2",
				createdAt: "2024-01-01T10:01:00.000Z",
				visitorId: "visitor-1",
			}),
		];

		const prepared = prepareTimelineItems(items);

		expect(prepared.didSort).toBe(false);
		expect(prepared.items).toBe(items);
		expect(prepared.times).toEqual([
			new Date("2024-01-01T10:00:00.000Z").getTime(),
			new Date("2024-01-01T10:01:00.000Z").getTime(),
		]);
	});

	it("sorts unsorted arrays and preserves stable ordering for equal timestamps", () => {
		const items: TimelineItem[] = [
			createMessageItem({
				id: "msg-3",
				createdAt: "2024-01-01T10:02:00.000Z",
				visitorId: "visitor-1",
			}),
			createMessageItem({
				id: "msg-1",
				createdAt: "2024-01-01T10:00:00.000Z",
				visitorId: "visitor-1",
			}),
			createMessageItem({
				id: "msg-2",
				createdAt: "2024-01-01T10:00:00.000Z",
				visitorId: "visitor-1",
			}),
			createMessageItem({
				id: "msg-4",
				createdAt: "2024-01-01T10:03:00.000Z",
				visitorId: "visitor-1",
			}),
		];

		const prepared = prepareTimelineItems(items);
		const sortedIds = prepared.items.map((item) => item.id);

		expect(prepared.didSort).toBe(true);
		expect(sortedIds).toEqual(["msg-1", "msg-2", "msg-3", "msg-4"]);
	});

	it("handles append-heavy timelines without sorting work", () => {
		const baseTime = new Date("2024-01-01T00:00:00.000Z").getTime();
		const items: TimelineItem[] = Array.from({ length: 1500 }, (_, index) =>
			createMessageItem({
				id: `msg-${index}`,
				createdAt: new Date(baseTime + index * 1000).toISOString(),
				visitorId: "visitor-1",
			})
		);

		const prepared = prepareTimelineItems(items);

		expect(prepared.didSort).toBe(false);
		expect(prepared.items).toBe(items);
		expect(prepared.times.length).toBe(items.length);
	});
});

describe("groupTimelineItems", () => {
	it("groups messages by sender only when within the time window", () => {
		const base = new Date("2024-01-01T09:00:00.000Z").getTime();
		const items: TimelineItem[] = [
			createMessageItem({
				id: "m1",
				createdAt: new Date(base).toISOString(),
				visitorId: "visitor-1",
			}),
			createMessageItem({
				id: "m2",
				createdAt: new Date(base + 4 * MINUTE_MS).toISOString(),
				visitorId: "visitor-1",
			}),
			createMessageItem({
				id: "m3",
				createdAt: new Date(base + 11 * MINUTE_MS).toISOString(),
				visitorId: "visitor-1",
			}),
			createMessageItem({
				id: "m4",
				createdAt: new Date(base + 12 * MINUTE_MS).toISOString(),
				visitorId: "visitor-2",
			}),
		];

		const grouped = groupTimelineItems(
			items,
			items.map((item) => new Date(item.createdAt).getTime())
		);

		expect(grouped).toHaveLength(4);
		expect(grouped[0]?.type).toBe("day_separator");
		expect(grouped[1]?.type).toBe("message_group");
		expect(grouped[2]?.type).toBe("message_group");
		expect(grouped[3]?.type).toBe("message_group");

		if (grouped[1]?.type === "message_group") {
			expect(grouped[1].items.map((item) => item.id)).toEqual(["m1", "m2"]);
		}
		if (grouped[2]?.type === "message_group") {
			expect(grouped[2].items.map((item) => item.id)).toEqual(["m3"]);
		}
		if (grouped[3]?.type === "message_group") {
			expect(grouped[3].senderId).toBe("visitor-2");
		}
	});

	it("groups messages correctly when non-visible tool items are pre-filtered", () => {
		const base = new Date("2024-01-01T09:00:00.000Z").getTime();

		// Simulate what happens when invisible tools are filtered out before
		// grouping: AI sends 3 messages with internal tool calls between them.
		// Without pre-filtering, the tools break the message groups.
		// With pre-filtering (removing the tool items), all 3 messages group.
		const items: TimelineItem[] = [
			createMessageItem({
				id: "m1",
				createdAt: new Date(base).toISOString(),
				aiAgentId: "ai-1",
			}),
			// tool item would be here at base + 5s but is filtered out
			createMessageItem({
				id: "m2",
				createdAt: new Date(base + 10_000).toISOString(),
				aiAgentId: "ai-1",
			}),
			// another tool item would be here at base + 15s but is filtered out
			createMessageItem({
				id: "m3",
				createdAt: new Date(base + 20_000).toISOString(),
				aiAgentId: "ai-1",
			}),
		];

		const grouped = groupTimelineItems(
			items,
			items.map((item) => new Date(item.createdAt).getTime())
		);

		expect(grouped).toHaveLength(2);
		expect(grouped[0]?.type).toBe("day_separator");
		expect(grouped[1]?.type).toBe("message_group");

		if (grouped[1]?.type === "message_group") {
			expect(grouped[1].items.map((item) => item.id)).toEqual([
				"m1",
				"m2",
				"m3",
			]);
			expect(grouped[1].senderId).toBe("ai-1");
		}
	});

	it("tool items between messages from the same sender break groups", () => {
		const base = new Date("2024-01-01T09:00:00.000Z").getTime();

		// Without pre-filtering, tool items break message groups.
		// This is the expected behavior of the grouping algorithm itself.
		const items: TimelineItem[] = [
			createMessageItem({
				id: "m1",
				createdAt: new Date(base).toISOString(),
				aiAgentId: "ai-1",
			}),
			createToolItem({
				id: "t1",
				createdAt: new Date(base + 5000).toISOString(),
				toolName: "searchKnowledgeBase",
				aiAgentId: "ai-1",
			}),
			createMessageItem({
				id: "m2",
				createdAt: new Date(base + 10_000).toISOString(),
				aiAgentId: "ai-1",
			}),
		];

		const grouped = groupTimelineItems(
			items,
			items.map((item) => new Date(item.createdAt).getTime())
		);

		// Tool breaks the message group into: day_sep, msg_group(m1), activity_group(t1), msg_group(m2)
		expect(grouped).toHaveLength(4);
		expect(grouped[0]?.type).toBe("day_separator");
		expect(grouped[1]?.type).toBe("message_group");
		expect(grouped[2]?.type).toBe("activity_group");
		expect(grouped[3]?.type).toBe("message_group");

		if (grouped[1]?.type === "message_group") {
			expect(grouped[1].items.map((item) => item.id)).toEqual(["m1"]);
		}
		if (grouped[3]?.type === "message_group") {
			expect(grouped[3].items.map((item) => item.id)).toEqual(["m2"]);
		}
	});

	it("groups events and tools together for the same sender in the window", () => {
		const base = new Date("2024-01-01T12:00:00.000Z").getTime();
		const items: TimelineItem[] = [
			createEventItem({
				id: "e1",
				createdAt: new Date(base).toISOString(),
				userId: "user-1",
				actorUserId: "user-1",
				eventType: "assigned",
			}),
			createToolItem({
				id: "t1",
				createdAt: new Date(base + 2 * MINUTE_MS).toISOString(),
				toolName: "updateSentiment",
				userId: "user-1",
			}),
			createEventItem({
				id: "e2",
				createdAt: new Date(base + 4 * MINUTE_MS).toISOString(),
				userId: "user-1",
				actorUserId: "user-1",
				eventType: "status_changed",
			}),
			createToolItem({
				id: "t2",
				createdAt: new Date(base + 10 * MINUTE_MS).toISOString(),
				toolName: "setPriority",
				userId: "user-1",
			}),
			createIdentificationItem({
				id: "id1",
				createdAt: new Date(base + 11 * MINUTE_MS).toISOString(),
				userId: "user-1",
			}),
		];

		const grouped = groupTimelineItems(
			items,
			items.map((item) => new Date(item.createdAt).getTime())
		);

		expect(grouped).toHaveLength(4);
		expect(grouped[0]?.type).toBe("day_separator");
		expect(grouped[1]?.type).toBe("activity_group");
		expect(grouped[2]?.type).toBe("activity_group");
		expect(grouped[3]?.type).toBe("timeline_tool");

		if (grouped[1]?.type === "activity_group") {
			expect(grouped[1].items.map((item) => item.id)).toEqual([
				"e1",
				"t1",
				"e2",
			]);
			expect(grouped[1].hasEvent).toBe(true);
			expect(grouped[1].hasTool).toBe(true);
		}
		if (grouped[2]?.type === "activity_group") {
			expect(grouped[2].items.map((item) => item.id)).toEqual(["t2"]);
			expect(grouped[2].hasEvent).toBe(false);
			expect(grouped[2].hasTool).toBe(true);
		}
	});

	it("resolves sender precedence for activity groups as user -> ai -> visitor", () => {
		const base = new Date("2024-01-01T15:00:00.000Z").getTime();
		const items: TimelineItem[] = [
			createEventItem({
				id: "e1",
				createdAt: new Date(base).toISOString(),
				actorAiAgentId: "ai-1",
				eventType: "participant_joined",
			}),
			createToolItem({
				id: "t1",
				createdAt: new Date(base + MINUTE_MS).toISOString(),
				toolName: "searchKnowledgeBase",
				aiAgentId: "ai-1",
				visitorId: "visitor-1",
			}),
		];

		const grouped = groupTimelineItems(
			items,
			items.map((item) => new Date(item.createdAt).getTime())
		);

		expect(grouped).toHaveLength(2);
		expect(grouped[1]?.type).toBe("activity_group");

		if (grouped[1]?.type === "activity_group") {
			expect(grouped[1].senderId).toBe("ai-1");
			expect(grouped[1].senderType).toBe(SenderType.AI);
			expect(grouped[1].items).toHaveLength(2);
		}
	});

	it("renders aiCreditUsage as a standalone timeline_tool", () => {
		const base = new Date("2024-01-01T12:00:00.000Z").getTime();
		const items: TimelineItem[] = [
			createToolItem({
				id: "credit-1",
				createdAt: new Date(base).toISOString(),
				toolName: "aiCreditUsage",
				aiAgentId: "ai-1",
			}),
		];
		// Set item.tool so the classifier can detect it
		(items[0] as TimelineItem).tool = "aiCreditUsage";

		const grouped = groupTimelineItems(
			items,
			items.map((item) => new Date(item.createdAt).getTime())
		);

		expect(grouped).toHaveLength(2);
		expect(grouped[0]?.type).toBe("day_separator");
		expect(grouped[1]?.type).toBe("timeline_tool");

		if (grouped[1]?.type === "timeline_tool") {
			expect(grouped[1].item.id).toBe("credit-1");
			expect(grouped[1].tool).toBe("aiCreditUsage");
		}
	});

	it("renders generationUsage as a standalone timeline_tool for compatibility", () => {
		const base = new Date("2024-01-01T12:00:00.000Z").getTime();
		const items: TimelineItem[] = [
			createToolItem({
				id: "generation-1",
				createdAt: new Date(base).toISOString(),
				toolName: "generationUsage",
				aiAgentId: "ai-1",
			}),
		];
		(items[0] as TimelineItem).tool = "generationUsage";

		const grouped = groupTimelineItems(
			items,
			items.map((item) => new Date(item.createdAt).getTime())
		);

		expect(grouped).toHaveLength(2);
		expect(grouped[0]?.type).toBe("day_separator");
		expect(grouped[1]?.type).toBe("timeline_tool");

		if (grouped[1]?.type === "timeline_tool") {
			expect(grouped[1].item.id).toBe("generation-1");
			expect(grouped[1].tool).toBe("generationUsage");
		}
	});

	it("aiCreditUsage between other tools breaks the activity group", () => {
		const base = new Date("2024-01-01T12:00:00.000Z").getTime();
		const creditItem = createToolItem({
			id: "credit-1",
			createdAt: new Date(base + 2 * MINUTE_MS).toISOString(),
			toolName: "aiCreditUsage",
			aiAgentId: "ai-1",
		});
		(creditItem as TimelineItem).tool = "aiCreditUsage";

		const items: TimelineItem[] = [
			createToolItem({
				id: "t1",
				createdAt: new Date(base).toISOString(),
				toolName: "searchKnowledgeBase",
				aiAgentId: "ai-1",
			}),
			creditItem,
			createToolItem({
				id: "t2",
				createdAt: new Date(base + 3 * MINUTE_MS).toISOString(),
				toolName: "updateSentiment",
				aiAgentId: "ai-1",
			}),
		];

		const grouped = groupTimelineItems(
			items,
			items.map((item) => new Date(item.createdAt).getTime())
		);

		// day_sep, activity_group(t1), timeline_tool(credit), activity_group(t2)
		expect(grouped).toHaveLength(4);
		expect(grouped[0]?.type).toBe("day_separator");
		expect(grouped[1]?.type).toBe("activity_group");
		expect(grouped[2]?.type).toBe("timeline_tool");
		expect(grouped[3]?.type).toBe("activity_group");

		if (grouped[1]?.type === "activity_group") {
			expect(grouped[1].items.map((item) => item.id)).toEqual(["t1"]);
		}
		if (grouped[2]?.type === "timeline_tool") {
			expect(grouped[2].item.id).toBe("credit-1");
		}
		if (grouped[3]?.type === "activity_group") {
			expect(grouped[3].items.map((item) => item.id)).toEqual(["t2"]);
		}
	});

	it("breaks activity groups at day boundaries", () => {
		const items: TimelineItem[] = [
			createEventItem({
				id: "e1",
				createdAt: "2024-01-01T23:58:00.000Z",
				userId: "user-1",
				actorUserId: "user-1",
				eventType: "assigned",
			}),
			createToolItem({
				id: "t1",
				createdAt: "2024-01-02T00:01:00.000Z",
				toolName: "updateConversationTitle",
				userId: "user-1",
			}),
		];

		const grouped = groupTimelineItems(
			items,
			items.map((item) => new Date(item.createdAt).getTime())
		);

		expect(grouped).toHaveLength(4);
		expect(grouped[0]?.type).toBe("day_separator");
		expect(grouped[1]?.type).toBe("activity_group");
		expect(grouped[2]?.type).toBe("day_separator");
		expect(grouped[3]?.type).toBe("activity_group");
	});
});

describe("buildTimelineReadReceiptData", () => {
	it("computes read receipts against pre-sorted message arrays", () => {
		const sortedMessageItems: TimelineItem[] = [
			createMessageItem({
				id: "m1",
				createdAt: "2024-01-01T10:00:00.000Z",
				visitorId: "visitor-1",
			}),
			createMessageItem({
				id: "m2",
				createdAt: "2024-01-01T10:05:00.000Z",
				userId: "user-1",
			}),
			createMessageItem({
				id: "m3",
				createdAt: "2024-01-01T10:10:00.000Z",
				userId: "user-1",
			}),
		];
		const sortedTimes = sortedMessageItems.map((item) =>
			new Date(item.createdAt).getTime()
		);

		const seenData: ConversationSeen[] = [
			createSeenEntry({
				id: "seen-visitor",
				userId: null,
				visitorId: "visitor-1",
				lastSeenAt: "2024-01-01T10:06:00.000Z",
			}),
			createSeenEntry({
				id: "seen-ai",
				userId: null,
				visitorId: null,
				aiAgentId: "ai-1",
				lastSeenAt: "2024-01-01T10:11:00.000Z",
			}),
		];

		const { seenByMap, lastReadMessageMap, unreadCountMap } =
			buildTimelineReadReceiptData(seenData, sortedMessageItems, sortedTimes);

		expect(seenByMap.get("m1")?.has("visitor-1")).toBe(true);
		expect(seenByMap.get("m2")?.has("visitor-1")).toBe(true);
		expect(seenByMap.get("m3")?.has("visitor-1")).toBe(false);

		expect(lastReadMessageMap.get("visitor-1")).toBe("m2");
		expect(unreadCountMap.get("visitor-1")).toBe(1);

		expect(lastReadMessageMap.get("ai-1")).toBe("m3");
		expect(unreadCountMap.get("ai-1")).toBe(0);
	});

	it("returns initialized maps even when seenData is empty", () => {
		const sortedMessageItems: TimelineItem[] = [
			createMessageItem({
				id: "m1",
				createdAt: "2024-01-01T10:00:00.000Z",
				visitorId: "visitor-1",
			}),
			createMessageItem({
				id: "m2",
				createdAt: "2024-01-01T10:05:00.000Z",
				userId: "user-1",
			}),
		];
		const sortedTimes = sortedMessageItems.map((item) =>
			new Date(item.createdAt).getTime()
		);

		const { seenByMap, lastReadMessageMap, unreadCountMap } =
			buildTimelineReadReceiptData([], sortedMessageItems, sortedTimes);

		expect(seenByMap.size).toBe(2);
		expect(lastReadMessageMap.size).toBe(0);
		expect(unreadCountMap.size).toBe(0);
	});
});
