"use client";

import {
	extractFilesFromClipboard,
	FILE_INPUT_ACCEPT,
	MAX_FILES_PER_MESSAGE,
} from "@cossistant/core";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { cn } from "@/lib/utils";
import {
	type AiPauseAction,
	getAiPauseActionLabel,
	getAiPauseMenuActions,
	getAiPauseStatusLabel,
	mapAiPauseSelectValueToAction,
} from "./ai-pause-control";
import {
	ComposerAnimatedSlot,
	ComposerBlocksFrame,
} from "./composer-blocks-frame";
import {
	ComposerDefaultBottomBlock,
	type ConversationPriorityValue,
	type ConversationSentimentValue,
} from "./composer-bottom-block";
import { ComposerDefaultCentralBlock } from "./composer-central-block";
import { getComposerAnimatedSlotKey } from "./composer-slot-key";
import {
	EscalationAction,
	type EscalationActionProps,
} from "./escalation-action";
import type { MentionStore } from "./mention-store";
import { useComposerHeightSync } from "./use-composer-height-sync";
import { useComposerTextareaLayout } from "./use-composer-textarea-layout";
import { useMentionEditor } from "./use-mention-editor";
import type { UseMentionSearchOptions } from "./use-mention-search";
import { useMentionSearch } from "./use-mention-search";

export type MessageVisibility = "public" | "private";

const AI_PAUSE_TICK_MS = 30_000;

export type ComposerEscalationActionProps = Pick<
	EscalationActionProps,
	"isJoining" | "joinButtonRef" | "onJoin" | "reason"
>;

export type ComposerProps = {
	className?: string;
	layoutMode?: "docked" | "inline";
	aboveBlock?: React.ReactNode;
	bottomBlock?: React.ReactNode;
	centralBlock?: React.ReactNode;
	textareaOverlay?: React.ReactNode;
	escalationAction?: ComposerEscalationActionProps | null;
	value: string;
	autoFocus?: boolean;
	onChange: (value: string) => void;
	onSubmit: () => void;
	onFileSelect?: (files: File[]) => void;
	placeholder?: string;
	disabled?: boolean;
	isSubmitting?: boolean;
	isUploading?: boolean;
	uploadProgress?: number;
	error?: Error | null;
	files?: File[];
	onRemoveFile?: (index: number) => void;
	maxFiles?: number;
	// Reserved for upstream validation and future display copy.
	maxFileSize?: number;
	allowedFileTypes?: string;
	visibility?: MessageVisibility;
	onVisibilityChange?: (visibility: MessageVisibility) => void;
	renderAttachButton?: (props: {
		triggerFileInput: () => void;
		disabled: boolean;
	}) => React.ReactNode;
	mentionConfig?: UseMentionSearchOptions;
	onMarkdownChange?: (markdownValue: string) => void;
	onHeightChange?: (height: number) => void;
	aiPausedUntil?: string | null;
	onAiPauseAction?: (action: AiPauseAction) => void;
	isAiPauseActionPending?: boolean;
	priority?: ConversationPriorityValue;
	onPriorityChange?: (priority: ConversationPriorityValue) => void;
	isPriorityActionPending?: boolean;
	sentiment?: ConversationSentimentValue | null;
	onSentimentChange?: (sentiment: ConversationSentimentValue | null) => void;
	isSentimentActionPending?: boolean;
};

