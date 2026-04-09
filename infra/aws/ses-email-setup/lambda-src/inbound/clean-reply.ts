function normalizeWhitespace(value: string) {
	return value
		.replace(/\r\n/g, "\n")
		.replace(/\u00a0/g, " ")
		.trim();
}

export function htmlToText(html?: string | null): string | null {
	if (!html) {
		return null;
	}

	const normalized = html
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/p>/gi, "\n\n")
		.replace(/<[^>]+>/g, " ")
		.replace(/\n[ \t]+/g, "\n")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.replace(/[ \t]{2,}/g, " ");

	return normalizeWhitespace(normalized) || null;
}

export function cleanReplyText(text?: string | null): string | null {
	if (!text) {
		return null;
	}

	let cleaned = normalizeWhitespace(text);

	const cutMarkers = [
		/\nOn .+ wrote:\n/i,
		/\nFrom:\s.+/i,
		/\nSent from my .+/i,
		/\n--\s*\n/,
	];

	for (const marker of cutMarkers) {
		cleaned = cleaned.split(marker, 1)[0] ?? cleaned;
	}

	cleaned = cleaned
		.replace(/\n>.*$/gms, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();

	return cleaned || null;
}
