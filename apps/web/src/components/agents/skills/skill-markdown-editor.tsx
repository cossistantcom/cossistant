"use client";

import type { Mention, MentionType } from "@plasma/tiny-markdown";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { MentionPopover } from "../../conversation/composer/mention-popover";
import {
	formatMentionDisplay,
	type MentionStore,
} from "../../conversation/composer/mention-store";
import { StyledOverlay } from "../../conversation/composer/styled-overlay";
import { useMentionEditor } from "../../conversation/composer/use-mention-editor";
import { useMentionSearch } from "../../conversation/composer/use-mention-search";

const MENTION_MARKDOWN_REGEX = /\[@([^\]]+)\]\(mention:([^:]+):([^)]+)\)/g;

export type SkillToolMention = {
	id: string;
	name: string;
	description?: string;
};

type SkillMarkdownEditorProps = {
	value: string;
	onChange: (value: string) => void;
	toolMentions: SkillToolMention[];
	placeholder?: string;
	disabled?: boolean;
	rows?: number;
	className?: string;
};

function toMentionType(value: string): MentionType {
	if (
		value === "ai-agent" ||
		value === "human-agent" ||
		value === "visitor" ||
		value === "tool"
	) {
		return value;
	}

	return "tool";
}

function toDisplayValue(
	markdownValue: string,
	mentionStore: MentionStore
): string {
	mentionStore.clear();

	return markdownValue.replace(
		MENTION_MARKDOWN_REGEX,
		(_, name: string, type: string, id: string) => {
			const mention: Mention = {
				id,
				name,
				type: toMentionType(type),
			};
			mentionStore.set(name, mention);
			return formatMentionDisplay(mention);
		}
	);
}

export function SkillMarkdownEditor({
	value,
	onChange,
	toolMentions,
	placeholder = "Write skill instructions...",
	disabled = false,
	rows = 8,
	className,
}: SkillMarkdownEditorProps) {
	const mentionStoreRef = useRef<MentionStore>(new Map());
	const [displayValue, setDisplayValue] = useState(() =>
		toDisplayValue(value, mentionStoreRef.current)
	);

	const { search: mentionSearch } = useMentionSearch({
		tools: toolMentions,
	});

	const mentionEditor = useMentionEditor({
		value: displayValue,
		onValueChange: setDisplayValue,
		mentionStoreRef,
		mentionSearch,
		onMarkdownChange: onChange,
		mentionEnabled: true,
	});

	useEffect(() => {
		const nextDisplayValue = toDisplayValue(value, mentionStoreRef.current);
		setDisplayValue((currentDisplay) =>
			currentDisplay === nextDisplayValue ? currentDisplay : nextDisplayValue
		);
	}, [value]);

	return (
		<div
			className={cn(
				"relative rounded-md border border-input bg-background-100/40 dark:bg-background-200/70",
				className
			)}
		>
			<div
				className="relative overflow-hidden"
				ref={mentionEditor.mentionViewportRef}
			>
				<MentionPopover
					anchorRef={mentionEditor.mentionViewportRef}
					caretPosition={mentionEditor.mention.caretPosition}
					highlightedIndex={mentionEditor.mention.highlightedIndex}
					isActive={mentionEditor.mention.isActive}
					isLoading={mentionEditor.mention.isLoading}
					onSelect={mentionEditor.mention.selectMention}
					results={mentionEditor.mention.results}
				/>
				{mentionEditor.hasMentions && (
					<StyledOverlay
						className="pointer-events-none absolute inset-0 whitespace-pre-wrap break-words p-3 font-mono text-sm"
						mentionStore={mentionStoreRef.current}
						ref={mentionEditor.overlayRef}
						value={displayValue}
					/>
				)}
				<textarea
					className={cn(
						"w-full resize-none overflow-y-auto border-0 bg-transparent p-3 font-mono text-sm outline-none placeholder:text-muted-foreground",
						mentionEditor.hasMentions
							? "text-transparent caret-foreground"
							: "text-foreground"
					)}
					disabled={disabled}
					onChange={mentionEditor.handleChange}
					onKeyDown={mentionEditor.handleKeyDown}
					onScroll={mentionEditor.handleScroll}
					onSelect={mentionEditor.handleSelect}
					placeholder={`${placeholder} Type @ to mention tools.`}
					ref={mentionEditor.textareaRef}
					rows={rows}
					value={displayValue}
				/>
			</div>
		</div>
	);
}
