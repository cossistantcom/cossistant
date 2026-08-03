"use client";

import type { SenderType } from "@cossistant/types";
import type { TimelineItem as TimelineItemType } from "@cossistant/types/api/timeline-item";
import * as React from "react";
import { getTimelineItemSender } from "../utils/timeline-item-sender";
import { useRenderElement } from "../utils/use-render-element";

/**
 * Shape returned to render-prop children describing the grouped timeline items state
 * and viewer specific flags.
 */
export type TimelineItemGroupRenderProps = {
	// Sender information
	senderType: SenderType;
	senderId: string;
	viewerType?: SenderType;

	// POV flags - who is viewing
	isSentByViewer: boolean; // True if the current viewer sent these items
	isReceivedByViewer: boolean; // True if the current viewer received these items

	// Sender type flags for convenience
	isVisitor: boolean;
	isAI: boolean;
	isTeamMember: boolean;

	// Item info
	itemCount: number;
	firstItemId: string | undefined;
	lastItemId: string | undefined;

	// Seen status
	hasBeenSeenByViewer?: boolean;
	seenByIds?: readonly string[]; // IDs of users who have seen the last item in group
};

export type TimelineItemGroupProps = Omit<
	React.HTMLAttributes<HTMLDivElement>,
	"children"
> & {
	children?:
		| React.ReactNode
		| ((props: TimelineItemGroupRenderProps) => React.ReactNode);
	asChild?: boolean;
	className?: string;
	items: TimelineItemType[];

	// POV context - who is viewing these timeline items
	viewerId?: string; // ID of the current viewer
	viewerType?: SenderType; // Type of the current viewer

	// Seen data
	seenByIds?: readonly string[]; // IDs of users who have seen these timeline items
	lastReadItemIds?: Map<string, string>; // Map of userId -> lastItemId they read
};

/**
 * Groups sequential timeline items from the same sender and exposes render helpers
 * that describe who sent the batch and whether the active viewer has seen it.
 * Consumers can either render their own layout via a render prop or rely on
 * slotted children. Typically used for MESSAGE-type items; EVENT items are usually rendered separately.
 */
export const TimelineItemGroup = (() => {
	const Component = React.forwardRef<HTMLDivElement, TimelineItemGroupProps>(
		(
			{
				children,
				className,
				asChild = false,
				items = [],
				viewerId,
				seenByIds = [] as readonly string[],
				lastReadItemIds,
				...restProps
			},
			ref
		) => {
			const { viewerType, ...elementProps } = restProps;

			// Determine sender type from first timeline item in group
			const firstItem = items[0];
			const lastItem = items.at(-1);

			const { senderId, senderType } = firstItem
				? getTimelineItemSender(firstItem)
				: { senderId: "unknown", senderType: "team_member" as SenderType };

			// Determine POV
			const isSentByViewer = viewerId
				? senderId === viewerId
				: viewerType
					? senderType === viewerType
					: false;
			const isReceivedByViewer = viewerId
				? senderId !== viewerId
				: viewerType
					? senderType !== viewerType
					: true;

			// Convenience flags
			const isVisitor = senderType === "visitor";
			const isAI = senderType === "ai";
			const isTeamMember = senderType === "team_member";

			// Check if viewer has seen these timeline items
			const hasBeenSeenByViewer = viewerId
				? seenByIds.includes(viewerId)
				: undefined;

			const renderProps: TimelineItemGroupRenderProps = {
				senderType,
				senderId,
				viewerType,
				isSentByViewer,
				isReceivedByViewer,
				isVisitor,
				isAI,
				isTeamMember,
				itemCount: items.length,
				firstItemId: firstItem?.id,
				lastItemId: lastItem?.id,
				hasBeenSeenByViewer,
				seenByIds,
			};

			const content =
				typeof children === "function" ? children(renderProps) : children;

			return useRenderElement(
				"div",
				{
					className,
					asChild,
				},
				{
					ref,
					state: renderProps,
					props: {
						role: "group",
						"aria-label": `Timeline item group from ${senderType}`,
						...elementProps,
						children: content,
					},
				}
			);
		}
	);

	Component.displayName = "TimelineItemGroup";
	return Component;
})();

export type TimelineItemGroupAvatarProps = Omit<
	React.HTMLAttributes<HTMLDivElement>,
	"children"
> & {
	children?: React.ReactNode;
	asChild?: boolean;
	className?: string;
};

/**
 * Optional slot rendered next to a grouped batch to display an avatar, agent
 * badge or any other sender metadata supplied by the consumer UI.
 */
export const TimelineItemGroupAvatar = (() => {
	const Component = React.forwardRef<
		HTMLDivElement,
		TimelineItemGroupAvatarProps
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

	Component.displayName = "TimelineItemGroupAvatar";
	return Component;
})();

export type TimelineItemGroupHeaderProps = Omit<
	React.HTMLAttributes<HTMLDivElement>,
	"children"
