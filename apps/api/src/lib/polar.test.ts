import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

mock.module("@api/env", () => ({
	env: { POLAR_ACCESS_TOKEN: "test-token", NODE_ENV: "test" },
}));
mock.module("@api/lib/billing-mode", () => ({ isPolarEnabled: () => true }));

const { createPolarClient, getPolarClient } = await import("./polar");
const { getCustomerState, updateWebsiteSubscriptionProduct } = await import(
	"./plans/polar"
);
const { getDiscountInfo } = await import("./plans/discount");

afterEach(() => mock.restore());

describe("Polar transport contract", () => {
	it("maps real SDK customer-state responses into application entitlements", async () => {
		spyOn(globalThis, "fetch").mockResolvedValue(
			Response.json({
				id: "customer-1",
				active_subscriptions: [
					{
						id: "sub-1",
						product_id: "product-1",
						status: "active",
						metadata: { websiteId: "site-1" },
						created_at: "2026-04-01T00:00:00Z",
						current_period_start: "2026-09-01T00:00:00Z",
					},
				],
				granted_benefits: [
					{ id: "grant-1", benefit_id: "benefit-1", benefit_type: "custom" },
				],
			})
		);
		expect(await getCustomerState("customer-1")).toEqual({
			customerId: "customer-1",
			activeSubscriptions: [
				{
					id: "sub-1",
					productId: "product-1",
					productName: undefined,
					status: "active",
					metadata: { websiteId: "site-1" },
					createdAt: "2026-04-01T00:00:00Z",
					currentPeriodStart: "2026-09-01T00:00:00Z",
				},
			],
			grantedBenefits: [
				{ id: "grant-1", benefitId: "benefit-1", benefitType: "custom" },
			],
		});
	});

	it.each([402, 404, 500])(
		"classifies SDK subscription failure %s",
		async (status) => {
			spyOn(globalThis, "fetch").mockResolvedValue(
				Response.json({ detail: "Request failed" }, { status })
			);
			const result = await updateWebsiteSubscriptionProduct({
				subscriptionId: "sub-1",
				productId: "product-1",
			});
			expect(result.status).toBe(
				status === 402
					? "payment_required"
					: status === 404
						? "not_found"
						: "failed"
			);
		}
	);

	it.each(["fixed", "percentage"])(
		"maps %s discounts and string timestamps",
		async (type) => {
			spyOn(globalThis, "fetch").mockResolvedValue(
				Response.json({
					id: "discount-1",
					name: "Early bird",
					code: null,
					type,
					duration: "forever",
					...(type === "fixed"
						? { amount: 900, currency: "usd" }
						: { basis_points: 1000 }),
					max_redemptions: 150,
					redemptions_count: 10,
					starts_at: "2026-04-01T00:00:00Z",
					ends_at: null,
				})
			);
			expect(await getDiscountInfo("discount-1")).toEqual({
				id: "discount-1",
				name: "Early bird",
				code: null,
				type,
				duration: "forever",
				amount: type === "fixed" ? 900 : 1000,
				currency: type === "fixed" ? "usd" : null,
				maxRedemptions: 150,
				redemptionsCount: 10,
				redemptionsLeft: 140,
				startsAt: "2026-04-01T00:00:00Z",
				endsAt: null,
			});
		}
	);
	it.each(["production", "development", "test"])(
		"pins the API version and selects the environment for %s",
		async (nodeEnv) => {
			const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(
				Response.json({ id: "customer-1" })
			);
			const client = createPolarClient({
				NODE_ENV: nodeEnv,
				POLAR_ACCESS_TOKEN: "test-token",
			});
			await client.customers.getExternal("org-1");
			const call = fetchMock.mock.calls[0];
			if (!call) {
				throw new Error("Expected a Polar request");
			}
			const [url, init] = call;
			expect(String(url)).toBe(
				`https://${nodeEnv === "production" ? "api" : "sandbox-api"}.polar.sh/v1/customers/external/org-1`
			);
			expect(new Headers(init?.headers).get("Polar-Version")).toBe("2026-04");
			expect(new Headers(init?.headers).get("Authorization")).toBe(
				"Bearer test-token"
			);
		}
	);

	it("serializes checkout, subscription, portal and usage requests", async () => {
		const fetchMock = spyOn(globalThis, "fetch").mockImplementation(
			Object.assign(
				async () =>
					Response.json({ id: "test-id", url: "https://example.com" }),
				{ preconnect: globalThis.fetch.preconnect }
			)
		);
		const client = getPolarClient();
		await client.checkouts.create({
			products: ["product-1"],
			external_customer_id: "org-1",
			metadata: { websiteId: "site-1" },
			success_url: "https://example.com/success",
			return_url: "https://example.com/return",
		});
		await client.subscriptions.update("sub-1", {
			product_id: "product-2",
			proration_behavior: "invoice",
		});
		await client.customerSessions.create({ customer_id: "customer-1" });
		await client.events.ingest({
			events: [
				{
					name: "credits",
					external_customer_id: "org-1",
					metadata: { credits: 2, websiteId: "site-1" },
				},
			],
		});
		const requests = fetchMock.mock.calls.map(([url, init]) => {
			expect(new Headers(init?.headers).get("Polar-Version")).toBe("2026-04");
			return { url: String(url), body: JSON.parse(String(init?.body)) };
		});
		expect(requests[0]?.body).toEqual({
			products: ["product-1"],
			external_customer_id: "org-1",
			metadata: { websiteId: "site-1" },
			success_url: "https://example.com/success",
			return_url: "https://example.com/return",
		});
		expect(requests[1]?.url).toEndWith("/v1/subscriptions/sub-1");
		expect(requests[1]?.body).toEqual({
			product_id: "product-2",
			proration_behavior: "invoice",
		});
		expect(requests[2]?.body).toEqual({ customer_id: "customer-1" });
		expect(requests[3]?.body).toEqual({
			events: [
				{
					name: "credits",
					external_customer_id: "org-1",
					metadata: { credits: 2, websiteId: "site-1" },
				},
			],
		});
	});

	it("rejects missing credentials only when creating a client", () => {
		expect(() =>
			createPolarClient({ NODE_ENV: "test", POLAR_ACCESS_TOKEN: "" })
		).toThrow("POLAR_ACCESS_TOKEN is required");
		expect(getPolarClient()).toBe(getPolarClient());
	});
});
