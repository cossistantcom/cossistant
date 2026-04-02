import type { RouterOutputs } from "@api/trpc/types";
import { ConversationStatus } from "@plasma/types";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
	buildConversationListModel,
	CONVERSATION_LIST_GAP,
} from "@/components/conversations-list/model";
import {
	ANALYTICS_HEIGHT,
	CATEGORY_LABELS,
	type CategoryType,
	type ConversationItem,
	HEADER_HEIGHT,
	ITEM_HEIGHT,
	PRIORITY_WEIGHTS,
	type VirtualListItem,
	WAITING_THRESHOLD_MS,
} from "@/components/conversations-list/types";
import { useWebsite } from "@/contexts/website";
import { useConversationHeaders } from "@/data/use-conversation-headers";
import { isInboundVisitorMessage } from "@/lib/conversation-messages";
import { useConversationFocusStore } from "./conversation-focus-store";

type ConversationStatusFilter = ConversationStatus | "archived" | null;

type ConversationHeader =
	RouterOutputs["conversation"]["listConversationsHeaders"]["items"][number];

type FilterResult = {
	conversations: ConversationHeader[];
	conversationMap: Map<string, ConversationHeader>;
	indexMap: Map<string, number>;
	statusCounts: {
		open: number;
		resolved: number;
		spam: number;
		archived: number;
	};
};

type SmartOrderResult = {
	items: VirtualListItem[];
	conversationIndexMap: Map<string, number>;
	categoryCounts: Record<CategoryType, number>;
};

/**
 * Count conversations by status
 */
function countStatus(
	conversation: ConversationHeader,
	statusCounts: FilterResult["statusCounts"]
) {
	if (conversation.deletedAt !== null) {
		statusCounts.archived++;
	} else if (conversation.status === ConversationStatus.OPEN) {
		statusCounts.open++;
	} else if (
		conversation.status === ConversationStatus.RESOLVED ||
		conversation.resolvedAt !== null
	) {
		statusCounts.resolved++;
	} else if (conversation.status === ConversationStatus.SPAM) {
		statusCounts.spam++;
	}
}

/**
 * Check if conversation matches status filter
 */
function matchesStatusFilter(
	conversation: ConversationHeader,
	selectedStatus: ConversationStatusFilter
): boolean {
	const statusFilter = selectedStatus ?? ConversationStatus.OPEN;

	if (statusFilter === "archived") {
		return conversation.deletedAt !== null;
	}

	switch (statusFilter) {
		case ConversationStatus.OPEN:
			return (
				conversation.status === ConversationStatus.OPEN &&
				!conversation.deletedAt
			);
		case ConversationStatus.RESOLVED:
			return (
				(conversation.status === ConversationStatus.RESOLVED ||
					conversation.resolvedAt !== null) &&
				!conversation.deletedAt
			);
		case ConversationStatus.SPAM:
			return (
				conversation.status === ConversationStatus.SPAM &&
				!conversation.deletedAt
			);
		default: {
			const _exhaustive: never = statusFilter;
			return true;
		}
	}
}

/**
 * Categorize a conversation for smart ordering
 */
function categorizeConversation(
	conversation: ConversationHeader,
	now: number
): CategoryType {
	// Category 1: Needs human intervention (escalated but not handled)
	if (conversation.escalatedAt && !conversation.escalationHandledAt) {
		return "needsHuman";
	}

	// Category 2: Needs clarification from the team
	if (conversation.activeClarification) {
		return "needsClarification";
	}

	// Category 3: Waiting 8+ hours (last message from visitor, > 8 hours old)
	const lastTimelineItem = conversation.lastTimelineItem;

	if (isInboundVisitorMessage(lastTimelineItem)) {
		const messageTime = Date.parse(lastTimelineItem.createdAt);

		if (now - messageTime > WAITING_THRESHOLD_MS) {
			return "waiting8Hours";
		}
	}

	// Category 4: Everything else
	return "other";
}

/**
 * Build smart ordered list with category headers
 * O(n) categorization + O(k log k) sort per category
 */
