import type { ConversationTimelineItemsState } from "@plasma/core";
import type {
	GetConversationTimelineItemsRequest,
	GetConversationTimelineItemsResponse,
} from "@plasma/types/api/timeline-item";
import { useCallback, useMemo } from "react";
import { useSupport } from "../provider";
import { useStoreSelector } from "./private/store/use-store-selector";
import { useClientQuery } from "./private/use-client-query";

const EMPTY_STATE: ConversationTimelineItemsState = {
	items: [],
	hasNextPage: false,
	nextCursor: undefined,
};

const DEFAULT_LIMIT = 50;

const NO_CONVERSATION_ID = "__no_conversation__" as const;

export type UseConversationTimelineItemsOptions = {
	limit?: number;
	cursor?: string | null;
	enabled?: boolean;
	refetchInterval?: number | false;
	refetchOnWindowFocus?: boolean;
};

export type UseConversationTimelineItemsResult =
	ConversationTimelineItemsState & {
		isLoading: boolean;
		error: Error | null;
		refetch: (
			args?: Pick<GetConversationTimelineItemsRequest, "cursor" | "limit">
		) => Promise<GetConversationTimelineItemsResponse | undefined>;
		fetchNextPage: () => Promise<
			GetConversationTimelineItemsResponse | undefined
		>;
	};

/**
 * Fetches timeline items for a conversation and keeps the local store in sync
 * with pagination helpers.
 */
export function useConversationTimelineItems(
	conversationId: string | null | undefined,
	options: UseConversationTimelineItemsOptions = {}
): UseConversationTimelineItemsResult {
	const { client } = useSupport();
	const store = client?.timelineItemsStore ?? null;

	const stableConversationId = conversationId ?? NO_CONVERSATION_ID;

	const selection = useStoreSelector(store, (state) =>
		state
			? (state.conversations[stableConversationId] ?? EMPTY_STATE)
			: EMPTY_STATE
	);

	const baseArgs = useMemo(
		() =>
			({
				limit: options.limit ?? DEFAULT_LIMIT,
				cursor: options.cursor ?? undefined,
			}) satisfies Pick<
				GetConversationTimelineItemsRequest,
				"limit" | "cursor"
			>,
		[options.cursor, options.limit]
	);

	const {
		refetch: queryRefetch,
		isLoading: queryLoading,
		error,
	} = useClientQuery<
		GetConversationTimelineItemsResponse,
		Pick<GetConversationTimelineItemsRequest, "cursor" | "limit">
	>({
		client,
		queryKey: conversationId
			? `timeline:${conversationId}:${baseArgs.limit}:${baseArgs.cursor ?? ""}`
			: undefined,
		queryFn: (instance, args) => {
			if (!conversationId) {
				return Promise.resolve({
					items: [],
					hasNextPage: false,
					nextCursor: null,
				});
			}

			return instance.getConversationTimelineItems({
				conversationId,
				limit: args?.limit ?? baseArgs.limit,
				cursor: args?.cursor ?? baseArgs.cursor ?? undefined,
			});
		},
		enabled: Boolean(conversationId) && (options.enabled ?? true),
		refetchInterval: options.refetchInterval ?? false,
		refetchOnWindowFocus: options.refetchOnWindowFocus ?? false,
		refetchOnMount: selection.items.length === 0,
		initialArgs: baseArgs,
		dependencies: [
			stableConversationId,
			baseArgs.limit,
			baseArgs.cursor ?? null,
		],
	});

	const refetch = useCallback(
		(args?: Pick<GetConversationTimelineItemsRequest, "cursor" | "limit">) => {
			if (!conversationId) {
				return Promise.resolve(undefined);
			}

			return queryRefetch({
				limit: baseArgs.limit,
				cursor: baseArgs.cursor,
				...args,
			});
		},
		[queryRefetch, baseArgs, conversationId]
	);

	const fetchNextPage = useCallback(() => {
		if (!(selection.hasNextPage && selection.nextCursor)) {
			return Promise.resolve(undefined);
		}

		return refetch({ cursor: selection.nextCursor, limit: baseArgs.limit });
	}, [selection.hasNextPage, selection.nextCursor, refetch, baseArgs.limit]);

	const isInitialLoad = selection.items.length === 0;
	const isLoading = isInitialLoad ? queryLoading : false;

	return {
		items: selection.items,
		hasNextPage: selection.hasNextPage,
		nextCursor: selection.nextCursor,
		isLoading,
		error,
		refetch,
		fetchNextPage,
	};
}
