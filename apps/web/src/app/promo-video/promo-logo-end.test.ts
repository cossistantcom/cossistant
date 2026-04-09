import { describe, expect, it } from "bun:test";
import {
	createPromoLogoEndPlaybackState,
	resetPromoLogoEndPlayback,
	revealPromoLogoEnd,
} from "./promo-logo-end";

describe("promo logo end playback helpers", () => {
	it("starts hidden, reveals on play, and resets back to hidden", () => {
		expect(createPromoLogoEndPlaybackState()).toEqual({
			isVisible: false,
		});

		expect(revealPromoLogoEnd()).toEqual({
			isVisible: true,
		});

		expect(resetPromoLogoEndPlayback()).toEqual({
			isVisible: false,
		});
	});
});
