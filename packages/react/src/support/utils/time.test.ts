import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { formatTimeAgo } from "./time";

const MINUTE_MS = 1000 * 60;
const DAY_MS = MINUTE_MS * 60 * 24;

describe("formatTimeAgo", () => {
	let originalWindow: typeof globalThis.window;

	beforeEach(() => {
		originalWindow = globalThis.window;
		// Simulate a browser environment (formatTimeAgo returns "" during SSR)
		// @ts-expect-error - mocking window for test
		globalThis.window = {};
	});

	afterEach(() => {
		globalThis.window = originalWindow;
	});

	it("returns an empty string during SSR", () => {
		// @ts-expect-error - simulating SSR
		globalThis.window = undefined;
		expect(formatTimeAgo(new Date())).toBe("");
	});

	it("localizes relative times through Intl.RelativeTimeFormat", () => {
		const yesterday = new Date(Date.now() - DAY_MS);

		const en = formatTimeAgo(yesterday, "en");
		const fr = formatTimeAgo(yesterday, "fr");

		expect(en.toLowerCase()).toBe("yesterday");
		expect(fr.toLowerCase()).toBe("hier");
	});

	it("formats sub-hour differences in minutes", () => {
		const threeMinutesAgo = new Date(Date.now() - 3 * MINUTE_MS);
		const formatted = formatTimeAgo(threeMinutesAgo, "en");

		expect(formatted).toContain("3");
		expect(formatted).toContain("ago");
	});

	it("falls back to English for invalid locale tags", () => {
		const yesterday = new Date(Date.now() - DAY_MS);
		expect(formatTimeAgo(yesterday, "not a locale").toLowerCase()).toBe(
			"yesterday"
		);
	});
});
