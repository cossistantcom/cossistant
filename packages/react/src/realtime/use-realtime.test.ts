import { describe, expect, it } from "bun:test";
import type { RealtimeEvent } from "@plasma/types/realtime-events";
import { shouldDeliverEvent } from "./event-filter";

describe("shouldDeliverEvent", () => {
	const baseEvent: RealtimeEvent<"timelineItemCreated"> = {
		type: "timelineItemCreated",
		payload: {
			websiteId: "site-1",
			organizationId: "org-1",
			userId: "user-1",
			visitorId: "visitor-1",
			conversationId: "conv-1",
			item: {
				id: "item-1",
				conversationId: "conv-1",
				organizationId: "org-1",
				type: "message",
				text: "Hello",
				parts: [{ type: "text", text: "Hello" }],
				visibility: "public",
				userId: "user-1",
				aiAgentId: null,
				visitorId: "visitor-1",
				createdAt: "2024-01-01T00:00:00.000Z",
				deletedAt: null,
			},
		},
	};

	it("allows events that match the website and visitor", () => {
		const result = shouldDeliverEvent(baseEvent, "site-1", "visitor-1");
		expect(result).toBe(true);
	});

	it("blocks events from other websites", () => {
		const result = shouldDeliverEvent(baseEvent, "site-2", "visitor-1");
		expect(result).toBe(false);
	});

	it("falls back to the timeline item visitor when the payload visitor is null", () => {
		const eventWithoutVisitor: RealtimeEvent<"timelineItemCreated"> = {
			...baseEvent,
			payload: {
				...baseEvent.payload,
				visitorId: null,
				item: {
					...baseEvent.payload.item,
					visitorId: "visitor-1",
				},
			},
		};

		expect(shouldDeliverEvent(eventWithoutVisitor, "site-1", "visitor-1")).toBe(
			true
		);
		expect(shouldDeliverEvent(eventWithoutVisitor, "site-1", "visitor-2")).toBe(
			false
		);
	});

	it("uses the same visitor fallback for timelineItemUpdated events", () => {
		const eventWithoutVisitor: RealtimeEvent<"timelineItemUpdated"> = {
			type: "timelineItemUpdated",
			payload: {
				websiteId: "site-1",
				organizationId: "org-1",
				userId: "user-1",
				visitorId: null,
				conversationId: "conv-1",
				item: {
					...baseEvent.payload.item,
					visitorId: "visitor-1",
				},
			},
		};

		expect(shouldDeliverEvent(eventWithoutVisitor, "site-1", "visitor-1")).toBe(
			true
		);
		expect(shouldDeliverEvent(eventWithoutVisitor, "site-1", "visitor-2")).toBe(
			false
		);
	});

	it("delivers events when the client visitor id is not yet known", () => {
		const result = shouldDeliverEvent(baseEvent, "site-1", null);
		expect(result).toBe(true);
	});

	it("blocks private tool timeline events for visitors", () => {
		const privateToolEvent: RealtimeEvent<"timelineItemCreated"> = {
			...baseEvent,
			payload: {
				...baseEvent.payload,
				item: {
					...baseEvent.payload.item,
					type: "tool",
					tool: "sendMessage",
					visibility: "private",
					parts: [
						{
							type: "tool-sendMessage",
							toolCallId: "call-1",
							toolName: "sendMessage",
							input: { text: "hi" },
							state: "partial",
						},
					],
				},
			},
		};

		expect(shouldDeliverEvent(privateToolEvent, "site-1", "visitor-1")).toBe(
			false
		);
	});

	it("allows public tool timeline events for visitors", () => {
		const publicToolEvent: RealtimeEvent<"timelineItemCreated"> = {
			...baseEvent,
			payload: {
				...baseEvent.payload,
				item: {
					...baseEvent.payload.item,
					type: "tool",
					tool: "searchKnowledgeBase",
					visibility: "public",
					parts: [
						{
							type: "tool-searchKnowledgeBase",
							toolCallId: "call-2",
							toolName: "searchKnowledgeBase",
							input: { query: "pricing" },
							state: "partial",
						},
					],
				},
			},
		};

		expect(shouldDeliverEvent(publicToolEvent, "site-1", "visitor-1")).toBe(
			true
		);
	});
});
