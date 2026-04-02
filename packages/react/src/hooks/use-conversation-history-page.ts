import type { Conversation } from "@plasma/types";
import { useCallback, useMemo, useState } from "react";
import { shouldDisplayConversation } from "../utils/conversation";
import { useConversations } from "./use-conversations";

export type UseConversationHistoryPageOptions = {
	/**
	 * Initial number of conversations to display.
	 * Default: 4
	 */
	initialVisibleCount?: number;

	/**
	 * Whether to enable conversations fetching.
	 * Default: true
	 */
	enabled?: boolean;

	/**
	 * Callback when user wants to open a conversation.
	 */
	onOpenConversation?: (conversationId: string) => void;

	/**
	 * Callback when user wants to start a new conversation.
	 */
	onStartConversation?: (initialMessage?: string) => void;
};

export type UseConversationHistoryPageReturn = {
	// Conversations data
	conversations: Conversation[];
	isLoading: boolean;
	error: Error | null;

	// Pagination state
	visibleConversations: Conversation[];
	visibleCount: number;
	hasMore: boolean;
	remainingCount: number;

	// Actions
	showMore: () => void;
	showAll: () => void;
	openConversation: (conversationId: string) => void;
	startConversation: (initialMessage?: string) => void;
};

/**
 * Main hook for the conversation history page.
 *
 * This hook:
 * - Fetches all conversations
 * - Manages pagination/visible count
 * - Provides navigation actions
 *
 * It encapsulates all conversation history logic, making the component
 * purely presentational.
 *
 * @example
 * ```tsx
 * export function ConversationHistoryPage() {
 *   const history = useConversationHistoryPage({
 *     initialVisibleCount: 4,
 *     onOpenConversation: (id) => {
 *       navigate('conversation', { conversationId: id });
 *     },
 *     onStartConversation: (msg) => {
 *       navigate('conversation', { conversationId: PENDING_CONVERSATION_ID, initialMessage: msg });
 *     },
 *   });
 *
 *   return (
 *     <>
 *       <h1>Conversation History</h1>
 *
 *       {history.hasMore && (
 *         <button onClick={history.showAll}>
 *           +{history.remainingCount} more
 *         </button>
 *       )}
 *
 *       <ul>
 *         {history.visibleConversations.map(conv => (
 *           <li key={conv.id} onClick={() => history.openConversation(conv.id)}>
 *             {conv.title}
 *           </li>
 *         ))}
 *       </ul>
 *     </>
 *   );
 * }
 * ```
 */
export function useConversationHistoryPage(
	options: UseConversationHistoryPageOptions = {}
): UseConversationHistoryPageReturn {
	const {
		initialVisibleCount = 4,
		enabled = true,
		onOpenConversation,
		onStartConversation,
	} = options;

	// Fetch conversations
	const {
		conversations: allConversations,
		isLoading,
		error,
	} = useConversations({
		enabled,
		// Most recent first
		orderBy: "updatedAt",
		order: "desc",
	});

	const conversations = useMemo(
		() => allConversations.filter(shouldDisplayConversation),
		[allConversations]
	);

	// Manage visible count for pagination
	const [visibleCount, setVisibleCount] = useState(initialVisibleCount);

	// Compute visible conversations and pagination state
	const { visibleConversations, hasMore, remainingCount } = useMemo(() => {
		const visible = conversations.slice(0, visibleCount);
		const remaining = Math.max(conversations.length - visible.length, 0);

		return {
			visibleConversations: visible,
			hasMore: remaining > 0,
			remainingCount: remaining,
		};
	}, [conversations, visibleCount]);

	// Actions
	const showMore = useCallback(() => {
		setVisibleCount((current) => current + initialVisibleCount);
	}, [initialVisibleCount]);

	const showAll = useCallback(() => {
		setVisibleCount(conversations.length);
	}, [conversations.length]);

	const openConversation = useCallback(
		(conversationId: string) => {
			onOpenConversation?.(conversationId);
		},
		[onOpenConversation]
	);

	const startConversation = useCallback(
		(initialMessage?: string) => {
			onStartConversation?.(initialMessage);
		},
		[onStartConversation]
	);

	return {
		conversations,
		isLoading,
		error,
		visibleConversations,
		visibleCount,
		hasMore,
		remainingCount,
		showMore,
		showAll,
		openConversation,
		startConversation,
	};
}
