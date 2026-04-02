import type { CossistantClient } from "@plasma/core";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import type { AnyRealtimeEvent } from "@plasma/types/realtime-events";
import { useCallback, useEffect } from "react";
import {
	type UseMultimodalInputOptions,
	useMultimodalInput,
} from "./private/use-multimodal-input";
import { useVisitorTypingReporter } from "./private/use-visitor-typing-reporter";
import { useSendMessage } from "./use-send-message";

export type UseMessageComposerOptions = {
	/**
	 * The Cossistant client instance.
	 * Optional - when not provided, the composer will be disabled.
	 */
	client?: CossistantClient;

	/**
	 * Current conversation ID. Can be null if no real conversation exists yet.
	 * Pass null when showing default timeline items before user sends first message.
	 */
	conversationId: string | null;

	/**
	 * Default timeline items to include when creating a new conversation.
	 */
	defaultTimelineItems?: TimelineItem[];

	/**
	 * Visitor ID to associate with messages.
	 */
	visitorId?: string;

	/**
	 * Callback when a message is successfully sent.
	 * @param conversationId - The conversation ID (may be newly created)
	 * @param messageId - The sent message ID
	 */
	onMessageSent?: (conversationId: string, messageId: string) => void;

	/**
	 * Called immediately after a new conversation is initiated (before API call).
	 * Use this to immediately switch the UI to the new conversation ID for
	 * proper optimistic updates display.
	 */
	onConversationInitiated?: (conversationId: string) => void;

	/**
	 * Callback when message sending fails.
	 */
	onError?: (error: Error) => void;

	/**
	 * File upload options (max size, allowed types, etc.)
	 */
	fileOptions?: Pick<
		UseMultimodalInputOptions,
		"maxFileSize" | "maxFiles" | "allowedFileTypes"
	>;

	/**
	 * Optional WebSocket send function for real-time typing events.
	 * When provided, typing indicators are sent via WebSocket for better performance.
	 */
	realtimeSend?: ((event: AnyRealtimeEvent) => void) | null;

	/**
	 * Whether the WebSocket connection is currently established.
	 */
	isRealtimeConnected?: boolean;
};

export type UseMessageComposerReturn = {
	/**
	 * Current message text being composed.
	 */
	message: string;
	/**
	 * Files currently attached to the message draft.
	 */
	files: File[];
	/**
	 * Error from the most recent submission attempt.
	 */
	error: Error | null;

	/**
	 * Whether a submission is in progress.
	 */
	isSubmitting: boolean;
	/**
	 * Whether file uploads are currently in progress.
	 */
	isUploading: boolean;
	/**
	 * Whether the current draft can be submitted.
	 */
	canSubmit: boolean;

	/**
	 * Update the message text.
	 *
	 * @param message - New draft message.
	 * @returns void
	 */
	setMessage: (message: string) => void;
	/**
	 * Add files to the current draft.
	 *
	 * @param files - Files to attach.
	 * @returns void
	 */
	addFiles: (files: File[]) => void;
	/**
	 * Remove an attached file by index.
	 *
	 * @param index - Index of the file to remove.
	 * @returns void
	 */
	removeFile: (index: number) => void;
	/**
	 * Remove all attached files.
	 *
	 * @returns void
	 */
	clearFiles: () => void;
	/**
	 * Submit the current draft message.
	 *
	 * @returns void
	 */
	submit: () => void;
	/**
	 * Reset the current draft state.
	 *
	 * @returns void
	 */
	reset: () => void;
};

/**
 * Combines message input, typing indicators, and message sending into
 * a single, cohesive hook for building message composers.
 *
 * This hook:
 * - Manages text input and file attachments via useMultimodalInput
 * - Sends typing indicators while user is composing
 * - Handles message submission with proper error handling
 * - Automatically resets input after successful send
 * - Works with both pending and real conversations
 *
 * @example
 * ```tsx
 * const composer = useMessageComposer({
 *   client,
 *   conversationId: realConversationId, // null if pending
 *   defaultMessages,
 *   visitorId: visitor?.id,
 *   onMessageSent: (convId) => {
 *     // Update conversation ID if it was created
 *   },
 * });
 *
 * return (
 *   <MessageInput
 *     value={composer.message}
 *     onChange={composer.setMessage}
 *     onSubmit={composer.submit}
 *     disabled={composer.isSubmitting}
 *   />
 * );
 * ```
 */
export function useMessageComposer(
	options: UseMessageComposerOptions
): UseMessageComposerReturn {
	const {
		client,
		conversationId,
		defaultTimelineItems = [],
		visitorId,
		onMessageSent,
		onConversationInitiated,
		onError,
		fileOptions,
		realtimeSend,
		isRealtimeConnected = false,
	} = options;

	const sendMessage = useSendMessage({ client });

	const {
		handleInputChange: reportTyping,
		handleSubmit: stopTyping,
		stop: forceStopTyping,
	} = useVisitorTypingReporter({
		client: client ?? null,
		conversationId,
		realtimeSend,
		isRealtimeConnected,
	});

	const multimodalInput = useMultimodalInput({
		onSubmit: async ({ message: messageText, files }) => {
			// Stop typing indicator
			stopTyping();

			// Send the message
			sendMessage.mutate({
				conversationId,
				message: messageText,
				files,
				defaultTimelineItems,
				visitorId,
				onConversationInitiated: (newConversationId) => {
					// Immediately switch to new conversation ID for optimistic updates
					onConversationInitiated?.(newConversationId);
				},
				onSuccess: (resultConversationId, messageId) => {
					onMessageSent?.(resultConversationId, messageId);
				},
				onError: (err) => {
					onError?.(err);
				},
			});
		},
		onError,
		...fileOptions,
	});

	// Clean up typing indicator on unmount
	useEffect(
		() => () => {
			forceStopTyping();
		},
		[forceStopTyping]
	);

	// Wrap setMessage to also report typing
	const setMessage = useCallback(
		(value: string) => {
			multimodalInput.setMessage(value);
			reportTyping(value);
		},
		[multimodalInput, reportTyping]
	);

	// Combine submission states
	const isSubmitting = multimodalInput.isSubmitting || sendMessage.isPending;
	const isUploading = sendMessage.isUploading;
	const error = multimodalInput.error || sendMessage.error;
	const canSubmit =
		multimodalInput.canSubmit && !sendMessage.isPending && !isUploading;

	return {
		message: multimodalInput.message,
		files: multimodalInput.files,
		error,
		isSubmitting,
		isUploading,
		canSubmit,
		setMessage,
		addFiles: multimodalInput.addFiles,
		removeFile: multimodalInput.removeFile,
		clearFiles: multimodalInput.clearFiles,
		submit: multimodalInput.submit,
		reset: multimodalInput.reset,
	};
}
