"use client";

import type { TimelineItem as TimelineItemType } from "@cossistant/types/api/timeline-item";
import * as React from "react";
import { useScrollMask } from "../hooks/use-scroll-mask";
import { useRenderElement } from "../utils/use-render-element";
import {
	composeConversationTimelineScrollHandlers,
	isConversationTimelinePrepend,
	mergeConversationTimelineStyles,
} from "./conversation-timeline-internal";

/**
 * High-level state of the timeline handed to render-prop children so they can show
 * skeletons, empty states or pagination affordances.
 */
export type ConversationTimelineRenderProps = {
	itemCount: number;
	isLoading?: boolean;
	hasMore?: boolean;
	isEmpty: boolean;
};

export type ConversationTimelineProps = Omit<
	React.HTMLAttributes<HTMLDivElement>,
	"children"
> & {
	children?:
		| React.ReactNode
		| ((props: ConversationTimelineRenderProps) => React.ReactNode);
	asChild?: boolean;
	className?: string;
	items?: TimelineItemType[];
	isLoading?: boolean;
	hasMore?: boolean;
	autoScroll?: boolean;
	maskHeight?: string;
	onScrollEnd?: () => void;
	onScrollStart?: () => void;
};

const BOTTOM_THRESHOLD_PX = 12;
const TOP_THRESHOLD_PX = 2;
/** Grace period after mount where all scrolls are instant (avoids animation on first render) */
const INITIAL_SCROLL_GRACE_MS = 300;

function getLastItemKey(items: TimelineItemType[]): string | number | null {
	if (items.length === 0) {
		return null;
	}

	const lastItem = items.at(-1);

	if (lastItem?.id) {
		return lastItem.id;
	}

	return lastItem?.createdAt ?? null;
}

/**
 * Scrollable conversation timeline that wires auto-scroll behaviour, live-region semantics and
 * pagination callbacks for displaying timeline items (messages, events, etc.).
 */
export const ConversationTimeline = (() => {
	const Component = React.forwardRef<HTMLDivElement, ConversationTimelineProps>(
		(
			{
				children,
				className,
				asChild = false,
				items = [],
				isLoading = false,
				hasMore = false,
				autoScroll = true,
				maskHeight,
				onScrollEnd,
				onScrollStart,
				style: styleProp,
				onScroll: onScrollProp,
				...props
			},
			ref
		) => {
			const internalRef = React.useRef<HTMLDivElement>(null);
			const { ref: scrollMaskRef, style: scrollMaskStyle } = useScrollMask({
				maskHeight: maskHeight ?? "54px",
				scrollbarWidth: "8px",
				topThreshold: TOP_THRESHOLD_PX,
				bottomThreshold: BOTTOM_THRESHOLD_PX,
			});

			const setRefs = React.useCallback(
				(node: HTMLDivElement | null) => {
					internalRef.current = node;
					(
						scrollMaskRef as React.MutableRefObject<HTMLDivElement | null>
					).current = node;
					if (typeof ref === "function") {
						ref(node);
					} else if (ref) {
						(ref as React.MutableRefObject<HTMLDivElement | null>).current =
							node;
					}
				},
				[ref, scrollMaskRef]
			);

			// Track mount time for grace period (instant scroll during initial load)
			const mountTimeRef = React.useRef(Date.now());
			const previousItemCount = React.useRef(items.length);
			const previousLastItemKey = React.useRef<string | number | null>(
				getLastItemKey(items)
			);
			const isPinnedToBottom = React.useRef(true);
			const isAtTop = React.useRef(true);

			const renderProps: ConversationTimelineRenderProps = {
				itemCount: items.length,
				isLoading,
				hasMore,
				isEmpty: items.length === 0,
			};

			const content =
				typeof children === "function" ? children(renderProps) : children;

			const lastItemKey = getLastItemKey(items);

			// Preserve the scroll position when older items are prepended via top
			// pagination. Runs on every commit (before the auto-scroll effect
			// updates the previous-* refs) so the stored scrollHeight is always
			// the one from the last paint.
			const previousScrollHeightRef = React.useRef(0);
			React.useLayoutEffect(() => {
				const element = internalRef.current;
				if (!element) {
					return;
				}

				const prepended = isConversationTimelinePrepend({
					previousItemCount: previousItemCount.current,
					nextItemCount: items.length,
					previousLastItemKey: previousLastItemKey.current,
					nextLastItemKey: lastItemKey,
				});

				if (prepended && !isPinnedToBottom.current) {
					element.scrollTop +=
						element.scrollHeight - previousScrollHeightRef.current;
				}

				previousScrollHeightRef.current = element.scrollHeight;
			});

			// Auto-scroll to bottom when new timeline items are added
			React.useEffect(() => {
				const element = internalRef.current;

				if (!(element && autoScroll)) {
					previousItemCount.current = items.length;
					previousLastItemKey.current = lastItemKey;
					return;
				}

				const hasNewItems = items.length > previousItemCount.current;
				const itemsRemoved = items.length < previousItemCount.current;
				const appendedNewItem =
					hasNewItems &&
					lastItemKey !== null &&
					lastItemKey !== previousLastItemKey.current;
				const replacedLastItem =
					!hasNewItems &&
					lastItemKey !== null &&
					lastItemKey !== previousLastItemKey.current;

				const isWithinGracePeriod =
					Date.now() - mountTimeRef.current < INITIAL_SCROLL_GRACE_MS;

				const shouldSnapToBottom =
					isWithinGracePeriod ||
					(itemsRemoved && isPinnedToBottom.current) ||
					(appendedNewItem && isPinnedToBottom.current) ||
					(replacedLastItem && isPinnedToBottom.current);

				if (shouldSnapToBottom) {
					// Instant scroll during grace period, smooth scroll after
					if (isWithinGracePeriod) {
						element.scrollTop = element.scrollHeight;
					} else {
						element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
					}
					isPinnedToBottom.current = true;
					isAtTop.current = false;
				}

				previousItemCount.current = items.length;
				previousLastItemKey.current = lastItemKey;
			}, [autoScroll, items.length, lastItemKey]);

			// Handle scroll events for infinite scrolling
			const handleScroll = React.useCallback(
				(e: React.UIEvent<HTMLDivElement>) => {
					const element = e.currentTarget;
					const { scrollTop, scrollHeight, clientHeight } = element;

					const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
					const pinnedNow = distanceFromBottom <= BOTTOM_THRESHOLD_PX;
					if (pinnedNow && !isPinnedToBottom.current) {
						onScrollEnd?.();
					}
					isPinnedToBottom.current = pinnedNow;

					const atTop = scrollTop <= TOP_THRESHOLD_PX;
					if (atTop && !isAtTop.current) {
						onScrollStart?.();
					}
					isAtTop.current = atTop;
				},
				[onScrollStart, onScrollEnd]
			);

			const mergedStyle = React.useMemo(
				() => mergeConversationTimelineStyles(styleProp, scrollMaskStyle),
				[styleProp, scrollMaskStyle]
			);

			const composedOnScroll = React.useMemo(
				() =>
					composeConversationTimelineScrollHandlers(handleScroll, onScrollProp),
				[handleScroll, onScrollProp]
			);

			return useRenderElement(
				"div",
				{
					className,
					asChild,
				},
				{
					ref: setRefs,
					state: renderProps,
					props: {
						role: "log",
						"aria-label": "Conversation timeline",
						"aria-live": "polite",
						"aria-relevant": "additions",
						...props,
						onScroll: composedOnScroll,
						style: mergedStyle,
						children: content,
					},
				}
			);
		}
	);

	Component.displayName = "ConversationTimeline";
	return Component;
})();

