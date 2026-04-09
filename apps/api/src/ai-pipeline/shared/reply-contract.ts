function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

export function normalizePublicReplyText(text: string): string {
	return normalizeWhitespace(text);
}

export function isQuestionOnlyPublicReply(text: string): boolean {
	const normalized = normalizeWhitespace(text);
	if (!normalized.endsWith("?")) {
		return false;
	}

	const segments = normalized
		.match(/[^.!?]+[.!?]?/g)
		?.map((segment) => normalizeWhitespace(segment))
		.filter((segment) => segment.length > 0) ?? [normalized];

	let sawQuestion = false;

	for (const segment of segments) {
		const lastCharacter = segment.at(-1);
		if (lastCharacter === "?") {
			sawQuestion = true;
			continue;
		}

		return false;
	}

	return sawQuestion;
}

export function hasUsefulPublicReply(texts: readonly string[]): boolean {
	return texts.some((text) => {
		const normalized = normalizeWhitespace(text);
		return normalized.length > 0 && !isQuestionOnlyPublicReply(normalized);
	});
}
