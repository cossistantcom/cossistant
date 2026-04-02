import type { ConversationPagination } from "@plasma/core";
import type {
	ListConversationsRequest,
	ListConversationsResponse,
} from "@plasma/types/api/conversation";
import { useCallback, useMemo } from "react";
import { useSupport } from "../provider";
import { useStoreSelector } from "./private/store/use-store-selector";
import { useClientQuery } from "./private/use-client-query";

type ConversationsSelection = {
	conversations: ListConversationsResponse["conversations"];
	pagination: ConversationPagination | null;
};

function areSelectionsEqual(
	a: ConversationsSelection,
	b: ConversationsSelection
): boolean {
	const samePagination =
		a.pagination === b.pagination ||
		(Boolean(a.pagination) &&
			Boolean(b.pagination) &&
			a.pagination?.page === b.pagination?.page &&
			a.pagination?.limit === b.pagination?.limit &&
			a.pagination?.total === b.pagination?.total &&
			a.pagination?.totalPages === b.pagination?.totalPages &&
			a.pagination?.hasMore === b.pagination?.hasMore);

	if (!samePagination) {
		return false;
	}

	if (a.conversations.length !== b.conversations.length) {
		return false;
	}

	return a.conversations.every(
		(conversation, index) => conversation === b.conversations[index]
	);
}

export type UseConversationsOptions = Partial<
	Omit<ListConversationsRequest, "visitorId">
> & {
	enabled?: boolean;
	refetchInterval?: number | false;
	refetchOnWindowFocus?: boolean;
};

export type UseConversationsResult = {
	conversations: ListConversationsResponse["conversations"];
	pagination: ConversationPagination | null;
	isLoading: boolean;
	error: Error | null;
	refetch: (
		args?: Partial<ListConversationsRequest>
	) => Promise<ListConversationsResponse | undefined>;
};

/**
 * Fetches and subscribes to the authenticated visitor's conversation list.
 *
 * The hook keeps the store in sync with the REST client and exposes
 * pagination metadata plus a refetch helper for manual refreshes. The
 * `options` mirror the public API filters so the UI can request slices of the
 * inbox without duplicating data-fetching logic.
 *
 * @param options Filtering and lifecycle controls for the query.
 * @returns Conversations, pagination data, loading state, and a refetch
 * helper.
 */
export function useConversations(
	options: UseConversationsOptions = {}
): UseConversationsResult {
	const { client } = useSupport();

	const {
		limit,
		page,
		order,
		orderBy,
		status,
		enabled = true,
		refetchInterval = false,
		refetchOnWindowFocus = true,
	} = options;

	const requestDefaults = useMemo(
		() => ({ limit, page, status, orderBy, order }),
		[limit, page, status, orderBy, order]
	);

	const store = client?.conversationsStore ?? null;

	const selection = useStoreSelector(
		store,
		(state): ConversationsSelection =>
			state
				? {
						conversations: state.ids
							.map((id) => state.byId[id])
							.filter(
								(
									conversation
								): conversation is ListConversationsResponse["conversations"][number] =>
									Boolean(conversation)
							),
						pagination: state.pagination,
					}
				: { conversations: [], pagination: null },
		areSelectionsEqual
	);

	const {
		refetch: queryRefetch,
		isLoading: queryLoading,
		error,
	} = useClientQuery<
		ListConversationsResponse,
		Partial<ListConversationsRequest>
	>({
		client,
		queryKey: `conversations:${limit ?? ""}:${page ?? ""}:${status ?? ""}:${orderBy ?? ""}:${order ?? ""}`,
		queryFn: (instance, args) =>
			instance.listConversations({
				...requestDefaults,
				...args,
			}),
		enabled,
		refetchInterval,
		refetchOnWindowFocus,
		refetchOnMount: selection.conversations.length === 0,
		initialArgs: requestDefaults,
		dependencies: [limit, page, status, orderBy, order],
	});

	const refetch = useCallback(
		(args?: Partial<ListConversationsRequest>) =>
			queryRefetch({
				...requestDefaults,
				...args,
			}),
		[queryRefetch, requestDefaults]
	);

	const isInitialLoad = selection.conversations.length === 0;
	const isLoading = isInitialLoad ? queryLoading : false;

	return {
		conversations: selection.conversations,
		pagination: selection.pagination,
		isLoading,
		error,
		refetch,
	};
}
