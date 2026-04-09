import { env } from "@api/env";
import {
	normalizeResendInboundEvent,
	normalizeResendLifecycleEvent,
} from "@api/mail/providers/resend/normalize";
import type { ResendWebhookEvent } from "@api/mail/providers/resend/types";
import {
	findParsedInboundReplyAddress,
	handleReceivedEmail,
} from "@api/mail/shared/inbound";
import { handleLifecycleEmailEvent } from "@api/mail/shared/lifecycle";
import { resend } from "@cossistant/transactional";
import type { Context } from "hono";
import { Hono } from "hono";

const resendRouters = new Hono();

resendRouters.post("/webhooks", async (c: Context) => {
	try {
		const payload = await c.req.text();

		const result = resend.webhooks.verify({
			payload,
			headers: {
				id: c.req.raw.headers.get("svix-id") ?? "",
				timestamp: c.req.raw.headers.get("svix-timestamp") ?? "",
				signature: c.req.raw.headers.get("svix-signature") ?? "",
			},
			webhookSecret: env.RESEND_WEBHOOK_SECRET,
		}) as ResendWebhookEvent;

		console.log("[Resend Webhook] Verified webhook:", result.type);

		await processResendWebhookEvent(result);

		return c.json({ received: true }, 200);
	} catch (error) {
		console.error("[Resend Webhook] Error processing webhook:", error);
		return c.json({ error: "Internal server error" }, 400);
	}
});

async function processResendWebhookEvent(
	event: ResendWebhookEvent
): Promise<void> {
	if (event.type === "email.received") {
		await handleResendEmailReceived(event);
		return;
	}

	const normalized = normalizeResendLifecycleEvent(event);

	if (!normalized) {
		console.log(
			`[Resend Webhook] Received ${event.type} event for ${event.data.to[0] ?? "unknown"}`
		);
		return;
	}

	if (event.type === "email.delivered") {
		console.log(
			`[Resend Webhook] Received ${event.type} event for ${normalized.recipientEmail}`
		);
		return;
	}

	await handleLifecycleEmailEvent(normalized);
}

async function handleResendEmailReceived(
	event: ResendWebhookEvent
): Promise<void> {
	const inboundMatch = findParsedInboundReplyAddress(event.data.to);

	if (!inboundMatch) {
		console.warn(
			"[Resend Webhook] email.received event without a recognized inbound reply address"
		);
		return;
	}

	if (!resend) {
		console.warn(
			"[Resend Webhook] Resend client not initialized, unable to fetch received email content"
		);
		return;
	}

	const receivedEmailResult = await resend.emails.receiving.get(
		event.data.email_id
	);
	const receivedEmail =
		(
			receivedEmailResult as {
				data?: { text?: string | null; html?: string | null };
			}
		).data ??
		(receivedEmailResult as { text?: string | null; html?: string | null });

	if (!receivedEmail) {
		console.warn(
			`[Resend Webhook] Unable to retrieve received email content for id ${event.data.email_id}`
		);
		return;
	}

	await handleReceivedEmail(
		normalizeResendInboundEvent({
			event,
			inboundAddress: inboundMatch.address,
			text: receivedEmail.text,
			html: receivedEmail.html,
		})
	);
}

export { resendRouters };
