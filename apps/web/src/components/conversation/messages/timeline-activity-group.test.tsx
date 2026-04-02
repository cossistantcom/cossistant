import { describe, expect, it } from "bun:test";
import type { RouterOutputs } from "@api/trpc/types";
import type { GroupedActivity } from "@plasma/next/hooks";
import type { AvailableAIAgent } from "@plasma/types";
import { SenderType } from "@plasma/types";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ConversationHeader } from "@/contexts/inboxes";
import { TimelineActivityGroup } from "./timeline-activity-group";

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

function createEventItem({
	id,
	createdAt,
	eventType = "participant_joined",
	userId = "user-1",
	actorUserId = "user-1",
}: {
	id: string;
	createdAt: string;
	eventType?: "participant_joined" | "participant_requested" | "status_changed";
	userId?: string | null;
	actorUserId?: string | null;
}): TimelineItem {
	return createTimelineItem({
		id,
		type: "event",
		userId,
		createdAt,
		parts: [
			{
				type: "event",
				eventType,
				actorUserId,
				actorAiAgentId: null,
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
	text,
	userId = "user-1",
	state = "result",
	output,
}: {
	id: string;
	createdAt: string;
	toolName: string;
	text: string;
	userId?: string | null;
	state?: "partial" | "result" | "error";
	output?: unknown;
}): TimelineItem {
	return createTimelineItem({
		id,
		type: "tool",
		userId,
		text,
		tool: toolName,
		createdAt,
		parts: [
			{
				type: `tool-${toolName}`,
				toolCallId: `${id}-call`,
				toolName,
				input: {},
				state,
				output,
			},
		],
	});
}

function createActivityGroup(items: TimelineItem[]): GroupedActivity {
	const firstItem = items[0];
	const lastItem = items.at(-1);
	const senderId = firstItem?.userId ?? "user-1";

	return {
		type: "activity_group",
		senderId,
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

const TEAM_MEMBERS = [
	{
		id: "user-1",
		name: "Anthony Riera",
		email: "anthony@example.com",
		image: null,
		lastSeenAt: null,
	},
] as unknown as RouterOutputs["user"]["getWebsiteMembers"];

const AVAILABLE_AI_AGENTS: AvailableAIAgent[] = [];

const VISITOR = {
	id: "visitor-1",
	contact: {
		name: "Marc",
		email: "marc@example.com",
		image: null,
	},
} as unknown as ConversationHeader["visitor"];

function renderActivityGroup(
	group: GroupedActivity,
	teamMembers: RouterOutputs["user"]["getWebsiteMembers"] = TEAM_MEMBERS
): string {
	return renderToStaticMarkup(
		React.createElement(TimelineActivityGroup, {
			group,
			availableAIAgents: AVAILABLE_AI_AGENTS,
			teamMembers,
			currentUserId: "user-1",
			visitor: VISITOR,
		})
	);
}

function countOccurrences(html: string, pattern: string): number {
	return html.split(pattern).length - 1;
}

describe("TimelineActivityGroup", () => {
	it("shows sender avatar for viewer-authored activity groups", () => {
		const group = createActivityGroup([
			createEventItem({
				id: "event-1",
				createdAt: "2026-01-01T10:00:00.000Z",
			}),
		]);

		const html = renderActivityGroup(group);

		expect(html).toContain("Anthony Riera");
		expect(html).not.toContain('data-activity-group-sender-label="true"');
		expect(html).toContain('data-slot="avatar"');
		expect(html).toContain(
			'<span class="font-semibold">Anthony Riera</span> joined the conversation'
		);
		expect(html).not.toContain('data-tool-execution-indicator="arrow"');
		expect(html).not.toContain("flex-row-reverse");
		expect(html).not.toContain("mb-2 px-1 text-muted-foreground text-xs");
	});

	it("shows Team member when a human activity actor has no name", () => {
		const group = createActivityGroup([
			createEventItem({
				id: "event-blank-name",
				createdAt: "2026-01-01T10:00:00.000Z",
			}),
		]);
		const namelessMembers = [
			{
				id: "user-1",
				name: null,
				email: "nameless@example.com",
				image: null,
				lastSeenAt: null,
			},
		] as unknown as RouterOutputs["user"]["getWebsiteMembers"];

		const html = renderActivityGroup(group, namelessMembers);

		expect(html).toContain("Team member");
		expect(html).not.toContain("nameless@example.com");
	});

	it("renders flat stacked activity rows in normal mode", () => {
		const group = createActivityGroup([
			createEventItem({
				id: "event-1",
				createdAt: "2026-01-01T10:00:00.000Z",
				eventType: "participant_joined",
			}),
			createEventItem({
				id: "event-2",
				createdAt: "2026-01-01T10:01:00.000Z",
				eventType: "status_changed",
			}),
		]);

		const html = renderActivityGroup(group);

		expect(html).toContain("Anthony Riera");
		expect(
			countOccurrences(html, 'data-activity-group-sender-label="true"')
		).toBe(1);
		expect(html).toContain("joined the conversation");
		expect(html).toContain("changed the status");
		expect(html).not.toContain(
			'<span class="font-semibold">Anthony Riera</span> joined the conversation'
		);
		expect(html).not.toContain(
			'<span class="font-semibold">Anthony Riera</span> changed the status'
		);
		expect(
			countOccurrences(html, 'data-tool-execution-indicator="arrow"')
		).toBe(2);
		expect(html).not.toContain("data-activity-tree-prefix=");
		expect(html).not.toContain("data-activity-bullet=");
	});

	it("does not render tree continuation markers anymore", () => {
		const group = createActivityGroup([
			createEventItem({
				id: "event-1",
				createdAt: "2026-01-01T10:00:00.000Z",
			}),
			createEventItem({
				id: "event-2",
				createdAt: "2026-01-01T10:01:00.000Z",
				eventType: "participant_joined",
			}),
			createEventItem({
				id: "event-3",
				createdAt: "2026-01-01T10:02:00.000Z",
				eventType: "status_changed",
			}),
		]);

		const html = renderActivityGroup(group);

		expect(countOccurrences(html, "data-activity-tree-prefix=")).toBe(0);
		expect(
			countOccurrences(html, 'data-activity-tree-continuation="true"')
		).toBe(0);
	});

	it("renders tool groups as flat sender-labeled stacks in normal mode", () => {
		const group = createActivityGroup([
			createToolItem({
				id: "tool-1",
				createdAt: "2026-01-01T10:00:00.000Z",
				toolName: "searchKnowledgeBase",
				text: 'Searched for "pricing"',
				output: {
					success: true,
					data: {
						totalFound: 6,
						articles: [
							{ title: "A", sourceUrl: "https://example.com/a" },
							{ title: "B", sourceUrl: "https://example.com/b" },
							{ title: "C", sourceUrl: "https://example.com/c" },
							{ title: "D", sourceUrl: "https://example.com/d" },
							{ title: "E", sourceUrl: "https://example.com/e" },
							{ title: "F", sourceUrl: "https://example.com/f" },
						],
					},
				},
			}),
			createEventItem({
				id: "event-1",
				createdAt: "2026-01-01T10:01:00.000Z",
			}),
		]);

		const html = renderActivityGroup(group);

		expect(html).toContain("Anthony Riera");
		expect(html).toContain('data-source-pill="true"');
		expect(html).toContain('data-source-overflow="2"');
		expect(
			countOccurrences(html, 'data-tool-execution-indicator="arrow"')
		).toBe(2);
		expect(html).toContain("Searched for &quot;pricing&quot;");
		expect(html).not.toContain("data-activity-tree-prefix=");
	});

	it("routes single-tool groups through ToolCall in normal mode", () => {
		const group = createActivityGroup([
			createToolItem({
				id: "tool-1",
				createdAt: "2026-01-01T10:00:00.000Z",
				toolName: "searchKnowledgeBase",
				text: 'Searched for "pricing"',
			}),
		]);

		const html = renderActivityGroup(group);

		expect(html).toContain("Anthony Riera");
		expect(html).toContain("Searched for &quot;pricing&quot;");
		expect(html).toContain('data-activity-group-layout="single-tool"');
		expect(html).toContain('data-tool-execution-indicator="arrow"');
		expect(html).not.toContain("data-activity-tree-prefix=");
		expect(html).not.toContain("data-activity-single-tool=");
		expect(html).not.toContain("data-activity-bullet=");
	});

	it("uses the single-tool layout when only one visible tool row remains", () => {
		const group = createActivityGroup([
			createToolItem({
				id: "tool-visible",
				createdAt: "2026-01-01T10:00:00.000Z",
				toolName: "searchKnowledgeBase",
				text: 'Searched for "pricing"',
			}),
			createToolItem({
				id: "tool-hidden",
				createdAt: "2026-01-01T10:01:00.000Z",
				toolName: "aiDecision",
				text: "Decision log",
			}),
		]);

		const html = renderActivityGroup(group);

		expect(html).toContain('data-activity-group-layout="single-tool"');
		expect(
			countOccurrences(html, 'data-tool-execution-indicator="arrow"')
		).toBe(1);
		expect(html).toContain("Anthony Riera");
	});

	it("keeps terminal arrows when an activity group has multiple tool rows", () => {
		const group = createActivityGroup([
			createToolItem({
				id: "tool-1",
				createdAt: "2026-01-01T10:00:00.000Z",
				toolName: "searchKnowledgeBase",
				text: 'Searched for "pricing"',
			}),
			createToolItem({
				id: "tool-2",
				createdAt: "2026-01-01T10:01:00.000Z",
				toolName: "searchKnowledgeBase",
				text: 'Searched for "billing"',
			}),
		]);

		const html = renderActivityGroup(group);

		expect(html).toContain('data-activity-group-layout="stacked"');
		expect(
			countOccurrences(html, 'data-tool-execution-indicator="arrow"')
		).toBe(2);
	});

	it("keeps event rows public while still rendering customer-facing tool rows", () => {
		const group = createActivityGroup([
			createEventItem({
				id: "event-1",
				createdAt: "2026-01-01T10:00:00.000Z",
				eventType: "participant_requested",
			}),
			createToolItem({
				id: "tool-1",
				createdAt: "2026-01-01T10:01:00.000Z",
				toolName: "searchKnowledgeBase",
				text: 'Searched for "billing"',
			}),
		]);

		const html = renderActivityGroup(group);

		expect(
			countOccurrences(html, 'data-activity-group-sender-label="true"')
		).toBe(1);
		expect(html).toContain(
			'<span class="font-semibold">Anthony Riera</span> requested a team member to join'
		);
		expect(html).toContain("requested a team member to join");
		expect(html).toContain("Searched for &quot;billing&quot;");
		expect(
			countOccurrences(html, 'data-tool-execution-indicator="arrow"')
		).toBe(2);
		expect(html).not.toContain("data-activity-tree-prefix=");
		expect(html).not.toContain("data-activity-bullet=");
	});

	it("does not render internal tool logs in the public activity group", () => {
		const group = createActivityGroup([
			createToolItem({
				id: "tool-log-1",
				createdAt: "2026-01-01T10:00:00.000Z",
				toolName: "aiDecision",
				text: "Decision log",
			}),
		]);

		const html = renderActivityGroup(group);
		expect(html).toBe("");
	});
});
