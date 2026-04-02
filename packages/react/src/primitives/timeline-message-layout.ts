import { parseMarkdown } from "@plasma/tiny-markdown/utils";
import { mapInlineCommandFromParagraphChildren } from "./command-block-utils";

/**
 * Detects whether message text includes fenced code content that should use
 * the expanded timeline bubble layout.
 */
export function hasExpandedTimelineContent(
	text: string | null | undefined
): boolean {
	if (!text || text.trim().length === 0) {
		return false;
	}

	const tokens = parseMarkdown(text);
	return tokens.some((token) => {
		if (token.type === "code" && token.inline === false) {
			return true;
		}

		if (token.type === "p") {
			return mapInlineCommandFromParagraphChildren(token.children) !== null;
		}

		return false;
	});
}
