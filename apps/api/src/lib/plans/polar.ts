import polarClient from "@api/lib/polar";
import { getRedis } from "@api/redis";
import { isPolarEnabled } from "../billing-mode";
import type { PlanName } from "./config";
import { getPlanConfig, mapPolarProductToPlan } from "./config";

const WEBSITE_SUBSCRIPTION_LOCK_PREFIX = "plan:website-subscription:lock";
const WEBSITE_SUBSCRIPTION_LOCK_TTL_MS = 10_000;

type WebsiteSubscriptionStatus = "active" | "trialing" | string;

const PLAN_RANK: Record<PlanName, number> = {
	free: 0,
	hobby: 1,
	pro: 2,
};

export type CustomerState = {
	customerId: string;
	activeSubscriptions: Array<{
		id: string;
		productId: string;
		productName?: string;
		status: WebsiteSubscriptionStatus;
		metadata?: Record<string, unknown>;
		createdAt?: string | null;
		currentPeriodStart?: string | null;
	}>;
	grantedBenefits: Array<{
		id: string;
		benefitId: string;
		benefitType: string;
	}>;
};

export type WebsiteSubscription = CustomerState["activeSubscriptions"][number];

export class PolarCustomerInvariantViolationError extends Error {
	readonly organizationId: string;

	constructor(organizationId: string) {
		super(
			`Polar customer missing for organization=${organizationId}. This violates billing invariants.`
		);
		this.name = "PolarCustomerInvariantViolationError";
		this.organizationId = organizationId;
	}
}

export type WebsiteSubscriptionUpdateFailureReason =
	| "payment_required"
	| "not_found"
	| "config_error"
	| "failed";

export type WebsiteSubscriptionUpdateResult =
	| { status: "updated"; subscriptionId: string }
	| {
			status: WebsiteSubscriptionUpdateFailureReason;
			message: string;
	  };

export type EnsureFreeSubscriptionResult = {
	status: "created" | "already_exists" | "skipped_lock_contention";
	subscriptionId: string | null;
	revokedSubscriptionIds: string[];
};

type RedisLike = {
	get: (key: string) => Promise<string | null>;
	set: (
		key: string,
		value: string,
		...args: Array<string | number>
	) => Promise<string | null>;
	del: (...keys: string[]) => Promise<number>;
};

function toIso(value: Date | string | null | undefined): string | null {
	if (!value) {
		return null;
	}

	if (typeof value === "string") {
		return value;
	}

	return value.toISOString();
}

function toDateNumber(value: string | null | undefined): number {
	if (!value) {
		return 0;
	}
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? 0 : parsed;
}

function getPlanNameFromSubscription(
	subscription: WebsiteSubscription
): PlanName | null {
	return mapPolarProductToPlan(
		subscription.productName,
		subscription.productId
	);
}

function getPlanRankFromSubscription(
	subscription: WebsiteSubscription
): number {
	const plan = getPlanNameFromSubscription(subscription);
	if (!plan) {
		return -1;
	}
	return PLAN_RANK[plan];
}

function getWebsiteIdFromSubscription(
	subscription: WebsiteSubscription
): string | null {
	if (!(subscription.metadata && typeof subscription.metadata === "object")) {
		return null;
	}

	const value = subscription.metadata.websiteId;
	if (typeof value === "string") {
		return value;
	}
	if (typeof value === "number") {
		return String(value);
	}
	return null;
}

function rankSubscriptionsForWebsite(
	subscriptions: WebsiteSubscription[]
): WebsiteSubscription[] {
	return [...subscriptions].sort((a, b) => {
		const rankDiff =
			getPlanRankFromSubscription(b) - getPlanRankFromSubscription(a);
		if (rankDiff !== 0) {
			return rankDiff;
		}

		// Prefer fully active over trialing when ranks match.
		const activeDiff =
			Number(b.status === "active") - Number(a.status === "active");
		if (activeDiff !== 0) {
			return activeDiff;
		}

		// Prefer newer subscriptions as tie-breaker.
		const periodDiff =
			toDateNumber(b.currentPeriodStart) - toDateNumber(a.currentPeriodStart);
		if (periodDiff !== 0) {
			return periodDiff;
		}

		return toDateNumber(b.createdAt) - toDateNumber(a.createdAt);
	});
}

