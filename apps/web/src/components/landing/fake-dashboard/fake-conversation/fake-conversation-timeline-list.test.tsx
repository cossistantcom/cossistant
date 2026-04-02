import { describe, expect, it } from "bun:test";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ConversationHeader } from "@/contexts/inboxes";
import type { ConversationTimelineItem } from "@/data/conversation-message-cache";
import { FakeConversationTimelineList } from "./fake-conversation-timeline-list";

function createTimelineItem(overrides: Partial<TimelineItem>): TimelineItem {
	return {
		id: "item-1",
		conversationId: "conv-1",
		organizationId: "org-1",
		visibility: "public",
		type: "event",
		text: null,
		parts: [],
		userId: null,
		visitorId: null,
		aiAgentId: null,
		tool: null,
		createdAt: "2026-01-01T10:00:00.000Z",
		deletedAt: null,
		...overrides,
	};
}

function createEventItem(id: string, createdAt: string): TimelineItem {
	return createTimelineItem({
		id,
		type: "event",
		userId: "01JGUSER1111111111111111",
		createdAt,
		parts: [
			{
				type: "event",
				eventType: "participant_joined",
				actorUserId: "01JGUSER1111111111111111",
				actorAiAgentId: null,
				targetUserId: null,
				targetAiAgentId: null,
				message: null,
			},
		],
	});
}

function createToolItem(params: {
	id: string;
	createdAt: string;
	toolName: "searchKnowledgeBase" | "updateConversationTitle" | "aiDecision";
	state: "partial" | "result";
	text: string;
	output?: unknown;
}): TimelineItem {
	return createTimelineItem({
		id: params.id,
		type: "tool",
		userId: null,
		aiAgentId: "01JGAIA11111111111111111",
		text: params.text,
		tool: params.toolName,
		createdAt: params.createdAt,
		parts: [
			{
				type: `tool-${params.toolName}`,
				toolCallId: `${params.id}-call`,
				toolName: params.toolName,
				input: { query: "allowlist" },
				state: params.state,
				output: params.output,
			},
		],
	});
}

const VISITOR = {
	id: "visitor-1",
	contact: {
		name: "Marc",
		email: "marc@example.com",
		image: null,
	},
} as unknown as ConversationHeader["visitor"];

