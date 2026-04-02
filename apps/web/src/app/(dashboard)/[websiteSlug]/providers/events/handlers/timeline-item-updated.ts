import type { RealtimeEvent } from "@plasma/types/realtime-events";
import {
	type ConversationTimelineItem,
	upsertConversationTimelineItemInCache,
} from "@/data/conversation-message-cache";
import type { DashboardRealtimeContext } from "../types";

type TimelineItemUpdatedEvent = RealtimeEvent<"timelineItemUpdated">;

type ConversationTimelineItemsQueryInput = {
	conversationId?: string;
	websiteSlug?: string;
};

type QueryKeyInput = {
	input?: ConversationTimelineItemsQueryInput;
	type?: string;
};

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

export const handleTimelineItemUpdated = ({
	event,
	context,
}: {
	event: TimelineItemUpdatedEvent;
	context: DashboardRealtimeContext;
}) => {
	const { queryClient, website } = context;
	const { payload } = event;
	const { item } = payload;

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

		upsertConversationTimelineItemInCache(
			queryClient,
			queryKey,
			item as ConversationTimelineItem
		);
	}
};
