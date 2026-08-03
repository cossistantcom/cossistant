import type { CossistantClient } from "@cossistant/core/client";
import { CossistantAPIError } from "@cossistant/core/types";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import {
	ConversationTimelineType,
	TimelineItemVisibility,
} from "@cossistant/types/enums";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useSyncExternalStore,
} from "react";
import { useSupport } from "../provider";
import { useIdentificationState } from "../support/context/identification";
import { useWebSocketSafe } from "../support/context/websocket";
import { useDefaultMessages } from "./private/use-default-messages";
import { useConversationAutoSeen } from "./use-conversation-auto-seen";
import { useConversationLifecycle } from "./use-conversation-lifecycle";
import { useConversationTimelineItems } from "./use-conversation-timeline-items";
import {
	type UseMessageComposerReturn,
	useMessageComposer,
} from "./use-message-composer";

export type UseConversationPageOptions = {
	/**
	 * Initial conversation ID (from URL params, navigation state, etc.)
	 * Can be PENDING_CONVERSATION_ID or a real ID.
	 */
	conversationId: string;

	/**
	 * Optional initial message to send when the conversation opens.
	 */
	initialMessage?: string;

	/**
	 * Callback when conversation ID changes (e.g., after creation).
	 * Use this to update navigation state or URL.
	 */
	onConversationIdChange?: (conversationId: string) => void;

	/**
	 * Optional timeline items to pass through (e.g., optimistic updates).
	 */
	items?: TimelineItem[];

	/**
	 * Whether automatic "seen" tracking should be enabled.
	 * Set to false when the conversation isn't visible (e.g. widget closed).
	 * Default: true
	 */
	autoSeenEnabled?: boolean;
};

export type UseConversationPageReturn = {
	/**
	 * Current conversation ID. For newly created conversations this switches
	 * from the pending ID to the real conversation ID.
	 */
	conversationId: string;
	/**
	 * Whether the conversation is still in the pending pre-creation state.
	 */
	isPending: boolean;
	/**
	 * Timeline items currently displayed for the conversation.
	 *
	 * @remarks `TimelineItem[]`
	 * @fumadocsType `TimelineItem[]`
	 */
	items: TimelineItem[];
	/**
	 * Whether conversation data is still loading.
	 */
	isLoading: boolean;
	/**
	 * Error from the conversation timeline or composer state.
	 */
	error: Error | null;

	/**
	 * Message composer state and actions for the conversation page.
	 *
	 * @remarks `MessageComposer`
	 * @fumadocsType `MessageComposer`
	 * @fumadocsHref #messagecomposer
	 */
	composer: MessageComposer;

	/**
	 * Whether there are any displayable items in the conversation.
	 */
	hasItems: boolean;
	/**
	 * Most recent timeline item, or null when the conversation is empty.
	 *
	 * @remarks `TimelineItem | null`
	 * @fumadocsType `TimelineItem | null`
	 */
	lastTimelineItem: TimelineItem | null;
};

export type MessageComposer = Pick<
	UseMessageComposerReturn,
	| "message"
	| "files"
	| "isSubmitting"
	| "isUploading"
	| "canSubmit"
	| "setMessage"
	| "addFiles"
	| "removeFile"
	| "submit"
>;

function isNotFoundError(error: Error | null): boolean {
	return error instanceof CossistantAPIError && error.code === "HTTP_404";
}

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * Main orchestrator hook for the conversation page.
 *
 * This hook combines all conversation-related logic:
 * - Lifecycle management (pending → real conversation)
 * - Message fetching and display
 * - Message composition and sending
 * - Automatic seen tracking
 * - Default/welcome messages before conversation is created
 *
 * It provides a clean, simple API for building conversation UIs.
 *
 * @example
 * ```tsx
 * export function ConversationPage({ conversationId: initialId }) {
 *   const conversation = useConversationPage({
 *     conversationId: initialId,
 *     onConversationIdChange: (newId) => {
 *       // Update URL or navigation state
 *       navigate(`/conversation/${newId}`);
 *     },
 *   });
 *
 *   return (
 *     <>
 *       <MessageList messages={conversation.messages} />
 *       <MessageInput
 *         value={conversation.composer.message}
 *         onChange={conversation.composer.setMessage}
 *         onSubmit={conversation.composer.submit}
 *       />
 *     </>
 *   );
 * }
 * ```
 */
