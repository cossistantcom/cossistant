#!/usr/bin/env bun

import { Polar } from "@polar-sh/sdk";
import { Client } from "pg";

type PlanName = "free" | "hobby" | "pro";

type WebsiteRow = {
	id: string;
	organizationId: string;
};

type WebsiteSubscription = {
	id: string;
	productId: string;
	status: string;
	metadata?: Record<string, unknown>;
	createdAt?: string;
	currentPeriodStart?: string;
};

const PLAN_RANK: Record<PlanName, number> = {
	free: 0,
	hobby: 1,
	pro: 2,
};

const DEFAULT_PRODUCTS = {
	hobbySandbox: "b060ff1e-c2dd-4c02-a3e4-395d7cce84a0",
	hobbyProduction: "758ff687-1254-422f-9b4a-b23d39c6b47e",
	proSandbox: "c87aa036-2f0b-40da-9338-1a1fcc191543",
	proProduction: "f34bf87c-96ab-4e54-9167-c4de8527669a",
} as const;

function getEnv(name: string, fallback = ""): string {
	const value = process.env[name];
	if (value == null) {
		return fallback;
	}
	return value;
}

function isProduction(): boolean {
	return getEnv("NODE_ENV") === "production";
}

function getProductIds(): Record<PlanName, string> {
	const production = isProduction();
	return {
		free: production
			? getEnv("POLAR_PRODUCT_ID_FREE_PRODUCTION", "")
			: getEnv("POLAR_PRODUCT_ID_FREE_SANDBOX", ""),
		hobby: production
			? getEnv(
					"POLAR_PRODUCT_ID_HOBBY_PRODUCTION",
					DEFAULT_PRODUCTS.hobbyProduction
				)
			: getEnv("POLAR_PRODUCT_ID_HOBBY_SANDBOX", DEFAULT_PRODUCTS.hobbySandbox),
		pro: production
			? getEnv(
					"POLAR_PRODUCT_ID_PRO_PRODUCTION",
					DEFAULT_PRODUCTS.proProduction
				)
			: getEnv("POLAR_PRODUCT_ID_PRO_SANDBOX", DEFAULT_PRODUCTS.proSandbox),
	};
}

function getPlanByProductId(
	productId: string,
	productIds: Record<PlanName, string>
): PlanName | null {
	if (productId === productIds.free) {
		return "free";
	}
	if (productId === productIds.hobby) {
		return "hobby";
	}
	if (productId === productIds.pro) {
		return "pro";
	}
	return null;
}

function isPaidPlan(plan: PlanName | null): plan is "hobby" | "pro" {
	return plan === "hobby" || plan === "pro";
}

function getWebsiteIdFromMetadata(
	metadata: Record<string, unknown> | undefined
) {
	if (!(metadata && typeof metadata === "object")) {
		return null;
	}

	const value = metadata.websiteId;
	if (typeof value === "string") {
		return value;
	}
	if (typeof value === "number") {
		return String(value);
	}
	return null;
}

function isUnscopedPaidSubscription(params: {
	subscription: WebsiteSubscription;
	productIds: Record<PlanName, string>;
}): boolean {
	if (getWebsiteIdFromMetadata(params.subscription.metadata) !== null) {
		return false;
	}

	return isPaidPlan(
		getPlanByProductId(params.subscription.productId, params.productIds)
	);
}

function toDateNumber(value: string | undefined): number {
	if (!value) {
		return 0;
	}
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? 0 : parsed;
}

function pickWinningSubscription(params: {
	subscriptions: WebsiteSubscription[];
	productIds: Record<PlanName, string>;
}): WebsiteSubscription | null {
	const ranked = [...params.subscriptions].sort((a, b) => {
		const planA = getPlanByProductId(a.productId, params.productIds);
		const planB = getPlanByProductId(b.productId, params.productIds);
		const rankA = planA ? PLAN_RANK[planA] : -1;
		const rankB = planB ? PLAN_RANK[planB] : -1;
		if (rankA !== rankB) {
			return rankB - rankA;
		}

		const activeDiff =
			Number(b.status === "active") - Number(a.status === "active");
		if (activeDiff !== 0) {
			return activeDiff;
		}

		const periodDiff =
			toDateNumber(b.currentPeriodStart) - toDateNumber(a.currentPeriodStart);
		if (periodDiff !== 0) {
			return periodDiff;
		}

		return toDateNumber(b.createdAt) - toDateNumber(a.createdAt);
	});

	return ranked[0] ?? null;
}

