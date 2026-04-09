import {
	type SqsEvent,
	unwrapSnsMessagesFromSqsEvent,
} from "../common/sns-sqs";
import { postSignedWebhook } from "../common/webhook-client";
import { cleanReplyText, htmlToText } from "./clean-reply";
import { fetchRawEmail } from "./fetch-raw-email";
import { parseMimeMessage } from "./parse-mime";

type SESInboundNotification = {
	mail?: {
		messageId?: string;
		timestamp?: string;
		destination?: string[];
	};
	receipt?: {
		recipients?: string[];
		action?: {
			bucketName?: string;
			objectKey?: string;
		};
	};
};

type InboundWebhookPayload = {
	eventType: "email.received";
	provider: "ses";
	from: string;
	to: string[];
	subject: string;
	messageId: string | null;
	receivedAt: string;
	text: string | null;
	html: string | null;
	textWithoutSignature: string | null;
	inboundAddress: string | null;
	s3Bucket: string;
	s3Key: string;
};

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? "";
const WEBHOOK_TIMEOUT_MS = Number.parseInt(
	process.env.WEBHOOK_TIMEOUT_MS ?? "15000",
	10
);
const WEBHOOK_URL = process.env.WEBHOOK_URL ?? "";

export async function handler(event: SqsEvent) {
	const notifications =
		unwrapSnsMessagesFromSqsEvent<SESInboundNotification>(event);
	const payloads: InboundWebhookPayload[] = [];

	for (const notification of notifications) {
		const bucketName = notification.receipt?.action?.bucketName;
		const objectKey = notification.receipt?.action?.objectKey;

		if (!(bucketName && objectKey)) {
			console.warn("Skipping SES inbound notification without S3 location");
			continue;
		}

		const rawEmail = await fetchRawEmail({ bucketName, objectKey });
		const parsedEmail = await parseMimeMessage(rawEmail);
		const readableText = parsedEmail.text ?? htmlToText(parsedEmail.html);
		const recipients =
			parsedEmail.to.length > 0
				? parsedEmail.to
				: [
						...(notification.receipt?.recipients ?? []),
						...(notification.mail?.destination ?? []),
					].filter(Boolean);

		payloads.push({
			eventType: "email.received",
			provider: "ses",
			from: parsedEmail.from,
			to: recipients,
			subject: parsedEmail.subject,
			messageId: parsedEmail.messageId ?? notification.mail?.messageId ?? null,
			receivedAt: notification.mail?.timestamp ?? new Date().toISOString(),
			text: readableText,
			html: parsedEmail.html,
			textWithoutSignature: cleanReplyText(readableText),
			inboundAddress: recipients[0] ?? null,
			s3Bucket: bucketName,
			s3Key: objectKey,
		});
	}

	if (payloads.length > 0) {
		await postSignedWebhook({
			url: WEBHOOK_URL,
			secret: WEBHOOK_SECRET,
			eventName: "email.received",
			payload: payloads.length === 1 ? payloads[0] : payloads,
			timeoutMs: WEBHOOK_TIMEOUT_MS,
		});
	}

	return { processed: payloads.length };
}
