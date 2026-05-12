import { describe, expect, it } from "bun:test";
import type { RealtimeEvent } from "@cossistant/types/realtime-events";
import { shouldDeliverEvent } from "./realtime-event-filter";

describe("shouldDeliverEvent", () => {
	it("accepts recipient-targeted contact continuity events", () => {
		const event: RealtimeEvent<"timelineItemCreated"> = {
			type: "timelineItemCreated",
			payload: {
				websiteId: "site-1",
				organizationId: "org-1",
				userId: "user-1",
				visitorId: "visitor-new",
				conversationId: "conv-1",
				item: {
					id: "item-1",
					conversationId: "conv-1",
					organizationId: "org-1",
					type: "message",
					text: "agent reply",
					parts: [{ type: "text", text: "agent reply" }],
					userId: "user-1",
					aiAgentId: null,
					visitorId: "visitor-old",
					visibility: "public",
					createdAt: "2026-05-06T12:00:00.000Z",
					deletedAt: null,
				},
			},
		};

		expect(shouldDeliverEvent(event, "site-1", "visitor-new")).toBe(true);
		expect(shouldDeliverEvent(event, "site-1", "visitor-other")).toBe(false);
	});
});
