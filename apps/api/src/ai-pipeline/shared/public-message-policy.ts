export const MAX_PUBLIC_MESSAGE_CHARS = 1200;
export const MAX_PUBLIC_MESSAGE_NON_EMPTY_LINES = 12;

export const MAX_SCOPE_BOUNDARY_REDIRECT_CHARS = 280;
export const MAX_SCOPE_BOUNDARY_REDIRECT_NON_EMPTY_LINES = 2;

export type PublicMessageValidationOptions = {
	maxChars?: number;
	maxNonEmptyLines?: number;
};

export function countNonEmptyLines(text: string): number {
	return text.split(/\r?\n/u).filter((line) => line.trim().length > 0).length;
}

export function getPublicMessageValidationError(
	text: string,
	options: PublicMessageValidationOptions = {}
): string | null {
	const trimmedText = text.trim();
	const maxChars = options.maxChars ?? MAX_PUBLIC_MESSAGE_CHARS;
	const maxNonEmptyLines =
		options.maxNonEmptyLines ?? MAX_PUBLIC_MESSAGE_NON_EMPTY_LINES;

	if (!trimmedText) {
		return "Message is empty";
	}

	if (trimmedText.length > maxChars) {
		return `Message must be ${maxChars} characters or fewer`;
	}

	if (countNonEmptyLines(trimmedText) > maxNonEmptyLines) {
		return `Message must be ${maxNonEmptyLines} non-empty lines or fewer`;
	}

	return null;
}

export function getScopeBoundaryRedirectValidationError(
	text: string
): string | null {
	return getPublicMessageValidationError(text, {
		maxChars: MAX_SCOPE_BOUNDARY_REDIRECT_CHARS,
		maxNonEmptyLines: MAX_SCOPE_BOUNDARY_REDIRECT_NON_EMPTY_LINES,
	});
}
