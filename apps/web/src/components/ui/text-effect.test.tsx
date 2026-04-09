import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
	getTextEffectTypingSegments,
	getTextEffectVisibleText,
	TextEffect,
} from "./text-effect";

describe("TextEffect", () => {
	it("does not render a caret by default", () => {
		const html = renderToStaticMarkup(<TextEffect>Typing</TextEffect>);

		expect(html).not.toContain('data-text-effect-caret="true"');
	});

	it("computes progressive typing output when caret mode is enabled", () => {
		const segments = getTextEffectTypingSegments("Typing", "char");

		expect(getTextEffectVisibleText(segments, 0)).toBe("");
		expect(getTextEffectVisibleText(segments, 2)).toBe("Ty");
		expect(getTextEffectVisibleText(segments, segments.length)).toBe("Typing");
	});

	it("renders a controlled caret reveal without running the internal typing scheduler", () => {
		const html = renderToStaticMarkup(
			<TextEffect as="span" per="char" revealedCount={4} showCaret={true}>
				Typing
			</TextEffect>
		);

		expect(html).toContain("Typi");
		expect(html).toContain('data-text-effect-caret="true"');
	});
});
