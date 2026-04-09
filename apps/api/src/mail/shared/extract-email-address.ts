export function extractEmailAddress(raw: string): string | null {
	const trimmed = raw.trim();
	const angleStart = trimmed.lastIndexOf("<");
	const angleEnd = trimmed.lastIndexOf(">");

	if (angleStart !== -1 && angleEnd !== -1 && angleEnd > angleStart + 1) {
		return trimmed.slice(angleStart + 1, angleEnd).trim();
	}

	if (trimmed.includes("@")) {
		return trimmed;
	}

	return null;
}
