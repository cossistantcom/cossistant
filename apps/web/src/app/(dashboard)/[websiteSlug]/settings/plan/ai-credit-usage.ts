import type { RouterOutputs } from "@cossistant/api/types";

export type PlanAiCredits = RouterOutputs["plan"]["getPlanInfo"]["aiCredits"];
type AdminWebsiteAiCredits =
	RouterOutputs["admin"]["getWebsiteAiUsage"]["aiCredits"];

export type AiCreditUsageView = {
	kind: "metered" | "unlimited";
	current: number;
	limit: number | null;
	remaining: number | null;
	usageLabel: string;
	remainingLabel: string | null;
};

const aiCreditFormatter = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 2,
});

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

export function formatAiCreditAmount(value: number): string {
	return aiCreditFormatter.format(value);
}

export function getAiCreditUsageView(
	aiCredits: AdminWebsiteAiCredits | PlanAiCredits | null | undefined
): AiCreditUsageView | null {
	if (aiCredits?.source === "disabled") {
		return {
			kind: "unlimited",
			current: 0,
			limit: null,
			remaining: null,
			usageLabel: "Unlimited in self-hosted mode",
			remainingLabel: null,
		};
	}

	if (!aiCredits?.meterBacked) {
		return null;
	}

	if (
		!(
			isFiniteNumber(aiCredits.creditedUnits) &&
			isFiniteNumber(aiCredits.consumedUnits)
		)
	) {
		return null;
	}

	const remaining = isFiniteNumber(aiCredits.balance)
		? aiCredits.balance
		: Math.max(aiCredits.creditedUnits - aiCredits.consumedUnits, 0);

	return {
		kind: "metered",
		current: aiCredits.consumedUnits,
		limit: aiCredits.creditedUnits,
		remaining,
		usageLabel: `${formatAiCreditAmount(aiCredits.consumedUnits)} / ${formatAiCreditAmount(aiCredits.creditedUnits)} used this cycle`,
		remainingLabel: `${formatAiCreditAmount(remaining)} left`,
	};
}