function buildSmartOrderedList(
	conversations: ConversationHeader[]
): SmartOrderResult {
	const now = Date.now();

	// Categorize all conversations (O(n))
	const categorized = new Map<CategoryType, ConversationItem[]>([
		["needsHuman", []],
		["needsClarification", []],
		["waiting8Hours", []],
		["other", []],
	]);

	for (const conversation of conversations) {
		const category = categorizeConversation(conversation, now);

		categorized.get(category)?.push({
			type: "conversation",
			conversation,
			category,
		});
	}

	// Sort "needsHuman", "needsClarification", and "waiting8Hours" by priority DESC, then lastMessageAt DESC
	const sortByPriorityThenTime = (categoryItems: ConversationItem[]) => {
		categoryItems.sort((a, b) => {
			// First by priority (higher priority first)
			const priorityA =
				PRIORITY_WEIGHTS[
					a.conversation.priority as keyof typeof PRIORITY_WEIGHTS
				] ?? 2;
			const priorityB =
				PRIORITY_WEIGHTS[
					b.conversation.priority as keyof typeof PRIORITY_WEIGHTS
				] ?? 2;

			if (priorityA !== priorityB) {
				return priorityB - priorityA;
			}

			// Then by last message time (most recent first)
			const timeA = Date.parse(
				a.conversation.lastMessageAt ?? a.conversation.updatedAt
			);
			const timeB = Date.parse(
				b.conversation.lastMessageAt ?? b.conversation.updatedAt
			);

			if (!(Number.isNaN(timeA) || Number.isNaN(timeB))) {
				return timeB - timeA;
			}

			return 0;
		});
	};

	// Sort "other" category only by last message time (most recent first)
	const sortByTimeOnly = (categoryItems: ConversationItem[]) => {
		categoryItems.sort((a, b) => {
			const timeA = Date.parse(
				a.conversation.lastMessageAt ?? a.conversation.updatedAt
			);
			const timeB = Date.parse(
				b.conversation.lastMessageAt ?? b.conversation.updatedAt
			);

			if (!(Number.isNaN(timeA) || Number.isNaN(timeB))) {
				return timeB - timeA;
			}

			return 0;
		});
	};

	// Apply appropriate sorting to each category
	const needsHumanItems = categorized.get("needsHuman");
	const needsClarificationItems = categorized.get("needsClarification");
	const waiting8HoursItems = categorized.get("waiting8Hours");
	const otherItems = categorized.get("other");

	if (needsHumanItems) {
		sortByPriorityThenTime(needsHumanItems);
	}
	if (needsClarificationItems) {
		sortByPriorityThenTime(needsClarificationItems);
	}
	if (waiting8HoursItems) {
		sortByPriorityThenTime(waiting8HoursItems);
	}
	if (otherItems) {
		sortByTimeOnly(otherItems);
	}

	// Build final list with headers
	const items: VirtualListItem[] = [];
	const conversationIndexMap = new Map<string, number>();
	const categoryCounts: Record<CategoryType, number> = {
		needsHuman: needsHumanItems?.length ?? 0,
		needsClarification: needsClarificationItems?.length ?? 0,
		waiting8Hours: waiting8HoursItems?.length ?? 0,
		other: otherItems?.length ?? 0,
	};

	// Check if we only have "other" conversations - if so, skip headers entirely
	const hasOnlyOther =
		categoryCounts.needsHuman === 0 &&
		categoryCounts.needsClarification === 0 &&
		categoryCounts.waiting8Hours === 0;

	const addCategory = (category: CategoryType, showHeader: boolean) => {
		const categoryItems = categorized.get(category);

		if (!categoryItems || categoryItems.length === 0) {
			return;
		}

		// Add header only if we have multiple categories
		if (showHeader) {
			items.push({
				type: "header",
				category,
				count: categoryItems.length,
				label: CATEGORY_LABELS[category],
			});
		}

		// Add conversations, tracking their indices
		for (const item of categoryItems) {
			conversationIndexMap.set(item.conversation.id, items.length);
			items.push(item);
		}
	};

	addCategory("needsHuman", true);
	addCategory("needsClarification", true);
	addCategory("waiting8Hours", true);
	addCategory("other", !hasOnlyOther);

	return { items, conversationIndexMap, categoryCounts };
}

/**
 * Single-pass filter and count function optimized for performance
 * This function processes conversations once to:
 * 1. Filter by status and view
 * 2. Count conversations by status
 * 3. Create lookup maps for O(1) access
 */
