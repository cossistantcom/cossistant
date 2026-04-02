import type { SeenEntry } from "@plasma/core";
import type { ConversationSeen } from "@plasma/types/schemas";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSupport } from "../provider";
import { useStoreSelector } from "./private/store/use-store-selector";

type UseConversationSeenOptions = {
	initialData?: ConversationSeen[];
};

function buildSeenId(
	conversationId: string,
	actorType: string,
	actorId: string
) {
	return `${conversationId}-${actorType}-${actorId}`;
}

/**
 * Reads the conversation seen store and optionally hydrates it with SSR
 * payloads.
 */
export function useConversationSeen(
	conversationId: string | null | undefined,
	options: UseConversationSeenOptions = {}
): ConversationSeen[] {
	const { initialData } = options;
	const { client } = useSupport();
	const hydratedKeyRef = useRef<string | null>(null);
	const hasInitialData = Object.hasOwn(options, "initialData");
	const hydrationSignature = useMemo(() => {
		if (!(conversationId && hasInitialData)) {
			return null;
		}

		const entries = initialData ?? [];
		return `${conversationId}:${entries
			.map((entry) => `${entry.id}:${entry.lastSeenAt}`)
			.join("|")}`;
	}, [conversationId, hasInitialData, initialData]);

	useEffect(() => {
		if (!conversationId) {
			hydratedKeyRef.current = null;
			return;
		}

		if (!hasInitialData) {
			return;
		}

		const hydrationKey = hydrationSignature ?? conversationId;

		if (hydratedKeyRef.current === hydrationKey) {
			return;
		}

		client?.seenStore.hydrate(conversationId, initialData ?? []);
		hydratedKeyRef.current = hydrationKey;
	}, [conversationId, client, hasInitialData, hydrationSignature, initialData]);

	const conversationSeen = useStoreSelector(
		client?.seenStore ?? null,
		useCallback(
			(
				state: {
					conversations: Record<string, Record<string, SeenEntry>>;
				} | null
			) =>
				conversationId ? (state?.conversations[conversationId] ?? null) : null,
			[conversationId]
		)
	);

	return useMemo(() => {
		if (!(conversationId && conversationSeen)) {
			return [];
		}

		return Object.values(conversationSeen).map(
			(entry) =>
				({
					id: buildSeenId(conversationId, entry.actorType, entry.actorId),
					conversationId,
					userId: entry.actorType === "user" ? entry.actorId : null,
					visitorId: entry.actorType === "visitor" ? entry.actorId : null,
					aiAgentId: entry.actorType === "ai_agent" ? entry.actorId : null,
					lastSeenAt: entry.lastSeenAt,
					createdAt: entry.lastSeenAt,
					updatedAt: entry.lastSeenAt,
					deletedAt: null,
				}) satisfies ConversationSeen
		);
	}, [conversationId, conversationSeen]);
}

/**
 * Debounced version of useConversationSeen that delays updates by 500ms
 * to prevent animation conflicts when messages are sent and immediately seen.
 *
 * Use this in UI components where smooth animations are critical.
 */
export function useDebouncedConversationSeen(
	conversationId: string | null | undefined,
	options: UseConversationSeenOptions = {},
	delay = 500
): ConversationSeen[] {
	const seenData = useConversationSeen(conversationId, options);
	// Use lazy initialization to avoid re-computing initial state on every render
	const [debouncedSeenData, setDebouncedSeenData] = useState<
		ConversationSeen[]
	>(() => seenData);
	const timeoutRef = useRef<NodeJS.Timeout | null>(null);

	useEffect(() => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
		}

		timeoutRef.current = setTimeout(() => {
			setDebouncedSeenData(seenData);
		}, delay);

		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, [seenData, delay]);

	return debouncedSeenData;
}