> & {
	children?:
		| React.ReactNode
		| ((props: {
				name?: string;
				senderId?: string;
				senderType?: SenderType;
		  }) => React.ReactNode);
	asChild?: boolean;
	className?: string;
	name?: string;
	senderId?: string;
	senderType?: SenderType;
};

/**
 * Decorative or semantic wrapper rendered above a timeline item batch. Useful for
 * injecting agent names, timestamps or custom status labels tied to the sender
 * metadata supplied by `TimelineItemGroup`.
 */
export const TimelineItemGroupHeader = (() => {
	const Component = React.forwardRef<
		HTMLDivElement,
		TimelineItemGroupHeaderProps
	>(
		(
			{
				children,
				className,
				asChild = false,
				name,
				senderId,
				senderType,
				...props
			},
			ref
		) => {
			const content =
				typeof children === "function"
					? children({ name, senderId, senderType })
					: children;

			return useRenderElement(
				"div",
				{
					className,
					asChild,
				},
				{
					ref,
					props: {
						...props,
						children: content,
					},
				}
			);
		}
	);

	Component.displayName = "TimelineItemGroupHeader";
	return Component;
})();

export type TimelineItemGroupContentProps = Omit<
	React.HTMLAttributes<HTMLDivElement>,
	"children"
> & {
	children?: React.ReactNode;
	asChild?: boolean;
	className?: string;
};

/**
 * Container for the actual timeline items within a batch. Consumers can
 * override the structure while inheriting layout props passed down from the
 * parent group.
 */
export const TimelineItemGroupContent = (() => {
	const Component = React.forwardRef<
		HTMLDivElement,
		TimelineItemGroupContentProps
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

	Component.displayName = "TimelineItemGroupContent";
	return Component;
})();

export type TimelineItemGroupSeenIndicatorProps = Omit<
	React.HTMLAttributes<HTMLDivElement>,
	"children"
> & {
	children?:
		| React.ReactNode
		| ((props: {
				seenByIds: readonly string[];
				hasBeenSeen: boolean;
		  }) => React.ReactNode);
	asChild?: boolean;
	className?: string;
	seenByIds?: readonly string[];
};

/**
 * Utility slot for showing who has viewed the most recent timeline item in the
 * group. Works with simple text children or a render prop for advanced
 * displays.
 */
export const TimelineItemGroupSeenIndicator = (() => {
	const Component = React.forwardRef<
		HTMLDivElement,
		TimelineItemGroupSeenIndicatorProps
	>(
		(
			{
				children,
				className,
				asChild = false,
				seenByIds = [] as readonly string[],
				...props
			},
			ref
		) => {
			const hasBeenSeen = seenByIds.length > 0;
			const content =
				typeof children === "function"
					? children({ seenByIds, hasBeenSeen })
					: children;

			return useRenderElement(
				"div",
				{
					className,
					asChild,
				},
				{
					ref,
					props: {
						...props,
						children: content,
					},
				}
			);
		}
	);

	Component.displayName = "TimelineItemGroupSeenIndicator";
	return Component;
})();

export type TimelineItemGroupReadIndicatorProps = Omit<
	React.HTMLAttributes<HTMLDivElement>,
	"children"
> & {
	children?:
		| React.ReactNode
		| ((props: {
				readers: Array<{ userId: string; isLastRead: boolean }>;
				lastReaderIds: string[];
		  }) => React.ReactNode);
	asChild?: boolean;
	className?: string;
	itemId: string;
	lastReadItemIds?: Map<string, string>;
};

/**
 * Renders read receipts for the tail timeline item in a group. It surfaces the list
 * of readers and callers can decide whether to render avatars, tooltips or a
 * basic label.
 */
export const TimelineItemGroupReadIndicator = (() => {
	const Component = React.forwardRef<
		HTMLDivElement,
		TimelineItemGroupReadIndicatorProps
	>(
		(
			{
				children,
				className,
				asChild = false,
				itemId,
				lastReadItemIds,
				...props
			},
			ref
		) => {
			// Find all users who stopped reading at this timeline item
			const { lastReaderIds, readers } = React.useMemo(() => {
				const _lastReaderIds: string[] = [];
				const _readers: Array<{ userId: string; isLastRead: boolean }> = [];

				if (lastReadItemIds) {
					lastReadItemIds.forEach((lastItemId, userId) => {
						if (lastItemId === itemId) {
							_lastReaderIds.push(userId);
							_readers.push({ userId, isLastRead: true });
						}
					});
				}

				return { lastReaderIds: _lastReaderIds, readers: _readers };
			}, [itemId, lastReadItemIds]);

			const content =
				typeof children === "function"
					? children({ readers, lastReaderIds })
					: children;

			return useRenderElement(
				"div",
				{
					className,
					asChild,
				},
				{
					ref,
					props: {
						...props,
						children: content,
					},
				}
			);
		}
	);

	Component.displayName = "TimelineItemGroupReadIndicator";
	return Component;
})();
