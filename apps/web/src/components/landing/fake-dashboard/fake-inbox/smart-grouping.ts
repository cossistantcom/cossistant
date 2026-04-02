import type { ConversationHeader } from "@plasma/types";
import {
	CATEGORY_LABELS,
	type CategoryType,
	PRIORITY_WEIGHTS,
	WAITING_THRESHOLD_MS,
} from "@/components/conversations-list/types";
import { isInboundVisitorMessage } from "@/lib/conversation-messages";

export type FakeSmartHeaderItem = {
	type: "header";
	category: CategoryType;
	count: number;
	label: string;
};

export type FakeSmartConversationItem = {
	type: "conversation";
	category: CategoryType;
	conversation: ConversationHeader;
};

export type FakeSmartListItem = FakeSmartHeaderItem | FakeSmartConversationItem;

export type FakeSmartGroupingResult = {
	items: FakeSmartListItem[];
	categoryCounts: Record<CategoryType, number>;
};

function categorizeConversation(
	conversation: ConversationHeader,
	now: number
): CategoryType {
	if (conversation.escalatedAt && !conversation.escalationHandledAt) {
		return "needsHuman";
	}

	if (conversation.activeClarification) {
		return "needsClarification";
	}

	if (isInboundVisitorMessage(conversation.lastTimelineItem)) {
		const messageTime = Date.parse(conversation.lastTimelineItem.createdAt);
		if (
			!Number.isNaN(messageTime) &&
			now - messageTime > WAITING_THRESHOLD_MS
		) {
			return "waiting8Hours";
		}
	}

	return "other";
}

function toPriorityWeight(conversation: ConversationHeader): number {
	return (
		PRIORITY_WEIGHTS[conversation.priority as keyof typeof PRIORITY_WEIGHTS] ??
		PRIORITY_WEIGHTS.normal
	);
}

function toSortTimestamp(conversation: ConversationHeader): number {
	const parsed = Date.parse(
		conversation.lastMessageAt ?? conversation.updatedAt
	);
	return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function sortByPriorityThenTime(items: FakeSmartConversationItem[]) {
	items.sort((a, b) => {
		const priorityDiff =
			toPriorityWeight(b.conversation) - toPriorityWeight(a.conversation);
		if (priorityDiff !== 0) {
			return priorityDiff;
		}

		return toSortTimestamp(b.conversation) - toSortTimestamp(a.conversation);
	});
}

function sortByTimeOnly(items: FakeSmartConversationItem[]) {
	items.sort(
		(a, b) => toSortTimestamp(b.conversation) - toSortTimestamp(a.conversation)
	);
}

export function buildFakeSmartOrderedList(
	conversations: ConversationHeader[]
): FakeSmartGroupingResult {
	const now = Date.now();
	const openConversations = conversations.filter(
		(conversation) => conversation.status === "open" && !conversation.deletedAt
	);

	const categorized = new Map<CategoryType, FakeSmartConversationItem[]>([
		["needsHuman", []],
		["needsClarification", []],
		["waiting8Hours", []],
		["other", []],
	]);

	for (const conversation of openConversations) {
		const category = categorizeConversation(conversation, now);
		categorized.get(category)?.push({
			type: "conversation",
			category,
			conversation,
		});
	}

	const needsHumanItems = categorized.get("needsHuman") ?? [];
	const needsClarificationItems = categorized.get("needsClarification") ?? [];
	const waitingItems = categorized.get("waiting8Hours") ?? [];
	const otherItems = categorized.get("other") ?? [];

	sortByPriorityThenTime(needsHumanItems);
	sortByPriorityThenTime(needsClarificationItems);
	sortByPriorityThenTime(waitingItems);
	sortByTimeOnly(otherItems);

	const categoryCounts: Record<CategoryType, number> = {
		needsHuman: needsHumanItems.length,
		needsClarification: needsClarificationItems.length,
		waiting8Hours: waitingItems.length,
		other: otherItems.length,
	};

	const onlyOther =
		categoryCounts.needsHuman === 0 &&
		categoryCounts.needsClarification === 0 &&
		categoryCounts.waiting8Hours === 0;

	const items: FakeSmartListItem[] = [];
	const addCategory = (category: CategoryType, withHeader: boolean) => {
		const categoryItems = categorized.get(category) ?? [];
		if (categoryItems.length === 0) {
			return;
		}

		if (withHeader) {
			items.push({
				type: "header",
				category,
				count: categoryItems.length,
				label: CATEGORY_LABELS[category],
			});
		}

		items.push(...categoryItems);
	};

	addCategory("needsHuman", true);
	addCategory("needsClarification", true);
	addCategory("waiting8Hours", true);
	addCategory("other", !onlyOther);

	return { items, categoryCounts };
}
