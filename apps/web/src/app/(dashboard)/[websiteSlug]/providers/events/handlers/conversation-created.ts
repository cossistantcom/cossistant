import type { RealtimeEvent } from "@plasma/types/realtime-events";
import { ensureDashboardConversationLockRedaction } from "@plasma/types/trpc/conversation-hard-limit";
import {
	forEachConversationHeadersQuery,
	prependConversationHeaderInCache,
} from "@/data/conversation-header-cache";
import type { DashboardRealtimeContext } from "../types";

type ConversationCreatedEvent = RealtimeEvent<"conversationCreated">;

export function handleConversationCreated({
	event,
	context,
}: {
	event: ConversationCreatedEvent;
	context: DashboardRealtimeContext;
}) {
	if (event.payload.websiteId !== context.website.id) {
		return;
	}

	const { header } = event.payload;
	const safeHeader = ensureDashboardConversationLockRedaction(header);

	// Type assertion needed because TimelineItemParts contains complex union types
	// that don't fit @normy/react-query's simpler Data type constraints
	context.queryNormalizer.setNormalizedData(
		safeHeader as Parameters<
			typeof context.queryNormalizer.setNormalizedData
		>[0]
	);

	forEachConversationHeadersQuery(
		context.queryClient,
		context.website.slug,
		(queryKey) => {
			prependConversationHeaderInCache(
				context.queryClient,
				queryKey,
				safeHeader
			);
		}
	);
}
