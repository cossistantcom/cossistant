import { describe, expect, it } from "bun:test";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GenericWidgetToolTimelineTool } from "./timeline-widget-tool";

function createToolTimelineItem(
	overrides: Partial<TimelineItem> = {}
): TimelineItem {
	return {
		id: "tool-1",
		conversationId: "conv-1",
		organizationId: "org-1",
		visibility: "public",
		type: "tool",
		text: "Searching knowledge base...",
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
		createdAt: "2026-03-08T10:00:00.000Z",
		deletedAt: null,
		tool: "searchKnowledgeBase",
		...overrides,
	};
}

describe("GenericWidgetToolTimelineTool", () => {
	it("renders registered tools as flat inline activity rows", () => {
		const html = renderToStaticMarkup(
			<GenericWidgetToolTimelineTool
				conversationId="conv-1"
				item={createToolTimelineItem()}
			/>
		);

		expect(html).toContain("Searching knowledge base...");
		expect(html).toContain('data-tool-display-state="partial"');
		expect(html).toContain('data-tool-execution-indicator-slot="true"');
		expect(html).toContain('data-tool-execution-indicator="spinner"');
		expect(html).toContain('data-co-spinner="true"');
		expect(html).toContain('data-co-spinner-variant="');
		expect(html).toContain("text-sm");
		expect(html).not.toContain("rounded-lg");
	});

	it("returns null for unregistered tools", () => {
		const html = renderToStaticMarkup(
			<GenericWidgetToolTimelineTool
				conversationId="conv-1"
				item={createToolTimelineItem({
					text: "Analyzing conversation...",
					tool: "updateSentiment",
					parts: [
						{
							type: "tool-updateSentiment",
							toolCallId: "call-2",
							toolName: "updateSentiment",
							input: { mode: "auto" },
							state: "partial",
						},
					],
				})}
			/>
		);

		expect(html).toBe("");
	});

	it("renders terminal states with the shared ascii arrow", () => {
		const html = renderToStaticMarkup(
			<GenericWidgetToolTimelineTool
				conversationId="conv-1"
				item={createToolTimelineItem({
					text: "Finished knowledge base search",
					parts: [
						{
							type: "tool-searchKnowledgeBase",
							toolCallId: "call-1",
							toolName: "searchKnowledgeBase",
							input: { query: "pricing" },
							state: "result",
						},
					],
				})}
			/>
		);

		expect(html).toContain('data-tool-display-state="result"');
		expect(html).toContain('data-tool-execution-indicator-slot="true"');
		expect(html).toContain('data-tool-execution-indicator="arrow"');
		expect(html).toContain("-&gt;");
		expect(html).not.toContain('data-co-spinner="true"');
	});

	it("omits the terminal arrow when single-tool rendering disables it", () => {
		const html = renderToStaticMarkup(
			<GenericWidgetToolTimelineTool
				conversationId="conv-1"
				item={createToolTimelineItem({
					text: "Finished knowledge base search",
					parts: [
						{
							type: "tool-searchKnowledgeBase",
							toolCallId: "call-1",
							toolName: "searchKnowledgeBase",
							input: { query: "pricing" },
							state: "result",
						},
					],
				})}
				showTerminalIndicator={false}
			/>
		);

		expect(html).toContain('data-tool-display-state="result"');
		expect(html).not.toContain('data-tool-execution-indicator="arrow"');
		expect(html).not.toContain('data-tool-execution-indicator-slot="true"');
	});
});