describe("FakeDashboard timeline activity grouping", () => {
	it("supports a centered layout mode for focused landing demos", () => {
		const items = [
			createTimelineItem({
				id: "visitor-message",
				type: "message",
				text: "How do I delete my account?",
				parts: [{ type: "text", text: "How do I delete my account?" }],
				userId: null,
				visitorId: "visitor-1",
				aiAgentId: null,
				createdAt: "2026-01-01T10:00:00.000Z",
			}),
		] as unknown as ConversationTimelineItem[];

		const html = renderToStaticMarkup(
			React.createElement(FakeConversationTimelineList, {
				items,
				layoutMode: "centered",
				visitor: VISITOR,
				typingActors: [],
			})
		);

		expect(html).toContain('data-fake-conversation-layout-mode="centered"');
		expect(html).toContain("How do I delete my account?");
		expect(html).not.toContain("overflow-y-scroll");
		expect(html).not.toContain("pt-20");
	});

	it("uses the flat tool row structure for grouped activity rows and keeps sender identity visible", () => {
		const items = [
			createEventItem("event-1", "2026-01-01T10:00:00.000Z"),
			createToolItem({
				id: "tool-1",
				createdAt: "2026-01-01T10:01:00.000Z",
				toolName: "searchKnowledgeBase",
				state: "partial",
				text: "Checking runbooks",
			}),
		] as unknown as ConversationTimelineItem[];

		const html = renderToStaticMarkup(
			React.createElement(FakeConversationTimelineList, {
				items,
				visitor: VISITOR,
				typingActors: [],
			})
		);

		expect(html).toContain("joined the conversation");
		expect(html).toContain('data-tool-execution-indicator="spinner"');
		expect(html).toContain('data-slot="avatar"');
		expect(html).not.toContain("flex-row-reverse");
		expect(html).not.toContain("mb-2 px-1 text-muted-foreground text-xs");
	});

	it("renders tool rows, human handoff rows, and visitor typing preview", () => {
		const items = [
			createToolItem({
				id: "tool-search-partial",
				createdAt: "2026-01-01T10:00:40.000Z",
				toolName: "searchKnowledgeBase",
				state: "partial",
				text: "Checking runbooks",
			}),
			createToolItem({
				id: "tool-search-result",
				createdAt: "2026-01-01T10:01:00.000Z",
				toolName: "searchKnowledgeBase",
				state: "result",
				text: "Matched knowledge base sources",
				output: {
					success: true,
					data: {
						totalFound: 2,
						articles: [
							{ title: "Allowlist checklist" },
							{ title: "Cache propagation" },
						],
					},
				},
			}),
			createToolItem({
				id: "tool-title-result",
				createdAt: "2026-01-01T10:01:30.000Z",
				toolName: "updateConversationTitle",
				state: "result",
				text: 'Changed title to "Custom domain blocked by stale edge allowlist"',
				output: {
					success: true,
					data: { title: "Custom domain blocked by stale edge allowlist" },
				},
			}),
			createTimelineItem({
				id: "join-event",
				type: "event",
				text: null,
				parts: [
					{
						type: "event",
						eventType: "participant_joined",
						actorUserId: "01JGUSER1111111111111111",
						actorAiAgentId: null,
						targetUserId: null,
						targetAiAgentId: null,
						message: null,
					},
				],
				userId: "01JGUSER1111111111111111",
				visitorId: null,
				aiAgentId: null,
				createdAt: "2026-01-01T10:02:00.000Z",
			}),
			createTimelineItem({
				id: "anthony-follow-up",
				type: "message",
				text: "Joined. I validated and published the production allowlist update.",
				parts: [
					{
						type: "text",
						text: "Joined. I validated and published the production allowlist update.",
					},
				],
				userId: "01JGUSER1111111111111111",
				visitorId: null,
				aiAgentId: null,
				createdAt: "2026-01-01T10:03:00.000Z",
			}),
		] as unknown as ConversationTimelineItem[];

		const html = renderToStaticMarkup(
			React.createElement(FakeConversationTimelineList, {
				items,
				visitor: VISITOR,
				typingActors: [
					{
						conversationId: "conv-1",
						actorType: "visitor",
						actorId: "visitor-1",
						preview:
							"Perfect, I refreshed and checkout events are flowing again.",
					},
				],
			})
		);

		expect(html).toContain("Searching for &quot;allowlist&quot;...");
		expect(html).toContain("Allowlist checklist");
		expect(html).toContain("Cache propagation");
		expect(html).toContain("Anthony Riera");
		expect(html).toContain("joined the conversation");
		expect(html).toContain(
			"Joined. I validated and published the production allowlist update."
		);
		expect(html).toContain("live typing");
		expect(html).toContain(
			"Perfect, I refreshed and checkout events are flowing again."
		);
	});

	it("keeps internal tool telemetry out of the fake dashboard public timeline", () => {
		const items = [
			createToolItem({
				id: "tool-log-1",
				createdAt: "2026-01-01T10:00:00.000Z",
				toolName: "aiDecision",
				state: "result",
				text: "Response action captured",
			}),
			createToolItem({
				id: "tool-public-1",
				createdAt: "2026-01-01T10:01:00.000Z",
				toolName: "searchKnowledgeBase",
				state: "result",
				text: "Matched knowledge base sources",
				output: {
					success: true,
					data: { totalFound: 1, articles: [{ title: "Allowlist checklist" }] },
				},
			}),
		] as unknown as ConversationTimelineItem[];

		const html = renderToStaticMarkup(
			React.createElement(FakeConversationTimelineList, {
				items,
				visitor: VISITOR,
				typingActors: [],
			})
		);

		expect(html).not.toContain("Response action captured");
		expect(html).toContain("Searched for &quot;allowlist&quot;");
	});
});
