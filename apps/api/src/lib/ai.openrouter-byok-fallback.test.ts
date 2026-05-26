import { describe, expect, it } from "bun:test";
import { APICallError, NoOutputGeneratedError } from "ai";
import { isOpenRouterByokFallbackEligibleError } from "./ai";
import { OpenRouterByokError } from "./openrouter-byok/resolver";

function apiCallError(statusCode?: number) {
	return new APICallError({
		message: "OpenRouter request failed",
		url: "https://openrouter.ai/api/v1/chat/completions",
		requestBodyValues: {},
		statusCode,
	});
}

describe("isOpenRouterByokFallbackEligibleError", () => {
	it("allows fallback for decrypt, auth, quota, rate limit, provider, and network failures", () => {
		expect(
			isOpenRouterByokFallbackEligibleError(
				new OpenRouterByokError("decrypt_failed", "decrypt failed")
			)
		).toBe(true);
		expect(isOpenRouterByokFallbackEligibleError(apiCallError(401))).toBe(true);
		expect(isOpenRouterByokFallbackEligibleError(apiCallError(402))).toBe(true);
		expect(isOpenRouterByokFallbackEligibleError(apiCallError(429))).toBe(true);
		expect(isOpenRouterByokFallbackEligibleError(apiCallError(500))).toBe(true);
		expect(
			isOpenRouterByokFallbackEligibleError(new Error("fetch failed"))
		).toBe(true);
	});

	it("does not fallback for app/runtime failures", () => {
		const abortError = new Error("The operation was aborted");
		abortError.name = "AbortError";

		expect(isOpenRouterByokFallbackEligibleError(abortError)).toBe(false);
		expect(
			isOpenRouterByokFallbackEligibleError(abortError, {
				localAbort: true,
			})
		).toBe(false);
		expect(
			isOpenRouterByokFallbackEligibleError(new Error("translation_timeout"))
		).toBe(false);
		expect(
			isOpenRouterByokFallbackEligibleError(new NoOutputGeneratedError())
		).toBe(false);
		expect(
			isOpenRouterByokFallbackEligibleError(new Error("tool execution failed"))
		).toBe(false);
	});

	it("allows fallback for provider AbortError when the local signal did not abort", () => {
		const abortError = new Error("The provider aborted the request");
		abortError.name = "AbortError";

		expect(
			isOpenRouterByokFallbackEligibleError(abortError, {
				localAbort: false,
			})
		).toBe(true);
	});
});
