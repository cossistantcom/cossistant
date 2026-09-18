import { env } from "@api/env";
import polarClient from "@api/lib/polar";
import { webhooks } from "@polar-sh/sdk/2026-04";
import type { Context } from "hono";
import { Hono } from "hono";

const polarRouters = new Hono();

polarRouters.post("/webhooks", async (c: Context) => {
	try {
		// Get raw body as string for webhook verification
		const rawBody = await c.req.text();

		// Convert Hono headers to Record<string, string>
		const headers: Record<string, string> = {};
		c.req.raw.headers.forEach((value, key) => {
			headers[key] = value;
		});

		// Validate the webhook event
		const payload = await webhooks.validateEvent(
			rawBody,
			headers,
			env.POLAR_WEBHOOK_SECRET
		);

		const eventType = payload.type;

		// Handle subscription events
		if (
			eventType === "subscription.created" ||
			eventType === "subscription.updated" ||
			eventType === "subscription.active" ||
			eventType === "subscription.canceled" ||
			eventType === "subscription.revoked" ||
			eventType === "subscription.uncanceled"
		) {
			const subscription = payload.data;
			const websiteId = subscription.metadata?.websiteId;
			const customerId = subscription.customer_id;

			// Fetch customer to get organizationId (externalId)
			let organizationId: string | undefined;
			try {
				const customer = await polarClient.customers.get(customerId);
				organizationId = customer?.external_id ?? undefined;
			} catch (error) {
				console.error("[Polar Webhook] Failed to fetch customer:", error);
			}

			console.log(`[Polar Webhook] ${eventType}`, {
				subscriptionId: subscription.id,
				productId: subscription.product_id,
				status: subscription.status,
				websiteId,
				organizationId,
				customerId,
				metadata: subscription.metadata,
			});

			// Log specific subscription event types
			switch (eventType) {
				case "subscription.created":
					console.log(
						`[Polar] New subscription created for website ${websiteId} in organization ${organizationId}`
					);
					break;
				case "subscription.updated":
					console.log(
						`[Polar] Subscription ${subscription.id} updated - Status: ${subscription.status}`
					);
					break;
				case "subscription.active":
					console.log(
						`[Polar] Subscription ${subscription.id} is now active for website ${websiteId}`
					);
					break;
				case "subscription.canceled":
					console.log(
						`[Polar] Subscription ${subscription.id} canceled for website ${websiteId}`
					);
					break;
				case "subscription.revoked":
					console.log(
						`[Polar] Subscription ${subscription.id} revoked for website ${websiteId}`
					);
					break;
				case "subscription.uncanceled":
					console.log(
						`[Polar] Subscription ${subscription.id} uncanceled for website ${websiteId}`
					);
					break;
				default:
					break;
			}
		}

		// Handle checkout events
		else if (
			eventType === "checkout.created" ||
			eventType === "checkout.updated"
		) {
			const checkout = payload.data;
			const websiteId = checkout.metadata?.websiteId;

			console.log(`[Polar Webhook] ${eventType}`, {
				checkoutId: checkout.id,
				productId: checkout.product_id,
				websiteId,
				metadata: checkout.metadata,
			});
		}

		// Handle order events
		else if (eventType === "order.created" || eventType === "order.paid") {
			const order = payload.data;
			const websiteId = order.metadata?.websiteId;

			console.log(`[Polar Webhook] ${eventType}`, {
				orderId: order.id,
				productId: order.product_id,
				websiteId,
				metadata: order.metadata,
			});
		}

		// Handle customer state changes
		else if (eventType === "customer.state_changed") {
			const customer = payload.data;
			const organizationId = customer.external_id;

			console.log(`[Polar Webhook] ${eventType}`, {
				customerId: customer.id,
				organizationId,
				activeSubscriptionsCount: customer.active_subscriptions?.length ?? 0,
				grantedBenefitsCount: customer.granted_benefits?.length ?? 0,
			});
		}

		// Log all other events
		else {
			console.log(`[Polar Webhook] ${eventType}`, {
				eventType,
				data: payload.data,
			});
		}

		// Return 200 to acknowledge receipt
		return c.json({ received: true }, 200);
	} catch (error) {
		if (error instanceof webhooks.PolarWebhookVerificationError) {
			console.error("[Polar Webhook] Verification failed:", error.message);
			return c.json({ error: "Webhook verification failed" }, 403);
		}

		if (error instanceof webhooks.PolarWebhookError) {
			console.error("[Polar Webhook] Invalid payload:", error.message);
			return c.json({ error: "Invalid webhook payload" }, 400);
		}

		console.error("[Polar Webhook] Error processing webhook:", error);
		return c.json({ error: "Internal server error" }, 500);
	}
});

export { polarRouters };
