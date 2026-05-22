import { describe, expect, it } from "bun:test";
import { FEATURE_CONFIG, PLAN_CONFIG } from "./config";

describe("plan feature configuration", () => {
	it("gates custom AI agent avatars to Pro", () => {
		expect(FEATURE_CONFIG["custom-ai-agent-avatar"]).toMatchObject({
			key: "custom-ai-agent-avatar",
			name: "Custom AI Agent Avatar",
		});
		expect(PLAN_CONFIG.free.features["custom-ai-agent-avatar"]).toBe(false);
		expect(PLAN_CONFIG.hobby.features["custom-ai-agent-avatar"]).toBe(false);
		expect(PLAN_CONFIG.pro.features["custom-ai-agent-avatar"]).toBe(true);
	});

	it("gates OpenRouter BYOK to Pro", () => {
		expect(FEATURE_CONFIG["openrouter-byok"]).toMatchObject({
			key: "openrouter-byok",
			name: "Bring Your Own OpenRouter Key",
		});
		expect(PLAN_CONFIG.free.features["openrouter-byok"]).toBe(false);
		expect(PLAN_CONFIG.hobby.features["openrouter-byok"]).toBe(false);
		expect(PLAN_CONFIG.pro.features["openrouter-byok"]).toBe(true);
	});
});
