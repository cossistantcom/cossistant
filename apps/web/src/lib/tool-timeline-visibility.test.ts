import { describe, expect, it } from "bun:test";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import {
	getToolTimelineLogType,
	isCustomerFacingToolTimelineItem,
	isInternalToolTimelineItem,
	shouldDisplayToolTimelineItem,
} from "./tool-timeline-visibility";

function createToolItem(
	overrides: Partial<TimelineItem> = {},
	partOverrides: Record<string, unknown> = {}
): TimelineItem {
	return {
		id: "tool-1",
		conversationId: "conv-1",
		organizationId: "org-1",
		visibility: "private",
		type: "tool",
		text: "Tool call",
		parts: [
			{
				type: "tool-sendMessage",
				toolCallId: "call-1",
				toolName: "sendMessage",
				input: {},
				state: "partial",
				...partOverrides,
			},
		],
		userId: null,
		visitorId: "visitor-1",
		aiAgentId: "ai-1",
		createdAt: "2026-02-01T00:00:00.000Z",
		deletedAt: null,
		tool: "sendMessage",
		...overrides,
	};
}

describe("tool timeline visibility", () => {
	it("reads log type from callProviderMetadata first", () => {
		const item = createToolItem(
			{},
			{
				callProviderMetadata: {
					cossistant: {
						toolTimeline: {
							logType: "customer_facing",
						},
					},
				},
			}
		);

		expect(getToolTimelineLogType(item)).toBe("customer_facing");
		expect(shouldDisplayToolTimelineItem(item)).toBe(true);
	});

	it("falls back to providerMetadata log type", () => {
		const item = createToolItem(
			{},
			{
				providerMetadata: {
					cossistant: {
						toolTimeline: {
							logType: "decision",
						},
					},
				},
			}
		);

		expect(getToolTimelineLogType(item)).toBe("decision");
		expect(shouldDisplayToolTimelineItem(item)).toBe(false);
	});

	it("falls back to allowlist policy for older rows without metadata", () => {
		const visibleItem = createToolItem(
			{ tool: "searchKnowledgeBase" },
			{
				type: "tool-searchKnowledgeBase",
				toolName: "searchKnowledgeBase",
			}
		);
		const hiddenItem = createToolItem();

		expect(getToolTimelineLogType(visibleItem)).toBe("customer_facing");
		expect(shouldDisplayToolTimelineItem(visibleItem)).toBe(true);

		expect(getToolTimelineLogType(hiddenItem)).toBe("log");
		expect(shouldDisplayToolTimelineItem(hiddenItem)).toBe(false);
	});

	it("classifies public and internal tool rows explicitly", () => {
		const publicItem = createToolItem(
			{ tool: "searchKnowledgeBase" },
			{
				type: "tool-searchKnowledgeBase",
				toolName: "searchKnowledgeBase",
			}
		);
		const logItem = createToolItem();
		const creditItem = createToolItem(
			{ tool: "aiCreditUsage", text: "Credits calculated" },
			{
				type: "tool-aiCreditUsage",
				toolName: "aiCreditUsage",
			}
		);
		const decisionItem = createToolItem(
			{ tool: "aiDecision", text: "Decision log" },
			{
				type: "tool-aiDecision",
				toolName: "aiDecision",
			}
		);
		const titleItem = createToolItem(
			{ tool: "updateConversationTitle", text: 'Changed title to "Billing"' },
			{
				type: "tool-updateConversationTitle",
				toolName: "updateConversationTitle",
			}
		);
		const sentimentItem = createToolItem(
			{ tool: "updateSentiment", text: "Updated sentiment to positive" },
			{
				type: "tool-updateSentiment",
				toolName: "updateSentiment",
			}
		);
		const priorityItem = createToolItem(
			{ tool: "setPriority", text: "Priority set to high" },
			{
				type: "tool-setPriority",
				toolName: "setPriority",
			}
		);

		expect(isCustomerFacingToolTimelineItem(publicItem)).toBe(true);
		expect(isInternalToolTimelineItem(publicItem)).toBe(false);

		expect(isCustomerFacingToolTimelineItem(titleItem)).toBe(true);
		expect(isInternalToolTimelineItem(titleItem)).toBe(false);

		expect(isCustomerFacingToolTimelineItem(sentimentItem)).toBe(true);
		expect(isInternalToolTimelineItem(sentimentItem)).toBe(false);

		expect(isCustomerFacingToolTimelineItem(priorityItem)).toBe(true);
		expect(isInternalToolTimelineItem(priorityItem)).toBe(false);

		expect(isCustomerFacingToolTimelineItem(logItem)).toBe(false);
		expect(isInternalToolTimelineItem(logItem)).toBe(true);

		expect(isCustomerFacingToolTimelineItem(creditItem)).toBe(false);
		expect(isInternalToolTimelineItem(creditItem)).toBe(true);

		expect(isCustomerFacingToolTimelineItem(decisionItem)).toBe(false);
		expect(isInternalToolTimelineItem(decisionItem)).toBe(true);
	});

	it("keeps telemetry-only tool summaries hidden from normal mode", () => {
		const messageSentItem = createToolItem(
			{ tool: "sendMessage", text: "Message sent" },
			{
				type: "tool-sendMessage",
				toolName: "sendMessage",
				state: "result",
			}
		);
		const responseCapturedItem = createToolItem(
			{ tool: "respond", text: "Response action captured" },
			{
				type: "tool-respond",
				toolName: "respond",
				state: "result",
			}
		);

		expect(shouldDisplayToolTimelineItem(messageSentItem)).toBe(false);
		expect(shouldDisplayToolTimelineItem(responseCapturedItem)).toBe(false);
	});

	it("shows all tool timeline rows when internal logs are enabled", () => {
		const customerFacingItem = createToolItem(
			{ tool: "searchKnowledgeBase" },
			{
				type: "tool-searchKnowledgeBase",
				toolName: "searchKnowledgeBase",
			}
		);
		const logItem = createToolItem();
		const decisionItem = createToolItem(
			{},
			{
				providerMetadata: {
					cossistant: {
						toolTimeline: {
							logType: "decision",
						},
					},
				},
			}
		);

		expect(
			shouldDisplayToolTimelineItem(customerFacingItem, {
				includeInternalLogs: true,
			})
		).toBe(true);
		expect(
			shouldDisplayToolTimelineItem(logItem, {
				includeInternalLogs: true,
			})
		).toBe(true);
		expect(
			shouldDisplayToolTimelineItem(decisionItem, {
				includeInternalLogs: true,
			})
		).toBe(true);
	});
});
