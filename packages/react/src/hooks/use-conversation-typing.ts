import type { TypingEntry } from "@plasma/core";
import { useCallback, useMemo } from "react";
import { useSupport } from "../provider";
import { useStoreSelector } from "./private/store/use-store-selector";

export type ConversationTypingParticipant = TypingEntry;

type UseConversationTypingOptions = {
	excludeVisitorId?: string | null;
	excludeUserId?: string | null;
	excludeAiAgentId?: string | null;
};

function shouldExclude(
	entry: TypingEntry,
	options: Required<UseConversationTypingOptions>
) {
	if (entry.actorType === "visitor" && options.excludeVisitorId) {
		return entry.actorId === options.excludeVisitorId;
	}

	if (entry.actorType === "user" && options.excludeUserId) {
		return entry.actorId === options.excludeUserId;
	}

	if (entry.actorType === "ai_agent" && options.excludeAiAgentId) {
		return entry.actorId === options.excludeAiAgentId;
	}

	return false;
}

/**
 * Selects typing participants for a conversation while letting consumers omit
 * their own identities.
 */
export function useConversationTyping(
	conversationId: string | null | undefined,
	options: UseConversationTypingOptions = {}
): ConversationTypingParticipant[] {
	const { client } = useSupport();

	const conversationTyping = useStoreSelector(
		client?.typingStore ?? null,
		useCallback(
			(
				state: {
					conversations: Record<string, Record<string, TypingEntry>>;
				} | null
			) =>
				conversationId ? (state?.conversations[conversationId] ?? null) : null,
			[conversationId]
		)
	);

	return useMemo(() => {
		if (!(conversationId && conversationTyping)) {
			return [];
		}

		const excludeOptions: Required<UseConversationTypingOptions> = {
			excludeVisitorId: options.excludeVisitorId ?? null,
			excludeUserId: options.excludeUserId ?? null,
			excludeAiAgentId: options.excludeAiAgentId ?? null,
		};

		const entries = Object.values(conversationTyping).filter(
			(entry) => !shouldExclude(entry, excludeOptions)
		);

		entries.sort((a, b) => a.updatedAt - b.updatedAt);

		return entries;
	}, [
		conversationId,
		conversationTyping,
		options.excludeVisitorId,
		options.excludeUserId,
		options.excludeAiAgentId,
	]);
}
