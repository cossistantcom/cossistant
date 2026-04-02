import type { ConversationProcessingEntry } from "@plasma/core";
import { useSupport } from "../provider";
import { useStoreSelector } from "./private/store/use-store-selector";

export function useConversationProcessing(
	conversationId: string | null | undefined
): ConversationProcessingEntry | null {
	const { client } = useSupport();

	return useStoreSelector(client?.processingStore ?? null, (state) =>
		conversationId ? (state?.conversations[conversationId] ?? null) : null
	);
}
