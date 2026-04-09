import type { MailProvider } from "@api/mail/config";

export type MailLifecycleEventPayload = {
	eventType:
		| "email.delivered"
		| "email.bounced"
		| "email.complained"
		| "email.failed";
	eventId: string;
	occurredAt: string;
	recipientEmail: string;
	messageId?: string | null;
	bounce?: {
		type: string;
		subType?: string | null;
		message?: string | null;
	} | null;
	failure?: {
		reason: string;
	} | null;
	provider?: MailProvider;
};

export type ReceivedEmailPayload = {
	eventType: "email.received";
	from: string;
	to: string[];
	subject: string;
	messageId?: string | null;
	receivedAt: string;
	text?: string | null;
	html?: string | null;
	textWithoutSignature?: string | null;
	inboundAddress?: string | null;
	s3Bucket?: string | null;
	s3Key?: string | null;
	provider?: MailProvider;
};