export type ConversationTimelineContainerProps = Omit<
	React.HTMLAttributes<HTMLDivElement>,
	"children"
> & {
	children?: React.ReactNode;
	asChild?: boolean;
	className?: string;
};

/**
 * Wrapper around the scrollable timeline giving consumers an easy hook to add
 * padding, backgrounds or transitions without touching the core timeline logic.
 */
export const ConversationTimelineContainer = (() => {
	const Component = React.forwardRef<
		HTMLDivElement,
		ConversationTimelineContainerProps
	>(({ children, className, asChild = false, ...props }, ref) =>
		useRenderElement(
			"div",
			{
				className,
				asChild,
			},
			{
				ref,
				props: {
					...props,
					children,
				},
			}
		)
	);

	Component.displayName = "ConversationTimelineContainer";
	return Component;
})();

export type ConversationTimelineLoadingProps = Omit<
	React.HTMLAttributes<HTMLDivElement>,
	"children"
> & {
	children?: React.ReactNode;
	asChild?: boolean;
	className?: string;
};

/**
 * Accessible status region for loading more timeline items. Lets host apps render
 * skeletons or shimmer states without reimplementing ARIA wiring.
 */
export const ConversationTimelineLoading = (() => {
	const Component = React.forwardRef<
		HTMLDivElement,
		ConversationTimelineLoadingProps
	>(({ children, className, asChild = false, ...props }, ref) =>
		useRenderElement(
			"div",
			{
				className,
				asChild,
			},
			{
				ref,
				props: {
					role: "status",
					"aria-label": "Loading timeline items",
					...props,
					children,
				},
			}
		)
	);

	Component.displayName = "ConversationTimelineLoading";
	return Component;
})();

export type ConversationTimelineEmptyProps = Omit<
	React.HTMLAttributes<HTMLDivElement>,
	"children"
> & {
	children?: React.ReactNode;
	asChild?: boolean;
	className?: string;
};

/**
 * Placeholder state rendered when no timeline items are present. Uses a polite status
 * region so screen readers announce the empty state.
 */
export const ConversationTimelineEmpty = (() => {
	const Component = React.forwardRef<
		HTMLDivElement,
		ConversationTimelineEmptyProps
	>(({ children, className, asChild = false, ...props }, ref) =>
		useRenderElement(
			"div",
			{
				className,
				asChild,
			},
			{
				ref,
				props: {
					role: "status",
					"aria-label": "No timeline items",
					...props,
					children,
				},
			}
		)
	);

	Component.displayName = "ConversationTimelineEmpty";
	return Component;
})();
