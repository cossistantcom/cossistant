import { env } from "@api/env";
import {
	sesEventEnvelopeSchema,
	sesInboundEnvelopeSchema,
} from "@api/mail/providers/ses/payloads";
import { verifyWebhookSignature } from "@api/mail/providers/ses/webhook-auth";
import { handleReceivedEmail } from "@api/mail/shared/inbound";
import { handleLifecycleEmailEvent } from "@api/mail/shared/lifecycle";
import type {
	MailLifecycleEventPayload,
	ReceivedEmailPayload,
} from "@api/mail/shared/types";
import type { Context } from "hono";
import { Hono } from "hono";

const sesRouters = new Hono();

sesRouters.post("/webhooks/events", async (c: Context) => {
	const payload = await c.req.text();

	if (!isValidWebhookRequest(c, payload)) {
		return c.json({ error: "Invalid webhook signature" }, 401);
	}

	try {
		const parsed = sesEventEnvelopeSchema.parse(JSON.parse(payload));
		const events = Array.isArray(parsed) ? parsed : [parsed];

		for (const event of events) {
			if (event.eventType === "email.delivered") {
				continue;
			}

			await handleLifecycleEmailEvent(event as MailLifecycleEventPayload);
		}

		return c.json({ received: true }, 200);
	} catch (error) {
		console.error("[SES Webhook] Failed to process lifecycle webhook:", error);
		return c.json({ error: "Invalid SES lifecycle webhook payload" }, 400);
	}
});

sesRouters.post("/webhooks/inbound", async (c: Context) => {
	const payload = await c.req.text();

	if (!isValidWebhookRequest(c, payload)) {
		return c.json({ error: "Invalid webhook signature" }, 401);
	}

	try {
		const parsed = sesInboundEnvelopeSchema.parse(JSON.parse(payload));
		const events = Array.isArray(parsed) ? parsed : [parsed];

		for (const event of events) {
			await handleReceivedEmail(event as ReceivedEmailPayload);
		}

		return c.json({ received: true }, 200);
	} catch (error) {
		console.error("[SES Webhook] Failed to process inbound webhook:", error);
		return c.json({ error: "Invalid SES inbound webhook payload" }, 400);
	}
});

function isValidWebhookRequest(c: Context, rawBody: string): boolean {
	return verifyWebhookSignature({
		secret: env.SES_WEBHOOK_SECRET,
		timestamp: c.req.header("x-cossistant-timestamp") ?? null,
		signature: c.req.header("x-cossistant-signature") ?? null,
		rawBody,
	});
}

export { sesRouters };
