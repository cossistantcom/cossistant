import type { Mention } from "@plasma/tiny-markdown";

/**
 * Display format for mentions in textarea: @Name followed by zero-width space
 * The zero-width space (U+200B) marks the end of the mention without being visible.
 * This allows names with spaces (like "Anthony Riera") to work correctly.
 */

// Zero Width Space - invisible marker to delimit mention end
const MENTION_END_MARKER = "\u200B";

/**
 * Stored mention data keyed by name (for lookup during conversion)
 */
export type MentionStore = Map<string, Mention>;

/**
 * Format a mention for display in textarea - @Name followed by invisible marker
 */
export function formatMentionDisplay(mention: Mention): string {
	return `@${mention.name}${MENTION_END_MARKER}`;
}

/**
 * Format a mention for sending (full markdown)
 * Format: [@Name](mention:type:id) - the @ is inside the brackets so it gets styled
 */
export function formatMentionMarkdown(mention: Mention): string {
	return `[@${mention.name}](mention:${mention.type}:${mention.id})`;
}

/**
 * Regex to find @mentions in text - matches @Name followed by the invisible marker
 * This allows names with spaces to be matched correctly.
 */
const MENTION_PATTERN = /@([^@\u200B]+)\u200B/g;

/**
 * Convert display format text to full markdown using the mention store.
 * Looks up each @Name in the store and replaces with full markdown.
 */
export function convertDisplayToMarkdown(
	text: string,
	store: MentionStore
): string {
	if (store.size === 0) {
		return text;
	}

	// Replace each @Name with full markdown if found in store
	return text.replace(MENTION_PATTERN, (match, name) => {
		const mention = store.get(name.trim());
		if (mention) {
			return formatMentionMarkdown(mention);
		}
		return match; // Keep as-is if not found in store
	});
}

/**
 * Parse display format mentions from text
 */
export function parseDisplayMentions(
	text: string,
	store: MentionStore
): Array<{
	name: string;
	start: number;
	end: number;
	raw: string;
	mention: Mention | undefined;
}> {
	const mentions: Array<{
		name: string;
		start: number;
		end: number;
		raw: string;
		mention: Mention | undefined;
	}> = [];

	for (const match of text.matchAll(MENTION_PATTERN)) {
		const name = match[1]?.trim() ?? "";
		const mention = store.get(name);
		// Only include if this name is in our store (i.e., it's a real mention, not just @word)
		if (mention) {
			mentions.push({
				name,
				start: match.index ?? 0,
				end: (match.index ?? 0) + match[0].length,
				raw: match[0],
				mention,
			});
		}
	}

	return mentions;
}

/**
 * Check if text has any stored mentions
 */
export function hasStoredMentions(text: string, store: MentionStore): boolean {
	return parseDisplayMentions(text, store).length > 0;
}