function buildWebsiteSubscriptionLockKey(websiteId: string): string {
	return `${WEBSITE_SUBSCRIPTION_LOCK_PREFIX}:${websiteId}`;
}

async function releaseWebsiteLock(params: {
	redis: RedisLike;
	lockKey: string;
	lockToken: string;
}): Promise<void> {
	try {
		const currentToken = await params.redis.get(params.lockKey);
		if (currentToken === params.lockToken) {
			await params.redis.del(params.lockKey);
		}
	} catch {
		// Best effort.
	}
}

function stringifyError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

function classifySubscriptionUpdateError(
	error: unknown
): WebsiteSubscriptionUpdateFailureReason {
	const payload = stringifyError(error).toLowerCase();
	const statusCode =
		typeof error === "object" &&
		error &&
		"statusCode" in error &&
		typeof (error as { statusCode?: unknown }).statusCode === "number"
			? (error as { statusCode: number }).statusCode
			: undefined;

	if (statusCode === 402) {
		return "payment_required";
	}

	if (
		payload.includes("payment") ||
		payload.includes("payment_method") ||
		payload.includes("card") ||
		payload.includes("requires_payment") ||
		payload.includes("requires_action")
	) {
		return "payment_required";
	}

	if (
		statusCode === 404 ||
		(payload.includes("subscription") && payload.includes("not found"))
	) {
		return "not_found";
	}

	if (
		payload.includes("product") &&
		(payload.includes("not found") ||
			payload.includes("invalid") ||
			payload.includes("unknown"))
	) {
		return "config_error";
	}

	return "failed";
}

/**
 * Get customer by organization ID (using external ID).
 */
export async function getCustomerByOrganizationId(
	organizationId: string
): Promise<{ id: string } | null> {
	if (!isPolarEnabled()) {
		return null;
	}

	try {
		const customer = await polarClient.customers.getExternal({
			externalId: organizationId,
		});

		if (!customer) {
			return null;
		}

		return { id: customer.id };
	} catch (error) {
		console.error("Error getting customer by organization ID:", error);
		return null;
	}
}

export async function requireCustomerByOrganizationId(
	organizationId: string
): Promise<{ id: string }> {
	const customer = await getCustomerByOrganizationId(organizationId);
	if (!customer) {
		throw new PolarCustomerInvariantViolationError(organizationId);
	}
	return customer;
}

/**
 * @deprecated Use getCustomerByOrganizationId instead.
 */
export async function getCustomerByWebsiteId(
	websiteId: string
): Promise<{ id: string } | null> {
	return getCustomerByOrganizationId(websiteId);
}

/**
 * Get customer state from Polar API.
 */
export async function getCustomerState(
	customerId: string
): Promise<CustomerState | null> {
	if (!isPolarEnabled()) {
		return null;
	}

	try {
		const state = await polarClient.customers.getState({
			id: customerId,
		});

		if (!state) {
			return null;
		}

		return {
			customerId: state.id,
			activeSubscriptions:
				state.activeSubscriptions?.map(
					(sub: {
						id: string;
						productId: string;
						status: string;
						metadata?: Record<string, unknown>;
						createdAt?: Date | string | null;
						currentPeriodStart?: Date | string | null;
					}) => ({
						id: sub.id,
						productId: sub.productId,
						productName: undefined,
						status: sub.status,
						metadata: sub.metadata,
						createdAt: toIso(sub.createdAt),
						currentPeriodStart: toIso(sub.currentPeriodStart),
					})
				) ?? [],
			grantedBenefits:
				state.grantedBenefits?.map(
					(benefit: {
						id: string;
						benefitId: string;
						benefitType: string;
					}) => ({
						id: benefit.id,
						benefitId: benefit.benefitId,
						benefitType: benefit.benefitType,
					})
				) ?? [],
		};
	} catch (error) {
		console.error("Error getting customer state:", error);
		return null;
	}
}

