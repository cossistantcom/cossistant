import { describe, expect, it } from "bun:test";
import {
	ConversationTimelineType,
	TimelineItemVisibility,
} from "@plasma/types";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import { mapDefaultTimelineItemForCreation } from "./conversation-default-timeline-item";

function createBaseTimelineItem(
	overrides: Partial<TimelineItem> = {}
): TimelineItem {
	return {
		id: "01JTESTDEFAULTITEM0000000000",
		conversationId: "CO4GKT9QZ2BJKXMVR",
		organizationId: "org_123",
		visibility: TimelineItemVisibility.PUBLIC,
		type: ConversationTimelineType.MESSAGE,
		text: "Hello",
		parts: [{ type: "text", text: "Hello" }],
		userId: null,
		aiAgentId: null,
		visitorId: "01JTESTVISITOR000000000000",
		createdAt: "2026-02-20T00:00:00.000Z",
		deletedAt: null,
		tool: null,
		...overrides,
	};
}

describe("mapDefaultTimelineItemForCreation", () => {
	it("preserves client id/tool for message defaults", () => {
		const messageItem = createBaseTimelineItem({
			id: "01JTESTMESSAGE000000000000",
			tool: "sendMessage",
			parts: [
				{ type: "text", text: "Hello" },
				{
					type: "image",
					url: "https://example.com/image.png",
					mediaType: "image/png",
				},
			],
		});

		const prepared = mapDefaultTimelineItemForCreation(messageItem);

		expect(prepared.kind).toBe("message");
		if (prepared.kind !== "message") {
			throw new Error("Expected message mapping");
		}

		expect(prepared.input.id).toBe(messageItem.id);
		expect(prepared.input.tool).toBe("sendMessage");
		expect(prepared.input.text).toBe("Hello");
		expect(prepared.input.extraParts).toEqual([
			{
				type: "image",
				url: "https://example.com/image.png",
				mediaType: "image/png",
			},
		]);
	});

	it("preserves client id/tool for non-message defaults", () => {
		const toolItem = createBaseTimelineItem({
			id: "01JTESTTOOLITEM00000000000",
			type: ConversationTimelineType.TOOL,
			tool: "identifyVisitor",
			text: null,
			parts: [],
		});

		const prepared = mapDefaultTimelineItemForCreation(toolItem);

		expect(prepared.kind).toBe("timeline");
		if (prepared.kind !== "timeline") {
			throw new Error("Expected timeline mapping");
		}

		expect(prepared.input.id).toBe(toolItem.id);
		expect(prepared.input.type).toBe(ConversationTimelineType.TOOL);
		expect(prepared.input.tool).toBe("identifyVisitor");
		expect(prepared.input.parts).toEqual([]);
	});
});
