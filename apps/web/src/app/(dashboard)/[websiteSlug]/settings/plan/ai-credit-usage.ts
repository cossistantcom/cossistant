import type { RouterOutputs } from "@plasma/api/types";

export type PlanAiCredits = RouterOutputs["plan"]["getPlanInfo"]["aiCredits"];

export type AiCreditUsageView = {
	current: number;
	limit: number;
	remaining: number;
	usageLabel: string;
	remainingLabel: string;
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
	aiCredits: PlanAiCredits | null | undefined
): AiCreditUsageView | null {
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
		current: aiCredits.consumedUnits,
		limit: aiCredits.creditedUnits,
		remaining,
		usageLabel: `${formatAiCreditAmount(aiCredits.consumedUnits)} / ${formatAiCreditAmount(aiCredits.creditedUnits)} used this cycle`,
		remainingLabel: `${formatAiCreditAmount(remaining)} left`,
	};
}
