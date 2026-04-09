import type {
	MailLifecycleEventPayload,
	ReceivedEmailPayload,
} from "@api/mail/shared/types";
import type { ResendWebhookEvent } from "./types";

export function normalizeResendLifecycleEvent(
	event: ResendWebhookEvent
): MailLifecycleEventPayload | null {
	const recipientEmail = event.data.to[0];

	if (!recipientEmail) {
		return null;
	}

	switch (event.type) {
		case "email.bounced":
			return {
				eventType: "email.bounced",
				eventId: event.data.email_id,
				occurredAt: event.created_at,
				recipientEmail,
				messageId: event.data.message_id ?? null,
				bounce: event.data.bounce
					? {
							type: event.data.bounce.type,
							subType: event.data.bounce.subType ?? null,
							message: event.data.bounce.message ?? null,
						}
					: null,
				provider: "resend",
			};

		case "email.complained":
			return {
				eventType: "email.complained",
				eventId: event.data.email_id,
				occurredAt: event.created_at,
				recipientEmail,
				messageId: event.data.message_id ?? null,
				provider: "resend",
			};

		case "email.failed":
			return {
				eventType: "email.failed",
				eventId: event.data.email_id,
				occurredAt: event.created_at,
				recipientEmail,
				messageId: event.data.message_id ?? null,
				failure: event.data.failed
					? {
							reason: event.data.failed.reason,
						}
					: null,
				provider: "resend",
			};

		case "email.delivered":
			return {
				eventType: "email.delivered",
				eventId: event.data.email_id,
				occurredAt: event.created_at,
				recipientEmail,
				messageId: event.data.message_id ?? null,
				provider: "resend",
			};

		default:
			return null;
	}
}

export function normalizeResendInboundEvent(params: {
	event: ResendWebhookEvent;
	inboundAddress: string;
	text?: string | null;
	html?: string | null;
}): ReceivedEmailPayload {
	return {
		eventType: "email.received",
		from: params.event.data.from,
		to: params.event.data.to,
		subject: params.event.data.subject,
		messageId: params.event.data.message_id ?? params.event.data.email_id,
		receivedAt: params.event.created_at,
		text: params.text,
		html: params.html,
		inboundAddress: params.inboundAddress,
		provider: "resend",
	};
}
