import type { SenderType } from "@plasma/types";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import type { ConversationSeen } from "@plasma/types/schemas";
import { useMemo } from "react";
import { getTimelineItemSender } from "../../utils/timeline-item-sender";
import { getToolNameFromTimelineItem } from "../../utils/timeline-tool";

export type GroupedMessage = {
	type: "message_group";
	senderId: string;
	senderType: SenderType;
	items: TimelineItem[];
	firstMessageId: string;
	lastMessageId: string;
	firstMessageTime: Date;
	lastMessageTime: Date;
};

export type GroupedActivity = {
	type: "activity_group";
	senderId: string;
	senderType: SenderType;
	items: TimelineItem[];
	firstItemId: string;
	lastItemId: string;
	firstItemTime: Date;
	lastItemTime: Date;
	hasEvent: boolean;
	hasTool: boolean;
};

export type TimelineEventItem = {
	type: "timeline_event";
	item: TimelineItem;
	timestamp: Date;
};

export type TimelineToolItem = {
	type: "timeline_tool";
	item: TimelineItem;
	tool: string | null;
	timestamp: Date;
};

export type DaySeparatorItem = {
	type: "day_separator";
	date: Date;
	dateString: string; // ISO date string (YYYY-MM-DD) for stable keys
};

export type ConversationItem =
	| GroupedMessage
	| GroupedActivity
	| TimelineEventItem
	| TimelineToolItem
	| DaySeparatorItem;

export type UseGroupedMessagesOptions = {
	items: TimelineItem[];
	seenData?: ConversationSeen[];
	currentViewerId?: string; // The ID of the current viewer (visitor, user, or AI agent)
};

export type UseGroupedMessagesProps = UseGroupedMessagesOptions;

export type PreparedTimelineItems = {
	items: TimelineItem[];
	times: number[];
	didSort: boolean;
};

export const TIMELINE_GROUP_WINDOW_MS = 5 * 60 * 1000;

// Helper function to safely get timestamp from Date or string
const getTimestamp = (date: Date | string | null | undefined): number => {
	if (!date) {
		return 0;
	}
	if (typeof date === "string") {
		return new Date(date).getTime();
	}
	return date.getTime();
};

// Helper to extract the date string (YYYY-MM-DD) from a Date for day comparison
const getDateString = (date: Date): string => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
};

// Helper to create a Date at midnight for a given date string
const createDayDate = (dateString: string): Date => {
	const [year, month, day] = dateString.split("-").map(Number);
	return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 0, 0, 0, 0);
};

const EMPTY_STRING_ARRAY: readonly string[] = Object.freeze([]);

type GroupableTimelineItemType =
	| "message"
	| "activity"
	| "standalone_tool"
	| "standalone_event";

/** Tool names that should never be grouped with other activity items. */
const STANDALONE_TOOL_NAMES = new Set(["aiCreditUsage", "generationUsage"]);

function getGroupableTimelineItemType(
	item: TimelineItem
): GroupableTimelineItemType {
	if (item.type === "message") {
		return "message";
	}

	if (item.type === "identification") {
		return "standalone_tool";
	}

	if (
		item.type === "tool" &&
		STANDALONE_TOOL_NAMES.has(getToolNameFromTimelineItem(item) ?? "")
	) {
		return "standalone_tool";
	}

	if (item.type === "event" || item.type === "tool") {
		return "activity";
	}

	return "standalone_event";
}

export const prepareTimelineItems = (
	items: TimelineItem[]
): PreparedTimelineItems => {
	if (items.length <= 1) {
		return {
			items,
			times: items.map((item) => getTimestamp(item.createdAt)),
			didSort: false,
		};
	}

	const times = new Array<number>(items.length);
	let isSorted = true;

	for (let index = 0; index < items.length; index++) {
		const item = items[index];
		const time = getTimestamp(item?.createdAt);
		times[index] = time;

		if (index === 0) {
			continue;
		}

		const previousTime = times[index - 1];
		if (
			previousTime !== undefined &&
			time !== undefined &&
			time < previousTime
		) {
			isSorted = false;
		}
	}

	if (isSorted) {
		return { items, times, didSort: false };
	}

	const entries = items.map((item, index) => ({
		item,
		time: times[index] ?? 0,
		index,
	}));

	entries.sort((a, b) => {
		if (a.time === b.time) {
			return a.index - b.index;
		}
		return a.time - b.time;
	});

	return {
		items: entries.map((entry) => entry.item),
		times: entries.map((entry) => entry.time),
		didSort: true,
	};
};

const isWithinGroupingWindow = (
	previousTimestamp: number,
	currentTimestamp: number
): boolean => currentTimestamp - previousTimestamp <= TIMELINE_GROUP_WINDOW_MS;

