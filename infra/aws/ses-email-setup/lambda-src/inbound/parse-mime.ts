import PostalMime from "postal-mime";

export type ParsedInboundEmail = {
	from: string;
	to: string[];
	subject: string;
	messageId: string | null;
	text: string | null;
	html: string | null;
};

function formatMailbox(input: unknown): string {
	if (typeof input === "string") {
		return input;
	}

	if (input && typeof input === "object") {
		const mailbox = input as { address?: string; name?: string };
		if (mailbox.name && mailbox.address) {
			return `${mailbox.name} <${mailbox.address}>`;
		}

		return mailbox.address ?? "";
	}

	return "";
}

function extractRecipients(input: unknown): string[] {
	if (!Array.isArray(input)) {
		return [];
	}

	return input
		.map((entry) => {
			if (typeof entry === "string") {
				return entry;
			}

			if (entry && typeof entry === "object" && "address" in entry) {
				return (entry as { address?: string }).address ?? "";
			}

			return "";
		})
		.filter(Boolean);
}

export async function parseMimeMessage(
	rawEmail: Uint8Array | ArrayBuffer | string
): Promise<ParsedInboundEmail> {
	const parsed = await new PostalMime().parse(rawEmail);

	return {
		from: formatMailbox(parsed.from),
		to: extractRecipients(parsed.to),
		subject: parsed.subject ?? "",
		messageId: parsed.messageId ?? null,
		text: parsed.text?.trim() || null,
		html: typeof parsed.html === "string" ? parsed.html : null,
	};
}
