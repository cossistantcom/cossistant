import { describe, expect, it } from "bun:test";
import { ConversationTimelineType } from "@cossistant/types";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import {
	createFeedbackTimelinePart,
	formatFeedbackMetadataValue,
	formatFeedbackRatingLabel,
	formatFeedbackReviewPreview,
	getFeedbackTimelineComment,
	getFeedbackTimelineMetadataEntries,
	getTimelineItemFeedback,
	isFeedbackTimelineItem,
	resolveFeedbackTimelineText,
	WIDGET_FEEDBACK_REVIEW_PREVIEW,
} from "./feedback-timeline";

function createFeedbackTimelineItem(): TimelineItem {
	return {
		id: "msg-feedback",
		conversationId: "conv-feedback",
		organizationId: "org-1",
		visibility: "public",
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
		tool: null,
	};
}

describe("feedback timeline helpers", () => {
	it("detects feedback-backed timeline items", () => {
		const item = createFeedbackTimelineItem();

		expect(isFeedbackTimelineItem(item)).toBe(true);
		expect(getTimelineItemFeedback(item)).toEqual({
			type: "feedback",
			feedbackId: "feedback-1",
			rating: 5,
			topic: "Bug",
			trigger: "dashboard_topbar",
			source: "widget",
		});
	});

	it("formats dashboard and widget previews", () => {
		expect(formatFeedbackReviewPreview(5)).toBe("left a 5 star review");
		expect(WIDGET_FEEDBACK_REVIEW_PREVIEW).toBe("You left a review");
	});

	it("formats feedback card display data", () => {
		const item = createFeedbackTimelineItem();
		const feedback = getTimelineItemFeedback(item);

		expect(formatFeedbackRatingLabel(1)).toBe("1 star review");
		expect(formatFeedbackRatingLabel(5)).toBe("5 star review");
		expect(formatFeedbackMetadataValue("dashboard_topbar")).toBe(
			"Dashboard Topbar"
		);
		expect(getFeedbackTimelineComment(item)).toBe(
			"The drawer closes unexpectedly"
		);
		expect(feedback && getFeedbackTimelineMetadataEntries(feedback)).toEqual([
			{ label: "Reason", value: "Bug" },
			{ label: "Trigger", value: "Dashboard Topbar" },
			{ label: "Source", value: "Widget" },
		]);
		expect(
			getFeedbackTimelineComment({
				...item,
				text: "left a 5 star review",
			})
		).toBeNull();
	});

	it("builds feedback parts and timeline text consistently", () => {
		expect(
			createFeedbackTimelinePart({
				feedbackId: "feedback-1",
				rating: 4,
				source: "widget",
			})
		).toEqual({
			type: "feedback",
			feedbackId: "feedback-1",
			rating: 4,
			topic: null,
			trigger: null,
			source: "widget",
		});
		expect(
			resolveFeedbackTimelineText({
				comment: "  Helpful but slow  ",
				rating: 4,
			})
		).toBe("Helpful but slow");
		expect(resolveFeedbackTimelineText({ comment: " ", rating: 4 })).toBe(
			"left a 4 star review"
		);
	});
});
