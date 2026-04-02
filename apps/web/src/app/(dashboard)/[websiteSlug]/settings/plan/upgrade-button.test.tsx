import { describe, expect, it, mock } from "bun:test";
import type { RouterOutputs } from "@plasma/api/types";
import { renderToStaticMarkup } from "react-dom/server";
import { UpgradeButton } from "./upgrade-button";

mock.module("@/components/plan/upgrade-modal", () => ({
	UpgradeModal: () => null,
}));

type PlanInfo = RouterOutputs["plan"]["getPlanInfo"];

function createPlanInfo(overrides: Partial<PlanInfo> = {}): PlanInfo {
	return {
		plan: {
			name: "free",
			displayName: "Free",
			price: null,
			features: {
				contacts: 100,
				conversations: 500,
				messages: 5000,
				"team-members": 1,
				"conversation-retention": 30,
			},
		},
		usage: {
			contacts: 10,
			conversations: 25,
			messages: 250,
			teamMembers: 1,
		},
		hardLimitStatus: {
			rollingWindowDays: 30,
			windowStart: "2026-02-11T00:00:00.000Z",
			enforced: true,
			unavailableReason: null,
			messages: {
				limit: 5000,
				used: 250,
				reached: false,
			},
			conversations: {
				limit: 500,
				used: 25,
				reached: false,
				lockCutoff: null,
			},
		},
		aiCredits: {
			balance: 50,
			consumedUnits: 50,
			creditedUnits: 100,
			meterBacked: true,
			source: "live",
			lastSyncedAt: "2026-03-12T00:00:00.000Z",
		},
		aiModels: {
			defaultModelId: "openai/gpt-4.1-mini",
			items: [],
		},
		...overrides,
	} as PlanInfo;
}

describe("UpgradeButton", () => {
	it("shows usage context for free-plan upgrades", () => {
		const html = renderToStaticMarkup(
			<UpgradeButton planInfo={createPlanInfo()} websiteSlug="acme" />
		);

		expect(html).toContain("Upgrade to Pro");
		expect(html).toContain("Rolling 30-day window");
		expect(html).toContain(">Messages<");
		expect(html).toContain(">Conversations<");
		expect(html).toContain("250 / 5,000");
		expect(html).toContain("25 / 500");
		expect(html).toContain('data-slot="progress"');
	});

	it("keeps paid plans as a simple change-plan button", () => {
		const freePlanInfo = createPlanInfo();
		const html = renderToStaticMarkup(
			<UpgradeButton
				planInfo={
					{
						...freePlanInfo,
						plan: {
							...freePlanInfo.plan,
							name: "pro",
							displayName: "Pro",
							price: 79,
						},
					} as PlanInfo
				}
				websiteSlug="acme"
			/>
		);

		expect(html).toContain(">Change plan<");
		expect(html).not.toContain("Rolling 30-day window");
		expect(html).not.toContain(">Messages<");
	});
});
