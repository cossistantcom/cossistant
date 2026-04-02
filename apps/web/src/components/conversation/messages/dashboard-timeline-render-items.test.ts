import { describe, expect, it } from "bun:test";
import type {
	ConversationItem,
	GroupedActivity,
	TimelineToolItem,
} from "@plasma/next/hooks";
import { SenderType } from "@plasma/types";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import { buildDashboardTimelineRenderItems } from "./dashboard-timeline-render-items";

function createTimelineItem(overrides: Partial<TimelineItem>): TimelineItem {
	return {
		id: "item-1",
		conversationId: "conv-1",
		organizationId: "org-1",
		visibility: "private",
		type: "tool",
		text: "Tool call",
		parts: [],
		userId: "user-1",
		visitorId: null,
		aiAgentId: null,
		tool: null,
		createdAt: "2026-01-01T10:00:00.000Z",
		deletedAt: null,
		...overrides,
	};
}

function createToolItem(params: {
	id: string;
	createdAt: string;
	toolName: string;
	text: string;
	state?: "partial" | "result" | "error";
}): TimelineItem {
	return createTimelineItem({
		id: params.id,
		type: "tool",
		tool: params.toolName,
		text: params.text,
		createdAt: params.createdAt,
		parts: [
			{
				type: `tool-${params.toolName}`,
				toolCallId: `${params.id}-call`,
				toolName: params.toolName,
				input: {},
				state: params.state ?? "result",
			},
		],
	});
}

function createEventItem(id: string, createdAt: string): TimelineItem {
	return createTimelineItem({
		id,
		type: "event",
		text: null,
		createdAt,
		parts: [
			{
				type: "event",
				eventType: "participant_joined",
				actorUserId: "user-1",
				actorAiAgentId: null,
				targetUserId: null,
				targetAiAgentId: null,
				message: null,
			},
		],
	});
}

function createActivityGroup(items: TimelineItem[]): GroupedActivity {
	const firstItem = items[0];
	const lastItem = items.at(-1);

	return {
		type: "activity_group",
		senderId: "user-1",
		senderType: SenderType.TEAM_MEMBER,
		items,
		firstItemId: firstItem?.id ?? "",
		lastItemId: lastItem?.id ?? "",
		firstItemTime: new Date(firstItem?.createdAt ?? "2026-01-01T10:00:00.000Z"),
		lastItemTime: new Date(lastItem?.createdAt ?? "2026-01-01T10:00:00.000Z"),
		hasEvent: items.some((item) => item.type === "event"),
		hasTool: items.some((item) => item.type === "tool"),
	};
}

function createStandaloneToolItem(item: TimelineItem): TimelineToolItem {
	return {
		type: "timeline_tool",
		item,
		tool: item.tool ?? null,
		timestamp: new Date(item.createdAt),
	};
}

describe("buildDashboardTimelineRenderItems", () => {
	it("splits mixed activity groups into public and developer segments in order", () => {
		const items: ConversationItem[] = [
			createActivityGroup([
				createEventItem("event-1", "2026-01-01T10:00:00.000Z"),
				createToolItem({
					id: "tool-log-1",
					createdAt: "2026-01-01T10:01:00.000Z",
					toolName: "sendMessage",
					text: "Message sent",
				}),
				createToolItem({
					id: "tool-public-1",
					createdAt: "2026-01-01T10:02:00.000Z",
					toolName: "searchKnowledgeBase",
					text: "Searched for pricing",
				}),
			]),
		];

		const renderItems = buildDashboardTimelineRenderItems(items, true);

		expect(renderItems.map((item) => item.type)).toEqual([
			"public_activity_group",
			"developer_log_group",
			"public_activity_group",
		]);
		expect(renderItems[0]?.type === "public_activity_group").toBe(true);
		if (renderItems[0]?.type === "public_activity_group") {
			expect(renderItems[0].items).toHaveLength(1);
			expect(renderItems[0].items[0]?.id).toBe("event-1");
		}
		expect(renderItems[1]?.type === "developer_log_group").toBe(true);
		if (renderItems[1]?.type === "developer_log_group") {
			expect(renderItems[1].items).toHaveLength(1);
			expect(renderItems[1].items[0]?.id).toBe("tool-log-1");
		}
		expect(renderItems[2]?.type === "public_activity_group").toBe(true);
		if (renderItems[2]?.type === "public_activity_group") {
			expect(renderItems[2].items).toHaveLength(1);
			expect(renderItems[2].items[0]?.id).toBe("tool-public-1");
		}
	});

	it("drops internal tool rows from normal mode", () => {
		const items: ConversationItem[] = [
			createActivityGroup([
				createToolItem({
					id: "tool-log-1",
					createdAt: "2026-01-01T10:00:00.000Z",
					toolName: "aiDecision",
					text: "Decision log",
				}),
				createToolItem({
					id: "tool-public-1",
					createdAt: "2026-01-01T10:01:00.000Z",
					toolName: "searchKnowledgeBase",
					text: "Searched for pricing",
				}),
			]),
		];

		const renderItems = buildDashboardTimelineRenderItems(items, false);

		expect(renderItems.map((item) => item.type)).toEqual([
			"public_activity_group",
		]);
		expect(renderItems[0]?.type === "public_activity_group").toBe(true);
		if (renderItems[0]?.type === "public_activity_group") {
			expect(renderItems[0].items).toHaveLength(1);
			expect(renderItems[0].items[0]?.id).toBe("tool-public-1");
		}
	});

	it("keeps title, sentiment, and priority updates in public activity groups", () => {
		const items: ConversationItem[] = [
			createActivityGroup([
				createToolItem({
					id: "tool-title-1",
					createdAt: "2026-01-01T10:00:00.000Z",
					toolName: "updateConversationTitle",
					text: 'Changed title to "Billing"',
				}),
				createToolItem({
					id: "tool-sentiment-1",
					createdAt: "2026-01-01T10:01:00.000Z",
					toolName: "updateSentiment",
					text: "Updated sentiment to positive",
				}),
				createToolItem({
					id: "tool-priority-1",
					createdAt: "2026-01-01T10:02:00.000Z",
					toolName: "setPriority",
					text: "Priority set to high",
				}),
			]),
		];

		const renderItems = buildDashboardTimelineRenderItems(items, false);

		expect(renderItems.map((item) => item.type)).toEqual([
			"public_activity_group",
		]);
		expect(renderItems[0]?.type).toBe("public_activity_group");
		if (renderItems[0]?.type === "public_activity_group") {
			expect(renderItems[0].items.map((item) => item.id)).toEqual([
				"tool-title-1",
				"tool-sentiment-1",
				"tool-priority-1",
			]);
		}
	});

	it("merges adjacent standalone internal tools into one developer log group", () => {
		const items: ConversationItem[] = [
			createStandaloneToolItem(
				createToolItem({
					id: "credit-1",
					createdAt: "2026-01-01T10:00:00.000Z",
					toolName: "aiCreditUsage",
					text: "Credits calculated",
				})
			),
			createStandaloneToolItem(
				createToolItem({
					id: "credit-2",
					createdAt: "2026-01-01T10:03:00.000Z",
					toolName: "generationUsage",
					text: "Model usage calculated",
				})
			),
		];

		const renderItems = buildDashboardTimelineRenderItems(items, true);

		expect(renderItems).toHaveLength(1);
		expect(renderItems[0]?.type).toBe("developer_log_group");
		if (renderItems[0]?.type === "developer_log_group") {
			expect(renderItems[0].items.map((item) => item.id)).toEqual([
				"credit-1",
				"credit-2",
			]);
		}
	});
});
