import { describe, expect, it } from "bun:test";
import type { PlanInfo } from "@api/lib/plans/access";
import { resolveAiCreditsView } from "./plan-view";

const basePlanInfo: PlanInfo = {
	planName: "free",
	displayName: "Free",
	features: {
		conversations: 20,
		messages: 200,
		contacts: 25,
		"conversation-retention": 30,
		"team-members": 1,
		"email-notifications": true,
		"email-reply": true,
		"dashboard-file-sharing": false,
		"auto-translate": false,
		"slack-support": false,
		"slack-custom-channel": false,
		"pro-integrations": false,
		"rest-api": true,
		webhooks: true,
		"self-host": true,
		"custom-events": true,
		"ai-workflows": true,
		"ai-credit": 50,
		"latest-ai-models": false,
		"custom-ai-skills": true,
		"custom-ai-agent-avatar": false,
		"openrouter-byok": false,
		"ai-support-agents": 1,
		"ai-agent-training-links": 5,
		"ai-agent-training-mb": 0.25,
		"ai-agent-crawl-pages-per-source": 5,
		"ai-agent-training-pages-total": 5,
		"ai-agent-training-faqs": 5,
		"ai-agent-training-files": 2,
		"ai-agent-training-interval": 180,
	},
	hardLimitsEnforced: true,
	hardLimitsUnavailableReason: null,
	billing: {
		enabled: true,
		provider: "polar",
		canManageSubscription: true,
	},
};

describe("resolveAiCreditsView", () => {
	it("returns meter-backed values when meter state is available", () => {
		const result = resolveAiCreditsView({
			planInfo: basePlanInfo,
			meterState: {
				organizationId: "org-1",
				meterId: "meter-1",
				balance: 23,
				consumedUnits: 77,
				creditedUnits: 100,
				meterBacked: true,
				source: "live",
				lastSyncedAt: "2026-02-18T12:00:00.000Z",
				outage: false,
			},
		});

		expect(result.meterBacked).toBe(true);
		expect(result.balance).toBe(23);
		expect(result.source).toBe("live");
	});

	it("falls back to plan credits when meter state is unavailable", () => {
		const result = resolveAiCreditsView({
			planInfo: basePlanInfo,
			meterState: {
				organizationId: "org-1",
				meterId: null,
				balance: null,
				consumedUnits: null,
				creditedUnits: null,
				meterBacked: false,
				source: "outage",
				lastSyncedAt: "2026-02-18T12:00:00.000Z",
				outage: true,
				outageReason: "polar_error",
			},
		});

		expect(result.meterBacked).toBe(false);
		expect(result.balance).toBe(50);
		expect(result.creditedUnits).toBe(50);
		expect(result.source).toBe("plan_fallback");
	});

	it("surfaces disabled billing as an unlimited self-hosted credit state", () => {
		const result = resolveAiCreditsView({
			planInfo: basePlanInfo,
			meterState: {
				organizationId: "org-1",
				meterId: null,
				balance: null,
				consumedUnits: null,
				creditedUnits: null,
				meterBacked: false,
				source: "disabled",
				lastSyncedAt: "2026-02-18T12:00:00.000Z",
				outage: false,
			},
		});

		expect(result.meterBacked).toBe(false);
		expect(result.balance).toBeNull();
		expect(result.creditedUnits).toBeNull();
		expect(result.source).toBe("disabled");
	});
});
