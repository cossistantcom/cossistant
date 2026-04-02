import { db } from "@api/db";
import { getConversationById } from "@api/db/queries/conversation";
import {
	recordEmailBounce,
	recordEmailComplaint,
	recordEmailFailure,
} from "@api/db/queries/email-bounce";
import { contact, member, user } from "@api/db/schema";
import { env } from "@api/env";
import {
	type ParsedInboundReplyAddress,
	parseInboundReplyAddress,
} from "@api/utils/email-threading";
import {
	logEmailBounce,
	logEmailComplaint,
	logEmailFailure,
} from "@api/utils/notification-monitoring";
import { triggerMessageNotificationWorkflow } from "@api/utils/send-message-with-notification";
import { createMessageTimelineItem } from "@api/utils/timeline-item";
import { resend } from "@plasma/transactional";
import { ConversationTimelineType } from "@plasma/types";
import { and, eq } from "drizzle-orm";
import EmailReplyParser from "email-reply-parser";
import type { Context } from "hono";
import { Hono } from "hono";

const resendRouters = new Hono();

type ResendWebhookEvent = {
	type:
		| "email.sent"
		| "email.delivered"
		| "email.bounced"
		| "email.complained"
		| "email.failed"
		| "email.opened"
		| "email.clicked"
		| "email.received";
	created_at: string;
	data: {
		email_id: string;
		from: string;
		to: string[];
		subject: string;
		message_id?: string;
		bounce?: {
			type: string;
			subType?: string;
			message?: string;
		};
		failed?: {
			reason: string;
		};
		// Additional fields...
	};
};

function extractEmailAddress(raw: string): string | null {
	const trimmed = raw.trim();
	const angleStart = trimmed.lastIndexOf("<");
	const angleEnd = trimmed.lastIndexOf(">");

	if (angleStart !== -1 && angleEnd !== -1 && angleEnd > angleStart + 1) {
		return trimmed.slice(angleStart + 1, angleEnd).trim();
	}

	// Fallback: if there are no angle brackets, assume the whole string is an email
	if (trimmed.includes("@")) {
		return trimmed;
	}

	return null;
}

resendRouters.post("/webhooks", async (c: Context) => {
	try {
		// Get raw body as string for webhook verification
		const payload = await c.req.text();

		// Convert Hono headers to Record<string, string>
		const headers: Record<string, string> = {};
		c.req.raw.headers.forEach((value, key) => {
			headers[key] = value;
		});

		// Throws an error if the webhook is invalid
		// Otherwise, returns the parsed payload object
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

		// Process the webhook event
		await processWebhookEvent(result);

		// Return 200 to acknowledge receipt
		return c.json({ received: true }, 200);
	} catch (error) {
		console.error("[Resend Webhook] Error processing webhook:", error);
		return c.json({ error: "Internal server error" }, 400);
	}
});

/**
 * Process Resend webhook events
 * Handles bounce, complaint, and failure events to protect email reputation
 */
async function processWebhookEvent(event: ResendWebhookEvent): Promise<void> {
	const { type, data } = event;

	// Receiving emails (inbound replies) are handled separately
	if (type === "email.received") {
		await handleEmailReceived(event);
		return;
	}

	// Extract recipient email (use first recipient)
	const recipientEmail = data.to[0];
	if (!recipientEmail) {
		console.warn("[Resend Webhook] No recipient email found in event");
		return;
	}

	// We need to determine the organization ID from the email or context
	// For now, we'll need to query the database to find which organization this email belongs to
	// This is a simplified approach - in production, you might want to include org ID in email tags
	const organizationId = await getOrganizationIdFromEmail(recipientEmail);

	if (!organizationId) {
		console.warn(
			`[Resend Webhook] Could not determine organization for email ${recipientEmail}`
		);
		return;
	}

	switch (type) {
		case "email.bounced":
			if (data.bounce) {
				await recordEmailBounce(db, {
					email: recipientEmail,
					organizationId,
					bounceType: data.bounce.type,
					bounceSubType: data.bounce.subType,
					bounceMessage: data.bounce.message,
					eventId: data.email_id,
				});
				logEmailBounce({
					email: recipientEmail,
					organizationId,
					bounceType: data.bounce.type,
				});
			}
			break;

		case "email.complained":
			await recordEmailComplaint(db, {
				email: recipientEmail,
				organizationId,
				eventId: data.email_id,
			});
			logEmailComplaint({
				email: recipientEmail,
				organizationId,
			});
			break;

		case "email.failed":
			if (data.failed) {
				await recordEmailFailure(db, {
					email: recipientEmail,
					organizationId,
					failureReason: data.failed.reason,
					eventId: data.email_id,
				});
				logEmailFailure({
					email: recipientEmail,
					organizationId,
					reason: data.failed.reason,
				});
			}
			break;

		default:
			// Log other events for monitoring but don't process them
			console.log(
				`[Resend Webhook] Received ${type} event for ${recipientEmail}`
			);
	}
}

