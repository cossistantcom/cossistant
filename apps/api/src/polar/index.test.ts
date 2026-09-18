import { afterEach, beforeEach, expect, it, mock, spyOn } from "bun:test";
import { createHmac } from "node:crypto";

const secret = "whsec_cG9sYXItdGVzdC1zZWNyZXQ=";
const getCustomer = mock(async (_id: string) => ({ external_id: "org-1" }));
mock.module("@api/env", () => ({ env: { POLAR_WEBHOOK_SECRET: secret } }));
mock.module("@api/lib/polar", () => ({
	default: { customers: { get: getCustomer } },
}));
const { polarRouters } = await import("./index");

beforeEach(() => getCustomer.mockClear());
afterEach(() => mock.restore());

function deliver(
	body: string,
	options: { invalid?: boolean; standardKey?: boolean; version?: string } = {}
) {
	const timestamp = String(Math.floor(Date.now() / 1000));
	const id = "event-1";
	const key = options.standardKey
		? Buffer.from(secret.slice(6), "base64")
		: secret;
	const signature = createHmac("sha256", key)
		.update(`${id}.${timestamp}.${body}`)
		.digest("base64");
	return polarRouters.request("/webhooks", {
		method: "POST",
		body,
		headers: {
			"webhook-id": id,
			"webhook-timestamp": timestamp,
			"webhook-signature": options.invalid ? "v1,invalid" : `v1,${signature}`,
			"webhook-api-version": options.version ?? "2026-04",
		},
	});
}

it.each([false, true])(
	"handles a signed subscription with standard key=%s",
	async (standardKey) => {
		const log = spyOn(console, "log").mockImplementation(() => {});
		const response = await deliver(
			JSON.stringify({
				type: "subscription.active",
				api_version: "2026-04",
				data: {
					id: "sub-1",
					customer_id: "customer-1",
					product_id: "product-1",
					status: "active",
					metadata: { websiteId: "site-1" },
				},
			}),
			{ standardKey }
		);
		expect(response.status).toBe(200);
		expect(getCustomer).toHaveBeenCalledWith("customer-1");
		expect(log).toHaveBeenCalledWith(
			"[Polar Webhook] subscription.active",
			expect.objectContaining({
				customerId: "customer-1",
				productId: "product-1",
				organizationId: "org-1",
				websiteId: "site-1",
			})
		);
	}
);

it("reads snake_case customer state and accepts historical signed redeliveries", async () => {
	const log = spyOn(console, "log").mockImplementation(() => {});
	const response = await deliver(
		JSON.stringify({
			type: "customer.state_changed",
			data: {
				id: "customer-1",
				external_id: "org-1",
				active_subscriptions: [{ id: "sub-1" }],
				granted_benefits: [],
			},
		}),
		{ version: "" }
	);
	expect(response.status).toBe(200);
	expect(log).toHaveBeenCalledWith(
		"[Polar Webhook] customer.state_changed",
		expect.objectContaining({
			organizationId: "org-1",
			activeSubscriptionsCount: 1,
			grantedBenefitsCount: 0,
		})
	);
});

it("rejects invalid signatures without processing the payload", async () => {
	spyOn(console, "error").mockImplementation(() => {});
	expect(
		(await deliver('{"type":"subscription.active"}', { invalid: true })).status
	).toBe(403);
	expect(getCustomer).not.toHaveBeenCalled();
});

it.each(["{invalid", '{"type":"unsupported.event","data":{}}'])(
	"rejects a signed invalid payload: %s",
	async (body) => {
		spyOn(console, "error").mockImplementation(() => {});
		expect((await deliver(body)).status).toBe(400);
	}
);
