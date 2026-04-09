import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
	advancePromoBrowserIntroTyping,
	createPromoBrowserIntroPlaybackState,
	getPromoBrowserIntroTypedValue,
	PROMO_BROWSER_INTRO_DOMAIN,
	resetPromoBrowserIntroPlayback,
	startPromoBrowserIntroAppear,
	startPromoBrowserIntroCursor,
	startPromoBrowserIntroTyping,
} from "./promo-browser-intro";
import { PromoBrowserIntroScene } from "./promo-video-page";

describe("PromoBrowserIntroScene", () => {
	it("renders a single centered fake input without browser chrome or landing copy", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<PromoBrowserIntroScene
					isPlaying={false}
					playToken={0}
					resetToken={0}
				/>
			</React.StrictMode>
		);

		expect(html).toContain('data-promo-browser-intro="true"');
		expect(html).toContain('data-promo-browser-input="true"');
		expect(html).toContain('data-promo-browser-input-state="hidden"');
		expect(html).toContain('data-promo-browser-input-value-state="empty"');
		expect(html).not.toContain('data-slot="browser-shell"');
		expect(html).not.toContain(
			"Clarification turns one answer into the next answer."
		);
		expect(html).not.toContain(
			"Record-friendly landing shell for our promo shots."
		);
		expect(html).not.toContain("Search or enter a domain");
	});
});

describe("promo browser intro playback helpers", () => {
	it("moves from idle to cursor, then typing, then complete", () => {
		const idleState = createPromoBrowserIntroPlaybackState();

		expect(idleState).toEqual({
			phase: "hidden",
			typedLength: 0,
		});
		expect(getPromoBrowserIntroTypedValue(idleState)).toBe("");

		const appearingState = startPromoBrowserIntroAppear();
		expect(appearingState).toEqual({
			phase: "appearing",
			typedLength: 0,
		});

		const cursorState = startPromoBrowserIntroCursor();
		expect(cursorState).toEqual({
			phase: "cursor_enter",
			typedLength: 0,
		});

		const typingState = startPromoBrowserIntroTyping(cursorState);
		expect(typingState).toEqual({
			phase: "typing",
			typedLength: 0,
		});

		let currentState = typingState;
		for (const _character of PROMO_BROWSER_INTRO_DOMAIN) {
			currentState = advancePromoBrowserIntroTyping(currentState);
		}

		expect(currentState).toEqual({
			phase: "complete",
			typedLength: PROMO_BROWSER_INTRO_DOMAIN.length,
		});
		expect(getPromoBrowserIntroTypedValue(currentState)).toBe(
			PROMO_BROWSER_INTRO_DOMAIN
		);
	});

	it("resets back to an empty idle state", () => {
		const completedState = {
			phase: "complete" as const,
			typedLength: PROMO_BROWSER_INTRO_DOMAIN.length,
		};

		expect(resetPromoBrowserIntroPlayback()).toEqual({
			phase: "hidden",
			typedLength: 0,
		});
		expect(getPromoBrowserIntroTypedValue(completedState)).toBe(
			PROMO_BROWSER_INTRO_DOMAIN
		);
	});
});
