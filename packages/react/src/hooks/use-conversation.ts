import type {
	GetConversationRequest,
	GetConversationResponse,
} from "@plasma/types/api/conversation";
import { useSupport } from "../provider";
import { useStoreSelector } from "./private/store/use-store-selector";
import { useClientQuery } from "./private/use-client-query";

export type UseConversationOptions = {
	enabled?: boolean;
	refetchInterval?: number | false;
	refetchOnWindowFocus?: boolean;
};

export type UseConversationResult = {
	conversation: GetConversationResponse["conversation"] | null;
	isLoading: boolean;
	error: Error | null;
	refetch: (
		args?: GetConversationRequest
	) => Promise<GetConversationResponse | undefined>;
};

/**
 * Loads and caches a single conversation identified by `conversationId`.
 *
 * The hook keeps the conversations store hydrated, exposes a derived loading
 * state that respects cached data and provides a `refetch` helper to manually
 * refresh the thread.
 *
 * @param conversationId The conversation to retrieve; when `null` the hook
 * skips requests and returns `null` data.
 * @param options Additional react-query style controls for the request.
 */
export function useConversation(
	conversationId: string | null,
	options: UseConversationOptions = {}
): UseConversationResult {
	const { client } = useSupport();
	const store = client?.conversationsStore ?? null;

	const conversation = useStoreSelector(store, (state) => {
		if (!(state && conversationId)) {
			return null;
		}
		return state.byId[conversationId] ?? null;
	});

	const request: GetConversationRequest | undefined = conversationId
		? { conversationId }
		: undefined;

	const {
		refetch: queryRefetch,
		isLoading: queryLoading,
		error,
	} = useClientQuery<GetConversationResponse, GetConversationRequest>({
		client,
		queryKey: conversationId ? `conversation:${conversationId}` : undefined,
		queryFn: (instance) => {
			if (!request) {
				throw new Error("Conversation ID is required");
			}
			return instance.getConversation(request);
		},
		enabled: Boolean(conversationId && (options.enabled ?? true)),
		refetchInterval: options.refetchInterval ?? false,
		refetchOnWindowFocus: options.refetchOnWindowFocus ?? false,
		refetchOnMount: !conversation,
		initialArgs: request,
		dependencies: [conversationId ?? "null"],
	});

	const refetch = (args?: GetConversationRequest) => {
		if (!conversationId) {
			return Promise.resolve(undefined);
		}

		return queryRefetch({
			conversationId,
			...args,
		});
	};

	const isLoading = conversation ? false : queryLoading;

	return {
		conversation,
		isLoading,
		error,
		refetch,
	};
}
