import { describe, expect, it } from "bun:test";
import { SenderType } from "@plasma/types";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TimelineItemGroupRenderProps } from "./timeline-item-group";
import { TimelineItemGroup } from "./timeline-item-group";

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

function renderGroup(item: TimelineItem, viewerId?: string): string {
	return renderToStaticMarkup(
		React.createElement(
			TimelineItemGroup,
			{
				items: [item],
				viewerId,
			},
			(props: TimelineItemGroupRenderProps) =>
				React.createElement("span", {
					"data-sender-id": props.senderId,
					"data-sender-type": props.senderType,
					"data-sent": String(props.isSentByViewer),
					"data-received": String(props.isReceivedByViewer),
					"data-seen-by-viewer": String(props.hasBeenSeenByViewer),
				})
		)
	);
}

describe("TimelineItemGroup sender resolution", () => {
	it("prefers user sender over ai and visitor ids", () => {
		const html = renderGroup(
			createTimelineItem({
				id: "tool-1",
				type: "tool",
				userId: "user-1",
				aiAgentId: "ai-1",
				visitorId: "visitor-1",
				parts: [
					{
						type: "tool-searchKnowledgeBase",
						toolCallId: "call-1",
						toolName: "searchKnowledgeBase",
						input: {},
						state: "partial",
					},
				],
			}),
			"user-1"
		);

		expect(html).toContain(`data-sender-id="user-1"`);
		expect(html).toContain(`data-sender-type="${SenderType.TEAM_MEMBER}"`);
		expect(html).toContain(`data-sent="true"`);
		expect(html).toContain(`data-received="false"`);
	});

	it("falls back to event actor when root ids are missing", () => {
		const html = renderGroup(
			createTimelineItem({
				id: "event-1",
				type: "event",
				userId: null,
				aiAgentId: null,
				visitorId: null,
				parts: [
					{
						type: "event",
						eventType: "participant_joined",
						actorUserId: null,
						actorAiAgentId: "ai-42",
						targetUserId: null,
						targetAiAgentId: null,
						message: null,
					},
				],
			}),
			"visitor-1"
		);

		expect(html).toContain(`data-sender-id="ai-42"`);
		expect(html).toContain(`data-sender-type="${SenderType.AI}"`);
		expect(html).toContain(`data-sent="false"`);
		expect(html).toContain(`data-received="true"`);
	});
});

describe("TimelineItemGroup seen state", () => {
	it("marks viewer as seen when viewer id is in seenByIds", () => {
		const item = createTimelineItem({
			id: "msg-1",
			visitorId: "visitor-1",
		});

		const html = renderToStaticMarkup(
			React.createElement(
				TimelineItemGroup,
				{
					items: [item],
					viewerId: "visitor-1",
					seenByIds: ["visitor-1", "user-1"],
				},
				(props: TimelineItemGroupRenderProps) =>
					React.createElement("span", {
						"data-seen-by-viewer": String(props.hasBeenSeenByViewer),
					})
			)
		);

		expect(html).toContain(`data-seen-by-viewer="true"`);
	});
});
