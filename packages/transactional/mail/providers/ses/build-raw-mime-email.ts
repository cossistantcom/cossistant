import { randomBytes } from "node:crypto";
import type { EmailAttachment, PreparedMail } from "../../core/types";

function createBoundary(prefix: string) {
	return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function normalizeNewlines(value: string) {
	return value.replace(/\r?\n/g, "\r\n");
}

function encodeHeaderValue(value: string) {
	const hasNonAscii = Array.from(value).some(
		(character) => (character.codePointAt(0) ?? 0) > 0x7f
	);
	if (!hasNonAscii) {
		return value;
	}

	return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function encodeBodyBase64(value: string) {
	return Buffer.from(normalizeNewlines(value), "utf8")
		.toString("base64")
		.replace(/(.{76})/g, "$1\r\n");
}

function inferContentType(filename?: string) {
	if (!filename) {
		return "application/octet-stream";
	}

	const normalized = filename.toLowerCase();
	if (normalized.endsWith(".pdf")) {
		return "application/pdf";
	}

	if (normalized.endsWith(".png")) {
		return "image/png";
	}

	if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
		return "image/jpeg";
	}

	if (normalized.endsWith(".gif")) {
		return "image/gif";
	}

	if (normalized.endsWith(".txt")) {
		return "text/plain";
	}

	if (normalized.endsWith(".csv")) {
		return "text/csv";
	}

	return "application/octet-stream";
}

function attachmentToPart(attachment: EmailAttachment, boundary: string) {
	const filename = attachment.filename || "attachment";
	const rawContent = attachment.content;
	const contentBuffer = Buffer.isBuffer(rawContent)
		? rawContent
		: Buffer.from(rawContent ?? "", "utf8");
	const encodedContent = contentBuffer
		.toString("base64")
		.replace(/(.{76})/g, "$1\r\n");

	return [
		`--${boundary}`,
		`Content-Type: ${inferContentType(filename)}; name="${filename}"`,
		"Content-Transfer-Encoding: base64",
		`Content-Disposition: attachment; filename="${filename}"`,
		"",
		encodedContent,
	].join("\r\n");
}

function buildAlternativeBody(mail: PreparedMail, boundary: string) {
	const parts: string[] = [];

	if (mail.text) {
		parts.push(
			[
				`--${boundary}`,
				'Content-Type: text/plain; charset="UTF-8"',
				"Content-Transfer-Encoding: base64",
				"",
				encodeBodyBase64(mail.text),
			].join("\r\n")
		);
	}

	if (mail.html) {
		parts.push(
			[
				`--${boundary}`,
				'Content-Type: text/html; charset="UTF-8"',
				"Content-Transfer-Encoding: base64",
				"",
				encodeBodyBase64(mail.html),
			].join("\r\n")
		);
	}

	return [...parts, `--${boundary}--`].join("\r\n");
}

export function buildRawMimeEmail(mail: PreparedMail) {
	const headers: string[] = [
		`From: ${encodeHeaderValue(mail.from)}`,
		`To: ${mail.to.join(", ")}`,
		`Subject: ${encodeHeaderValue(mail.subject)}`,
		"MIME-Version: 1.0",
	];

	if (mail.cc && mail.cc.length > 0) {
		headers.push(`Cc: ${mail.cc.join(", ")}`);
	}

	if (mail.replyTo && mail.replyTo.length > 0) {
		headers.push(`Reply-To: ${mail.replyTo.join(", ")}`);
	}

	if (mail.headers) {
		for (const [name, value] of Object.entries(mail.headers)) {
			headers.push(`${name}: ${value}`);
		}
	}

	const hasAttachments = Boolean(
		mail.attachments && mail.attachments.length > 0
	);
	const alternativeBoundary = createBoundary("alt");

	if (!hasAttachments) {
		headers.push(
			`Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`
		);

		const body = buildAlternativeBody(mail, alternativeBoundary);
		return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}`, "utf8");
	}

	const mixedBoundary = createBoundary("mixed");
	headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);

	const mixedParts = [
		`--${mixedBoundary}`,
		`Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
		"",
		buildAlternativeBody(mail, alternativeBoundary),
	];

	for (const attachment of mail.attachments ?? []) {
		mixedParts.push(attachmentToPart(attachment, mixedBoundary));
	}

	mixedParts.push(`--${mixedBoundary}--`);

	return Buffer.from(
		`${headers.join("\r\n")}\r\n\r\n${mixedParts.join("\r\n")}`,
		"utf8"
	);
}