// Helper function to group timeline items with a sender + time window policy.
// - message items group with messages only
// - event + tool items group together
// - identification remains standalone to preserve the interactive identification form
// Also inserts day separators when the day changes between items.
export const groupTimelineItems = (
	items: TimelineItem[],
	itemTimes: number[]
): ConversationItem[] => {
	const result: ConversationItem[] = [];
	let currentMessageGroup: GroupedMessage | null = null;
	let currentActivityGroup: GroupedActivity | null = null;
	let currentDayString: string | null = null;

	const flushMessageGroup = () => {
		if (!currentMessageGroup) {
			return;
		}

		result.push(currentMessageGroup);
		currentMessageGroup = null;
	};

	const flushActivityGroup = () => {
		if (!currentActivityGroup) {
			return;
		}

		result.push(currentActivityGroup);
		currentActivityGroup = null;
	};

	const flushAllGroups = () => {
		flushMessageGroup();
		flushActivityGroup();
	};

	const maybeInsertDaySeparator = (itemDate: Date): void => {
		const itemDayString = getDateString(itemDate);

		if (currentDayString === itemDayString) {
			return;
		}

		flushAllGroups();
		result.push({
			type: "day_separator",
			date: createDayDate(itemDayString),
			dateString: itemDayString,
		});
		currentDayString = itemDayString;
	};

	for (let index = 0; index < items.length; index++) {
		const item = items[index];
		if (!item) {
			continue;
		}

		const itemTimestamp = itemTimes[index] ?? getTimestamp(item.createdAt);
		const itemDate = new Date(itemTimestamp);

		maybeInsertDaySeparator(itemDate);

		const groupableType = getGroupableTimelineItemType(item);

		if (groupableType === "message") {
			flushActivityGroup();

			const { senderId, senderType } = getTimelineItemSender(item);
			const previousTimestamp = currentMessageGroup?.lastMessageTime.getTime();
			const canAppendToCurrentGroup = Boolean(
				currentMessageGroup &&
					currentMessageGroup.senderId === senderId &&
					previousTimestamp !== undefined &&
					isWithinGroupingWindow(previousTimestamp, itemTimestamp)
			);

			if (canAppendToCurrentGroup && currentMessageGroup) {
				currentMessageGroup.items.push(item);
				currentMessageGroup.lastMessageId =
					item.id || currentMessageGroup.lastMessageId;
				currentMessageGroup.lastMessageTime = itemDate;
				continue;
			}

			flushMessageGroup();
			currentMessageGroup = {
				type: "message_group",
				senderId,
				senderType,
				items: [item],
				firstMessageId: item.id || "",
				lastMessageId: item.id || "",
				firstMessageTime: itemDate,
				lastMessageTime: itemDate,
			};
			continue;
		}

		if (groupableType === "activity") {
			flushMessageGroup();

			const { senderId, senderType } = getTimelineItemSender(item);
			const previousTimestamp = currentActivityGroup?.lastItemTime.getTime();
			const canAppendToCurrentGroup = Boolean(
				currentActivityGroup &&
					currentActivityGroup.senderId === senderId &&
					previousTimestamp !== undefined &&
					isWithinGroupingWindow(previousTimestamp, itemTimestamp)
			);

			if (canAppendToCurrentGroup && currentActivityGroup) {
				currentActivityGroup.items.push(item);
				currentActivityGroup.lastItemId =
					item.id || currentActivityGroup.lastItemId;
				currentActivityGroup.lastItemTime = itemDate;
				currentActivityGroup.hasEvent =
					currentActivityGroup.hasEvent || item.type === "event";
				currentActivityGroup.hasTool =
					currentActivityGroup.hasTool || item.type === "tool";
				continue;
			}

			flushActivityGroup();
			currentActivityGroup = {
				type: "activity_group",
				senderId,
				senderType,
				items: [item],
				firstItemId: item.id || "",
				lastItemId: item.id || "",
				firstItemTime: itemDate,
				lastItemTime: itemDate,
				hasEvent: item.type === "event",
				hasTool: item.type === "tool",
			};
			continue;
		}

		flushAllGroups();

		if (groupableType === "standalone_tool") {
			result.push({
				type: "timeline_tool",
				item,
				tool: getToolNameFromTimelineItem(item),
				timestamp: itemDate,
			});
			continue;
		}

		result.push({
			type: "timeline_event",
			item,
			timestamp: itemDate,
		});
	}

	flushAllGroups();

	return result;
};