async function createSubscription(params: {
	polar: Polar;
	customerId: string;
	websiteId: string;
	freeProductId: string;
	dryRun: boolean;
}): Promise<{ id: string | null; dryRun: boolean }> {
	if (params.dryRun) {
		return {
			id: null,
			dryRun: true,
		};
	}

	const created = await params.polar.subscriptions.create({
		customerId: params.customerId,
		productId: params.freeProductId,
		metadata: {
			websiteId: params.websiteId,
		},
	});

	return {
		id: created.id,
		dryRun: false,
	};
}

async function run() {
	const apply = process.argv.includes("--apply");
	const dryRun = !apply;

	const productIds = getProductIds();
	if (!productIds.free) {
		throw new Error(
			"Missing free product ID. Set POLAR_PRODUCT_ID_FREE_SANDBOX/POLAR_PRODUCT_ID_FREE_PRODUCTION before running backfill."
		);
	}

	const pgClient = new Client({
		host: getEnv("DATABASE_HOST"),
		port: Number(getEnv("DATABASE_PORT", "5432")),
		user: getEnv("DATABASE_USERNAME"),
		password: getEnv("DATABASE_PASSWORD"),
		database: getEnv("DATABASE_NAME"),
		ssl: isProduction() ? { rejectUnauthorized: false } : false,
	});

	await pgClient.connect();

	const polar = new Polar({
		accessToken: getEnv("POLAR_ACCESS_TOKEN"),
		server: isProduction() ? "production" : "sandbox",
	});

	const websitesResult = await pgClient.query<{
		id: string;
		organization_id: string;
	}>(
		"select id, organization_id from website where deleted_at is null order by created_at asc"
	);

	const websites: WebsiteRow[] = websitesResult.rows.map((row) => ({
		id: row.id,
		organizationId: row.organization_id,
	}));
	const websiteCountByOrganization = new Map<string, number>();
	for (const website of websites) {
		websiteCountByOrganization.set(
			website.organizationId,
			(websiteCountByOrganization.get(website.organizationId) ?? 0) + 1
		);
	}

	const summary = {
		totalWebsites: websites.length,
		missingCustomer: 0,
		createdFree: 0,
		dryRunCreates: 0,
		deduped: 0,
		dryRunDedupes: 0,
		unscopedPaidSubscriptions: 0,
		singleWebsiteRepairCandidates: 0,
		skippedFreeDueToUnscopedPaid: 0,
		errors: 0,
	};
	const reportedUnscopedPaidSubscriptionIds = new Set<string>();

	console.log(
		`[backfill-free-subscriptions] starting ${dryRun ? "dry-run" : "apply"} for ${websites.length} websites`
	);

	for (const website of websites) {
		try {
			const customer = await polar.customers.getExternal({
				externalId: website.organizationId,
			});

			if (!customer) {
				summary.missingCustomer += 1;
				console.error("[backfill-free-subscriptions] missing customer", {
					organizationId: website.organizationId,
					websiteId: website.id,
				});
				continue;
			}

			const state = await polar.customers.getState({ id: customer.id });
			const activeSubscriptions = (state?.activeSubscriptions ?? []).map(
				(sub): WebsiteSubscription => ({
					id: sub.id,
					productId: sub.productId,
					status: sub.status,
					metadata: sub.metadata,
					createdAt:
						sub.createdAt instanceof Date
							? sub.createdAt.toISOString()
							: undefined,
					currentPeriodStart:
						sub.currentPeriodStart instanceof Date
							? sub.currentPeriodStart.toISOString()
							: undefined,
				})
			);

			const websiteSubscriptions = activeSubscriptions.filter(
				(sub) => getWebsiteIdFromMetadata(sub.metadata) === website.id
			);
			const unscopedPaidSubscriptions = activeSubscriptions.filter(
				(subscription) =>
					isUnscopedPaidSubscription({
						subscription,
						productIds,
					})
			);

			for (const subscription of unscopedPaidSubscriptions) {
				if (reportedUnscopedPaidSubscriptionIds.has(subscription.id)) {
					continue;
				}

				reportedUnscopedPaidSubscriptionIds.add(subscription.id);
				summary.unscopedPaidSubscriptions += 1;

				const organizationWebsiteCount =
					websiteCountByOrganization.get(website.organizationId) ?? 0;
				const plan = getPlanByProductId(subscription.productId, productIds);

				if (organizationWebsiteCount === 1) {
					summary.singleWebsiteRepairCandidates += 1;
					console.warn(
						"[backfill-free-subscriptions] unscoped paid subscription can be manually attached to the organization's only website",
						{
							organizationId: website.organizationId,
							websiteId: website.id,
							subscriptionId: subscription.id,
							plan,
							productId: subscription.productId,
							currentMetadata: subscription.metadata ?? {},
							suggestedMetadata: {
								...(subscription.metadata ?? {}),
								websiteId: website.id,
							},
						}
					);
					continue;
				}

				console.warn(
					"[backfill-free-subscriptions] unscoped paid subscription requires manual website assignment review",
					{
						organizationId: website.organizationId,
						organizationWebsiteCount,
						subscriptionId: subscription.id,
						plan,
						productId: subscription.productId,
						currentMetadata: subscription.metadata ?? {},
					}
				);
			}

			if (websiteSubscriptions.length === 0) {
				if (unscopedPaidSubscriptions.length > 0) {
					summary.skippedFreeDueToUnscopedPaid += 1;
					console.warn(
						"[backfill-free-subscriptions] skipped free subscription because organization has unscoped paid subscription",
						{
							organizationId: website.organizationId,
							websiteId: website.id,
							unscopedPaidSubscriptionIds: unscopedPaidSubscriptions.map(
								(subscription) => subscription.id
							),
						}
					);
					continue;
				}

				const created = await createSubscription({
					polar,
					customerId: customer.id,
					websiteId: website.id,
					freeProductId: productIds.free,
					dryRun,
				});

				if (created.dryRun) {
					summary.dryRunCreates += 1;
					console.log(
						"[backfill-free-subscriptions] would create free subscription",
						{
							organizationId: website.organizationId,
							websiteId: website.id,
						}
					);
				} else {
					summary.createdFree += 1;
					console.log(
						"[backfill-free-subscriptions] created free subscription",
						{
							organizationId: website.organizationId,
							websiteId: website.id,
							subscriptionId: created.id,
						}
					);
				}
				continue;
			}

			if (websiteSubscriptions.length === 1) {
				continue;
			}

			const winner = pickWinningSubscription({
				subscriptions: websiteSubscriptions,
				productIds,
			});

			if (!winner) {
				continue;
			}

			const losers = websiteSubscriptions.filter((sub) => sub.id !== winner.id);
			if (losers.length === 0) {
				continue;
			}

			if (dryRun) {
				summary.dryRunDedupes += 1;
				console.log("[backfill-free-subscriptions] would revoke duplicates", {
					organizationId: website.organizationId,
					websiteId: website.id,
					keep: winner.id,
					revoke: losers.map((sub) => sub.id),
				});
				continue;
			}

			for (const loser of losers) {
				await polar.subscriptions.revoke({ id: loser.id });
			}

			summary.deduped += 1;
			console.log(
				"[backfill-free-subscriptions] revoked duplicate subscriptions",
				{
					organizationId: website.organizationId,
					websiteId: website.id,
					keep: winner.id,
					revoked: losers.map((sub) => sub.id),
				}
			);
		} catch (error) {
			summary.errors += 1;
			console.error("[backfill-free-subscriptions] website failed", {
				organizationId: website.organizationId,
				websiteId: website.id,
				error,
			});
		}
	}

	console.log("[backfill-free-subscriptions] done", summary);
	await pgClient.end();
}

run().catch((error) => {
	console.error("[backfill-free-subscriptions] fatal", error);
	process.exit(1);
});
