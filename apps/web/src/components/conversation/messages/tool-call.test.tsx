import { describe, expect, it } from "bun:test";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ToolCall } from "./tool-call";

function createToolTimelineItem(
	overrides: Partial<TimelineItem> = {}
): TimelineItem {
	return {
		id: "tool-1",
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
		visitorId: "visitor-1",
		aiAgentId: "ai-1",
		createdAt: "2026-01-01T00:00:00.000Z",
		deletedAt: null,
		tool: "searchKnowledgeBase",
		...overrides,
	};
}

function render(
	item: TimelineItem,
	mode?: "default" | "developer",
	showTerminalIndicator = true
): string {
	return renderToStaticMarkup(
		React.createElement(ToolCall, {
			item,
			mode,
			showIcon: false,
			showTerminalIndicator,
		})
	);
}

function renderWithIcon(
	item: TimelineItem,
	mode?: "default" | "developer"
): string {
	return renderToStaticMarkup(
		React.createElement(ToolCall, { item, mode, showIcon: true })
	);
}

function countOccurrences(html: string, pattern: string): number {
	return html.split(pattern).length - 1;
}

describe("ToolCall", () => {
	it("renders mapped icon for known tools", () => {
		const html = renderWithIcon(createToolTimelineItem());
		expect(html).toContain('data-activity-icon="searchKnowledgeBase"');
	});

	it("renders default icon when tool has no specific icon mapping", () => {
		const html = renderWithIcon(
			createToolTimelineItem({
				text: "Running sendMessage",
				parts: [
					{
						type: "tool-sendMessage",
						toolCallId: "call-unknown",
						toolName: "sendMessage",
						input: { message: "Hello there" },
						state: "partial",
					},
				],
				tool: "sendMessage",
			})
		);

		expect(html).toContain('data-activity-icon="default"');
	});

	it("renders partial state as inline activity with spinner-friendly text", () => {
		const html = render(createToolTimelineItem());
		expect(html).toContain('data-tool-display-state="partial"');
		expect(html).toContain('data-tool-execution-indicator-slot="true"');
		expect(html).toContain('data-tool-execution-indicator="spinner"');
		expect(html).toContain('data-co-spinner="true"');
		expect(html).toContain("Searching for &quot;pricing&quot;...");
	});

	it("renders result state with the executed query", () => {
		const html = render(
			createToolTimelineItem({
				parts: [
					{
						type: "tool-searchKnowledgeBase",
						toolCallId: "call-2",
						toolName: "searchKnowledgeBase",
						input: { query: "pricing" },
						state: "result",
						output: {
							success: true,
							data: { totalFound: 3, articles: [] },
						},
					},
				],
			})
		);

		expect(html).toContain('data-tool-display-state="result"');
		expect(html).toContain('data-tool-execution-indicator-slot="true"');
		expect(html).toContain('data-tool-execution-indicator="arrow"');
		expect(html).toContain("Searched for &quot;pricing&quot;");
		expect(html).not.toContain("Found 3 sources");
	});

	it("omits the terminal arrow when the render unit contains a single tool call", () => {
		const html = render(
			createToolTimelineItem({
				parts: [
					{
						type: "tool-searchKnowledgeBase",
						toolCallId: "call-single",
						toolName: "searchKnowledgeBase",
						input: { query: "pricing" },
						state: "result",
						output: {
							success: true,
							data: { totalFound: 1, articles: [] },
						},
					},
				],
			}),
			"default",
			false
		);

		expect(html).toContain('data-tool-display-state="result"');
		expect(html).not.toContain('data-tool-execution-indicator="arrow"');
		expect(html).not.toContain('data-tool-execution-indicator-slot="true"');
	});

	it("renders compact source pills with +N overflow for search results", () => {
		const html = render(
			createToolTimelineItem({
				parts: [
					{
						type: "tool-searchKnowledgeBase",
						toolCallId: "call-sources",
						toolName: "searchKnowledgeBase",
						input: { query: "pricing" },
						state: "result",
						output: {
							success: true,
							data: {
								totalFound: 6,
								articles: [
									{
										title: "Billing FAQ",
										sourceUrl: "https://example.com/billing-faq",
									},
									{
										title: "Pricing API",
										sourceUrl: "https://example.com/pricing-api",
									},
									{
										title: "Upgrade Guide",
										sourceUrl: "https://example.com/upgrade-guide",
									},
									{
										title: "Enterprise Terms",
										sourceUrl: "https://example.com/enterprise",
									},
									{
										title: "Refund Policy",
										sourceUrl: "https://example.com/refunds",
									},
									{
										title: "Changelog",
										sourceUrl: "https://example.com/changelog",
									},
								],
							},
						},
					},
				],
			})
		);

		expect(html).not.toContain("View sources");
		expect(countOccurrences(html, 'data-source-pill="true"')).toBe(4);
		expect(html).toContain('data-source-overflow="2"');
		expect(html).toContain(">+2<");
		expect(countOccurrences(html, 'data-source-overflow-item="true"')).toBe(2);
		expect(html).toContain("Refund Policy");
		expect(html).toContain("Changelog");
		expect(html).not.toContain("<a ");
	});

	it("deduplicates repeated source URLs before computing pill overflow", () => {
		const html = render(
			createToolTimelineItem({
				parts: [
					{
						type: "tool-searchKnowledgeBase",
						toolCallId: "call-deduped-sources",
						toolName: "searchKnowledgeBase",
						input: { query: "billing" },
						state: "result",
						output: {
							success: true,
							data: {
								totalFound: 6,
								articles: [
									{
										title: "Billing FAQ",
										sourceUrl: "https://example.com/billing/",
									},
									{
										title: "Billing FAQ Duplicate",
										sourceUrl: "https://example.com/billing",
									},
									{
										title: "Pricing API",
										sourceUrl: "https://example.com/pricing-api",
									},
									{
										title: "Help Center",
										sourceUrl: "https://EXAMPLE.com/help?tab=all#top",
									},
									{
										title: "Help Center Duplicate",
										sourceUrl: "https://example.com/help?tab=all",
									},
									{
										title: "Enterprise Terms",
										sourceUrl: "https://example.com/enterprise",
									},
									{
										title: "Changelog",
										sourceUrl: "https://example.com/changelog",
									},
								],
							},
						},
					},
				],
			})
		);

		expect(countOccurrences(html, 'data-source-pill="true"')).toBe(4);
		expect(html).toContain('data-source-overflow="1"');
		expect(html).toContain(">+1<");
		expect(countOccurrences(html, 'data-source-overflow-item="true"')).toBe(1);
		expect(html).not.toContain("<a ");
	});

	it("prefers title labels and falls back to compact URL labels", () => {
		const html = render(
			createToolTimelineItem({
				parts: [
					{
						type: "tool-searchKnowledgeBase",
						toolCallId: "call-labels",
						toolName: "searchKnowledgeBase",
						input: { query: "help" },
						state: "result",
						output: {
							success: true,
							data: {
								totalFound: 3,
								articles: [
									{
										title: "Help Center",
										sourceUrl: "https://www.example.com/help-center",
									},
									{
										sourceUrl: "https://docs.example.com/getting-started/",
									},
									{},
								],
							},
						},
					},
				],
			})
		);

		expect(html).toContain("Help Center");
		expect(html).toContain("docs.example.com/getting-started");
		expect(html).toContain("Untitled");
	});

	it("renders error state with friendly error text", () => {
		const html = render(
			createToolTimelineItem({
				text: "Knowledge base lookup failed",
				parts: [
					{
						type: "tool-searchKnowledgeBase",
						toolCallId: "call-3",
						toolName: "searchKnowledgeBase",
						input: { query: "pricing" },
						state: "error",
						errorText: "Connection timeout",
					},
				],
			})
		);

		expect(html).toContain("Search for &quot;pricing&quot; failed");
	});

	it("falls back to derived summary when item text is missing", () => {
		const html = render(
			createToolTimelineItem({
				text: null,
				parts: [
					{
						type: "tool-sendMessage",
						toolCallId: "call-4",
						toolName: "sendMessage",
						input: { message: "hello" },
						state: "partial",
					},
				],
			})
		);

		expect(html).toContain("Running sendMessage");
	});

	it("renders developer mode through the dedicated dev log shell", () => {
		const html = render(
			createToolTimelineItem({
				text: "Running sendMessage",
				parts: [
					{
						type: "tool-sendMessage",
						toolCallId: "call-dev-1",
						toolName: "sendMessage",
						input: { message: "Hello there" },
						state: "partial",
					},
				],
				tool: "sendMessage",
			}),
			"developer"
		);

		expect(html).toContain("Running sendMessage");
		expect(html).toContain("Dev payload");
		expect(html).toContain("Running");
		expect(html).toContain("Log");
	});

	it("renders AI thinking traces with developer details", () => {
		const html = renderWithIcon(
			createToolTimelineItem({
				text: "AI thinking trace captured",
				parts: [
					{
						type: "tool-aiThinkingTrace",
						toolCallId: "ai-thinking-trace-1",
						toolName: "aiThinkingTrace",
						input: {
							modelId: "openai/gpt-5.5",
							attempt: 1,
							reasoningMaxTokens: 512,
						},
						state: "result",
						output: {
							modelId: "openai/gpt-5.5",
							workflowRunId: "wf-1",
							attempt: 1,
							thinkingCredits: 3,
							reasoningMaxTokens: 512,
							captureStatus: "captured",
							tokens: {
								inputTokens: 100,
								outputTokens: 40,
								totalTokens: 140,
								reasoningTokens: 12,
							},
							reasoningText: "Checked the evidence before answering.",
						},
					},
				],
				tool: "aiThinkingTrace",
			}),
			"developer"
		);

		expect(html).toContain('data-activity-icon="aiThinkingTrace"');
		expect(html).toContain("AI thinking trace captured");
		expect(html).toContain("openai/gpt-5.5");
		expect(html).toContain("12 reasoning");
		expect(html).toContain("Checked the evidence before answering.");
		expect(html).toContain("Dev payload");
	});

	it("renders developer-mode fallback through the dev log shell", () => {
		const html = render(
			createToolTimelineItem({
				parts: [],
				text: null,
				tool: "sendMessage",
			}),
			"developer"
		);

		expect(html).toContain("Running sendMessage");
		expect(html).toContain("Dev payload");
		expect(html).toContain("Fallback rendered from timeline metadata.");
	});

	it("renders updateConversationTitle with quoted title on result", () => {
		const html = render(
			createToolTimelineItem({
				text: 'Updated conversation title to "Help with billing"',
				parts: [
					{
						type: "tool-updateConversationTitle",
						toolCallId: "call-5",
						toolName: "updateConversationTitle",
						input: { title: "Help with billing" },
						state: "result",
						output: {
							success: true,
							data: { title: "Help with billing" },
						},
					},
				],
				tool: "updateConversationTitle",
			})
		);

		expect(html).toContain("Help with billing");
		expect(html).toContain("Changed title to");
	});

	it("renders updateConversationTitle unchanged state from summary text", () => {
		const html = render(
			createToolTimelineItem({
				text: "Skipped title update because the title was set manually",
				parts: [
					{
						type: "tool-updateConversationTitle",
						toolCallId: "call-5b",
						toolName: "updateConversationTitle",
						input: { title: "Help with billing" },
						state: "result",
						output: {
							success: true,
							data: {
								changed: false,
								reason: "manual_title",
								title: "Help with billing",
							},
						},
					},
				],
				tool: "updateConversationTitle",
			})
		);

		expect(html).toContain(
			"Skipped title update because the title was set manually"
		);
		expect(html).not.toContain("Changed title to");
	});

	it("renders updateSentiment with sentiment value", () => {
		const html = render(
			createToolTimelineItem({
				text: "Updated sentiment to positive",
				parts: [
					{
						type: "tool-updateSentiment",
						toolCallId: "call-6",
						toolName: "updateSentiment",
						input: {},
						state: "result",
						output: {
							success: true,
							data: { sentiment: "positive" },
						},
					},
				],
				tool: "updateSentiment",
			})
		);

		expect(html).toContain("Sentiment:");
		expect(html).toContain("positive");
	});

	it("renders updateSentiment unchanged state from summary text", () => {
		const html = render(
			createToolTimelineItem({
				text: "Sentiment unchanged",
				parts: [
					{
						type: "tool-updateSentiment",
						toolCallId: "call-6b",
						toolName: "updateSentiment",
						input: {},
						state: "result",
						output: {
							success: true,
							data: {
								changed: false,
								reason: "unchanged",
								sentiment: "positive",
							},
						},
					},
				],
				tool: "updateSentiment",
			})
		);

		expect(html).toContain("Sentiment unchanged");
		expect(html).not.toContain("Sentiment:");
	});

	it("renders setPriority with priority badge", () => {
		const html = render(
			createToolTimelineItem({
				text: "Priority set to high",
				parts: [
					{
						type: "tool-setPriority",
						toolCallId: "call-7",
						toolName: "setPriority",
						input: {},
						state: "result",
						output: { success: true, data: { priority: "high" } },
					},
				],
				tool: "setPriority",
			})
		);

		expect(html).toContain("Conversation priority set to");
		expect(html).toContain("high");
	});

	it("renders setPriority unchanged state from summary text", () => {
		const html = render(
			createToolTimelineItem({
				text: "Priority unchanged",
				parts: [
					{
						type: "tool-setPriority",
						toolCallId: "call-7b",
						toolName: "setPriority",
						input: {},
						state: "result",
						output: {
							success: true,
							data: { changed: false, reason: "unchanged", priority: "high" },
						},
					},
				],
				tool: "setPriority",
			})
		);

		expect(html).toContain("Priority unchanged");
		expect(html).not.toContain("Conversation priority set to");
	});

	it("renders categorizeConversation with the resolved view name", () => {
		const html = render(
			createToolTimelineItem({
				text: 'Classified as "billing"',
				parts: [
					{
						type: "tool-categorizeConversation",
						toolCallId: "call-8",
						toolName: "categorizeConversation",
						input: { viewId: "view-1" },
						state: "result",
						output: {
							success: true,
							data: { viewId: "view-1", viewName: "billing" },
						},
					},
				],
				tool: "categorizeConversation",
			})
		);

		expect(html).toContain("Classified as");
		expect(html).toContain("billing");
	});

	it("renders clarification credit usage context in ai credit activity", () => {
		const html = render(
			createToolTimelineItem({
				text: "FAQ draft generation: 240 tokens, 1 credits",
				parts: [
					{
						type: "tool-aiCreditUsage",
						toolCallId: "call-credits",
						toolName: "aiCreditUsage",
						input: {
							usageEventId: "usage-1",
							modelId: "moonshotai/kimi-k2.5",
							source: "knowledge_clarification",
							phase: "faq_draft_generation",
						},
						state: "result",
						output: {
							modelId: "moonshotai/kimi-k2.5",
							baseCredits: 1,
							modelCredits: 0,
							toolCredits: 0,
							totalCredits: 1,
							billableToolCount: 0,
							excludedToolCount: 0,
							totalToolCount: 0,
							balanceBefore: null,
							balanceAfterEstimate: null,
							mode: "normal",
							ingestStatus: "ingested",
							inputTokens: 180,
							outputTokens: 60,
							totalTokens: 240,
							tokenSource: "provider",
							source: "knowledge_clarification",
							phase: "faq_draft_generation",
							knowledgeClarificationRequestId: "clar-1",
							knowledgeClarificationStepIndex: 3,
						},
					},
				],
				tool: "aiCreditUsage",
			})
		);

		expect(html).toContain("Used");
		expect(html).toContain("FAQ draft generation");
		expect(html).toContain("Show details");
	});
});
