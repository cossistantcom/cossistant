import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import * as compat from "./api/support";
import * as onboarding from "./support-onboarding";

describe("support-onboarding module", () => {
	it("stays free of runtime imports (bundled into browser embeds)", async () => {
		const source = await readFile(
			new URL("./support-onboarding.ts", import.meta.url),
			"utf8"
		);
		assert.doesNotMatch(source, /^\s*import\s/m);
	});

	it("re-exports the same runtime values from api/support for compatibility", () => {
		assert.equal(
			compat.applySupportOnboardingUpdate,
			onboarding.applySupportOnboardingUpdate
		);
		assert.equal(
			compat.normalizeSupportOnboardingState,
			onboarding.normalizeSupportOnboardingState
		);
		assert.equal(
			compat.normalizeSupportFeatureFlags,
			onboarding.normalizeSupportFeatureFlags
		);
		assert.equal(
			compat.EMPTY_SUPPORT_ONBOARDING_STATE,
			onboarding.EMPTY_SUPPORT_ONBOARDING_STATE
		);
	});

	it("applies onboarding updates", () => {
		const next = onboarding.applySupportOnboardingUpdate(
			onboarding.EMPTY_SUPPORT_ONBOARDING_STATE,
			{ stepId: "invite-team", completed: true }
		);
		assert.deepEqual(next, {
			steps: { "invite-team": { completed: true, metadata: null } },
		});
		assert.deepEqual(
			onboarding.applySupportOnboardingUpdate(next, { reset: true }),
			{ steps: {} }
		);
	});
});
