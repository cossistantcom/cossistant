import { describe, expect, it } from "bun:test";
import { normalizeDomainOrigin } from "./allowed-domains-form";

describe("normalizeDomainOrigin", () => {
	it("normalizes bare domains to HTTPS origins", () => {
		expect(normalizeDomainOrigin("dirstarter.com")).toBe(
			"https://dirstarter.com"
		);
	});

	it("preserves explicit HTTP origins for local development", () => {
		expect(normalizeDomainOrigin("http://localhost:3000")).toBe(
			"http://localhost:3000"
		);
	});

	it("normalizes explicit URLs to their origin", () => {
		expect(
			normalizeDomainOrigin(" https://app.dirstarter.com/docs?tab=install ")
		).toBe("https://app.dirstarter.com");
	});

	it("rejects unsupported protocols", () => {
		expect(() => normalizeDomainOrigin("ftp://dirstarter.com")).toThrow(
			"Only http:// or https:// URLs are allowed."
		);
	});

	it("rejects invalid domains", () => {
		expect(() => normalizeDomainOrigin("not a domain")).toThrow(
			"Invalid domain."
		);
	});
});
