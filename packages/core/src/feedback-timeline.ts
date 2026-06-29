import type {
	TimelineItem,
	TimelinePartFeedback,
} from "@cossistant/types/api/timeline-item";

export const WIDGET_FEEDBACK_REVIEW_PREVIEW = "You left a review";

export type FeedbackTimelineMetadataEntry = {
	label: "Reason" | "Trigger" | "Source";
	value: string;
};

export type FeedbackTimelinePartInput = {
	feedbackId: string;
	rating: number;
	topic?: string | null;
	trigger?: string | null;
	source: string;
};

export function createFeedbackTimelinePart({
	feedbackId,
	rating,
	topic = null,
	trigger = null,
	source,
}: FeedbackTimelinePartInput): TimelinePartFeedback {
	return {
		type: "feedback",
		feedbackId,
		rating,
		topic,
		trigger,
		source,
	};
}

export function resolveFeedbackTimelineText({
	comment,
	rating,
}: {
	comment?: string | null;
	rating: number;
}): string {
	const trimmedComment = comment?.trim();

	return trimmedComment && trimmedComment.length > 0
		? trimmedComment
		: formatFeedbackReviewPreview(rating);
}

function formatLabelValue(value: string): string {
	return value
		.trim()
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.map((part) => (part.toLowerCase() === "api" ? "API" : part))
		.join(" ");
}

export function formatFeedbackMetadataValue(
	value: string | null | undefined
): string | null {
	const trimmedValue = value?.trim();

	return trimmedValue ? formatLabelValue(trimmedValue) : null;
}

export function formatFeedbackRatingLabel(rating: number): string {
	return `${rating} star review`;
}

export function getFeedbackTimelineComment(
	item: Pick<TimelineItem, "parts" | "text"> | null | undefined
): string | null {
	if (!item) {
		return null;
	}

	const feedback = getTimelineItemFeedback(item);
	if (!feedback) {
		return null;
	}

	const text = item.text?.trim();
	if (!text || text === formatFeedbackReviewPreview(feedback.rating)) {
		return null;
	}

	return text;
}

export function getFeedbackTimelineMetadataEntries(
	feedback: TimelinePartFeedback
): FeedbackTimelineMetadataEntry[] {
	const entries: FeedbackTimelineMetadataEntry[] = [];
	const topic = formatFeedbackMetadataValue(feedback.topic);
	const trigger = formatFeedbackMetadataValue(feedback.trigger);
	const source = formatFeedbackMetadataValue(feedback.source);

	if (topic) {
		entries.push({ label: "Reason", value: topic });
	}

	if (trigger) {
		entries.push({ label: "Trigger", value: trigger });
	}

	if (source) {
		entries.push({ label: "Source", value: source });
	}

	return entries;
}

export function isTimelinePartFeedback(
	part: unknown
): part is TimelinePartFeedback {
	if (!(part && typeof part === "object")) {
		return false;
	}

	return (
		"type" in part &&
		part.type === "feedback" &&
		"feedbackId" in part &&
		typeof part.feedbackId === "string" &&
		"rating" in part &&
		typeof part.rating === "number" &&
		Number.isInteger(part.rating) &&
		part.rating >= 1 &&
		part.rating <= 5
	);
}

export function getTimelineItemFeedback(
	item: Pick<TimelineItem, "parts"> | null | undefined
): TimelinePartFeedback | null {
	if (!item) {
		return null;
	}

	for (let index = item.parts.length - 1; index >= 0; index--) {
		const part = item.parts[index];
		if (isTimelinePartFeedback(part)) {
			return part;
		}
	}

	return null;
}

export function isFeedbackTimelineItem(
	item: Pick<TimelineItem, "parts" | "type"> | null | undefined
): boolean {
	return item?.type === "message" && Boolean(getTimelineItemFeedback(item));
}

export function formatFeedbackReviewPreview(rating: number): string {
	return `left a ${rating} star review`;
}
