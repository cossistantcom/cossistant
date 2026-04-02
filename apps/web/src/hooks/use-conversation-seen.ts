import { generateULID } from "@api/utils/db/ids";
import type { ConversationSeen } from "@plasma/types/schemas";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

type UseConversationSeenOptions = {
	initialData?: ConversationSeen[];
};

/**
 * Dashboard-specific hook for managing conversation seen state using React Query.
 * This replaces the widget's Zustand-based useConversationSeen hook.
 */
export function useConversationSeen(
	conversationId: string | null | undefined,
	options: UseConversationSeenOptions = {}
): ConversationSeen[] {
	const { initialData } = options;
	const queryClient = useQueryClient();
	const hasInitializedRef = useRef<string | null>(null);

	// Store seen data in React Query cache
	const queryKey = ["conversation-seen", conversationId];

	// Initialize with data from conversation header only once per conversation
	useEffect(() => {
		if (!conversationId) {
			hasInitializedRef.current = null;
			return;
		}

		// Only initialize once per conversation
		if (hasInitializedRef.current === conversationId) {
			return;
		}

		if (initialData && initialData.length > 0) {
			queryClient.setQueryData(queryKey, initialData);
			hasInitializedRef.current = conversationId;
		}
	}, [conversationId, queryClient]); // Don't include initialData to prevent re-initialization

	// Use useQuery to make the component reactive to cache changes
	const { data } = useQuery({
		queryKey,
		queryFn: () => {
			// Return what's already in cache, never fetch from server
			return (
				queryClient.getQueryData<ConversationSeen[]>(queryKey) ??
				initialData ??
				[]
			);
		},
		enabled: !!conversationId,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
		refetchOnMount: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	});

	return data ?? initialData ?? [];
}

/**
 * Helper to update conversation seen data in React Query cache.
 * Used by the real-time event handler.
 */
export function updateConversationSeenInCache(
	queryClient: ReturnType<typeof useQueryClient>,
	conversationId: string,
	payload: {
		userId?: string | null;
		visitorId?: string | null;
		aiAgentId?: string | null;
		lastSeenAt: string;
	}
) {
	const queryKey = ["conversation-seen", conversationId];

	// Get current data or empty array
	const currentData =
		queryClient.getQueryData<ConversationSeen[]>(queryKey) ?? [];

	// Find the existing entry for this actor
	const existingIndex = currentData.findIndex((s) => {
		if (payload.userId) {
			return s.userId === payload.userId;
		}
		if (payload.visitorId) {
			return s.visitorId === payload.visitorId;
		}
		if (payload.aiAgentId) {
			return s.aiAgentId === payload.aiAgentId;
		}
		return false;
	});

	const existingEntry = existingIndex >= 0 ? currentData[existingIndex] : null;

	// Skip update if the incoming lastSeenAt is not newer than existing
	if (existingEntry) {
		const existingTime = new Date(existingEntry.lastSeenAt).getTime();
		const incomingTime = new Date(payload.lastSeenAt).getTime();

		if (!Number.isNaN(existingTime) && existingTime >= incomingTime) {
			return; // No change needed, existing data is same or newer
		}
	}

	const seenEntry: ConversationSeen = {
		id: existingEntry?.id ?? generateULID(),
		conversationId,
		userId: payload.userId || null,
		visitorId: payload.visitorId || null,
		aiAgentId: payload.aiAgentId || null,
		lastSeenAt: payload.lastSeenAt,
		createdAt: existingEntry?.createdAt ?? payload.lastSeenAt,
		updatedAt: payload.lastSeenAt,
		deletedAt: null,
	};

	const updated = [...currentData];

	if (existingIndex >= 0) {
		// Update existing entry
		updated[existingIndex] = seenEntry;
	} else {
		// Add new entry
		updated.push(seenEntry);
	}

	// Set the new data - this automatically triggers re-renders for subscribed components
	queryClient.setQueryData(queryKey, updated);
}
