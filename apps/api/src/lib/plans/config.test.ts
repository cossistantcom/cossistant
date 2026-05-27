import { describe, expect, it } from "bun:test";
import { FEATURE_CONFIG, PLAN_CONFIG } from "./config";

describe("plan feature configuration", () => {
	it("keeps free plan non-AI limits intentionally constrained", () => {
		expect(PLAN_CONFIG.free.features).toMatchObject({
			conversations: 20,
			messages: 200,
			contacts: 25,
			"ai-agent-training-links": 5,
			"ai-agent-training-mb": 0.25,
			"ai-agent-crawl-pages-per-source": 5,
			"ai-agent-training-pages-total": 5,
			"ai-agent-training-faqs": 5,
			"ai-agent-training-files": 2,
			"ai-agent-training-interval": 180,
		});
		expect(PLAN_CONFIG.free.features["ai-credit"]).toBe(50);
		expect(PLAN_CONFIG.free.features["team-members"]).toBe(1);
		expect(PLAN_CONFIG.free.features["conversation-retention"]).toBe(30);
	});

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
