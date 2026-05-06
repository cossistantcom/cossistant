import type { RealtimeEvent } from "@cossistant/types/realtime-events";
import { ensureDashboardConversationLockRedaction } from "@cossistant/types/trpc/conversation-hard-limit";
import {
	type ConversationHeader,
	forEachConversationHeadersQuery,
	updateConversationHeaderInCache,
} from "@/data/conversation-header-cache";
import { invalidateActiveConversationClarificationQuery } from "@/data/knowledge-clarification-cache";
import type { DashboardRealtimeContext } from "../types";

type ConversationUpdatedEvent = RealtimeEvent<"conversationUpdated">;

/**
 * Handle conversationUpdated events from the AI agent.
 * Updates conversation headers with realtime state changes.
 */
export function handleConversationUpdated({
	event,
	context,
}: {
	event: ConversationUpdatedEvent;
	context: DashboardRealtimeContext;
}) {
	const { queryClient, website } = context;
	const { payload } = event;

	if (payload.websiteId !== website.id) {
		return;
	}

	const { conversationId, updates } = payload;

	// Type assertion needed because TimelineItemParts contains complex union types
	// that don't fit @normy/react-query's simpler Data type constraints
	const existingHeader = context.queryNormalizer.getObjectById(
		conversationId
	) as ConversationHeader | undefined;

	if (!existingHeader) {
		// Conversation not in cache, invalidate to refetch
		forEachConversationHeadersQuery(queryClient, website.slug, (queryKey) => {
			queryClient
				.invalidateQueries({
					queryKey,
					exact: true,
				})
				.catch((error) => {
					console.error(
						"Failed to invalidate conversation header queries:",
						error
					);
				});
		});
		return;
	}

	const headerUpdater = createHeaderUpdaterFromUpdates(updates);

	if (
		shouldInvalidateActiveClarification({
			current: existingHeader.activeClarification,
			next: updates.activeClarification,
		})
	) {
		invalidateActiveConversationClarificationQuery(queryClient, {
			websiteSlug: website.slug,
			conversationId,
		});
	}

	forEachConversationHeadersQuery(queryClient, website.slug, (queryKey) => {
		updateConversationHeaderInCache(
			queryClient,
			queryKey,
			conversationId,
			headerUpdater
		);
	});

	context.queryNormalizer.setNormalizedData(
		headerUpdater(existingHeader) as Parameters<
			typeof context.queryNormalizer.setNormalizedData
		>[0]
	);
}

function shouldInvalidateActiveClarification(params: {
	current: ConversationHeader["activeClarification"] | undefined;
	next: ConversationUpdatedEvent["payload"]["updates"]["activeClarification"];
}): boolean {
	if (params.next === undefined) {
		return false;
	}

	if (params.current == null || params.next == null) {
		return params.current !== params.next;
	}

	return (
		params.current.requestId !== params.next.requestId ||
		params.current.status !== params.next.status ||
		params.current.topicSummary !== params.next.topicSummary ||
		params.current.engagementMode !== params.next.engagementMode ||
		params.current.linkedConversationCount !==
			params.next.linkedConversationCount ||
		params.current.question !== params.next.question ||
		JSON.stringify(params.current.currentSuggestedAnswers) !==
			JSON.stringify(params.next.currentSuggestedAnswers) ||
		params.current.currentQuestionInputMode !==
			params.next.currentQuestionInputMode ||
		params.current.currentQuestionScope !== params.next.currentQuestionScope ||
		params.current.stepIndex !== params.next.stepIndex ||
		params.current.maxSteps !== params.next.maxSteps ||
		params.current.updatedAt !== params.next.updatedAt
	);
}

function createHeaderUpdaterFromUpdates(
	updates: ConversationUpdatedEvent["payload"]["updates"]
): (header: ConversationHeader) => ConversationHeader {
	return (header: ConversationHeader): ConversationHeader => {
		const updatedHeader = { ...header };

		if (updates.title !== undefined) {
			updatedHeader.title = updates.title;
		}

		if (updates.titleSource !== undefined) {
			updatedHeader.titleSource = updates.titleSource;
		}

		if (updates.visitorTitle !== undefined) {
			updatedHeader.visitorTitle = updates.visitorTitle;
		}

		if (updates.visitorTitleLanguage !== undefined) {
			updatedHeader.visitorTitleLanguage = updates.visitorTitleLanguage;
		}

		if (updates.visitorLanguage !== undefined) {
			updatedHeader.visitorLanguage = updates.visitorLanguage;
		}

		if (updates.translationActivatedAt !== undefined) {
			updatedHeader.translationActivatedAt = updates.translationActivatedAt;
		}

		if (updates.translationChargedAt !== undefined) {
			updatedHeader.translationChargedAt = updates.translationChargedAt;
		}

		if (updates.escalatedAt !== undefined) {
			updatedHeader.escalatedAt = updates.escalatedAt;
		}

		if (updates.escalationReason !== undefined) {
			updatedHeader.escalationReason = updates.escalationReason;
		}

		if (updates.status !== undefined) {
			updatedHeader.status = updates.status;
		}

		if (updates.deletedAt !== undefined) {
			updatedHeader.deletedAt = updates.deletedAt;
		}

		if (updates.priority !== undefined) {
			updatedHeader.priority = updates.priority;
		}

		if (updates.prioritySource !== undefined) {
			updatedHeader.prioritySource = updates.prioritySource;
		}

		if (updates.viewIds !== undefined) {
			updatedHeader.viewIds = updates.viewIds;
		}

		if (updates.sentiment !== undefined) {
			updatedHeader.sentiment = updates.sentiment;
		}

		if (updates.sentimentConfidence !== undefined) {
			updatedHeader.sentimentConfidence = updates.sentimentConfidence;
		}

		if (updates.sentimentSource !== undefined) {
			updatedHeader.sentimentSource = updates.sentimentSource;
		}

		if (updates.resolvedAt !== undefined) {
			updatedHeader.resolvedAt = updates.resolvedAt;
		}

		if (updates.resolvedByUserId !== undefined) {
			updatedHeader.resolvedByUserId = updates.resolvedByUserId;
		}

		if (updates.resolvedByAiAgentId !== undefined) {
			updatedHeader.resolvedByAiAgentId = updates.resolvedByAiAgentId;
		}

		if (updates.resolutionTime !== undefined) {
			updatedHeader.resolutionTime = updates.resolutionTime;
		}

		if (updates.aiPausedUntil !== undefined) {
			updatedHeader.aiPausedUntil = updates.aiPausedUntil;
		}

		if (updates.activeClarification !== undefined) {
			updatedHeader.activeClarification = updates.activeClarification;
		}

		return ensureDashboardConversationLockRedaction(updatedHeader);
	};
}