export const Composer: React.FC<ComposerProps> = ({
	className,
	layoutMode = "docked",
	aboveBlock,
	bottomBlock,
	centralBlock,
	textareaOverlay,
	escalationAction = null,
	value,
	autoFocus = true,
	onChange,
	onSubmit,
	onFileSelect,
	placeholder = "Type your message...",
	disabled = false,
	isSubmitting = false,
	isUploading = false,
	uploadProgress = 0,
	error,
	files = [],
	onRemoveFile,
	maxFiles = MAX_FILES_PER_MESSAGE,
	allowedFileTypes = FILE_INPUT_ACCEPT,
	visibility = "public",
	onVisibilityChange,
	renderAttachButton,
	mentionConfig,
	onMarkdownChange,
	onHeightChange,
	aiPausedUntil = null,
	onAiPauseAction,
	isAiPauseActionPending = false,
	priority = "normal",
	onPriorityChange,
	isPriorityActionPending = false,
	sentiment = null,
	onSentimentChange,
	isSentimentActionPending = false,
}) => {
	const isPrivate = visibility === "private";
	const fileInputRef = useRef<HTMLInputElement>(null);
	const rootContainerRef = useRef<HTMLDivElement>(null);
	const hasContent = value.trim().length > 0 || files.length > 0;
	const canSubmit = !disabled && hasContent && !isUploading;
	const [nowMs, setNowMs] = useState(() => Date.now());

	const aiPauseStatus = useMemo(() => {
		const pauseUntilMs = aiPausedUntil ? Date.parse(aiPausedUntil) : Number.NaN;
		const isPaused = !Number.isNaN(pauseUntilMs) && pauseUntilMs > nowMs;

		return {
			isPaused,
			label: getAiPauseStatusLabel(aiPausedUntil, nowMs),
		};
	}, [aiPausedUntil, nowMs]);
	const aiPauseMenuActions = getAiPauseMenuActions(aiPauseStatus.isPaused);
	const isAiPauseControlDisabled = disabled || isAiPauseActionPending;
	const embeddedEscalationAction = centralBlock ? null : escalationAction;
	const showsEmbeddedEscalationAction = embeddedEscalationAction !== null;
	const hasCustomBlocks = Boolean(
		aboveBlock || bottomBlock || centralBlock || showsEmbeddedEscalationAction
	);

	useEffect(() => {
		setNowMs(Date.now());
	}, [aiPausedUntil]);

	useEffect(() => {
		if (!aiPauseStatus.isPaused) {
			return;
		}

		const intervalId = window.setInterval(() => {
			setNowMs(Date.now());
		}, AI_PAUSE_TICK_MS);

		return () => {
			window.clearInterval(intervalId);
		};
	}, [aiPauseStatus.isPaused]);

	const mentionStoreRef = useRef<MentionStore>(new Map());
	const { search: mentionSearch } = useMentionSearch(mentionConfig ?? {});
	const mentionEditor = useMentionEditor({
		value,
		onValueChange: onChange,
		mentionStoreRef,
		mentionSearch,
		onMarkdownChange,
		mentionEnabled: Boolean(mentionConfig),
	});

	useComposerTextareaLayout({
		overlayRef: mentionEditor.overlayRef,
		textareaRef: mentionEditor.textareaRef,
		value,
	});
	useComposerHeightSync({
		containerRef: rootContainerRef,
		onHeightChange,
	});

	useHotkeys(
		"n",
		() => {
			onVisibilityChange?.(isPrivate ? "public" : "private");
		},
		{
			enabled: Boolean(onVisibilityChange) && !showsEmbeddedEscalationAction,
			enableOnFormTags: false,
			enableOnContentEditable: false,
			preventDefault: true,
		},
		[isPrivate, onVisibilityChange, showsEmbeddedEscalationAction]
	);

	const handleSubmit = () => {
		if (!canSubmit) {
			return;
		}

		onSubmit();
		mentionStoreRef.current.clear();
		mentionEditor.textareaRef.current?.focus();
		requestAnimationFrame(() => {
			mentionEditor.textareaRef.current?.focus();
		});
	};

	const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		handleSubmit();
	};

	const triggerFileInput = () => {
		if (files.length < maxFiles) {
			fileInputRef.current?.click();
		}
	};

	const isAttachDisabled = disabled || isSubmitting || files.length >= maxFiles;

	const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (mentionEditor.handleKeyDown(event)) {
			return;
		}

		if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			handleSubmit();
		}
	};

	const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
		const filesFromClipboard = extractFilesFromClipboard(event.clipboardData);
		if (filesFromClipboard.length > 0 && onFileSelect) {
			event.preventDefault();
			onFileSelect(filesFromClipboard);
		}
	};

	const handleAiPauseSelectValueChange = (selectedValue: string) => {
		const action = mapAiPauseSelectValueToAction(selectedValue);
		if (!(action && onAiPauseAction) || isAiPauseControlDisabled) {
			return;
		}

		onAiPauseAction(action);
	};

	const resolvedCentralBlock =
		centralBlock ??
		(showsEmbeddedEscalationAction ? (
			<EscalationAction
				isJoining={embeddedEscalationAction.isJoining}
				joinButtonRef={embeddedEscalationAction.joinButtonRef}
				layout="embedded"
				onJoin={embeddedEscalationAction.onJoin}
				reason={embeddedEscalationAction.reason}
			/>
		) : (
			<ComposerDefaultCentralBlock
				allowedFileTypes={allowedFileTypes}
				autoFocus={autoFocus}
				canSubmit={canSubmit}
				className={className}
				disabled={disabled}
				error={error}
				fileInputRef={fileInputRef}
				files={files}
				handleKeyDown={handleKeyDown}
				handlePaste={handlePaste}
				isAttachDisabled={isAttachDisabled}
				isPrivate={isPrivate}
				isUploading={isUploading}
				mentionEditor={mentionEditor}
				mentionEnabled={Boolean(mentionConfig)}
				mentionStore={mentionStoreRef.current}
				onFileSelect={onFileSelect}
				onFormSubmit={handleFormSubmit}
				onRemoveFile={onRemoveFile}
				onVisibilityChange={onVisibilityChange}
				placeholder={placeholder}
				renderAttachButton={renderAttachButton}
				textareaOverlay={textareaOverlay}
				triggerFileInput={triggerFileInput}
				uploadProgress={uploadProgress}
				value={value}
			/>
		));

	const resolvedBottomBlock = bottomBlock ?? (
		<ComposerDefaultBottomBlock
			aiPauseMenuActions={aiPauseMenuActions}
			aiPauseStatusLabel={aiPauseStatus.label}
			getAiPauseActionLabel={getAiPauseActionLabel}
			isAiPauseControlDisabled={isAiPauseControlDisabled}
			isPriorityActionPending={isPriorityActionPending}
			isSentimentActionPending={isSentimentActionPending}
			onAiPauseAction={onAiPauseAction}
			onAiPauseSelectValueChange={handleAiPauseSelectValueChange}
			onPriorityChange={onPriorityChange}
			onSentimentChange={onSentimentChange}
			priority={priority}
			sentiment={sentiment}
		/>
	);
	const aboveSlotKey = getComposerAnimatedSlotKey("above-custom", aboveBlock);
	const centralSlotBaseKey = centralBlock
		? "central-custom"
		: showsEmbeddedEscalationAction
			? "central-escalation"
			: "central-default";
	const centralSlotKey = getComposerAnimatedSlotKey(
		centralSlotBaseKey,
		resolvedCentralBlock
	);
	const bottomSlotKey = getComposerAnimatedSlotKey(
		bottomBlock ? "bottom-custom" : "bottom-default",
		resolvedBottomBlock
	);

	return (
		<div
			className={cn(
				"z-10 mx-auto flex w-full flex-col gap-1 bg-background px-3 pb-2 xl:max-w-xl xl:px-0 2xl:max-w-2xl dark:bg-background-50",
				layoutMode === "docked"
					? "absolute right-0 bottom-0 left-0"
					: "relative"
			)}
			data-composer-layout-mode={layoutMode}
			ref={rootContainerRef}
		>
			<ComposerBlocksFrame highlighted={hasCustomBlocks}>
				<ComposerAnimatedSlot slot="above" slotKey={aboveSlotKey}>
					{aboveBlock}
				</ComposerAnimatedSlot>

				<ComposerAnimatedSlot slot="central" slotKey={centralSlotKey}>
					{resolvedCentralBlock}
				</ComposerAnimatedSlot>

				<ComposerAnimatedSlot slot="bottom" slotKey={bottomSlotKey}>
					{resolvedBottomBlock}
				</ComposerAnimatedSlot>
			</ComposerBlocksFrame>
		</div>
	);
};

export const MultimodalInput = Composer;

export type { AiPauseAction } from "./ai-pause-control";
export {
	getAiPauseActionLabel,
	getAiPauseMenuActions,
	getAiPauseStatusLabel,
	mapAiPauseSelectValueToAction,
} from "./ai-pause-control";
export { ComposerBlocksFrame } from "./composer-blocks-frame";
export type {
	ConversationPriorityValue,
	ConversationSentimentValue,
} from "./composer-bottom-block";
export { ComposerBottomBlock } from "./composer-bottom-block";
export { ComposerCentralBlock } from "./composer-central-block";
export type { MentionStore } from "./mention-store";
export { convertDisplayToMarkdown } from "./mention-store";
export type { UseMentionSearchOptions } from "./use-mention-search";
