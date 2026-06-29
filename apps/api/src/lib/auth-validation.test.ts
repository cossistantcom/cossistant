import { describe, expect, it, mock } from "bun:test";

mock.module("@api/env", () => ({
	env: {
		API_KEY_SECRET: "test-secret",
	},
}));

const { validateDomain } = await import("./auth-validation");

describe("validateDomain", () => {
	it("allows an exact whitelisted hostname", () => {
		expect(validateDomain("dirstarter.com", ["https://dirstarter.com"])).toBe(
			true
		);
	});

	it("allows subdomains of a whitelisted hostname", () => {
		expect(
			validateDomain("app.dirstarter.com", ["https://dirstarter.com"])
		).toBe(true);
		expect(
			validateDomain("preview.app.dirstarter.com", ["https://dirstarter.com"])
		).toBe(true);
	});

	it("does not allow unrelated suffix lookalikes", () => {
		expect(
			validateDomain("evil-dirstarter.com", ["https://dirstarter.com"])
		).toBe(false);
		expect(
			validateDomain("dirstarter.com.evil.com", ["https://dirstarter.com"])
		).toBe(false);
	});

	it("does not allow an apex domain from a subdomain allowlist entry", () => {
		expect(
			validateDomain("dirstarter.com", ["https://app.dirstarter.com"])
		).toBe(false);
	});

	it("keeps existing wildcard entries working", () => {
		expect(validateDomain("dirstarter.com", ["*.dirstarter.com"])).toBe(true);
		expect(validateDomain("app.dirstarter.com", ["*.dirstarter.com"])).toBe(
			true
		);
		expect(validateDomain("evil-dirstarter.com", ["*.dirstarter.com"])).toBe(
			false
		);
	});
});
