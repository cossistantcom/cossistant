import type {
	ConversationPagination,
	ConversationsState,
} from "@plasma/core";
import type { Conversation } from "@plasma/types";
import { useSupport } from "../../../provider";
import { useStoreSelector } from "./use-store-selector";

type ConversationSelection = {
	conversations: Conversation[];
	pagination: ConversationPagination | null;
};

const EMPTY_SELECTION: ConversationSelection = {
	conversations: [],
	pagination: null,
};

function areSelectionsEqual(
	a: ConversationSelection,
	b: ConversationSelection
): boolean {
	if (a === b) {
		return true;
	}
	if (a.pagination !== b.pagination) {
		if (!(a.pagination && b.pagination)) {
			return false;
		}
		if (
			a.pagination.page !== b.pagination.page ||
			a.pagination.limit !== b.pagination.limit ||
			a.pagination.total !== b.pagination.total ||
			a.pagination.totalPages !== b.pagination.totalPages ||
			a.pagination.hasMore !== b.pagination.hasMore
		) {
			return false;
		}
	}
	if (a.conversations.length !== b.conversations.length) {
		return false;
	}
	for (let index = 0; index < a.conversations.length; index += 1) {
		if (a.conversations[index] !== b.conversations[index]) {
			return false;
		}
	}
	return true;
}

/**
 * Selector hook that exposes the normalized conversations list from the
 * internal store alongside pagination metadata.
 *
 * Returns empty selection when client is not available (configuration error).
 */
export function useConversationsStore(): ConversationSelection {
	const { client } = useSupport();

	return useStoreSelector(
		client?.conversationsStore ?? null,
		(state: ConversationsState | null) => {
			if (!state) {
				return EMPTY_SELECTION;
			}
			return {
				conversations: state.ids
					.map((id) => state.byId[id])
					.filter(
						(conversation): conversation is Conversation =>
							conversation !== undefined
					),
				pagination: state.pagination,
			};
		},
		areSelectionsEqual
	);
}

/**
 * Picks a single conversation entity from the store by id. Returns `null` when
 * the identifier is missing or the entity has not been fetched yet.
 */
export function useConversationById(
	conversationId: string | null
): Conversation | null {
	const { client } = useSupport();

	return useStoreSelector(
		client?.conversationsStore ?? null,
		(state: ConversationsState | null) => {
			if (!(state && conversationId)) {
				return null;
			}
			return state.byId[conversationId] ?? null;
		}
	);
}