function filterAndProcessConversations(
	conversations: ConversationHeader[],
	selectedStatus: ConversationStatusFilter,
	selectedViewId: string | null,
	_selectedConversationId: string | null
): FilterResult {
	const statusCounts = { open: 0, resolved: 0, spam: 0, archived: 0 };
	const filteredConversations: ConversationHeader[] = [];
	const conversationMap = new Map<string, ConversationHeader>();
	const indexMap = new Map<string, number>();
	const sortMetadata = new Map<
		string,
		{
			lastInboundAt: number;
			lastActivityAt: number;
		}
	>();

	const toTimestamp = (value: string | null | undefined): number => {
		if (!value) {
			return Number.NEGATIVE_INFINITY;
		}

		const parsed = Date.parse(value);

		return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
	};

	// Single pass through conversations
	for (const conversation of conversations) {
		// Count by status (always count, regardless of filters)
		countStatus(conversation, statusCounts);

		// Check if conversation matches current filters
		const matchesStatus = matchesStatusFilter(conversation, selectedStatus);
		const matchesViewFilter =
			!selectedViewId || conversation.viewIds.includes(selectedViewId);

		// Add to filtered list if matches all filters OR if it is the selected conversation
		if (matchesStatus && matchesViewFilter) {
			filteredConversations.push(conversation);

			const lastActivityFromMessage = toTimestamp(conversation.lastMessageAt);
			const lastActivityAt =
				lastActivityFromMessage > Number.NEGATIVE_INFINITY
					? lastActivityFromMessage
					: toTimestamp(conversation.updatedAt);

			const lastTimelineItem = conversation.lastTimelineItem;
			const lastInboundAt = isInboundVisitorMessage(lastTimelineItem)
				? toTimestamp(lastTimelineItem.createdAt)
				: Number.NEGATIVE_INFINITY;

			sortMetadata.set(conversation.id, {
				lastInboundAt,
				lastActivityAt,
			});
		}
	}

	// Sort by lastMessageAt (most recent first) - in-place for efficiency
	filteredConversations.sort((a, b) => {
		const aMeta = sortMetadata.get(a.id);
		const bMeta = sortMetadata.get(b.id);
		const aInbound = aMeta?.lastInboundAt ?? Number.NEGATIVE_INFINITY;
		const bInbound = bMeta?.lastInboundAt ?? Number.NEGATIVE_INFINITY;
		const aActivity = aMeta?.lastActivityAt ?? Number.NEGATIVE_INFINITY;
		const bActivity = bMeta?.lastActivityAt ?? Number.NEGATIVE_INFINITY;

		if (aInbound < bInbound) {
			return 1;
		}

		if (aInbound > bInbound) {
			return -1;
		}

		if (aActivity < bActivity) {
			return 1;
		}

		if (aActivity > bActivity) {
			return -1;
		}

		return b.id.localeCompare(a.id);
	});

	// Build maps after sorting for correct indexes
	for (let i = 0; i < filteredConversations.length; i++) {
		const conversation = filteredConversations[i];

		if (conversation) {
			conversationMap.set(conversation.id, conversation);
			indexMap.set(conversation.id, i);
		}
	}

	return {
		conversations: filteredConversations,
		conversationMap,
		indexMap,
		statusCounts,
	};
}

/**
 * Optimized hook for filtering conversations with O(1) lookups and single-pass computation
 *
 * Performance optimizations:
 * - Single-pass computation for filtering and counting
 * - O(1) lookups using Maps for conversation access
 * - Efficient memoization to prevent unnecessary recalculations
 * - In-place sorting for better memory efficiency
 *
 * @param selectedViewId - The selected view ID
 * @param selectedConversationStatus - The selected conversation status filter
 * @param selectedConversationId - The currently selected conversation ID
 * @param basePath - The base path for navigation
 * @returns Filtered conversations with navigation utilities and O(1) lookup capabilities
 */
