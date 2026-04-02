import { clearTypingFromTimelineItem } from "@plasma/react/realtime/typing-store";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import type { RealtimeEvent } from "@plasma/types/realtime-events";
import { ensureDashboardConversationLockRedaction } from "@plasma/types/trpc/conversation-hard-limit";
import {
	type ConversationHeader,
	forEachConversationHeadersQuery,
	updateConversationHeaderInCache,
} from "@/data/conversation-header-cache";
import {
	type ConversationTimelineItem,
	reconcileOptimisticConversationTimelineItemInCache,
	upsertConversationTimelineItemInCache,
} from "@/data/conversation-message-cache";
import type { DashboardRealtimeContext } from "../types";

type TimelineItemCreatedEvent = RealtimeEvent<"timelineItemCreated">;

type ConversationTimelineItemsQueryInput = {
	conversationId?: string;
	websiteSlug?: string;
};

type QueryKeyInput = {
	input?: ConversationTimelineItemsQueryInput;
	type?: string;
};

function isToolTimelineItem(item: TimelineItem): boolean {
	return item.type === "tool";
}

function extractQueryInput(
	queryKey: readonly unknown[]
): ConversationTimelineItemsQueryInput | null {
	if (queryKey.length < 2) {
		return null;
	}

	const maybeInput = queryKey[1];
	if (!maybeInput || typeof maybeInput !== "object") {
		return null;
	}

	const input = (maybeInput as QueryKeyInput).input;
	if (!input || typeof input !== "object") {
		return null;
	}

	return input;
}

function isInfiniteQueryKey(queryKey: readonly unknown[]): boolean {
	const marker = queryKey[2];
	return Boolean(
		marker &&
			typeof marker === "object" &&
			"type" in marker &&
			(marker as QueryKeyInput).type === "infinite"
	);
}

export const handleMessageCreated = ({
	event,
	context,
}: {
	event: TimelineItemCreatedEvent;
	context: DashboardRealtimeContext;
}) => {
	const { queryClient, website } = context;
	const { payload } = event;
	const { item } = payload;

	// Clear typing state when a timeline item is created
	clearTypingFromTimelineItem(event);

	const queries = queryClient.getQueryCache().findAll({
		queryKey: [["conversation", "getConversationTimelineItems"]],
	});

	for (const query of queries) {
		const queryKey = query.queryKey as readonly unknown[];

		if (!isInfiniteQueryKey(queryKey)) {
			continue;
		}

		const input = extractQueryInput(queryKey);
		if (!input) {
			continue;
		}

		if (input.conversationId !== payload.conversationId) {
			continue;
		}

		if (input.websiteSlug !== website.slug) {
			continue;
		}

		reconcileOptimisticConversationTimelineItemInCache(
			queryClient,
			queryKey,
			item as ConversationTimelineItem
		);

		upsertConversationTimelineItemInCache(queryClient, queryKey, item);
	}

	const timelineItem = item as TimelineItem;

	// Keep tool timeline rows out of conversation header ordering/preview churn.
	if (isToolTimelineItem(timelineItem)) {
		return;
	}

	// Type assertion needed because TimelineItemParts contains complex union types
	// that don't fit @normy/react-query's simpler Data type constraints
	const existingHeader = context.queryNormalizer.getObjectById(
		payload.conversationId
	) as ConversationHeader | undefined;

	if (!existingHeader) {
		forEachConversationHeadersQuery(
			queryClient,
			context.website.slug,
			(queryKey) => {
				queryClient
					.invalidateQueries({
						queryKey,
						exact: true,
					})
					.catch((error) => {
						console.error(
							"Failed to invalidate conversation header queries:",
							error
						);
					});
			}
		);
		return;
	}

	const headerUpdater = createHeaderUpdaterFromTimelineItem(timelineItem);

	forEachConversationHeadersQuery(
		queryClient,
		context.website.slug,
		(queryKey) => {
			updateConversationHeaderInCache(
				queryClient,
				queryKey,
				payload.conversationId,
				headerUpdater
			);
		}
	);

	context.queryNormalizer.setNormalizedData(
		headerUpdater(existingHeader) as Parameters<
			typeof context.queryNormalizer.setNormalizedData
		>[0]
	);
};

function createHeaderUpdaterFromTimelineItem(
	item: TimelineItem
): (header: ConversationHeader) => ConversationHeader {
	const lastTimelineItem = toHeaderTimelineItem(item);
	const lastMessageAt = item.createdAt;

	if (!lastTimelineItem) {
		return (header) => header;
	}

	const isMessage = item.type === "message";

	return (header: ConversationHeader): ConversationHeader => {
		const updatedHeader: ConversationHeader = {
			...header,
			lastTimelineItem,
			// Update lastMessageTimelineItem when the new item is a message so the
			// conversations list preview picks it up immediately (it has priority
			// over lastTimelineItem in the fallback chain).
			...(isMessage ? { lastMessageTimelineItem: lastTimelineItem } : {}),
			lastMessageAt,
			updatedAt: lastMessageAt,
		};

		return ensureDashboardConversationLockRedaction(updatedHeader);
	};
}

function toHeaderTimelineItem(
	item: TimelineItem
): ConversationHeader["lastTimelineItem"] {
	if (!item.id) {
		console.warn(
			"Received timeline item without an id, skipping header timeline update",
			item
		);
		return null;
	}

	return {
		id: item.id,
		conversationId: item.conversationId,
		text: item.text ?? null,
		type: item.type,
		parts: item.parts,
		visibility: item.visibility,
		userId: item.userId,
		visitorId: item.visitorId,
		organizationId: item.organizationId,
		aiAgentId: item.aiAgentId,
		createdAt: item.createdAt,
		deletedAt: item.deletedAt ?? null,
	} satisfies NonNullable<ConversationHeader["lastTimelineItem"]>;
}