/**
 * Get customer state by organization ID.
 */
export async function getCustomerStateByOrganizationId(
	organizationId: string
): Promise<CustomerState | null> {
	const customer = await getCustomerByOrganizationId(organizationId);

	if (!customer) {
		return null;
	}

	return getCustomerState(customer.id);
}

export function getSubscriptionsForWebsite(
	customerState: CustomerState | null,
	websiteId: string
): WebsiteSubscription[] {
	if (!customerState) {
		return [];
	}

	return rankSubscriptionsForWebsite(
		customerState.activeSubscriptions.filter(
			(sub) => getWebsiteIdFromSubscription(sub) === websiteId
		)
	);
}

/**
 * Get preferred subscription for a specific website from customer state.
 */
export function getSubscriptionForWebsite(
	customerState: CustomerState | null,
	websiteId: string
): WebsiteSubscription | null {
	return getSubscriptionsForWebsite(customerState, websiteId)[0] ?? null;
}

export function getUnscopedPaidSubscriptions(
	customerState: CustomerState | null
): WebsiteSubscription[] {
	if (!customerState) {
		return [];
	}

	return rankSubscriptionsForWebsite(
		customerState.activeSubscriptions.filter((subscription) => {
			if (getWebsiteIdFromSubscription(subscription) !== null) {
				return false;
			}

			const plan = getPlanNameFromSubscription(subscription);
			return plan === "hobby" || plan === "pro";
		})
	);
}

export type WebsiteDeletionSubscriptionPartition = {
	freeToRevoke: WebsiteSubscription[];
	blockingPaidOrUnknown: WebsiteSubscription[];
};

export function partitionWebsiteSubscriptionsForDeletion(
	customerState: CustomerState | null,
	websiteId: string
): WebsiteDeletionSubscriptionPartition {
	const subscriptions = getSubscriptionsForWebsite(customerState, websiteId);
	const freeToRevoke: WebsiteSubscription[] = [];
	const blockingPaidOrUnknown: WebsiteSubscription[] = [];

	for (const subscription of subscriptions) {
		const mappedPlan = mapPolarProductToPlan(
			subscription.productName,
			subscription.productId
		);

		if (mappedPlan === "free") {
			freeToRevoke.push(subscription);
			continue;
		}

		blockingPaidOrUnknown.push(subscription);
	}

	return {
		freeToRevoke,
		blockingPaidOrUnknown,
	};
}

/**
 * Get website subscription by organization + website IDs.
 */
export async function getWebsiteSubscription(params: {
	organizationId: string;
	websiteId: string;
}): Promise<WebsiteSubscription | null> {
	const state = await getCustomerStateByOrganizationId(params.organizationId);
	return getSubscriptionForWebsite(state, params.websiteId);
}

export async function normalizeWebsiteSubscriptions(params: {
	organizationId: string;
	websiteId: string;
}): Promise<{
	subscription: WebsiteSubscription | null;
	revokedSubscriptionIds: string[];
}> {
	if (!isPolarEnabled()) {
		return {
			subscription: null,
			revokedSubscriptionIds: [],
		};
	}

	const state = await getCustomerStateByOrganizationId(params.organizationId);
	const subscriptions = getSubscriptionsForWebsite(state, params.websiteId);
	const preferred = subscriptions[0] ?? null;

	if (subscriptions.length <= 1 || !preferred) {
		return {
			subscription: preferred,
			revokedSubscriptionIds: [],
		};
	}

	const revokedSubscriptionIds: string[] = [];
	for (const subscription of subscriptions) {
		if (subscription.id === preferred.id) {
			continue;
		}

		try {
			await polarClient.subscriptions.revoke({
				id: subscription.id,
			});
			revokedSubscriptionIds.push(subscription.id);
		} catch (error) {
			console.error(
				`[plans] Failed to revoke duplicate subscription id=${subscription.id} for website=${params.websiteId}:`,
				error
			);
		}
	}

	return {
		subscription: preferred,
		revokedSubscriptionIds,
	};
}

