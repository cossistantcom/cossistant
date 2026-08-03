import { describe, expect, it } from "bun:test";
import { getPlanConfig } from "./config";
import {
	type CustomerState,
	getSubscriptionForWebsite,
	getSubscriptionsForWebsite,
	getUnscopedPaidSubscriptions,
	partitionWebsiteSubscriptionsForDeletion,
} from "./polar";

function buildState(
	subscriptions: CustomerState["activeSubscriptions"]
): CustomerState {
	return {
		customerId: "cus_123",
		activeSubscriptions: subscriptions,
		grantedBenefits: [],
	};
}

describe("plans/polar website subscription resolution", () => {
	it("prefers highest-tier plan when duplicates exist", () => {
		const state = buildState([
			{
				id: "sub_free",
				productId: "free-product",
				status: "active",
				metadata: { websiteId: "site_1" },
			},
			{
				id: "sub_hobby",
				productId: "b060ff1e-c2dd-4c02-a3e4-395d7cce84a0",
				status: "active",
				metadata: { websiteId: "site_1" },
			},
			{
				id: "sub_pro",
				productId: "c87aa036-2f0b-40da-9338-1a1fcc191543",
				status: "trialing",
				metadata: { websiteId: "site_1" },
			},
		]);

		const selected = getSubscriptionForWebsite(state, "site_1");
		expect(selected?.id).toBe("sub_pro");
	});

	it("prefers active over trialing for same plan tier", () => {
		const state = buildState([
			{
				id: "sub_trialing",
				productId: "c87aa036-2f0b-40da-9338-1a1fcc191543",
				status: "trialing",
				metadata: { websiteId: "site_1" },
			},
			{
				id: "sub_active",
				productId: "c87aa036-2f0b-40da-9338-1a1fcc191543",
				status: "active",
				metadata: { websiteId: "site_1" },
			},
		]);

		const selected = getSubscriptionForWebsite(state, "site_1");
		expect(selected?.id).toBe("sub_active");
	});

	it("returns only subscriptions matching metadata.websiteId", () => {
		const state = buildState([
			{
				id: "sub_other",
				productId: "c87aa036-2f0b-40da-9338-1a1fcc191543",
				status: "active",
				metadata: { websiteId: "site_2" },
			},
			{
				id: "sub_target",
				productId: "b060ff1e-c2dd-4c02-a3e4-395d7cce84a0",
				status: "active",
				metadata: { websiteId: "site_1" },
			},
		]);

		const filtered = getSubscriptionsForWebsite(state, "site_1");
		expect(filtered).toHaveLength(1);
		expect(filtered[0]?.id).toBe("sub_target");
	});

	it("returns unscoped paid subscriptions without treating them as website subscriptions", () => {
		const freeProductId = getPlanConfig("free").polarProductId;

		if (!freeProductId) {
			throw new Error(
				"Expected free plan product ID to be configured for tests"
			);
		}

		const state = buildState([
			{
				id: "sub_unscoped_free",
				productId: freeProductId,
				status: "active",
				metadata: {},
			},
			{
				id: "sub_unscoped_hobby",
				productId: "b060ff1e-c2dd-4c02-a3e4-395d7cce84a0",
				status: "active",
				metadata: {},
			},
			{
				id: "sub_scoped_pro",
				productId: "c87aa036-2f0b-40da-9338-1a1fcc191543",
				status: "active",
				metadata: { websiteId: "site_1" },
			},
		]);

		const unscoped = getUnscopedPaidSubscriptions(state);

		expect(unscoped.map((subscription) => subscription.id)).toEqual([
			"sub_unscoped_hobby",
		]);
		expect(
			getSubscriptionsForWebsite(state, "site_1").map((sub) => sub.id)
		).toEqual(["sub_scoped_pro"]);
	});
});

describe("plans/polar website deletion subscription partitioning", () => {
	const freeProductId = getPlanConfig("free").polarProductId;

	if (!freeProductId) {
		throw new Error("Expected free plan product ID to be configured for tests");
	}

	it("marks free subscriptions as revocable", () => {
		const state = buildState([
			{
				id: "sub_free",
				productId: freeProductId,
				status: "active",
				metadata: { websiteId: "site_1" },
			},
		]);

		const partition = partitionWebsiteSubscriptionsForDeletion(state, "site_1");
		expect(partition.freeToRevoke.map((sub) => sub.id)).toEqual(["sub_free"]);
		expect(partition.blockingPaidOrUnknown).toHaveLength(0);
	});

	it("treats paid subscriptions as blocking", () => {
		const state = buildState([
			{
				id: "sub_paid",
				productId: "b060ff1e-c2dd-4c02-a3e4-395d7cce84a0",
				status: "active",
				metadata: { websiteId: "site_1" },
			},
		]);

		const partition = partitionWebsiteSubscriptionsForDeletion(state, "site_1");
		expect(partition.freeToRevoke).toHaveLength(0);
		expect(partition.blockingPaidOrUnknown.map((sub) => sub.id)).toEqual([
			"sub_paid",
		]);
	});

	it("treats unknown product subscriptions as blocking", () => {
		const state = buildState([
			{
				id: "sub_unknown",
				productId: "unknown_product",
				status: "active",
				metadata: { websiteId: "site_1" },
			},
		]);

		const partition = partitionWebsiteSubscriptionsForDeletion(state, "site_1");
		expect(partition.freeToRevoke).toHaveLength(0);
		expect(partition.blockingPaidOrUnknown.map((sub) => sub.id)).toEqual([
			"sub_unknown",
		]);
	});

	it("returns both free revokes and blocking paid subscriptions when mixed", () => {
		const state = buildState([
			{
				id: "sub_free",
				productId: freeProductId,
				status: "active",
				metadata: { websiteId: "site_1" },
			},
			{
				id: "sub_paid",
				productId: "c87aa036-2f0b-40da-9338-1a1fcc191543",
				status: "active",
				metadata: { websiteId: "site_1" },
			},
		]);

		const partition = partitionWebsiteSubscriptionsForDeletion(state, "site_1");
		expect(partition.freeToRevoke.map((sub) => sub.id)).toEqual(["sub_free"]);
		expect(partition.blockingPaidOrUnknown.map((sub) => sub.id)).toEqual([
			"sub_paid",
		]);
	});
});
