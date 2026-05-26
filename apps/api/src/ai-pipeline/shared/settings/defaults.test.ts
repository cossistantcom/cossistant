import { describe, expect, it } from "bun:test";
import { getBehaviorSettings, getDefaultBehaviorSettings } from "./defaults";

describe("getDefaultBehaviorSettings", () => {
	it("enables knowledge clarification by default", () => {
		expect(getDefaultBehaviorSettings().canRequestKnowledgeClarification).toBe(
			true
		);
	});

	it("disables AI Thinking by default", () => {
		expect(getDefaultBehaviorSettings().aiThinkingEnabled).toBe(false);
	});
});

describe("getBehaviorSettings", () => {
	it("treats missing clarification settings as enabled", () => {
		expect(
			getBehaviorSettings({
				behaviorSettings: {},
			} as never).canRequestKnowledgeClarification
		).toBe(true);
	});

	it("preserves explicit clarification opt-outs", () => {
		expect(
			getBehaviorSettings({
				behaviorSettings: {
					canRequestKnowledgeClarification: false,
				},
			} as never).canRequestKnowledgeClarification
		).toBe(false);
	});

	it("preserves explicit AI Thinking opt-ins", () => {
		expect(
			getBehaviorSettings({
				behaviorSettings: {
					aiThinkingEnabled: true,
				},
			} as never).aiThinkingEnabled
		).toBe(true);
	});
});
