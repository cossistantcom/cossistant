import { CossistantAPIError, type CossistantClient } from "@plasma/core";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import { useEffect, useRef } from "react";
import { useWindowVisibilityFocus } from "./use-window-visibility-focus";

export const CONVERSATION_AUTO_SEEN_DELAY_MS = 2000;

function isNotFoundError(error: unknown): boolean {
	return error instanceof CossistantAPIError && error.code === "HTTP_404";
}

export type UseConversationAutoSeenOptions = {
	/**
	 * The Cossistant client instance.
	 */
	client: CossistantClient | null;

	/**
	 * The real conversation ID. Pass null if no conversation exists yet.
	 */
	conversationId: string | null;

	/**
	 * Current visitor ID.
	 */
	visitorId?: string;

	/**
	 * The last timeline item in the conversation.
	 * Used to determine if we should mark as seen.
	 */
	lastTimelineItem: TimelineItem | null;

	/**
	 * Whether to enable auto-seen tracking.
	 * Default: true
	 */
	enabled?: boolean;

	/**
	 * Whether the support widget is currently open/visible.
	 * This is required to ensure we only mark conversations as seen when
	 * the widget is actually visible to the user.
	 * Default: true
	 */
	isWidgetOpen?: boolean;
};

/**
 * Automatically marks timeline items as seen when:
 * - A new timeline item arrives from someone else
 * - The page is visible
 * - The support widget is open/visible
 * - The visitor is the current user
 *
 * Also handles:
 * - Fetching and hydrating initial seen data
 * - Preventing duplicate API calls
 * - Page visibility tracking
 * - Widget visibility tracking
 *
 * @example
 * ```tsx
 * useConversationAutoSeen({
 *   client,
 *   conversationId: realConversationId,
 *   visitorId: visitor?.id,
 *   lastTimelineItem: items[items.length - 1] ?? null,
 * });
 * ```
 */
export function useConversationAutoSeen(
	options: UseConversationAutoSeenOptions
): void {
	const {
		client,
		conversationId,
		visitorId,
		lastTimelineItem,
		enabled = true,
		isWidgetOpen = true,
	} = options;

	const lastSeenItemIdRef = useRef<string | null>(null);
	const markSeenInFlightRef = useRef(false);
	const markSeenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const { isPageVisible } = useWindowVisibilityFocus();

	// Reset seen tracking when conversation changes
	useEffect(() => {
		lastSeenItemIdRef.current = null;
		markSeenInFlightRef.current = false;
		if (markSeenTimeoutRef.current) {
			clearTimeout(markSeenTimeoutRef.current);
			markSeenTimeoutRef.current = null;
		}
	}, [conversationId]);

	// Clear timeout immediately when widget closes and reset tracking
	useEffect(() => {
		if (!isWidgetOpen) {
			if (markSeenTimeoutRef.current) {
				clearTimeout(markSeenTimeoutRef.current);
				markSeenTimeoutRef.current = null;
			}
			markSeenInFlightRef.current = false;
			// Reset last seen item ID so we don't skip marking when widget reopens
			// This ensures we check again when the widget is reopened
			lastSeenItemIdRef.current = null;
		}
	}, [isWidgetOpen]);

	// Fetch and hydrate initial seen data when conversation loads
	useEffect(() => {
		if (enabled && client && conversationId) {
			void client
				.getConversationSeenData({ conversationId })
				.then((response) => {
					client.seenStore.hydrate(conversationId, response.seenData);
				})
				.catch((err) => {
					if (isNotFoundError(err)) {
						return;
					}

					console.error("Failed to fetch conversation seen data:", err);
				});
		}
	}, [enabled, client, conversationId]);

	// Auto-mark timeline items as seen
	useEffect(() => {
		const canMarkSeen =
			enabled &&
			isWidgetOpen &&
			client &&
			conversationId &&
			visitorId &&
			lastTimelineItem &&
			isPageVisible;

		if (!canMarkSeen) {
			if (markSeenTimeoutRef.current) {
				clearTimeout(markSeenTimeoutRef.current);
				markSeenTimeoutRef.current = null;
			}
			return;
		}

		if (markSeenTimeoutRef.current) {
			clearTimeout(markSeenTimeoutRef.current);
			markSeenTimeoutRef.current = null;
		}

		// Don't mark our own timeline items as seen via API (we already know we saw them)
		if (lastTimelineItem.visitorId === visitorId) {
			lastSeenItemIdRef.current = lastTimelineItem.id || null;
			return;
		}

		// Already marked this item
		if (lastSeenItemIdRef.current === lastTimelineItem.id) {
			return;
		}

		const pendingItemId = lastTimelineItem.id || null;

		markSeenTimeoutRef.current = setTimeout(() => {
			const attemptMarkSeen = () => {
				const stillCanMark =
					enabled &&
					isWidgetOpen &&
					client &&
					conversationId &&
					visitorId &&
					isPageVisible;

				if (!stillCanMark) {
					markSeenInFlightRef.current = false;
					markSeenTimeoutRef.current = null;
					return;
				}

				if (markSeenInFlightRef.current) {
					markSeenTimeoutRef.current = setTimeout(attemptMarkSeen, 100);
					return;
				}

				markSeenInFlightRef.current = true;

				client
					.markConversationSeen({ conversationId })
					.then((response) => {
						lastSeenItemIdRef.current = pendingItemId;

						// Optimistically update local seen store
						client.seenStore.upsert({
							conversationId,
							actorType: "visitor",
							actorId: visitorId,
							lastSeenAt: new Date(response.lastSeenAt).toISOString(),
						});
					})
					.catch((err) => {
						if (isNotFoundError(err)) {
							return;
						}

						console.error("Failed to mark conversation as seen:", err);
					})
					.finally(() => {
						markSeenInFlightRef.current = false;
						markSeenTimeoutRef.current = null;
					});
			};

			attemptMarkSeen();
		}, CONVERSATION_AUTO_SEEN_DELAY_MS);

		return () => {
			if (markSeenTimeoutRef.current) {
				clearTimeout(markSeenTimeoutRef.current);
				markSeenTimeoutRef.current = null;
			}
		};
	}, [
		enabled,
		isWidgetOpen,
		client,
		conversationId,
		visitorId,
		lastTimelineItem,
		isPageVisible,
	]);
}