export function useConversationPage(
	options: UseConversationPageOptions
): UseConversationPageReturn {
	const {
		conversationId: initialConversationId,
		initialMessage,
		onConversationIdChange,
		items: passedItems = [],
		autoSeenEnabled = true,
	} = options;

	const { client, visitor, availableAIAgents } = useSupport();
	const websocket = useWebSocketSafe();
	const identificationState = useIdentificationState();
	const isRealtimeConnected = websocket?.isConnected ?? false;
	// The identification item embeds a render-time timestamp that can never
	// match between the server and client passes; wait for hydration.
	const isHydrated = useSyncExternalStore(
		emptySubscribe,
		getClientSnapshot,
		getServerSnapshot
	);

	const trimmedInitialMessage = initialMessage?.trim() ?? "";
	const hasInitialMessage = trimmedInitialMessage.length > 0;

	// 1. Manage conversation lifecycle (pending vs real)
	const lifecycle = useConversationLifecycle({
		initialConversationId,
		onConversationCreated: onConversationIdChange,
	});
	const {
		conversationId: conversationLifecycleId,
		isPending: isPendingConversation,
		realConversationId,
		setConversationId,
	} = lifecycle;

	// 2. Get default timeline items for pending state
	const defaultTimelineItems = useDefaultMessages({
		conversationId: conversationLifecycleId,
	});

	const effectiveDefaultTimelineItems = hasInitialMessage
		? []
		: defaultTimelineItems;

	const hasRealConversationId = Boolean(realConversationId);
	const isPendingConversationBootstrap = Boolean(
		realConversationId && client?.isConversationPending(realConversationId)
	);
	const shouldEnableConversationNetworkSync =
		hasRealConversationId && !isPendingConversationBootstrap;

	// 3. Fetch timeline items from backend if real conversation exists
	const timelineQuery = useConversationTimelineItems(conversationLifecycleId, {
		enabled: shouldEnableConversationNetworkSync,
	});
	const refetchTimelineItems = timelineQuery.refetch;

	// Backfill timeline items that arrived while the realtime connection was
	// down: refetch on a disconnected -> connected transition (but not on the
	// initial connect, which happens right after the mount fetch).
	const wasRealtimeConnectedRef = useRef(isRealtimeConnected);
	const hadRealtimeConnectionRef = useRef(isRealtimeConnected);
	useEffect(() => {
		const wasConnected = wasRealtimeConnectedRef.current;
		wasRealtimeConnectedRef.current = isRealtimeConnected;

		if (!isRealtimeConnected || wasConnected) {
			return;
		}

		if (!hadRealtimeConnectionRef.current) {
			hadRealtimeConnectionRef.current = true;
			return;
		}

		if (!shouldEnableConversationNetworkSync) {
			return;
		}

		// Errors are surfaced through the query state; swallow the rejection.
		refetchTimelineItems().catch(() => {});
	}, [
		isRealtimeConnected,
		shouldEnableConversationNetworkSync,
		refetchTimelineItems,
	]);

	// 4. Determine which items to display
	const baseItems = useMemo(() => {
		// If we have fetched timeline items, use them
		if (timelineQuery.items.length > 0) {
			return timelineQuery.items;
		}

		// While pending (or pending bootstrap), keep default messages visible as fallback.
		if (
			(isPendingConversation || isPendingConversationBootstrap) &&
			effectiveDefaultTimelineItems.length > 0
		) {
			return effectiveDefaultTimelineItems;
		}

		// Use passed items as fallback
		if (passedItems.length > 0) {
			return passedItems;
		}

		return [];
	}, [
		timelineQuery.items,
		isPendingConversation,
		isPendingConversationBootstrap,
		effectiveDefaultTimelineItems,
		passedItems,
	]);

	const shouldShowIdentificationTool = useMemo(() => {
		if (!isHydrated) {
			return false;
		}

		if (isPendingConversation) {
			return false;
		}

		// Hide identification form when an AI agent is available
		if (availableAIAgents.length > 0) {
			return false;
		}

		// Don't show identification form while identification is in progress
		// This prevents the form from flashing when an authenticated user opens the widget
		if (identificationState?.isIdentifying) {
			return false;
		}

		if (visitor?.contact) {
			return false;
		}

		return !baseItems.some(
			(item) => item.type === ConversationTimelineType.IDENTIFICATION
		);
	}, [
		baseItems,
		isHydrated,
		isPendingConversation,
		visitor?.contact,
		identificationState?.isIdentifying,
		availableAIAgents.length,
	]);

	const displayItems = useMemo(() => {
		if (!shouldShowIdentificationTool) {
			return baseItems;
		}

		const organizationId =
			baseItems.at(-1)?.organizationId ??
			client?.getConfiguration().organizationId ??
			"";

		const identificationItem: TimelineItem = {
			id: `identification-${conversationLifecycleId}`,
			conversationId: conversationLifecycleId,
			organizationId,
			visibility: TimelineItemVisibility.PUBLIC,
			type: ConversationTimelineType.IDENTIFICATION,
			text: null,
			tool: "identification",
			parts: [],
			userId: null,
			visitorId: visitor?.id ?? null,
			aiAgentId: null,
			// shouldShowIdentificationTool is gated on hydration, so this only
			// runs client-side and always yields a valid timestamp.
			createdAt: new Date().toISOString(),
			deletedAt: null,
		};

		return [...baseItems, identificationItem];
	}, [
		baseItems,
		client,
		conversationLifecycleId,
		shouldShowIdentificationTool,
		visitor?.id,
	]);

	const lastTimelineItem = useMemo(
		() => displayItems.at(-1) ?? null,
		[displayItems]
	);

	const timelineError = useMemo(() => {
		if (
			isPendingConversationBootstrap &&
			isNotFoundError(timelineQuery.error)
		) {
			return null;
		}

		return timelineQuery.error;
	}, [isPendingConversationBootstrap, timelineQuery.error]);

	const handleConversationInitiated = useCallback(
		(newConversationId: string) => {
			// Single source of truth for pending -> real conversation transition.
			if (isPendingConversation) {
				setConversationId(newConversationId);
			}
		},
		[isPendingConversation, setConversationId]
	);

	// 5. Set up message composer
	const composer = useMessageComposer({
		client: client ?? undefined,
		conversationId: realConversationId,
		defaultTimelineItems: effectiveDefaultTimelineItems,
		visitorId: visitor?.id,
		onConversationInitiated: handleConversationInitiated,
		// Pass WebSocket connection for real-time typing events
		realtimeSend: websocket?.send ?? null,
		isRealtimeConnected,
	});

	const initialMessageSubmittedRef = useRef(false);
	const lastInitialMessageRef = useRef<string | null>(null);

	useEffect(() => {
		if (!hasInitialMessage) {
			initialMessageSubmittedRef.current = false;
			lastInitialMessageRef.current = null;
			return;
		}

		if (lastInitialMessageRef.current !== trimmedInitialMessage) {
			initialMessageSubmittedRef.current = false;
			lastInitialMessageRef.current = trimmedInitialMessage;
		}

		if (!isPendingConversation) {
			return;
		}

		if (composer.message !== trimmedInitialMessage) {
			composer.setMessage(trimmedInitialMessage);
			return;
		}

		if (
			initialMessageSubmittedRef.current ||
			composer.isSubmitting ||
			!composer.canSubmit
		) {
			return;
		}

		initialMessageSubmittedRef.current = true;
		composer.submit();
	}, [
		hasInitialMessage,
		isPendingConversation,
		composer.message,
		composer.setMessage,
		composer.isSubmitting,
		composer.canSubmit,
		composer.submit,
		trimmedInitialMessage,
	]);

	// 6. Auto-mark messages as seen
	useConversationAutoSeen({
		client,
		conversationId: realConversationId,
		visitorId: visitor?.id,
		lastTimelineItem,
		enabled: autoSeenEnabled && shouldEnableConversationNetworkSync,
		isWidgetOpen: autoSeenEnabled,
	});

	return {
		conversationId: conversationLifecycleId,
		isPending: isPendingConversation,
		items: displayItems,
		isLoading: timelineQuery.isLoading,
		error: timelineError || composer.error,
		composer: {
			message: composer.message,
			files: composer.files,
			isSubmitting: composer.isSubmitting,
			isUploading: composer.isUploading,
			canSubmit: composer.canSubmit,
			setMessage: composer.setMessage,
			addFiles: composer.addFiles,
			removeFile: composer.removeFile,
			submit: composer.submit,
		},
		hasItems: displayItems.length > 0,
		lastTimelineItem,
	};
}
