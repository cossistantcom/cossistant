import { describe, expect, it } from "bun:test";
import type { ConversationHeader } from "@plasma/types";
import { createMarcConversation, fakeConversations } from "../data";
import { buildFakeSmartOrderedList } from "./smart-grouping";

function createOpenConversation(
	overrides: Partial<ConversationHeader>
): ConversationHeader {
	const baseTime = new Date(Date.now() - 10 * 60 * 60 * 1000);
	const base = createMarcConversation("Testing smart grouping", baseTime);
	const baseTimelineItem = base.lastTimelineItem;

	if (!baseTimelineItem) {
		throw new Error("Expected base timeline item in fake test conversation");
	}

	const id = overrides.id ?? `test-${Math.random().toString(36).slice(2)}`;
	const visitorId = overrides.visitorId ?? `${id}-visitor`;
	const createdAt =
		overrides.lastTimelineItem?.createdAt ??
		overrides.lastMessageAt ??
		baseTimelineItem.createdAt ??
		baseTime.toISOString();
	const overrideTimelineItem = overrides.lastTimelineItem;
	const lastTimelineItem = {
		id: overrideTimelineItem?.id ?? `${id}-timeline`,
		conversationId: id,
		organizationId:
			overrideTimelineItem?.organizationId ?? baseTimelineItem.organizationId,
		visibility: overrideTimelineItem?.visibility ?? baseTimelineItem.visibility,
		type: overrideTimelineItem?.type ?? baseTimelineItem.type,
		text: overrideTimelineItem?.text ?? baseTimelineItem.text,
		parts: overrideTimelineItem?.parts ?? baseTimelineItem.parts,
		userId:
			overrideTimelineItem?.userId === undefined
				? baseTimelineItem.userId
				: overrideTimelineItem.userId,
		visitorId:
			overrideTimelineItem?.visitorId === undefined
				? baseTimelineItem.visitorId
				: overrideTimelineItem.visitorId,
		aiAgentId:
			overrideTimelineItem?.aiAgentId === undefined
				? baseTimelineItem.aiAgentId
				: overrideTimelineItem.aiAgentId,
		createdAt,
		deletedAt:
			overrideTimelineItem?.deletedAt === undefined
				? baseTimelineItem.deletedAt
				: overrideTimelineItem.deletedAt,
	};

	return {
		...base,
		...overrides,
		id,
		status: "open",
		visitorId,
		visitor: {
			...base.visitor,
			...overrides.visitor,
			id: visitorId,
		},
		lastTimelineItem,
		lastMessageTimelineItem: {
			...lastTimelineItem,
		},
		lastMessageAt: createdAt,
		updatedAt: overrides.updatedAt ?? createdAt,
	};
}