async function handleEmailReceived(event: ResendWebhookEvent): Promise<void> {
	const { data } = event;

	if (!Array.isArray(data.to) || data.to.length === 0) {
		console.warn("[Resend Webhook] email.received event has no recipients");
		return;
	}

	// Find the inbound.plasma-pandora.com recipient we encoded the conversation into
	const inboundRecipient = data.to.find((address) =>
		address.toLowerCase().endsWith("@inbound.plasma-pandora.com")
	);

	if (!inboundRecipient) {
		console.warn(
			"[Resend Webhook] email.received event without inbound.plasma-pandora.com recipient"
		);
		return;
	}

	const parsed: ParsedInboundReplyAddress | null =
		parseInboundReplyAddress(inboundRecipient);

	if (!parsed) {
		console.warn(
			`[Resend Webhook] Failed to parse inbound reply address: ${inboundRecipient}`
		);
		return;
	}

	const isProdEnv = env.NODE_ENV === "production";
	const isInboundProd = parsed.environment === "production";

	// Only process events that match the current runtime environment
	if (isProdEnv !== isInboundProd) {
		console.log(
			`[Resend Webhook] Skipping email.received for conversation ${parsed.conversationId} due to environment mismatch (parsed=${parsed.environment}, env=${env.NODE_ENV})`
		);
		return;
	}

	const conversation = await getConversationById(db, {
		conversationId: parsed.conversationId,
	});

	if (!conversation) {
		console.warn(
			`[Resend Webhook] Conversation not found for inbound reply: ${parsed.conversationId}`
		);
		return;
	}

	if (!resend) {
		console.warn(
			"[Resend Webhook] Resend client not initialized, unable to fetch received email content"
		);
		return;
	}

	// Fetch the full email content (HTML, text, headers) using the Receiving API
	// See https://resend.com/docs/dashboard/receiving/get-email-content
	const receivedEmailResult = await resend.emails.receiving.get(data.email_id);
	// SDKs typically return { data, error }, but be defensive in case of different shapes
	const receivedEmail =
		(
			receivedEmailResult as {
				data?: { text?: string | null; html?: string | null };
			}
		).data ??
		(receivedEmailResult as { text?: string | null; html?: string | null });

	if (!receivedEmail) {
		console.warn(
			`[Resend Webhook] Unable to retrieve received email content for id ${data.email_id}`
		);
		return;
	}

	const messageText = sanitizeIncomingEmailBody({
		textBody: receivedEmail.text,
		htmlBody: receivedEmail.html,
	});

	if (!messageText) {
		console.warn(
			`[Resend Webhook] Received email ${data.email_id} has no usable body content`
		);
		return;
	}

	const senderEmail = extractEmailAddress(data.from);

	let timelineUserId: string | null = null;
	let timelineVisitorId: string | null = conversation.visitorId;

	if (senderEmail) {
		const [memberMatch] = await db
			.select({
				userId: user.id,
			})
			.from(user)
			.innerJoin(member, eq(member.userId, user.id))
			.where(
				and(
					eq(user.email, senderEmail),
					eq(member.organizationId, conversation.organizationId)
				)
			)
			.limit(1);

		if (memberMatch) {
			timelineUserId = memberMatch.userId;
			timelineVisitorId = null;
		}
	}

	// Create a new public message on the conversation as if sent by the visitor/contact
	const { item: createdTimelineItem, actor } = await createMessageTimelineItem({
		db,
		organizationId: conversation.organizationId,
		websiteId: conversation.websiteId,
		conversationId: conversation.id,
		conversationOwnerVisitorId: conversation.visitorId,
		text: messageText,
		extraParts: [{ type: "metadata", source: "email" }],
		userId: timelineUserId,
		visitorId: timelineVisitorId,
		aiAgentId: null,
	});

	if (actor) {
		try {
			await triggerMessageNotificationWorkflow({
				conversationId: conversation.id,
				messageId: createdTimelineItem.id,
				websiteId: conversation.websiteId,
				organizationId: conversation.organizationId,
				actor,
			});
		} catch (error) {
			console.error(
				`[Resend Webhook] Failed to trigger workflow for inbound email message ${createdTimelineItem.id}`,
				error
			);
		}
	}

	console.log(
		`[Resend Webhook] Created timeline message from inbound email for conversation ${conversation.id}`
	);
}

function sanitizeIncomingEmailBody({
	textBody,
	htmlBody,
}: {
	textBody?: string | null;
	htmlBody?: string | null;
}): string | null {
	const parser = new EmailReplyParser();

	const normalizedText = textBody?.trim() ?? "";
	if (normalizedText) {
		const parsed = parser.parseReply(normalizedText).trim();
		if (parsed) {
			return parsed;
		}
	}

	const normalizedHtml = htmlBody?.trim() ?? "";

	if (!normalizedHtml) {
		return null;
	}

	const htmlAsText = normalizedHtml
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.replace(/[\u200B-\u200D\uFEFF]/g, "")
		.trim();

	const parsed = parser.parseReply(htmlAsText).trim();

	return parsed || null;
}

/**
 * Get organization ID from recipient email
 * This queries the database to find which organization the email belongs to
 */
async function getOrganizationIdFromEmail(
	email: string
): Promise<string | null> {
	try {
		// Check if email belongs to a user (member)
		const [userResult] = await db
			.select({
				userId: user.id,
			})
			.from(user)
			.where(eq(user.email, email))
			.limit(1);

		if (userResult) {
			// Get member info for this user
			const [memberResult] = await db
				.select({
					organizationId: member.organizationId,
				})
				.from(member)
				.where(eq(member.userId, userResult.userId))
				.limit(1);

			if (memberResult?.organizationId) {
				return memberResult.organizationId;
			}
		}

		// Check if email belongs to a contact (visitor)
		const [contactResult] = await db
			.select({
				organizationId: contact.organizationId,
			})
			.from(contact)
			.where(eq(contact.email, email))
			.limit(1);

		if (contactResult?.organizationId) {
			return contactResult.organizationId;
		}

		return null;
	} catch (error) {
		console.error(
			`[Resend Webhook] Error finding organization for email ${email}:`,
			error
		);
		return null;
	}
}

export { resendRouters };
