import { describe, expect, it } from "bun:test";
import {
	timelineItemSchema,
	timelinePartFeedbackSchema,
} from "../src/api/timeline-item";
import { ConversationTimelineType, TimelineItemVisibility } from "../src/enums";

describe("timelineItemSchema feedback parts", () => {
	it("accepts feedback metadata on message timeline items", () => {
		const parsed = timelineItemSchema.parse({
			id: "msg-feedback",
			conversationId: "conv-feedback",
			organizationId: "org-1",
			visibility: TimelineItemVisibility.PUBLIC,
			type: ConversationTimelineType.MESSAGE,
			text: "The drawer closes unexpectedly",
			parts: [
				{ type: "text", text: "The drawer closes unexpectedly" },
				{
					type: "feedback",
					feedbackId: "feedback-1",
					rating: 5,
					topic: "Bug",
					trigger: "dashboard_topbar",
					source: "widget",
				},
			],
			userId: null,
			visitorId: "visitor-1",
			aiAgentId: null,
			createdAt: "2026-03-11T03:00:00.000Z",
			deletedAt: null,
		});

		expect(parsed.parts.at(-1)).toEqual({
			type: "feedback",
			feedbackId: "feedback-1",
			rating: 5,
			topic: "Bug",
			trigger: "dashboard_topbar",
			source: "widget",
		});
	});

	it("exports the feedback part schema", () => {
		expect(
			timelinePartFeedbackSchema.parse({
				type: "feedback",
				feedbackId: "feedback-1",
				rating: 5,
				source: "widget",
			})
		).toEqual({
			type: "feedback",
			feedbackId: "feedback-1",
			rating: 5,
			source: "widget",
		});
	});
});
