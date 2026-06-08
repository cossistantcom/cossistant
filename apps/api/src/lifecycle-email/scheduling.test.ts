import { describe, expect, it } from "bun:test";
import {
	getLocalWeekKey,
	getWeeklyDigestDedupeKey,
	shouldScanWeeklyDigestForTimezone,
} from "./scheduling";

describe("lifecycle email scheduling", () => {
	it("runs weekly digest scans at Monday 09:00 in the organization timezone", () => {
		expect(
			shouldScanWeeklyDigestForTimezone({
				now: new Date("2026-05-25T07:04:00.000Z"),
				timezone: "Europe/Paris",
			})
		).toBe(true);
		expect(
			shouldScanWeeklyDigestForTimezone({
				now: new Date("2026-05-25T07:16:00.000Z"),
				timezone: "Europe/Paris",
			})
		).toBe(false);
		expect(
			shouldScanWeeklyDigestForTimezone({
				now: new Date("2026-05-25T07:04:00.000Z"),
				timezone: "America/New_York",
			})
		).toBe(false);
	});

	it("creates one stable dedupe week key for the local week", () => {
		expect(
			getLocalWeekKey(new Date("2026-05-25T07:04:00.000Z"), "Europe/Paris")
		).toBe("2026-05-25");
		expect(
			getLocalWeekKey(new Date("2026-05-31T21:30:00.000Z"), "Europe/Paris")
		).toBe("2026-05-25");
	});

	it("uses website-scoped weekly digest dedupe keys", () => {
		expect(
			getWeeklyDigestDedupeKey({
				websiteId: "site_123",
				weekKey: "2026-05-25",
			})
		).toBe("weekly_digest:site_123:2026-05-25");
	});
});
