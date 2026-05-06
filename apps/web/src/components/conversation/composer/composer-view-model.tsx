import type React from "react";
import type {
	AiPauseAction,
	ComposerEscalationActionProps,
	ComposerProps,
	MessageVisibility,
} from ".";
import type { LimitActionProps } from "./limit-action";
import type { UseMentionSearchOptions } from "./use-mention-search";

export type ComposerSlotBlocks = {
	aboveBlock?: React.ReactNode;
	centralBlock?: React.ReactNode | null;
	bottomBlock?: React.ReactNode | null;
};

type ComposerViewModelInputState = {
	className?: string;
	layoutMode?: ComposerProps["layoutMode"];
	textareaOverlay?: React.ReactNode;
	value: string;
	autoFocus?: boolean;
	onChange: ComposerProps["onChange"];
	onSubmit: ComposerProps["onSubmit"];
	onFileSelect?: ComposerProps["onFileSelect"];
	placeholder?: string;
	disabled?: boolean;
	isSubmitting?: boolean;
	isUploading?: boolean;
	uploadProgress?: number;
	error?: Error | null;
	files?: File[];
	onRemoveFile?: ComposerProps["onRemoveFile"];
	maxFiles?: number;
	maxFileSize?: number;
	allowedFileTypes?: string;
	visibility?: MessageVisibility;
	onVisibilityChange?: ComposerProps["onVisibilityChange"];
	renderAttachButton?: ComposerProps["renderAttachButton"];
	mentionConfig?: UseMentionSearchOptions;
	onMarkdownChange?: ComposerProps["onMarkdownChange"];
	aiPausedUntil?: string | null;
	onAiPauseAction?: (action: AiPauseAction) => void;
	isAiPauseActionPending?: boolean;
	priority?: ComposerProps["priority"];
	onPriorityChange?: ComposerProps["onPriorityChange"];
	isPriorityActionPending?: boolean;
	sentiment?: ComposerProps["sentiment"];
	onSentimentChange?: ComposerProps["onSentimentChange"];
	isSentimentActionPending?: boolean;
};

export type ComposerViewModelState = {
	input: ComposerViewModelInputState;
	slots?: ComposerSlotBlocks | null;
	clarification?: {
		promptBlock?: React.ReactNode | null;
		flowBlocks?: ComposerSlotBlocks | null;
	} | null;
	escalationAction?: ComposerEscalationActionProps | null;
	limitAction?: LimitActionProps | null;
};

export type ConversationComposerViewModelState = {
	input: ComposerViewModelInputState;
	clarificationPrompt?: React.ReactNode | null;
	clarificationFlow?: ComposerSlotBlocks | null;
	escalationAction?: ComposerEscalationActionProps | null;
	limitAction?: LimitActionProps | null;
};

export type ComposerViewModel = {
	input: ComposerProps;
	limitAction: LimitActionProps | null;
};

export function buildComposerViewModel(
	state: ComposerViewModelState
): ComposerViewModel {
	const flowBlocks = state.clarification?.flowBlocks ?? null;
	const aboveBlock =
		flowBlocks?.aboveBlock ??
		state.clarification?.promptBlock ??
		state.slots?.aboveBlock;
	const centralBlock = flowBlocks?.centralBlock ?? state.slots?.centralBlock;
	const bottomBlock = flowBlocks?.bottomBlock ?? state.slots?.bottomBlock;

	return {
		input: {
			...state.input,
			aboveBlock,
			bottomBlock,
			centralBlock,
			escalationAction: state.escalationAction ?? null,
		},
		limitAction: state.limitAction ?? null,
	};
}

export function buildConversationComposerViewModel(
	state: ConversationComposerViewModelState
): ComposerViewModel {
	return buildComposerViewModel({
		input: state.input,
		clarification: {
			promptBlock: state.clarificationPrompt ?? null,
			flowBlocks: state.clarificationFlow ?? null,
		},
		escalationAction: state.escalationAction ?? null,
		limitAction: state.limitAction ?? null,
	});
}
