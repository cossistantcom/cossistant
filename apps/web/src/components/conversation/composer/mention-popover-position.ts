import type { CaretCoordinates } from "@plasma/tiny-markdown";

export type MentionPopoverPlacement = "above" | "below";

export type CalculateMentionPopoverPositionInput = {
	caretPosition: CaretCoordinates;
	anchorWidth: number;
	anchorHeight: number;
	popoverWidth: number;
	popoverHeight: number;
	offset?: number;
	padding?: number;
};

export type MentionPopoverPosition = {
	left: number;
	top: number;
	placement: MentionPopoverPlacement;
};

export type MentionPopoverViewportPositionInput = {
	localPosition: Pick<MentionPopoverPosition, "left" | "top">;
	anchorRect: Pick<DOMRectReadOnly, "left" | "top">;
	popoverWidth: number;
	popoverHeight: number;
	viewportWidth: number;
	viewportHeight: number;
	padding?: number;
};

function clamp(value: number, min: number, max: number): number {
	if (min > max) {
		return min;
	}
	return Math.min(Math.max(value, min), max);
}

export function calculateMentionPopoverPosition({
	caretPosition,
	anchorWidth,
	anchorHeight,
	popoverWidth,
	popoverHeight,
	offset = 8,
	padding = 8,
}: CalculateMentionPopoverPositionInput): MentionPopoverPosition {
	const minLeft = padding;
	const maxLeft = Math.max(padding, anchorWidth - popoverWidth - padding);
	const left = clamp(caretPosition.left - 8, minLeft, maxLeft);

	const minTop = padding;
	const maxTop = Math.max(padding, anchorHeight - popoverHeight - padding);
	const belowTop = caretPosition.top + caretPosition.height + offset;
	const aboveTop = caretPosition.top - popoverHeight - offset;

	const spaceAbove = caretPosition.top;
	const spaceBelow = anchorHeight - (caretPosition.top + caretPosition.height);
	const requiredVerticalSpace = popoverHeight + offset + padding;
	const shouldPlaceBelow =
		spaceBelow >= requiredVerticalSpace ||
		(spaceBelow >= spaceAbove && spaceAbove < requiredVerticalSpace);

	return {
		left,
		top: clamp(shouldPlaceBelow ? belowTop : aboveTop, minTop, maxTop),
		placement: shouldPlaceBelow ? "below" : "above",
	};
}

export function calculateMentionPopoverViewportPosition({
	localPosition,
	anchorRect,
	popoverWidth,
	popoverHeight,
	viewportWidth,
	viewportHeight,
	padding = 8,
}: MentionPopoverViewportPositionInput): Pick<
	MentionPopoverPosition,
	"left" | "top"
> {
	const minLeft = padding;
	const maxLeft = Math.max(padding, viewportWidth - popoverWidth - padding);
	const minTop = padding;
	const maxTop = Math.max(padding, viewportHeight - popoverHeight - padding);

	return {
		left: clamp(anchorRect.left + localPosition.left, minLeft, maxLeft),
		top: clamp(anchorRect.top + localPosition.top, minTop, maxTop),
	};
}
