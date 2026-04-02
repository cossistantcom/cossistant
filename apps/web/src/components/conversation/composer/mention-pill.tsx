"use client";

import type { Mention } from "@plasma/tiny-markdown";

// Zero Width Space - must match the marker in mention-store.ts
const MENTION_END_MARKER = "\u200B";

export type MentionPillProps = {
	mention: Mention;
};

/**
 * Styled pill for displaying a mention.
 * Shows @Name in an orange pill.
 * Includes invisible marker at the end to match textarea text length.
 */
export function MentionPill({ mention }: MentionPillProps) {
	const colorClass =
		mention.type === "tool"
			? "bg-primary/15 text-primary"
			: "bg-plasma-orange/15 text-plasma-orange";

	return (
		<span
			className={`rounded font-medium ${colorClass}`}
			data-mention-id={mention.id}
			data-mention-type={mention.type}
		>
			@{mention.name}
			{MENTION_END_MARKER}
		</span>
	);
}
