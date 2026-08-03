import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySupportOnboardingUpdate as applyLightweightUpdate } from "../support-state";
import {
	applySupportOnboardingUpdate,
	supportFeatureFlagMutationRequestSchema,
} from "./support";

describe("support feature flag validation", () => {
	it("rejects comma-containing feature flag names", () => {
		const result = supportFeatureFlagMutationRequestSchema.safeParse({
			target: { type: "contact", id: "contact_123" },
			operation: "add",
			flags: ["new,message"],
		});

		assert.equal(result.success, false);
	});

	it("rejects whitespace-only feature flag names", () => {
		const result = supportFeatureFlagMutationRequestSchema.safeParse({
			target: { type: "contact", id: "contact_123" },
			operation: "add",
			flags: ["   "],
		});

		assert.equal(result.success, false);
	});
});

describe("support helper compatibility exports", () => {
	it("preserves helpers on the API support entry", () => {
		assert.equal(applySupportOnboardingUpdate, applyLightweightUpdate);
	});
});
