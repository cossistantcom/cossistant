import { type Conversation, ConversationStatus } from "@plasma/types";
import { useCallback, useMemo } from "react";
import { shouldDisplayConversation } from "../utils/conversation";
import { useConversations } from "./use-conversations";

export type UseHomePageOptions = {
	/**
	 * Whether to enable conversations fetching.
	 * Default: true
	 */
	enabled?: boolean;

	/**
	 * Callback when user wants to start a new conversation.
	 */
	onStartConversation?: (initialMessage?: string) => void;

	/**
	 * Callback when user wants to open an existing conversation.
	 */
	onOpenConversation?: (conversationId: string) => void;

	/**
	 * Callback when user wants to view conversation history.
	 */
	onOpenConversationHistory?: () => void;
};

export type UseHomePageReturn = {
	/**
	 * List of conversations that should be displayed on the home page.
	 *
	 * @remarks `Conversation[]`
	 * @fumadocsType `Conversation[]`
	 */
	conversations: Conversation[];
	/**
	 * Whether conversations are still loading.
	 */
	isLoading: boolean;
	/**
	 * Error from the most recent conversations fetch.
	 */
	error: Error | null;

	/**
	 * Most recent open conversation, or the most recent conversation overall.
	 *
	 * @remarks `Conversation | undefined`
	 * @fumadocsType `Conversation | undefined`
	 */
	lastOpenConversation: Conversation | undefined;
	/**
	 * Number of additional conversations available beyond the highlighted one.
	 */
	availableConversationsCount: number;
	/**
	 * Whether there are any conversations to display.
	 */
	hasConversations: boolean;

	/**
	 * Start a new conversation.
	 *
	 * @param initialMessage - Optional initial message to seed the conversation with.
	 * @returns void
	 */
	startConversation: (initialMessage?: string) => void;
	/**
	 * Open an existing conversation by ID.
	 *
	 * @param conversationId - Conversation to open.
	 * @returns void
	 */
	openConversation: (conversationId: string) => void;
	/**
	 * Navigate to the conversation history page.
	 *
	 * @returns void
	 */
	openConversationHistory: () => void;
};

/**
 * Main hook for the home page of the support widget.
 *
 * This hook:
 * - Fetches and manages conversations list
 * - Derives useful state (last open conversation, conversation counts)
 * - Provides navigation actions for the home page
 *
 * It encapsulates all home page logic, making the component
 * purely presentational.
 *
 * @example
 * ```tsx
 * export function HomePage() {
 *   const home = useHomePage({
 *     onStartConversation: (msg) => {
 *       navigate('conversation', { conversationId: PENDING_CONVERSATION_ID, initialMessage: msg });
 *     },
 *     onOpenConversation: (id) => {
 *       navigate('conversation', { conversationId: id });
 *     },
 *     onOpenConversationHistory: () => {
 *       navigate('conversation-history');
 *     },
 *   });
 *
 *   return (
 *     <>
 *       <h1>How can we help?</h1>
 *
 *       {home.lastOpenConversation && (
 *         <ConversationCard
 *           conversation={home.lastOpenConversation}
 *           onClick={() => home.openConversation(home.lastOpenConversation.id)}
 *         />
 *       )}
 *
 *       <Button onClick={() => home.startConversation()}>
 *         Ask a question
 *       </Button>
 *     </>
 *   );
 * }
 * ```
 */
export function useHomePage(
	options: UseHomePageOptions = {}
): UseHomePageReturn {
	const {
		enabled = true,
		onStartConversation,
		onOpenConversation,
		onOpenConversationHistory,
	} = options;

	// Fetch conversations
	const {
		conversations: allConversations,
		isLoading,
		error,
	} = useConversations({
		enabled,
		// Fetch most recent conversations first
		orderBy: "updatedAt",
		order: "desc",
	});

	const conversations = useMemo(
		() => allConversations.filter(shouldDisplayConversation),
		[allConversations]
	);

	// Derive useful state from conversations
	const { lastOpenConversation, availableConversationsCount } = useMemo(() => {
		// Find the most recent open conversation first
		const openConversation = conversations.find(
			(conv) => conv.status === ConversationStatus.OPEN
		);

		// If no open conversation, show the most recent one (could be resolved)
		const conversationToShow = openConversation ?? conversations[0];

		// Count other conversations (excluding the one we're showing)
		const otherCount = Math.max(
			conversations.length - (conversationToShow ? 1 : 0),
			0
		);

		return {
			lastOpenConversation: conversationToShow,
			availableConversationsCount: otherCount,
		};
	}, [conversations]);

	// Navigation actions
	const startConversation = useCallback(
		(initialMessage?: string) => {
			onStartConversation?.(initialMessage);
		},
		[onStartConversation]
	);

	const openConversation = useCallback(
		(conversationId: string) => {
			onOpenConversation?.(conversationId);
		},
		[onOpenConversation]
	);

	const openConversationHistory = useCallback(() => {
		onOpenConversationHistory?.();
	}, [onOpenConversationHistory]);

	return {
		conversations,
		isLoading,
		error,
		lastOpenConversation,
		availableConversationsCount,
		hasConversations: conversations.length > 0,
		startConversation,
		openConversation,
		openConversationHistory,
	};
}
