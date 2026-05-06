import { describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
	FeedbackCommentInput,
	FeedbackCommentInputView,
} from "./feedback-comment-input";
import { FeedbackRatingSelector } from "./feedback-rating-selector";
import {
	FeedbackTopicSelect,
	FeedbackTopicSelectView,
} from "./feedback-topic-select";

function countOccurrences(html: string, pattern: string): number {
	return html.split(pattern).length - 1;
}

function getElementChildren(element: React.ReactElement): React.ReactElement[] {
	return React.Children.toArray(element.props.children) as React.ReactElement[];
}

describe("feedback primitives", () => {
	it("renders the rating selector with stable SSR markup", () => {
		const html = renderToStaticMarkup(
			<FeedbackRatingSelector hoveredValue={4} value={3} />
		);

		expect(html).toContain('data-feedback-rating-selector="true"');
		expect(countOccurrences(html, 'data-feedback-rating-button="true"')).toBe(
			5
		);
		expect(html).toContain('data-rating-active="true"');
	});

	it("wires rating hover and select handlers", () => {
		const onHoverChange = mock(() => {});
		const onSelect = mock(() => {});
		const onBlur = mock(() => {});
		const element = FeedbackRatingSelector({
			value: 2,
			onBlur,
			onHoverChange,
			onSelect,
		});
		const buttons = getElementChildren(element);
		const thirdButton = buttons[2];

		thirdButton?.props.onBlur();
		thirdButton?.props.onMouseEnter();
		thirdButton?.props.onClick();
		thirdButton?.props.onMouseLeave();

		expect(onBlur).toHaveBeenCalledTimes(1);
		expect(onHoverChange).toHaveBeenNthCalledWith(1, 3);
		expect(onHoverChange).toHaveBeenNthCalledWith(2, null);
		expect(onSelect).toHaveBeenCalledWith(3);
	});

	it("renders the topic select through the shared primitive", () => {
		const html = renderToStaticMarkup(
			<FeedbackTopicSelect options={["Bug", "Feature request"]} value="" />
		);

		expect(html).toContain('data-feedback-topic-select="true"');
		expect(html).toContain('data-feedback-topic-select-control="true"');
		expect(html).toContain("Feature request");
	});

	it("wires topic selection changes", () => {
		const onValueChange = mock(() => {});
		const element = FeedbackTopicSelectView(
			{
				options: ["Bug", "Feature request"],
				onValueChange,
				value: "",
			},
			null
		);
		const [select] = getElementChildren(element);

		select?.props.onChange({
			target: {
				value: "Feature request",
			},
		});

		expect(onValueChange).toHaveBeenCalledWith("Feature request");
	});

	it("renders the comment input through the shared primitive", () => {
		const html = renderToStaticMarkup(
			<FeedbackCommentInput placeholder="Tell us more" value="" />
		);

		expect(html).toContain('data-feedback-comment-input="true"');
		expect(html).toContain('placeholder="Tell us more"');
	});

	it("wires comment changes", () => {
		const onValueChange = mock(() => {});
		const element = FeedbackCommentInputView(
			{
				onValueChange,
				value: "",
			},
			null
		);

		element.props.onChange({
			target: {
				value: "The panel closes too early",
			},
		});

		expect(onValueChange).toHaveBeenCalledWith("The panel closes too early");
	});
});
