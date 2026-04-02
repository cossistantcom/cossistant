import type {
	ConversationItem,
	GroupedActivity,
	TimelineToolItem,
} from "@plasma/next/hooks";
import { TIMELINE_GROUP_WINDOW_MS } from "@plasma/react/hooks";
import {
	SenderType,
	type SenderType as SenderTypeValue,
} from "@plasma/types";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import {
	isCustomerFacingToolTimelineItem,
	isInternalToolTimelineItem,
} from "@/lib/tool-timeline-visibility";

export type PublicActivityGroupRenderItem = Omit<GroupedActivity, "type"> & {
	type: "public_activity_group";
};

export type PublicTimelineToolRenderItem = Omit<TimelineToolItem, "type"> & {
	type: "public_timeline_tool";
};

export type DeveloperLogGroupRenderItem = {
	type: "developer_log_group";
	senderId: string;
	senderType: SenderTypeValue;
	items: TimelineItem[];
	firstItemId: string;
	lastItemId: string;
	firstItemTime: Date;
	lastItemTime: Date;
};

export type DashboardTimelineRenderItem =
	| Exclude<ConversationItem, GroupedActivity | TimelineToolItem>
	| PublicActivityGroupRenderItem
	| PublicTimelineToolRenderItem
	| DeveloperLogGroupRenderItem;

function resolveToolSender(item: TimelineItem): {
	senderId: string;
	senderType: SenderTypeValue;
} {
	if (item.userId) {
		return {
			senderId: item.userId,
			senderType: SenderType.TEAM_MEMBER,
		};
	}

	if (item.aiAgentId) {
		return {
			senderId: item.aiAgentId,
			senderType: SenderType.AI,
		};
	}

	if (item.visitorId) {
		return {
			senderId: item.visitorId,
			senderType: SenderType.VISITOR,
		};
	}

	return {
		senderId: item.id || "unknown-sender",
		senderType: SenderType.TEAM_MEMBER,
	};
}

function buildPublicActivityGroup(
	group: GroupedActivity,
	items: TimelineItem[]
): PublicActivityGroupRenderItem | null {
	if (items.length === 0) {
		return null;
	}

	const firstItem = items[0];
	const lastItem = items.at(-1);
	if (!(firstItem && lastItem)) {
		return null;
	}

	return {
		type: "public_activity_group",
		senderId: group.senderId,
		senderType: group.senderType,
		items,
		firstItemId: firstItem.id || group.firstItemId,
		lastItemId: lastItem.id || group.lastItemId,
		firstItemTime: new Date(firstItem.createdAt),
		lastItemTime: new Date(lastItem.createdAt),
		hasEvent: items.some((item) => item.type === "event"),
		hasTool: items.some((item) => item.type === "tool"),
	};
}

export function buildPublicActivityGroupFromTool(
	item: TimelineItem
): PublicActivityGroupRenderItem {
	const { senderId, senderType } = resolveToolSender(item);
	const itemDate = new Date(item.createdAt);

	return {
		type: "public_activity_group",
		senderId,
		senderType,
		items: [item],
		firstItemId: item.id || "",
		lastItemId: item.id || "",
		firstItemTime: itemDate,
		lastItemTime: itemDate,
		hasEvent: false,
		hasTool: true,
	};
}

function buildDeveloperLogGroup(
	items: TimelineItem[]
): DeveloperLogGroupRenderItem | null {
	if (items.length === 0) {
		return null;
	}

	const firstItem = items[0];
	const lastItem = items.at(-1);
	if (!(firstItem && lastItem)) {
		return null;
	}

	const { senderId, senderType } = resolveToolSender(firstItem);

	return {
		type: "developer_log_group",
		senderId,
		senderType,
		items,
		firstItemId: firstItem.id || "",
		lastItemId: lastItem.id || "",
		firstItemTime: new Date(firstItem.createdAt),
		lastItemTime: new Date(lastItem.createdAt),
	};
}

function splitActivityGroup(
	group: GroupedActivity,
	isDeveloperModeEnabled: boolean
): DashboardTimelineRenderItem[] {
	const renderItems: DashboardTimelineRenderItem[] = [];
	let currentKind: "public" | "developer_log" | null = null;
	let currentItems: TimelineItem[] = [];

	const flush = () => {
		if (currentItems.length === 0 || !currentKind) {
			return;
		}

		if (currentKind === "public") {
			const publicGroup = buildPublicActivityGroup(group, currentItems);
			if (publicGroup) {
				renderItems.push(publicGroup);
			}
		} else {
			const developerGroup = buildDeveloperLogGroup(currentItems);
			if (developerGroup) {
				renderItems.push(developerGroup);
			}
		}

		currentKind = null;
		currentItems = [];
	};

	for (const item of group.items) {
		if (item.type === "event") {
			if (currentKind !== "public") {
				flush();
				currentKind = "public";
			}
			currentItems.push(item);
			continue;
		}

		if (!isDeveloperModeEnabled && isInternalToolTimelineItem(item)) {
			flush();
			continue;
		}

		const nextKind = isCustomerFacingToolTimelineItem(item)
			? "public"
			: "developer_log";

		if (currentKind !== nextKind) {
			flush();
			currentKind = nextKind;
		}

		currentItems.push(item);
	}

	flush();

	return renderItems;
}

function canMergeDeveloperLogGroups(
	previous: DeveloperLogGroupRenderItem,
	next: DeveloperLogGroupRenderItem
): boolean {
	return (
		previous.senderId === next.senderId &&
		previous.senderType === next.senderType &&
		next.firstItemTime.getTime() - previous.lastItemTime.getTime() <=
			TIMELINE_GROUP_WINDOW_MS
	);
}

export function buildDashboardTimelineRenderItems(
	items: ConversationItem[],
	isDeveloperModeEnabled: boolean
): DashboardTimelineRenderItem[] {
	const renderItems: DashboardTimelineRenderItem[] = [];

	for (const item of items) {
		if (item.type === "activity_group") {
			for (const segment of splitActivityGroup(item, isDeveloperModeEnabled)) {
				const previousItem = renderItems.at(-1);

				if (
					segment.type === "developer_log_group" &&
					previousItem?.type === "developer_log_group" &&
					canMergeDeveloperLogGroups(previousItem, segment)
				) {
					previousItem.items.push(...segment.items);
					previousItem.lastItemId = segment.lastItemId;
					previousItem.lastItemTime = segment.lastItemTime;
					continue;
				}

				renderItems.push(segment);
			}
			continue;
		}

		if (item.type === "timeline_tool") {
			if (isCustomerFacingToolTimelineItem(item.item)) {
				renderItems.push({
					...item,
					type: "public_timeline_tool",
				});
				continue;
			}

			if (!(isDeveloperModeEnabled && isInternalToolTimelineItem(item.item))) {
				continue;
			}

			const developerGroup = buildDeveloperLogGroup([item.item]);
			if (!developerGroup) {
				continue;
			}

			const previousItem = renderItems.at(-1);
			if (
				previousItem?.type === "developer_log_group" &&
				canMergeDeveloperLogGroups(previousItem, developerGroup)
			) {
				previousItem.items.push(item.item);
				previousItem.lastItemId = developerGroup.lastItemId;
				previousItem.lastItemTime = developerGroup.lastItemTime;
				continue;
			}

			renderItems.push(developerGroup);
			continue;
		}

		renderItems.push(item);
	}

	return renderItems;
}
