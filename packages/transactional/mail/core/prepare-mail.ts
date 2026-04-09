import { getDefaultFromAddress, getDefaultReplyToAddress } from "./config";
import { renderMailContent } from "./render";
import type { MailSendOptions, PreparedMail } from "./types";

function toAddressList(value?: string | string[]): string[] | undefined {
	if (!value) {
		return;
	}

	const items = Array.isArray(value) ? value : [value];
	const normalized = items.map((item) => item.trim()).filter(Boolean);

	return normalized.length > 0 ? normalized : undefined;
}

export async function prepareMail(
	options: MailSendOptions
): Promise<PreparedMail> {
	const {
		to,
		from,
		variant = "notifications",
		bcc,
		cc,
		replyTo,
		subject,
		scheduledAt,
		headers = {},
		tags,
		attachments,
	} = options;

	const content = await renderMailContent(options);
	const prepared: PreparedMail = {
		to: toAddressList(to) ?? [],
		from: from || getDefaultFromAddress(variant),
		subject,
		headers: Object.keys(headers).length > 0 ? headers : undefined,
		html: content.html,
		text: content.text,
		scheduledAt,
		tags,
		attachments,
	};

	const normalizedBcc = toAddressList(bcc);
	if (normalizedBcc) {
		prepared.bcc = normalizedBcc;
	}

	const normalizedCc = toAddressList(cc);
	if (normalizedCc) {
		prepared.cc = normalizedCc;
	}

	if (replyTo !== "noreply") {
		prepared.replyTo = toAddressList(replyTo || getDefaultReplyToAddress());
	}

	if (variant === "marketing") {
		prepared.headers = {
			...(prepared.headers ?? {}),
			"List-Unsubscribe": "<https://cossistant.com/email/unsubscribe>",
			"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
		};
	}

	return prepared;
}
