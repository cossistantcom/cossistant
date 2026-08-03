import { describe, expect, it } from "bun:test";
import { EMPTY_SUPPORT_ONBOARDING_STATE } from "@cossistant/types/support-state";
import { EMPTY_ONBOARDING_STATE } from "./store/support-state-store";
import { createSupport } from "./support-config";
import { getSupportOnboardingSnapshot } from "./support-runtime";

describe("createSupport", () => {
	it("accepts feature flags and onboarding steps", () => {
		const support = createSupport({
			featureFlags: ["new-message"],
			onboarding: {
				steps: [
					{ id: "first", isFirst: true },
					{ id: "last", isLast: true },
				],
			},
		});

		expect(support.featureFlags).toEqual(["new-message"]);
	});

	it("rejects invalid feature flag names", () => {
		expect(() =>
			createSupport({
				featureFlags: ["new,message"],
			})
		).toThrow("cannot contain commas");
	});

	it("requires exactly one first and one last onboarding step", () => {
		expect(() =>
			createSupport({
				onboarding: {
					steps: [
						{ id: "first", isFirst: true },
						{ id: "second", isFirst: true },
						{ id: "last", isLast: true },
					],
				},
			})
		).toThrow("exactly one isFirst");

		expect(() =>
			createSupport({
				onboarding: {
					steps: [{ id: "only", isFirst: true, isLast: true }],
				},
			})
		).toThrow("at least two steps");
	});
});

describe("getSupportOnboardingSnapshot", () => {
	it("resolves completed state and current step in configured order", () => {
		const support = createSupport({
			onboarding: {
				steps: [
					{ id: "workspace", isFirst: true },
					{ id: "invite-team" },
					{ id: "done", isLast: true },
				],
			},
		});

		const snapshot = getSupportOnboardingSnapshot(support, {
			steps: {
				workspace: {
					completed: true,
					metadata: { workspaceName: "Acme" },
				},
			},
		});

		expect(snapshot.currentStepId).toBe("invite-team");
		expect(snapshot.isCompleted).toBe(false);
		expect(snapshot.steps).toEqual([
			{
				id: "workspace",
				isFirst: true,
				completed: true,
				metadata: { workspaceName: "Acme" },
			},
			{
				id: "invite-team",
				completed: false,
				metadata: null,
			},
			{
				id: "done",
				isLast: true,
				completed: false,
				metadata: null,
			},
		]);
	});
});

describe("support state constants", () => {
	it("reuses the shared empty onboarding state", () => {
		expect(EMPTY_ONBOARDING_STATE).toBe(EMPTY_SUPPORT_ONBOARDING_STATE);
	});
});
