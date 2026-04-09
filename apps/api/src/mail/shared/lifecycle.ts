import { db } from "@api/db";
import {
	recordEmailBounce,
	recordEmailComplaint,
	recordEmailFailure,
} from "@api/db/queries/email-bounce";
import { contact, member, user } from "@api/db/schema";
import {
	logEmailBounce,
	logEmailComplaint,
	logEmailFailure,
} from "@api/utils/notification-monitoring";
import { eq } from "drizzle-orm";
import type { MailLifecycleEventPayload } from "./types";

export async function handleLifecycleEmailEvent(
	event: MailLifecycleEventPayload
): Promise<void> {
	const recipientEmail = event.recipientEmail;

	if (!recipientEmail) {
		console.warn("[Mail Webhook] No recipient email found in event");
		return;
	}

	const organizationId = await getOrganizationIdFromEmail(recipientEmail);

	if (!organizationId) {
		console.warn(
			`[Mail Webhook] Could not determine organization for email ${recipientEmail}`
		);
		return;
	}

	switch (event.eventType) {
		case "email.bounced":
			if (event.bounce) {
				await recordEmailBounce(db, {
					email: recipientEmail,
					organizationId,
					bounceType: event.bounce.type,
					bounceSubType: event.bounce.subType ?? undefined,
					bounceMessage: event.bounce.message ?? undefined,
					eventId: event.eventId,
				});
				logEmailBounce({
					email: recipientEmail,
					organizationId,
					bounceType: event.bounce.type,
				});
			}
			return;

		case "email.complained":
			await recordEmailComplaint(db, {
				email: recipientEmail,
				organizationId,
				eventId: event.eventId,
			});
			logEmailComplaint({
				email: recipientEmail,
				organizationId,
			});
			return;

		case "email.failed":
			if (event.failure) {
				await recordEmailFailure(db, {
					email: recipientEmail,
					organizationId,
					failureReason: event.failure.reason,
					eventId: event.eventId,
				});
				logEmailFailure({
					email: recipientEmail,
					organizationId,
					reason: event.failure.reason,
				});
			}
			return;

		default:
			console.log(
				`[Mail Webhook] Received ${event.eventType} event for ${recipientEmail}`
			);
	}
}

async function getOrganizationIdFromEmail(
	email: string
): Promise<string | null> {
	try {
		const [userResult] = await db
			.select({
				userId: user.id,
			})
			.from(user)
			.where(eq(user.email, email))
			.limit(1);

		if (userResult) {
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
			`[Mail Webhook] Error finding organization for email ${email}:`,
			error
		);
		return null;
	}
}
