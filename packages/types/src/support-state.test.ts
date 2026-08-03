import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	applySupportOnboardingUpdate,
	normalizeSupportFeatureFlags,
	normalizeSupportOnboardingState,
} from "./support-state";

describe("support feature flag helpers", () => {
	it("normalizes feature flag names", () => {
		assert.deepEqual(
			normalizeSupportFeatureFlags([
				" beta ",
				"new-message",
				"beta",
				"",
				"bad,flag",
			]),
			["beta", "new-message"]
		);
	});
});

describe("support onboarding helpers", () => {
	it("normalizes invalid onboarding state", () => {
		assert.deepEqual(normalizeSupportOnboardingState(null), { steps: {} });
		assert.deepEqual(
			normalizeSupportOnboardingState({
				steps: {
					workspace: {
						completed: true,
						metadata: "not-an-object" as never,
					},
				},
			}),
			{
				steps: {
					workspace: {
						completed: true,
						metadata: null,
					},
				},
			}
		);
		assert.deepEqual(
			normalizeSupportOnboardingState({
				steps: {
					workspace: {
						completed: false,
						metadata: ["not-an-object"] as never,
					},
				},
			}),
			{
				steps: {
					workspace: {
						completed: false,
						metadata: null,
					},
				},
			}
		);
	});

	it("applies completed, metadata, clear metadata, and reset updates", () => {
		const completed = applySupportOnboardingUpdate(
			{ steps: {} },
			{ stepId: "workspace", completed: true }
		);

		assert.deepEqual(completed.steps.workspace, {
			completed: true,
			metadata: null,
		});

		const withMetadata = applySupportOnboardingUpdate(completed, {
			stepId: "workspace",
			metadata: { workspaceName: "Acme" },
		});

		assert.deepEqual(withMetadata.steps.workspace, {
			completed: true,
			metadata: { workspaceName: "Acme" },
		});

		const cleared = applySupportOnboardingUpdate(withMetadata, {
			stepId: "workspace",
			metadata: null,
		});

		assert.deepEqual(cleared.steps.workspace, {
			completed: true,
			metadata: null,
		});

		assert.deepEqual(applySupportOnboardingUpdate(cleared, { reset: true }), {
			steps: {},
		});
	});
});