export async function ensureFreeSubscriptionForWebsite(params: {
	organizationId: string;
	websiteId: string;
}): Promise<EnsureFreeSubscriptionResult> {
	if (!isPolarEnabled()) {
		return {
			status: "already_exists",
			subscriptionId: null,
			revokedSubscriptionIds: [],
		};
	}

	const freePlan = getPlanConfig("free");
	if (!freePlan.polarProductId) {
		throw new Error(
			"Free plan product ID is not configured. Set POLAR_PRODUCT_ID_FREE_SANDBOX/POLAR_PRODUCT_ID_FREE_PRODUCTION."
		);
	}

	const customer = await requireCustomerByOrganizationId(params.organizationId);
	const redis = getRedis() as unknown as RedisLike;
	const lockKey = buildWebsiteSubscriptionLockKey(params.websiteId);
	const lockToken = `${params.websiteId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

	const lockAcquired =
		(await redis.set(
			lockKey,
			lockToken,
			"PX",
			WEBSITE_SUBSCRIPTION_LOCK_TTL_MS,
			"NX"
		)) === "OK";

	if (!lockAcquired) {
		return {
			status: "skipped_lock_contention",
			subscriptionId: null,
			revokedSubscriptionIds: [],
		};
	}

	try {
		const normalized = await normalizeWebsiteSubscriptions({
			organizationId: params.organizationId,
			websiteId: params.websiteId,
		});

		if (normalized.subscription) {
			return {
				status: "already_exists",
				subscriptionId: normalized.subscription.id,
				revokedSubscriptionIds: normalized.revokedSubscriptionIds,
			};
		}

		const created = await polarClient.subscriptions.create({
			customerId: customer.id,
			productId: freePlan.polarProductId,
			metadata: {
				websiteId: params.websiteId,
			},
		});

		return {
			status: "created",
			subscriptionId: created.id,
			revokedSubscriptionIds: normalized.revokedSubscriptionIds,
		};
	} finally {
		await releaseWebsiteLock({
			redis,
			lockKey,
			lockToken,
		});
	}
}

export async function updateWebsiteSubscriptionProduct(params: {
	subscriptionId: string;
	productId: string;
	prorationBehavior?: "invoice" | "prorate";
}): Promise<WebsiteSubscriptionUpdateResult> {
	if (!isPolarEnabled()) {
		return {
			status: "failed",
			message: "Polar billing is disabled for this deployment.",
		};
	}

	try {
		const updated = await polarClient.subscriptions.update({
			id: params.subscriptionId,
			subscriptionUpdate: {
				productId: params.productId,
				prorationBehavior: params.prorationBehavior ?? "invoice",
			},
		});

		return {
			status: "updated",
			subscriptionId: updated.id,
		};
	} catch (error) {
		return {
			status: classifySubscriptionUpdateError(error),
			message: stringifyError(error),
		};
	}
}

/**
 * @deprecated Use getCustomerStateByOrganizationId instead.
 */
export async function getCustomerStateByWebsiteId(
	websiteId: string
): Promise<CustomerState | null> {
	return getCustomerStateByOrganizationId(websiteId);
}

/**
 * Get product details from Polar to map to plan.
 */
export async function getProductDetails(productId: string): Promise<{
	id: string;
	name: string;
} | null> {
	if (!isPolarEnabled()) {
		return null;
	}

	try {
		const product = await polarClient.products.get({ id: productId });

		if (!product) {
			return null;
		}

		return {
			id: product.id,
			name: product.name,
		};
	} catch (error) {
		console.error("Error getting product details:", error);
		return null;
	}
}

/**
 * Determine plan from customer state.
 */
export async function getPlanFromCustomerState(
	customerState: CustomerState | null
): Promise<PlanName | null> {
	if (!isPolarEnabled()) {
		return null;
	}

	if (!customerState) {
		return null;
	}

	const activeSubscription =
		rankSubscriptionsForWebsite(customerState.activeSubscriptions)[0] ?? null;
	if (!activeSubscription) {
		return null;
	}

	const product = await getProductDetails(activeSubscription.productId);
	if (!product) {
		return null;
	}

	return mapPolarProductToPlan(product.name, product.id);
}