// Build read receipt data for timeline items.
// Accepts pre-sorted message items and timestamps for performance.
export const buildTimelineReadReceiptData = (
	seenData: ConversationSeen[],
	sortedMessageItems: TimelineItem[],
	sortedMessageTimes: number[]
) => {
	const seenByMap = new Map<string, Set<string>>();
	const lastReadMessageMap = new Map<string, string>();
	const unreadCountMap = new Map<string, number>();

	for (const item of sortedMessageItems) {
		if (item.id) {
			seenByMap.set(item.id, new Set());
		}
	}

	if (seenData.length === 0 || sortedMessageItems.length === 0) {
		return { seenByMap, lastReadMessageMap, unreadCountMap };
	}

	for (const seen of seenData) {
		const seenTime = getTimestamp(seen.lastSeenAt);
		const viewerId = seen.userId || seen.visitorId || seen.aiAgentId;
		if (!viewerId) {
			continue;
		}

		let lastReadItem: TimelineItem | null = null;
		let unreadCount = 0;

		for (let index = 0; index < sortedMessageItems.length; index++) {
			const item = sortedMessageItems[index];
			if (!item) {
				continue;
			}

			const itemTime =
				sortedMessageTimes[index] ?? getTimestamp(item.createdAt);

			if (itemTime <= seenTime) {
				if (item.id) {
					const seenBy = seenByMap.get(item.id);
					seenBy?.add(viewerId);
				}
				lastReadItem = item;
				continue;
			}

			unreadCount++;
		}

		if (lastReadItem?.id) {
			lastReadMessageMap.set(viewerId, lastReadItem.id);
		}

		unreadCountMap.set(viewerId, unreadCount);
	}

	return { seenByMap, lastReadMessageMap, unreadCountMap };
};

/**
 * Batches sequential timeline items from the same sender into groups and enriches
 * them with read-receipt helpers so UIs can render conversation timelines with
 * minimal effort. Seen data is normalised into quick lookup maps for unread
 * indicators.
 */
export const useGroupedMessages = ({
	items,
	seenData = [],
	currentViewerId,
}: UseGroupedMessagesOptions) => {
	return useMemo(() => {
		const preparedItems = prepareTimelineItems(items);
		const groupedItems = groupTimelineItems(
			preparedItems.items,
			preparedItems.times
		);

		const sortedMessageItems: TimelineItem[] = [];
		const sortedMessageTimes: number[] = [];
		const messageIndexMap = new Map<string, number>();

		for (let index = 0; index < preparedItems.items.length; index++) {
			const item = preparedItems.items[index];
			if (item?.type !== "message") {
				continue;
			}

			const messageIndex = sortedMessageItems.length;
			sortedMessageItems.push(item);
			sortedMessageTimes.push(
				preparedItems.times[index] ?? getTimestamp(item.createdAt)
			);

			if (item.id) {
				messageIndexMap.set(item.id, messageIndex);
			}
		}

		const { seenByMap, lastReadMessageMap, unreadCountMap } =
			buildTimelineReadReceiptData(
				seenData,
				sortedMessageItems,
				sortedMessageTimes
			);

		// Cache for turning seen sets into stable arrays across renders
		const seenByArrayCache = new Map<string, readonly string[]>();

		return {
			items: groupedItems,
			seenByMap,
			lastReadMessageMap,
			unreadCountMap,

			isMessageSeenByViewer: (messageId: string): boolean => {
				if (!currentViewerId) {
					return false;
				}
				const seenBy = seenByMap.get(messageId);
				return seenBy ? seenBy.has(currentViewerId) : false;
			},

			getMessageSeenBy: (messageId: string): readonly string[] => {
				if (seenByArrayCache.has(messageId)) {
					return seenByArrayCache.get(messageId) ?? EMPTY_STRING_ARRAY;
				}

				const seenBy = seenByMap.get(messageId);
				if (!seenBy || seenBy.size === 0) {
					seenByArrayCache.set(messageId, EMPTY_STRING_ARRAY);
					return EMPTY_STRING_ARRAY;
				}

				const result = Object.freeze(Array.from(seenBy)) as readonly string[];
				seenByArrayCache.set(messageId, result);
				return result;
			},

			getLastReadMessageId: (userId: string): string | undefined =>
				lastReadMessageMap.get(userId),

			isLastReadMessage: (messageId: string, userId: string): boolean =>
				lastReadMessageMap.get(userId) === messageId,

			getUnreadCount: (userId: string): number =>
				unreadCountMap.get(userId) || 0,

			hasUnreadAfter: (messageId: string, userId: string): boolean => {
				const lastRead = lastReadMessageMap.get(userId);
				if (!lastRead) {
					return true;
				}

				// Use index map for O(1) lookups instead of findIndex O(n)
				const messageIndex = messageIndexMap.get(messageId);
				const lastReadIndex = messageIndexMap.get(lastRead);

				if (messageIndex === undefined || lastReadIndex === undefined) {
					return true;
				}

				return messageIndex < lastReadIndex;
			},
		};
	}, [items, seenData, currentViewerId]);
};
