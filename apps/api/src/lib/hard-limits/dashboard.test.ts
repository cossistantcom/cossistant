import { describe, expect, it } from "bun:test";
import { getDefaultPlan } from "@api/lib/plans/config";
import {
	applyDashboardConversationHardLimitLock,
	ensureDashboardConversationLockRedaction,
	isConversationAfterHardLimitCutoff,
} from "@cossistant/types/trpc/conversation-hard-limit";
import { resolveDashboardHardLimitPolicy } from "./dashboard";

describe("dashboard hard-limit helpers", () => {
	it("uses timestamp and id tie-break ordering for lock cutoff checks", () => {
		const cutoff = {
			id: "CO50",
			createdAt: "2026-02-18T12:00:00.000Z",
		};

		expect(
			isConversationAfterHardLimitCutoff(
				{
					id: "CO51",
					createdAt: cutoff.createdAt,
				},
				cutoff
			)
		).toBe(true);

		expect(
			isConversationAfterHardLimitCutoff(
				{
					id: "CO49",
					createdAt: cutoff.createdAt,
				},
				cutoff
			)
		).toBe(false);
	});

	it("preserves title while redacting message preview fields on locked rows", () => {
		const result = applyDashboardConversationHardLimitLock({
			conversation: {
				id: "CO51",
				createdAt: "2026-02-18T12:00:00.000Z",
				title: "Billing issue",
				lastTimelineItem: { id: "TI-1" },
				lastMessageTimelineItem: { id: "TI-1" },
				lastMessageAt: "2026-02-18T12:01:00.000Z",
			},
			cutoff: {
				id: "CO50",
				createdAt: "2026-02-18T12:00:00.000Z",
			},
		});

		expect(result.title).toBe("Billing issue");
		expect(result.lastTimelineItem).toBeNull();
		expect(result.lastMessageTimelineItem).toBeNull();
		expect(result.lastMessageAt).toBeNull();
		expect(result.dashboardLocked).toBe(true);
		expect(result.dashboardLockReason).toBe("conversation_limit");
	});

	it("keeps locked redaction deterministic after subsequent updates", () => {
		const result = ensureDashboardConversationLockRedaction({
			id: "CO51",
			createdAt: "2026-02-18T12:00:00.000Z",
			title: "Updated title",
			lastTimelineItem: { id: "TI-2" },
			lastMessageTimelineItem: { id: "TI-2" },
			lastMessageAt: "2026-02-18T12:02:00.000Z",
			dashboardLocked: true,
			dashboardLockReason: "conversation_limit" as const,
		});

		expect(result.title).toBe("Updated title");
		expect(result.lastTimelineItem).toBeNull();
		expect(result.lastMessageTimelineItem).toBeNull();
		expect(result.lastMessageAt).toBeNull();
		expect(result.dashboardLocked).toBe(true);
		expect(result.dashboardLockReason).toBe("conversation_limit");
	});

	it("builds non-enforced policy when hard limits are unavailable", () => {
		const freePlan = getDefaultPlan();

		const policy = resolveDashboardHardLimitPolicy(
			{
				planName: "free",
				displayName: "Free",
				features: freePlan.features,
				hardLimitsEnforced: false,
				hardLimitsUnavailableReason: "billing_provider_unavailable",
				billing: {
					enabled: true,
					provider: "polar",
					canManageSubscription: true,
				},
			},
			new Date("2026-02-18T00:00:00.000Z")
		);

		expect(policy.enforced).toBe(false);
		expect(policy.unavailableReason).toBe("billing_provider_unavailable");
		expect(policy.messageLimit).toBe(200);
		expect(policy.conversationLimit).toBe(20);
		expect(policy.windowStart).toBe("2026-01-19T00:00:00.000Z");
	});
});
