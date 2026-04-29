import { describe, expect, it } from "bun:test";
import { parseFeatureFlags, serializeFeatureFlags } from "./support";

describe("support feature flag serialization", () => {
	it("normalizes comma-separated feature flags", () => {
		expect(parseFeatureFlags(" beta ,new-message,beta,, ")).toEqual([
			"beta",
			"new-message",
		]);
	});

	it("serializes unique flags and drops invalid values", () => {
		expect(
			serializeFeatureFlags(["new-message", "bad,flag", "beta", "beta", " "])
		).toBe("beta,new-message");
	});
});
