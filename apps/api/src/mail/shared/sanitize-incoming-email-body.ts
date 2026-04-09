import EmailReplyParser from "email-reply-parser";

type SanitizedEmailBodyInput = {
	textBody?: string | null;
	htmlBody?: string | null;
	textWithoutSignature?: string | null;
};

export function sanitizeIncomingEmailBody(
	input: SanitizedEmailBodyInput
): string | null {
	const parser = new EmailReplyParser();

	const normalizedWithoutSignature = input.textWithoutSignature?.trim() ?? "";
	if (normalizedWithoutSignature) {
		return normalizedWithoutSignature;
	}

	const normalizedText = input.textBody?.trim() ?? "";
	if (normalizedText) {
		const parsed = parser.parseReply(normalizedText).trim();
		if (parsed) {
			return parsed;
		}
	}

	const normalizedHtml = input.htmlBody?.trim() ?? "";
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
