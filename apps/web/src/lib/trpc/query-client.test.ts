import { describe, expect, it } from "bun:test";
import { makeQueryClient, shouldRetryRequest } from "./query-client";

describe("query client retry policy", () => {
	it("does not retry unauthorized or forbidden failures", () => {
		expect(shouldRetryRequest(0, { data: { code: "UNAUTHORIZED" } })).toBe(
			false
		);
		expect(shouldRetryRequest(0, { data: { code: "FORBIDDEN" } })).toBe(false);
		expect(shouldRetryRequest(0, { data: { httpStatus: 401 } })).toBe(false);
		expect(shouldRetryRequest(0, { status: 403 })).toBe(false);
	});

	it("does not retry rate limit failures", () => {
		expect(shouldRetryRequest(0, { data: { code: "TOO_MANY_REQUESTS" } })).toBe(
			false
		);
		expect(shouldRetryRequest(0, new Error("TOO_MANY_REQUESTS"))).toBe(false);
	});

	it("keeps the existing retry window for transient failures", () => {
		expect(shouldRetryRequest(0, new Error("Network failed"))).toBe(true);
		expect(shouldRetryRequest(2, new Error("Network failed"))).toBe(true);
		expect(shouldRetryRequest(3, new Error("Network failed"))).toBe(false);
	});

	it("wires the retry policy into the query client defaults", () => {
		const queryClient = makeQueryClient();
		const retry = queryClient.getDefaultOptions().queries?.retry;

		expect(typeof retry).toBe("function");
		expect(
			typeof retry === "function"
				? retry(0, { data: { code: "UNAUTHORIZED" } } as unknown as Error)
				: true
		).toBe(false);
	});
});
