import { describe, expect, it } from "bun:test";
import { isValidTimezone, resolveOrganizationTimezone } from "./timezone";

describe("organization timezone helpers", () => {
	it("accepts bundled and platform-supported IANA timezones", () => {
		expect(isValidTimezone("Europe/Paris")).toBe(true);
		expect(isValidTimezone("America/New_York")).toBe(true);
	});

	it("rejects invalid timezone values", () => {
		expect(isValidTimezone("Paris")).toBe(false);
		expect(isValidTimezone("")).toBe(false);
		expect(isValidTimezone(null)).toBe(false);
	});

	it("defaults from browser candidate, request candidate, then UTC", () => {
		expect(resolveOrganizationTimezone("Europe/Paris", "UTC")).toBe(
			"Europe/Paris"
		);
		expect(resolveOrganizationTimezone("bad-zone", "America/New_York")).toBe(
			"America/New_York"
		);
		expect(resolveOrganizationTimezone("bad-zone", null)).toBe("UTC");
	});
});