describe("buildFakeSmartOrderedList", () => {
	it("categorizes open conversations into needsHuman, waiting8Hours, and other", () => {
		const result = buildFakeSmartOrderedList(fakeConversations);
		const headers = result.items.filter((item) => item.type === "header");
		const conversationItems = result.items.filter(
			(item) => item.type === "conversation"
		);

		expect(headers.map((item) => item.category)).toEqual([
			"needsHuman",
			"waiting8Hours",
			"other",
		]);
		expect(conversationItems.map((item) => item.category)).toEqual([
			"needsHuman",
			"needsHuman",
			"waiting8Hours",
			"other",
			"other",
			"other",
		]);
		expect(result.categoryCounts).toEqual({
			needsHuman: 2,
			needsClarification: 0,
			waiting8Hours: 1,
			other: 3,
		});
		expect(
			conversationItems.some((item) => item.conversation.status === "resolved")
		).toBe(false);
	});

	it("moves an escalated conversation to other once escalation is handled", () => {
		const escalatedConversation = createOpenConversation({
			id: "handled-escalation",
			escalatedAt: new Date().toISOString(),
			lastTimelineItem: {
				id: "handled-escalation-message",
				conversationId: "handled-escalation",
				organizationId: "org",
				visibility: "public",
				type: "message",
				text: "AI needs human validation before shipping this fix.",
				parts: [
					{
						type: "text",
						text: "AI needs human validation before shipping this fix.",
					},
				],
				userId: null,
				visitorId: null,
				aiAgentId: "ai-agent",
				createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
				deletedAt: null,
			},
		});

		const handledConversation = {
			...escalatedConversation,
			escalationHandledAt: new Date().toISOString(),
		};

		const result = buildFakeSmartOrderedList([handledConversation]);
		const categories = result.items.reduce<string[]>((acc, item) => {
			if (item.type === "conversation") {
				acc.push(item.category);
			}
			return acc;
		}, []);

		expect(categories).toEqual(["other"]);
		expect(result.categoryCounts.needsHuman).toBe(0);
		expect(result.categoryCounts.needsClarification).toBe(0);
		expect(result.categoryCounts.other).toBe(1);
	});

	it("places clarification-needed conversations ahead of long waiting ones", () => {
		const clarificationConversation = createOpenConversation({
			id: "needs-clarification",
			activeClarification: {
				requestId: "01JKCLARIFICATION0000000001",
				status: "awaiting_answer",
				topicSummary: "Clarify how invoice credits apply to plan changes.",
				question: "Do invoice credits carry over after a downgrade?",
				stepIndex: 2,
				maxSteps: 5,
				progress: null,
				updatedAt: new Date().toISOString(),
			},
			lastTimelineItem: {
				id: "needs-clarification-message",
				conversationId: "needs-clarification",
				organizationId: "org",
				visibility: "public",
				type: "message",
				text: "Can you clarify the billing behavior here?",
				parts: [
					{ type: "text", text: "Can you clarify the billing behavior here?" },
				],
				userId: null,
				visitorId: "needs-clarification-visitor",
				aiAgentId: "ai-agent",
				createdAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
				deletedAt: null,
			},
		});

		const waitingConversation = createOpenConversation({
			id: "still-waiting",
			lastTimelineItem: {
				id: "still-waiting-message",
				conversationId: "still-waiting",
				organizationId: "org",
				visibility: "public",
				type: "message",
				text: "Just checking back in",
				parts: [{ type: "text", text: "Just checking back in" }],
				userId: null,
				visitorId: "still-waiting-visitor",
				aiAgentId: null,
				createdAt: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
				deletedAt: null,
			},
		});

		const result = buildFakeSmartOrderedList([
			clarificationConversation,
			waitingConversation,
		]);
		const headers = result.items.filter((item) => item.type === "header");
		const conversations = result.items.filter(
			(item) => item.type === "conversation"
		);

		expect(headers.map((item) => item.category)).toEqual([
			"needsClarification",
			"waiting8Hours",
		]);
		expect(conversations.map((item) => item.category)).toEqual([
			"needsClarification",
			"waiting8Hours",
		]);
	});

	it("sorts needsHuman and waiting8Hours by priority then recency", () => {
		const highPriorityEscalated = createOpenConversation({
			id: "needs-high",
			priority: "high",
			escalatedAt: new Date().toISOString(),
			lastTimelineItem: {
				id: "needs-high-message",
				conversationId: "needs-high",
				organizationId: "org",
				visibility: "public",
				type: "message",
				text: "Need help now",
				parts: [{ type: "text", text: "Need help now" }],
				userId: null,
				visitorId: "needs-high-visitor",
				aiAgentId: null,
				createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
				deletedAt: null,
			},
		});

		const normalPriorityEscalated = createOpenConversation({
			id: "needs-normal",
			priority: "normal",
			escalatedAt: new Date().toISOString(),
			lastTimelineItem: {
				id: "needs-normal-message",
				conversationId: "needs-normal",
				organizationId: "org",
				visibility: "public",
				type: "message",
				text: "Need help soon",
				parts: [{ type: "text", text: "Need help soon" }],
				userId: null,
				visitorId: "needs-normal-visitor",
				aiAgentId: null,
				createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
				deletedAt: null,
			},
		});

		const waitingHighPriority = createOpenConversation({
			id: "waiting-high",
			priority: "high",
			lastTimelineItem: {
				id: "waiting-high-message",
				conversationId: "waiting-high",
				organizationId: "org",
				visibility: "public",
				type: "message",
				text: "Following up on invoice details",
				parts: [{ type: "text", text: "Following up on invoice details" }],
				userId: null,
				visitorId: "waiting-high-visitor",
				aiAgentId: null,
				createdAt: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
				deletedAt: null,
			},
		});

		const waitingNormalPriority = createOpenConversation({
			id: "waiting-normal",
			priority: "normal",
			lastTimelineItem: {
				id: "waiting-normal-message",
				conversationId: "waiting-normal",
				organizationId: "org",
				visibility: "public",
				type: "message",
				text: "Still waiting on the invoice PDF",
				parts: [{ type: "text", text: "Still waiting on the invoice PDF" }],
				userId: null,
				visitorId: "waiting-normal-visitor",
				aiAgentId: null,
				createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
				deletedAt: null,
			},
		});

		const result = buildFakeSmartOrderedList([
			highPriorityEscalated,
			normalPriorityEscalated,
			waitingHighPriority,
			waitingNormalPriority,
		]);

		const needsHumanIds = result.items.reduce<string[]>((acc, item) => {
			if (item.type === "conversation" && item.category === "needsHuman") {
				acc.push(item.conversation.id);
			}
			return acc;
		}, []);

		const waitingIds = result.items.reduce<string[]>((acc, item) => {
			if (item.type === "conversation" && item.category === "waiting8Hours") {
				acc.push(item.conversation.id);
			}
			return acc;
		}, []);

		expect(needsHumanIds).toEqual(["needs-high", "needs-normal"]);
		expect(waitingIds).toEqual(["waiting-high", "waiting-normal"]);
	});

	it("sorts other conversations by recency only", () => {
		const olderOther = createOpenConversation({
			id: "other-older",
			priority: "urgent",
			lastTimelineItem: {
				id: "other-older-message",
				conversationId: "other-older",
				organizationId: "org",
				visibility: "public",
				type: "message",
				text: "Older other message",
				parts: [{ type: "text", text: "Older other message" }],
				userId: null,
				visitorId: "other-older-visitor",
				aiAgentId: null,
				createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
				deletedAt: null,
			},
		});

		const newerOther = createOpenConversation({
			id: "other-newer",
			priority: "low",
			lastTimelineItem: {
				id: "other-newer-message",
				conversationId: "other-newer",
				organizationId: "org",
				visibility: "public",
				type: "message",
				text: "Newer other message",
				parts: [{ type: "text", text: "Newer other message" }],
				userId: null,
				visitorId: "other-newer-visitor",
				aiAgentId: null,
				createdAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
				deletedAt: null,
			},
		});

		const result = buildFakeSmartOrderedList([olderOther, newerOther]);
		const otherIds = result.items.reduce<string[]>((acc, item) => {
			if (item.type === "conversation" && item.category === "other") {
				acc.push(item.conversation.id);
			}
			return acc;
		}, []);

		expect(otherIds).toEqual(["other-newer", "other-older"]);
	});

	it("omits headers when only other conversations exist", () => {
		const aiConversation = createOpenConversation({
			id: "other-ai",
			lastTimelineItem: {
				id: "other-ai-message",
				conversationId: "other-ai",
				organizationId: "org",
				visibility: "public",
				type: "message",
				text: "I can handle this automatically.",
				parts: [{ type: "text", text: "I can handle this automatically." }],
				userId: null,
				visitorId: null,
				aiAgentId: "ai-agent",
				createdAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
				deletedAt: null,
			},
		});
		const recentVisitorConversation = createOpenConversation({
			id: "other-visitor",
			lastTimelineItem: {
				id: "other-visitor-message",
				conversationId: "other-visitor",
				organizationId: "org",
				visibility: "public",
				type: "message",
				text: "Still waiting for a quick update",
				parts: [{ type: "text", text: "Still waiting for a quick update" }],
				userId: null,
				visitorId: "other-visitor-1",
				aiAgentId: null,
				createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
				deletedAt: null,
			},
		});

		const result = buildFakeSmartOrderedList([
			aiConversation,
			recentVisitorConversation,
		]);

		expect(result.items.every((item) => item.type === "conversation")).toBe(
			true
		);
		expect(result.items).toHaveLength(2);
		expect(result.categoryCounts).toEqual({
			needsHuman: 0,
			needsClarification: 0,
			waiting8Hours: 0,
			other: 2,
		});
	});
});
