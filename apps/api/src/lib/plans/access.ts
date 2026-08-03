import type { website } from "@api/db/schema";
import {
	type BillingStatus,
	getBillingStatus,
	isPolarEnabled,
} from "@api/lib/billing-mode";
import {
	type FeatureKey,
	type FeatureValue,
	getDefaultPlan,
	getPlanConfig,
	type PlanName,
} from "./config";
import {
	getCustomerByOrganizationId,
	getCustomerState,
	getPlanFromCustomerState,
	getSubscriptionForWebsite,
	getUnscopedPaidSubscriptions,
	PolarCustomerInvariantViolationError,
} from "./polar";

type Website = typeof website.$inferSelect;

export type ResolvedPlanName = PlanName | "self_hosted";

export type HardLimitsUnavailableReason =
	| "billing_provider_unavailable"
	| "billing_disabled"
	| "billing_scope_ambiguous";

export type PlanInfo = {
	planName: ResolvedPlanName;
	displayName: string;
	price?: number;
	features: Record<FeatureKey, FeatureValue>;
	hardLimitsEnforced: boolean;
	hardLimitsUnavailableReason: HardLimitsUnavailableReason | null;
	billing: BillingStatus;
};

const PLAN_CACHE_SUCCESS_TTL_MS = 10_000;
const PLAN_CACHE_FAILURE_TTL_MS = 3000;

type CachedPlanEntry = {
	expiresAt: number;
	plan: PlanInfo;
};

const planCache = new Map<string, CachedPlanEntry>();

function resolveSelfHostedFeatures(): Record<FeatureKey, FeatureValue> {
	const referencePlan = getPlanConfig("pro");

	return Object.fromEntries(
		Object.entries(referencePlan.features).map(([featureKey, value]) => {
			if (featureKey === "ai-agent-training-interval") {
				return [featureKey, 0];
			}

			if (typeof value === "boolean") {
				return [featureKey, true];
			}

			return [featureKey, null];
		})
	) as Record<FeatureKey, FeatureValue>;
}

export function getSelfHostedPlanInfo(): PlanInfo {
	return {
		planName: "self_hosted",
		displayName: "Self-Hosted",
		price: undefined,
		features: resolveSelfHostedFeatures(),
		hardLimitsEnforced: false,
		hardLimitsUnavailableReason: "billing_disabled",
		billing: {
			enabled: false,
			provider: "disabled",
			canManageSubscription: false,
		},
	};
}

/**
 * Check if a website can use a specific feature
 */
export async function canUse(
	featureKey: FeatureKey,
	_website: Website
): Promise<boolean> {
	const planInfo = await getPlanForWebsite(_website);

	if (!planInfo) {
		return false;
	}

	const featureLimit = planInfo.features[featureKey];

	// null means unlimited, so return true
	if (featureLimit === null) {
		return true;
	}

	// If there's a limit, we need to check current usage
	// For now, we'll assume the limit check is done elsewhere
	// This function just checks if the plan allows the feature
	return true;
}

/**
 * Get plan information for a website
 * Returns the plan name, display name, price, and feature limits
 * Defaults to free plan if no subscription exists
 */
export async function getPlanForWebsite(_website: Website): Promise<PlanInfo> {
	if (!isPolarEnabled()) {
		return getSelfHostedPlanInfo();
	}

	const cached = planCache.get(_website.id);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.plan;
	}

	const stalePlan = cached?.plan ?? null;

	try {
		const customer = await getCustomerByOrganizationId(_website.organizationId);
		if (!customer) {
			throw new PolarCustomerInvariantViolationError(_website.organizationId);
		}

		const customerState = await getCustomerState(customer.id);

		// Find subscription for this specific website
		const websiteSubscription = getSubscriptionForWebsite(
			customerState,
			_website.id
		);

		let planName: PlanName | null = null;

		if (websiteSubscription) {
			// If we have a website-specific subscription, get plan from it
			// Create a temporary customer state with just this subscription
			const subscriptionCustomerState = {
				customerId: customerState?.customerId ?? "",
				activeSubscriptions: [websiteSubscription],
				grantedBenefits: customerState?.grantedBenefits ?? [],
			};
			planName = await getPlanFromCustomerState(subscriptionCustomerState);
		}
		// No fallback to organization-level subscriptions - each website must have its own subscription
		// If no website-specific subscription found, planName stays null and defaults to "free" below

		// If no plan found, default to free
		const finalPlanName: PlanName = planName ?? "free";
		const hasAmbiguousPaidScope =
			finalPlanName === "free" &&
			getUnscopedPaidSubscriptions(customerState).length > 0;

		// Get plan configuration
		const planConfig = getPlanConfig(finalPlanName);

		const resolvedPlan: PlanInfo = {
			planName: finalPlanName,
			displayName: planConfig.displayName,
			price: planConfig.price,
			features: planConfig.features,
			hardLimitsEnforced: !hasAmbiguousPaidScope,
			hardLimitsUnavailableReason: hasAmbiguousPaidScope
				? "billing_scope_ambiguous"
				: null,
			billing: getBillingStatus(),
		};

		planCache.set(_website.id, {
			expiresAt: Date.now() + PLAN_CACHE_SUCCESS_TTL_MS,
			plan: resolvedPlan,
		});

		return resolvedPlan;
	} catch (error) {
		console.error("Error getting plan for website:", error);

		if (stalePlan) {
			const degradedPlan: PlanInfo = {
				...stalePlan,
				hardLimitsEnforced: false,
				hardLimitsUnavailableReason: "billing_provider_unavailable",
				billing: getBillingStatus(),
			};

			planCache.set(_website.id, {
				expiresAt: Date.now() + PLAN_CACHE_FAILURE_TTL_MS,
				plan: degradedPlan,
			});

			return degradedPlan;
		}

		// On error, default to free plan
		const defaultPlan = getDefaultPlan();

		const fallbackPlan: PlanInfo = {
			planName: "free",
			displayName: defaultPlan.displayName,
			price: defaultPlan.price,
			features: defaultPlan.features,
			hardLimitsEnforced: false,
			hardLimitsUnavailableReason: "billing_provider_unavailable",
			billing: getBillingStatus(),
		};

		planCache.set(_website.id, {
			expiresAt: Date.now() + PLAN_CACHE_FAILURE_TTL_MS,
			plan: fallbackPlan,
		});

		return fallbackPlan;
	}
}
