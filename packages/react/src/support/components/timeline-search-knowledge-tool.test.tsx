import { afterAll, describe, expect, it, mock } from "bun:test";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import en from "../text/locales/en";
import type {
	SupportTextKey,
	SupportTextResolvedFormatter,
} from "../text/locales/keys";
import type { ConversationTimelineToolProps } from "./timeline-tool-types";

function createTextFormatter(): SupportTextResolvedFormatter {
	return ((key: SupportTextKey, variables?: unknown) => {
		const message = en[key];
		if (typeof message === "function") {
			return (message as (args: { variables: unknown }) => string)({
				variables,
			});
		}
		return message;
	}) as SupportTextResolvedFormatter;
}

mock.module("../text", () => ({
	useSupportText: () => createTextFormatter(),
}));

const modulePromise = import("./timeline-search-knowledge-tool");

async function renderTool(props: ConversationTimelineToolProps) {
	const { SearchKnowledgeTimelineTool } = await modulePromise;
	return renderToStaticMarkup(<SearchKnowledgeTimelineTool {...props} />);
}

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

function countOccurrences(html: string, pattern: string): number {
	return html.split(pattern).length - 1;
}

describe("SearchKnowledgeTimelineTool", () => {
	afterAll(() => {
		mock.restore();
	});

	it("renders the partial state with the knowledge search label", async () => {
		const html = await renderTool({
			conversationId: "conv-1",
			item: createToolTimelineItem(),
		});

		expect(html).toContain("Searching for &quot;pricing&quot;...");
		expect(html).toContain('data-tool-display-state="partial"');
		expect(html).toContain('data-tool-execution-indicator-slot="true"');
		expect(html).toContain('data-tool-execution-indicator="spinner"');
		expect(html).toContain('data-co-spinner="true"');
		expect(html).not.toContain("rounded-lg");
	});

	it("renders only unique web sources as external links", async () => {
		const html = await renderTool({
			conversationId: "conv-1",
			item: createToolTimelineItem({
				text: "Found 2 sources",
				parts: [
					{
						type: "tool-searchKnowledgeBase",
						toolCallId: "call-1",
						toolName: "searchKnowledgeBase",
						input: { query: "pricing" },
						state: "result",
						output: {
							success: true,
							data: {
								totalFound: 5,
								articles: [
									{
										title: "Billing FAQ",
										sourceUrl: "https://example.com/billing",
										sourceType: "url",
									},
									{
										title: "Billing FAQ Duplicate",
										sourceUrl: "https://example.com/billing/",
										sourceType: "url",
									},
									{
										sourceUrl: "https://docs.example.com/pricing",
										sourceType: "url",
									},
									{
										title: "Internal FAQ",
										sourceUrl: "https://example.com/internal-faq",
										sourceType: "faq",
									},
									{
										title: "Legacy entry",
										sourceUrl: "https://example.com/legacy-entry",
									},
								],
							},
						},
					},
				],
			}),
		});

		expect(html).toContain("Searched for &quot;pricing&quot;");
		expect(html).toContain("Billing FAQ");
		expect(html).toContain("docs.example.com/pricing");
		expect(html).toContain('href="https://example.com/billing"');
		expect(html).toContain('href="https://docs.example.com/pricing"');
		expect(countOccurrences(html, 'target="_blank"')).toBe(2);
		expect(countOccurrences(html, 'rel="noopener noreferrer"')).toBe(2);
		expect(countOccurrences(html, 'href="https://example.com/billing"')).toBe(
			1
		);
		expect(html).toContain('data-tool-display-state="result"');
		expect(html).toContain('data-tool-execution-indicator-slot="true"');
		expect(html).toContain('data-tool-execution-indicator="arrow"');
		expect(html).toContain("-&gt;");
		expect(html).not.toContain("Internal FAQ");
		expect(html).not.toContain("Legacy entry");
		expect(html).not.toContain("rounded-full");
	});

	it("renders repeated titles for distinct URLs while collapsing duplicate URLs", async () => {
		const html = await renderTool({
			conversationId: "conv-1",
			item: createToolTimelineItem({
				text: "Found 3 sources",
				parts: [
					{
						type: "tool-searchKnowledgeBase",
						toolCallId: "call-2",
						toolName: "searchKnowledgeBase",
						input: { query: "pricing" },
						state: "result",
						output: {
							success: true,
							data: {
								totalFound: 4,
								articles: [
									{
										title: "Pricing Guide",
										sourceUrl: "https://example.com/pricing",
										sourceType: "url",
									},
									{
										title: "Pricing Guide",
										sourceUrl: "https://docs.example.com/pricing",
										sourceType: "url",
									},
									{
										title: "Billing FAQ",
										sourceUrl: "https://example.com/billing",
										sourceType: "url",
									},
									{
										title: "Billing FAQ duplicate",
										sourceUrl: "https://example.com/billing/",
										sourceType: "url",
									},
								],
							},
						},
					},
				],
			}),
		});

		expect(countOccurrences(html, 'target="_blank"')).toBe(3);
		expect(countOccurrences(html, 'title="Pricing Guide"')).toBe(2);
		expect(countOccurrences(html, 'href="https://example.com/pricing"')).toBe(
			1
		);
		expect(
			countOccurrences(html, 'href="https://docs.example.com/pricing"')
		).toBe(1);
		expect(countOccurrences(html, 'href="https://example.com/billing"')).toBe(
			1
		);
		expect(countOccurrences(html, 'href="https://example.com/billing/"')).toBe(
			0
		);
	});

	it("replaces zero-source summaries with the executed query", async () => {
		const html = await renderTool({
			conversationId: "conv-1",
			item: createToolTimelineItem({
				text: "Found 0 sources",
				parts: [
					{
						type: "tool-searchKnowledgeBase",
						toolCallId: "call-1",
						toolName: "searchKnowledgeBase",
						input: { query: "refund policy" },
						state: "result",
						output: {
							success: true,
							data: {
								totalFound: 0,
								articles: [],
							},
						},
					},
				],
			}),
		});

		expect(html).toContain("Searched for &quot;refund policy&quot;");
		expect(html).not.toContain("Found 0 sources");
	});

	it("suppresses the terminal arrow when the caller marks it as a single tool row", async () => {
		const html = await renderTool({
			conversationId: "conv-1",
			item: createToolTimelineItem({
				text: "Found 2 sources",
				parts: [
					{
						type: "tool-searchKnowledgeBase",
						toolCallId: "call-1",
						toolName: "searchKnowledgeBase",
						input: { query: "pricing" },
						state: "result",
						output: {
							success: true,
							data: {
								totalFound: 2,
								articles: [],
							},
						},
					},
				],
			}),
			showTerminalIndicator: false,
		});

		expect(html).toContain("Searched for &quot;pricing&quot;");
		expect(html).not.toContain('data-tool-execution-indicator="arrow"');
		expect(html).not.toContain('data-tool-execution-indicator-slot="true"');
	});

	it("hides source links when results are not explicit web sources", async () => {
		const html = await renderTool({
			conversationId: "conv-1",
			item: createToolTimelineItem({
				text: "Found 2 sources",
				parts: [
					{
						type: "tool-searchKnowledgeBase",
						toolCallId: "call-privacy",
						toolName: "searchKnowledgeBase",
						input: { query: "billing" },
						state: "result",
						output: {
							success: true,
							data: {
								totalFound: 2,
								articles: [
									{
										title: "FAQ",
										sourceUrl: "https://example.com/faq",
										sourceType: "faq",
									},
									{
										title: "Legacy doc",
										sourceUrl: "https://example.com/legacy-doc",
									},
								],
							},
						},
					},
				],
			}),
		});

		expect(html).toContain("Searched for &quot;billing&quot;");
		expect(html).not.toContain("<a ");
		expect(html).not.toContain('target="_blank"');
		expect(html).not.toContain("FAQ");
		expect(html).not.toContain("Legacy doc");
	});
});
