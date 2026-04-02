"use client";

import { ConversationTimelineType } from "@plasma/types";
import type { InfiniteData } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { ConversationHeader } from "@/contexts/inboxes";
import { useTRPC } from "@/lib/trpc/client";
import {
	type ConversationTimelineItemsPage,
	createConversationTimelineItemsInfiniteQueryKey,
} from "./conversation-message-cache";

type LastTimelineItem = ConversationHeader["lastTimelineItem"];

type UseLatestConversationMessageOptions = {
	conversationId: string;
	websiteSlug: string;
	limit?: number;
};

function findLatestTimelineItem(
	data: InfiniteData<ConversationTimelineItemsPage> | undefined
): LastTimelineItem {
	if (!data) {
		return null;
	}

	for (let pageIndex = data.pages.length - 1; pageIndex >= 0; pageIndex--) {
		const page = data.pages[pageIndex];
		if (!page) {
			continue;
		}

		for (let itemIndex = page.items.length - 1; itemIndex >= 0; itemIndex--) {
			const item = page.items[itemIndex];

			if (item?.type === ConversationTimelineType.MESSAGE) {
				return item as LastTimelineItem;
			}
		}
	}

	return null;
}

export function useLatestConversationMessage({
	conversationId,
	websiteSlug,
	limit = 50,
}: UseLatestConversationMessageOptions): LastTimelineItem {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const baseQueryKey = useMemo(
		() =>
			trpc.conversation.getConversationTimelineItems.queryOptions({
				websiteSlug,
				conversationId,
				limit,
			}).queryKey,
		[conversationId, limit, trpc, websiteSlug]
	);

	const queryKey = useMemo(
		() => createConversationTimelineItemsInfiniteQueryKey(baseQueryKey),
		[baseQueryKey]
	);

	const getSnapshot = useCallback(() => {
		const data =
			queryClient.getQueryData<InfiniteData<ConversationTimelineItemsPage>>(
				queryKey
			);

		return findLatestTimelineItem(data);
	}, [queryClient, queryKey]);

	const subscribe = useCallback(
		(onStoreChange: () => void) =>
			queryClient.getQueryCache().subscribe(() => {
				onStoreChange();
			}),
		[queryClient]
	);

	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
