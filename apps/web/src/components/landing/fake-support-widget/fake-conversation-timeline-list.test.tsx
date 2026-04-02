import { describe, expect, it } from "bun:test";
import type { AvailableAIAgent, AvailableHumanAgent } from "@plasma/types";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FakeConversationTimelineList } from "./fake-conversation-timeline-list";
import type { FakeSupportTypingActor } from "./types";

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

function createToolItem(
	id: string,
	createdAt: string,
	toolName: "searchKnowledgeBase" | "updateConversationTitle"
): TimelineItem {
	return createTimelineItem({
		id,
		type: "tool",
		userId: null,
		aiAgentId: "ai-1",
		text:
			toolName === "updateConversationTitle"
				? 'Updated the title to "Cinematic preset crops face in thumbnail".'
				: "Checked the Cinematic preset troubleshooting runbook.",
		tool: toolName,
		createdAt,
		parts: [
			{
				type: `tool-${toolName}`,
				toolCallId: `${id}-call`,
				toolName,
				input: {},
				state: "result",
				output: {},
			},
		],
	});
}

const AVAILABLE_AI_AGENTS: AvailableAIAgent[] = [
	{
		id: "ai-1",
		name: "AI",
		image: "https://example.com/thumbnail-ai.png",
	},
];

const AVAILABLE_HUMAN_AGENTS: AvailableHumanAgent[] = [
	{
		id: "human-1",
		name: "Anthony Riera",
		image: "https://example.com/anthony.png",
		lastSeenAt: null,
	},
];

function renderTimeline(options: {
	items: TimelineItem[];
	typingActors?: FakeSupportTypingActor[];
	currentVisitorId?: string;
}): string {
	return renderToStaticMarkup(
		React.createElement(FakeConversationTimelineList, {
			conversationId: "conv-1",
			items: options.items,
			availableAIAgents: AVAILABLE_AI_AGENTS,
			availableHumanAgents: AVAILABLE_HUMAN_AGENTS,
			currentVisitorId: options.currentVisitorId ?? "visitor-1",
			typingActors: options.typingActors ?? [],
		})
	);
}

describe("FakeSupportWidget timeline activity grouping", () => {
	it("renders visible AI tool rows with the shared tool structure", () => {
		const html = renderTimeline({
			items: [
				createToolItem(
					"tool-1",
					"2026-01-01T10:00:00.000Z",
					"searchKnowledgeBase"
				),
				createToolItem(
					"tool-2",
					"2026-01-01T10:01:00.000Z",
					"searchKnowledgeBase"
				),
			],
		});

		expect(html).toContain('data-tool-execution-indicator="arrow"');
		expect(html).toContain(
			"Checked the Cinematic preset troubleshooting runbook."
		);
		expect(html).not.toContain("flex-row-reverse");
		expect(html).not.toContain("px-1 text-co-muted-foreground text-xs");
	});

	it("keeps single-row activity groups on the same shared tool structure", () => {
		const html = renderTimeline({
			items: [
				createToolItem(
					"tool-1",
					"2026-01-01T10:00:00.000Z",
					"searchKnowledgeBase"
				),
			],
		});

		expect(html).not.toContain('data-tool-execution-indicator="arrow"');
		expect(html).not.toContain('data-tool-execution-indicator-slot="true"');
		expect(html).not.toContain("data-activity-bullet=");
	});

	it("does not render typing indicator when actor matches current visitor", () => {
		const html = renderTimeline({
			items: [],
			currentVisitorId: "visitor-1",
			typingActors: [
				{
					conversationId: "conv-1",
					actorId: "visitor-1",
					actorType: "team_member",
					preview: "Ignored",
				},
			],
		});

		expect(html).not.toContain("dot-bounce-1");
	});
});
