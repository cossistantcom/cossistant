import {
	type AiCreditChargeBreakdown,
	getMinimumAiCreditCharge,
	isOutageAllowedModel,
} from "./config";
import { type AiCreditMeterSource, getAiCreditMeterState } from "./polar-meter";

export type AiCreditGuardMode = "normal" | "outage";

export type AiCreditGuardBlockedReason =
	| "insufficient_credits"
	| "meter_configuration_invalid"
	| "outage_model_not_allowed";

export type AiCreditGuardResult = {
	allowed: boolean;
	mode: AiCreditGuardMode;
	reason: string;
	blockedReason: AiCreditGuardBlockedReason | null;
	minimumCharge: AiCreditChargeBreakdown;
	balance: number | null;
	meterBacked: boolean;
	meterSource: AiCreditMeterSource;
	lastSyncedAt: string | null;
};

export async function guardAiCreditRun(params: {
	organizationId: string;
	modelId: string;
	aiThinkingEnabled?: boolean | null;
}): Promise<AiCreditGuardResult> {
	const minimumCharge = getMinimumAiCreditCharge(params.modelId, {
		aiThinkingEnabled: params.aiThinkingEnabled,
	});
	let meterState: Awaited<ReturnType<typeof getAiCreditMeterState>>;

	try {
		meterState = await getAiCreditMeterState(params.organizationId);
	} catch (error) {
		console.error(
			`[ai-credits] Guard meter lookup failed for org=${params.organizationId}:`,
			error
		);
		meterState = {
			organizationId: params.organizationId,
			meterId: null,
			balance: null,
			consumedUnits: null,
			creditedUnits: null,
			meterBacked: false,
			source: "outage",
			lastSyncedAt: new Date().toISOString(),
			outage: true,
			outageReason: "polar_error",
		};
	}

	if (meterState.source === "disabled") {
		return {
			allowed: true,
			mode: "normal",
			reason:
				"Billing is disabled for this deployment, so AI usage is unmetered",
			blockedReason: null,
			minimumCharge,
			balance: null,
			meterBacked: false,
			meterSource: meterState.source,
			lastSyncedAt: meterState.lastSyncedAt,
		};
	}

	if (meterState.meterBacked && typeof meterState.balance === "number") {
		if (meterState.balance >= minimumCharge.totalCredits) {
			return {
				allowed: true,
				mode: "normal",
				reason: "Sufficient AI credits",
				blockedReason: null,
				minimumCharge,
				balance: meterState.balance,
				meterBacked: true,
				meterSource: meterState.source,
				lastSyncedAt: meterState.lastSyncedAt,
			};
		}

		return {
			allowed: false,
			mode: "normal",
			reason: `Insufficient AI credits (required=${minimumCharge.totalCredits}, balance=${meterState.balance})`,
			blockedReason: "insufficient_credits",
			minimumCharge,
			balance: meterState.balance,
			meterBacked: true,
			meterSource: meterState.source,
			lastSyncedAt: meterState.lastSyncedAt,
		};
	}

	if (
		meterState.outageReason === "meter_not_configured" ||
		meterState.outageReason === "meter_not_found"
	) {
		return {
			allowed: false,
			mode: "normal",
			reason:
				"AI credits meter is not configured correctly. Blocking AI runs until billing meter configuration is fixed.",
			blockedReason: "meter_configuration_invalid",
			minimumCharge,
			balance: meterState.balance,
			meterBacked: meterState.meterBacked,
			meterSource: meterState.source,
			lastSyncedAt: meterState.lastSyncedAt,
		};
	}

	if (isOutageAllowedModel(params.modelId)) {
		return {
			allowed: true,
			mode: "outage",
			reason: "Polar meter unavailable, allowing outage fallback model",
			blockedReason: null,
			minimumCharge,
			balance: meterState.balance,
			meterBacked: meterState.meterBacked,
			meterSource: meterState.source,
			lastSyncedAt: meterState.lastSyncedAt,
		};
	}

	return {
		allowed: false,
		mode: "outage",
		reason:
			"Polar meter unavailable and selected model is not allowed in outage fallback mode",
		blockedReason: "outage_model_not_allowed",
		minimumCharge,
		balance: meterState.balance,
		meterBacked: meterState.meterBacked,
		meterSource: meterState.source,
		lastSyncedAt: meterState.lastSyncedAt,
	};
}