export function useFilteredConversations({
	selectedViewId,
	selectedConversationStatus,
	selectedConversationId,
	basePath,
}: {
	selectedViewId: string | null;
	selectedConversationStatus: ConversationStatusFilter;
	selectedConversationId: string | null;
	basePath: string;
}) {
	const website = useWebsite();
	const router = useRouter();
	const storeFocusedConversationId = useConversationFocusStore(
		(state) => state.setFocusedConversationId
	);
	const clearFocus = useConversationFocusStore((state) => state.clearFocus);

	const { conversations: unfilteredConversations, isLoading } =
		useConversationHeaders(website.slug);

	const { conversations, conversationMap, statusCounts } = useMemo(
		() =>
			filterAndProcessConversations(
				unfilteredConversations,
				selectedConversationStatus,
				selectedViewId,
				selectedConversationId
			),
		[
			unfilteredConversations,
			selectedConversationStatus,
			selectedViewId,
			selectedConversationId,
		]
	);

	// Build smart ordered list only when on main inbox (no status filter)
	const isSmartModeActive = selectedConversationStatus === null;

	const smartOrderResult = useMemo(() => {
		if (!isSmartModeActive) {
			return null;
		}

		return buildSmartOrderedList(conversations);
	}, [conversations, isSmartModeActive]);

	const activeConversationModel = useMemo(
		() =>
			buildConversationListModel({
				conversations,
				items: smartOrderResult?.items ?? null,
				itemHeight: ITEM_HEIGHT,
				headerHeight: HEADER_HEIGHT,
				analyticsHeight: ANALYTICS_HEIGHT,
				gap: CONVERSATION_LIST_GAP,
			}),
		[conversations, smartOrderResult]
	);

	const currentIndex = selectedConversationId
		? (activeConversationModel.conversationIdToOrderIndex.get(
				selectedConversationId
			) ?? -1)
		: -1;

	const selectedConversation = useMemo(() => {
		if (!selectedConversationId) {
			return null;
		}

		return (
			unfilteredConversations.find(
				(conversation) => conversation.id === selectedConversationId
			) ?? null
		);
	}, [selectedConversationId, unfilteredConversations]);

	const selectedConversationLocked = Boolean(
		selectedConversation?.dashboardLocked
	);

	const nextConversation =
		currentIndex >= 0 &&
		currentIndex < activeConversationModel.orderedConversations.length - 1
			? activeConversationModel.orderedConversations[currentIndex + 1] || null
			: null;

	const previousConversation =
		currentIndex > 0
			? activeConversationModel.orderedConversations[currentIndex - 1] || null
			: null;

	const conversationPath = useMemo(
		() => basePath.split("/").slice(0, -1).join("/"),
		[basePath]
	);

	const navigateToConversation = useCallback(
		(conversationId: string) => {
			storeFocusedConversationId(conversationId);
			router.push(`${conversationPath}/${conversationId}`);
		},
		[conversationPath, router, storeFocusedConversationId]
	);

	const navigateToNextConversation = useCallback(() => {
		if (nextConversation) {
			navigateToConversation(nextConversation.id);
		}
	}, [navigateToConversation, nextConversation]);

	const navigateToPreviousConversation = useCallback(() => {
		if (previousConversation) {
			navigateToConversation(previousConversation.id);
		}
	}, [navigateToConversation, previousConversation]);

	const goBack = useCallback(() => {
		router.push(`${conversationPath}`);
	}, [conversationPath, router]);

	const isConversationInCurrentFilter = useCallback(
		(conversationId: string) => conversationMap.has(conversationId),
		[conversationMap]
	);

	const getConversationById = useCallback(
		(conversationId: string) =>
			conversationMap.get(conversationId) ||
			unfilteredConversations.find(
				(conversation) => conversation.id === conversationId
			) ||
			null,
		[conversationMap, unfilteredConversations]
	);

	/**
	 * Navigate to next conversation if current one will leave the filter.
	 * Used after actions like archive, mark as spam, etc.
	 * Returns true if navigation happened, false otherwise.
	 */
	const navigateAwayIfNeeded = useCallback(
		(conversationId: string) => {
			if (
				!selectedConversationId ||
				conversationId !== selectedConversationId
			) {
				return false;
			}

			// Navigate to next, or previous, or go back to list
			if (nextConversation) {
				navigateToConversation(nextConversation.id);
				return true;
			}

			if (previousConversation) {
				navigateToConversation(previousConversation.id);
				return true;
			}

			// No other conversations, go back to list
			clearFocus();
			goBack();
			return true;
		},
		[
			clearFocus,
			goBack,
			navigateToConversation,
			selectedConversationId,
			nextConversation,
			previousConversation,
		]
	);

	return {
		conversations,
		conversationMap,
		indexMap: activeConversationModel.conversationIdToOrderIndex,
		statusCounts,
		selectedConversationIndex: currentIndex,
		selectedConversation,
		selectedConversationLocked,
		selectedVisitorId: selectedConversationLocked
			? null
			: selectedConversation?.visitorId || null,
		totalCount: conversations.length,
		isLoading,
		// Smart ordering
		smartOrderResult,
		isSmartModeActive,
		// Navigation
		goBack,
		nextConversation,
		previousConversation,
		navigateToNextConversation,
		navigateToPreviousConversation,
		navigateAwayIfNeeded,
		// Utilities
		isConversationInCurrentFilter,
		getConversationById,
	};
}
