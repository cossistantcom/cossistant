import { describe, expect, it } from "bun:test";
import { shouldEvaluateLifecycleLimitWarnings } from "./worker";

describe("lifecycle email limit scan", () => {
	it("skips limit warnings when plan hard limits are unavailable", () => {
		expect(
			shouldEvaluateLifecycleLimitWarnings({
				hardLimitsEnforced: false,
			})
		).toBe(false);
	});

	it("evaluates limit warnings when plan hard limits are enforced", () => {
		expect(
			shouldEvaluateLifecycleLimitWarnings({
				hardLimitsEnforced: true,
			})
		).toBe(true);
	});
});
