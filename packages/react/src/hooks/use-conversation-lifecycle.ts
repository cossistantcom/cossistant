import { useCallback, useEffect, useRef, useState } from "react";
import { PENDING_CONVERSATION_ID } from "../utils/id";

export type ConversationLifecycleState = {
	/**
	 * The current conversation ID. Always a string, never null.
	 * Will be PENDING_CONVERSATION_ID if no real conversation exists yet.
	 */
	conversationId: string;

	/**
	 * Whether this is a pending (not yet created) conversation.
	 * True = showing default messages, no backend conversation yet.
	 * False = real conversation exists on backend.
	 */
	isPending: boolean;

	/**
	 * The real conversation ID if one exists, otherwise null.
	 * Use this when you need to pass to API calls that require an existing conversation.
	 */
	realConversationId: string | null;
};

export type UseConversationLifecycleOptions = {
	/**
	 * Initial conversation ID from URL or navigation state.
	 * Can be PENDING_CONVERSATION_ID or a real conversation ID.
	 */
	initialConversationId?: string;

	/**
	 * Whether to automatically create a conversation on mount.
	 * If false, conversation will only be created when user sends first message.
	 * Default: false (lazy creation)
	 */
	autoCreate?: boolean;

	/**
	 * Visitor ID to associate with the conversation.
	 */
	visitorId?: string;

	/**
	 * Website ID to associate with the conversation.
	 */
	websiteId?: string | null;

	/**
	 * Callback when conversation is created.
	 */
	onConversationCreated?: (conversationId: string) => void;
};

export type UseConversationLifecycleReturn = ConversationLifecycleState & {
	/**
	 * Update the conversation ID (e.g., after creation or navigation).
	 */
	setConversationId: (conversationId: string) => void;

	/**
	 * Check if this is a new/pending conversation.
	 */
	isNewConversation: () => boolean;
};

/**
 * Manages the lifecycle of a conversation, handling the transition from
 * a pending state (showing default messages) to a real conversation
 * (with backend persistence).
 *
 * This hook simplifies the logic of:
 * - Starting with default/welcome messages
 * - Creating the conversation only when user sends first message
 * - Transitioning from pending → real conversation ID
 *
 * @example
 * ```tsx
 * const { conversationId, isPending, realConversationId } = useConversationLifecycle({
 *   initialConversationId: params.conversationId,
 *   visitorId: visitor?.id,
 * });
 *
 * // conversationId is always a string (never null)
 * // isPending tells you if it's a real conversation or not
 * // realConversationId is null when isPending=true, otherwise it's the real ID
 * ```
 */
export function useConversationLifecycle(
	options: UseConversationLifecycleOptions = {}
): UseConversationLifecycleReturn {
	const {
		initialConversationId = PENDING_CONVERSATION_ID,
		onConversationCreated,
	} = options;

	const [conversationId, setConversationIdState] = useState(
		initialConversationId
	);
	const [previousInitialConversationId, setPreviousInitialConversationId] =
		useState(initialConversationId);
	const conversationIdRef = useRef(conversationId);
	conversationIdRef.current = conversationId;

	// Resync when the caller navigates to a different conversation (URL param
	// or router state change) without unmounting this hook.
	if (previousInitialConversationId !== initialConversationId) {
		setPreviousInitialConversationId(initialConversationId);
		setConversationIdState(initialConversationId);
		conversationIdRef.current = initialConversationId;
	}

	const onConversationCreatedRef = useRef(onConversationCreated);

	// Keep callback ref up to date
	useEffect(() => {
		onConversationCreatedRef.current = onConversationCreated;
	}, [onConversationCreated]);

	const setConversationId = useCallback((newId: string) => {
		// The callback runs outside the setState updater: updaters must stay
		// side-effect free (StrictMode invokes them twice).
		const wasPending = conversationIdRef.current === PENDING_CONVERSATION_ID;
		conversationIdRef.current = newId;
		setConversationIdState(newId);

		// Only trigger callback if transitioning from pending to real
		if (wasPending && newId !== PENDING_CONVERSATION_ID) {
			onConversationCreatedRef.current?.(newId);
		}
	}, []);

	const isPending = conversationId === PENDING_CONVERSATION_ID;
	const realConversationId = isPending ? null : conversationId;

	const isNewConversation = useCallback(
		() => conversationId === PENDING_CONVERSATION_ID,
		[conversationId]
	);

	return {
		conversationId,
		isPending,
		realConversationId,
		setConversationId,
		isNewConversation,
	};
}
