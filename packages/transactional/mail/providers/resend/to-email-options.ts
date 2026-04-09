import type { CreateEmailOptions } from "resend";
import type { PreparedMail } from "../../core/types";

export function toResendEmailOptions(mail: PreparedMail): CreateEmailOptions {
	if (!(mail.html || mail.text)) {
		throw new Error(
			"Resend transport requires at least one rendered email body."
		);
	}

	const resendOptions = {
		to: mail.to,
		from: mail.from,
		subject: mail.subject,
		...(mail.html ? { html: mail.html } : {}),
		...(mail.text ? { text: mail.text } : {}),
	} as CreateEmailOptions;

	if (mail.bcc) {
		resendOptions.bcc = mail.bcc;
	}

	if (mail.cc) {
		resendOptions.cc = mail.cc;
	}

	if (mail.replyTo) {
		resendOptions.replyTo = mail.replyTo;
	}

	if (mail.headers) {
		resendOptions.headers = mail.headers;
	}

	if (mail.scheduledAt) {
		resendOptions.scheduledAt = mail.scheduledAt;
	}

	if (mail.tags) {
		resendOptions.tags = mail.tags;
	}

	if (mail.attachments) {
		resendOptions.attachments = mail.attachments.map((attachment) => ({
			filename: attachment.filename,
			content: attachment.content,
		}));
	}

	return resendOptions;
}
