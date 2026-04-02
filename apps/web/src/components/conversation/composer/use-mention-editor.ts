"use client";

import {
	type Mention,
	type UseTinyMentionReturn,
	useTinyMention,
} from "@plasma/tiny-markdown";
import type {
	ChangeEvent,
	KeyboardEvent,
	MutableRefObject,
	RefObject,
	SyntheticEvent,
} from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
	convertDisplayToMarkdown,
	formatMentionDisplay,
	type MentionStore,
	parseDisplayMentions,
} from "./mention-store";

type MentionSearch = (query: string) => Mention[] | Promise<Mention[]>;

export type UseMentionEditorOptions = {
	value: string;
	onValueChange: (value: string) => void;
	mentionStoreRef: MutableRefObject<MentionStore>;
	mentionSearch: MentionSearch;
	onMarkdownChange?: (markdownValue: string) => void;
	mentionEnabled?: boolean;
};

export type UseMentionEditorReturn = {
	textareaRef: RefObject<HTMLTextAreaElement | null>;
	overlayRef: RefObject<HTMLDivElement | null>;
	mentionViewportRef: RefObject<HTMLDivElement | null>;
	hasMentions: boolean;
	mention: UseTinyMentionReturn;
	handleChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
	handleSelect: (event: SyntheticEvent<HTMLTextAreaElement>) => void;
	handleScroll: () => void;
	handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean;
};

export function useMentionEditor({
	value,
	onValueChange,
	mentionStoreRef,
	mentionSearch,
	onMarkdownChange,
	mentionEnabled = true,
}: UseMentionEditorOptions): UseMentionEditorReturn {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const overlayRef = useRef<HTMLDivElement>(null);
	const mentionViewportRef = useRef<HTMLDivElement>(null);
	const [cursorPosition, setCursorPosition] = useState(0);

	const updateMarkdownValue = useCallback(
		(displayValue: string) => {
			if (!onMarkdownChange) {
				return;
			}

			onMarkdownChange(
				convertDisplayToMarkdown(displayValue, mentionStoreRef.current)
			);
		},
		[mentionStoreRef, onMarkdownChange]
	);

	const handleMentionSelect = useCallback(
		(selectedMention: Mention) => {
			const textarea = textareaRef.current;
			if (!textarea) {
				return;
			}

			const textBeforeCursor = value.slice(0, cursorPosition);
			const triggerIndex = textBeforeCursor.lastIndexOf("@");
			if (triggerIndex === -1) {
				return;
			}

			mentionStoreRef.current.set(selectedMention.name, selectedMention);
			const displayMention = formatMentionDisplay(selectedMention);
			const nextValue =
				value.slice(0, triggerIndex) +
				displayMention +
				" " +
				value.slice(cursorPosition);

			onValueChange(nextValue);
			updateMarkdownValue(nextValue);

			const nextCursor = triggerIndex + displayMention.length + 1;
			requestAnimationFrame(() => {
				textarea.setSelectionRange(nextCursor, nextCursor);
				textarea.focus();
				setCursorPosition(nextCursor);
			});
		},
		[cursorPosition, mentionStoreRef, onValueChange, updateMarkdownValue, value]
	);

	const runMentionSearch = useCallback<MentionSearch>(
		(query: string) => {
			if (!mentionEnabled) {
				return [];
			}

			return mentionSearch(query);
		},
		[mentionEnabled, mentionSearch]
	);

	const mention = useTinyMention({
		textareaRef,
		containerRef: mentionViewportRef,
		value,
		cursorPosition,
		onSearch: runMentionSearch,
		onSelect: handleMentionSelect,
		trigger: "@",
		debounceMs: 100,
	});

	const hasMentions = useMemo(() => {
		if (!mentionEnabled) {
			return false;
		}
		return parseDisplayMentions(value, mentionStoreRef.current).length > 0;
	}, [mentionEnabled, mentionStoreRef, value]);

	const handleChange = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) => {
			const nextValue = event.target.value;
			onValueChange(nextValue);
			updateMarkdownValue(nextValue);
			setCursorPosition(event.target.selectionStart);
		},
		[onValueChange, updateMarkdownValue]
	);

	const handleSelect = useCallback(
		(event: SyntheticEvent<HTMLTextAreaElement>) => {
			setCursorPosition(event.currentTarget.selectionStart);
		},
		[]
	);

	const handleScroll = useCallback(() => {
		const textarea = textareaRef.current;
		const overlay = overlayRef.current;
		if (textarea && overlay) {
			overlay.scrollTop = textarea.scrollTop;
			overlay.scrollLeft = textarea.scrollLeft;
		}
	}, []);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLTextAreaElement>) => {
			if (!mentionEnabled) {
				return false;
			}

			return mention.handleKeyDown(event);
		},
		[mention.handleKeyDown, mentionEnabled]
	);

	return {
		textareaRef,
		overlayRef,
		mentionViewportRef,
		hasMentions,
		mention,
		handleChange,
		handleSelect,
		handleScroll,
		handleKeyDown,
	};
}
