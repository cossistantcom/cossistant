/**
 * Update Sentiment Action
 *
 * Updates the conversation sentiment (background analysis).
 * Creates a private event - not visible to visitors.
 * Emits real-time event for dashboard updates.
 */

import type { Database } from "@api/db";
import type { ConversationSelect } from "@api/db/schema/conversation";
import { conversation } from "@api/db/schema/conversation";
import { realtime } from "@api/realtime/emitter";
import { createTimelineItem } from "@api/utils/timeline-item";
import {
	ConversationTimelineType,
	TimelineItemVisibility,
} from "@cossistant/types";
import { and, eq, isNull, or } from "drizzle-orm";
import { loadCurrentConversation } from "./load-current-conversation";

type UpdateSentimentParams = {
	db: Database;
	conversation: ConversationSelect;
	organizationId: string;
	websiteId: string;
	aiAgentId: string;
	sentiment: "positive" | "negative" | "neutral";
	confidence: number;
	emitTimelineEvent?: boolean;
};

function isSentimentEffectivelyUnchanged(params: {
	currentSentiment: ConversationSelect["sentiment"];
	currentConfidence: ConversationSelect["sentimentConfidence"];
	nextSentiment: UpdateSentimentParams["sentiment"];
	nextConfidence: number;
}): boolean {
	if (params.currentSentiment !== params.nextSentiment) {
		return false;
	}

	if (typeof params.currentConfidence !== "number") {
		return false;
	}

	return Math.abs(params.currentConfidence - params.nextConfidence) < 0.01;
}

/**
 * Update conversation sentiment
 */
export async function updateSentiment(params: UpdateSentimentParams): Promise<{
	changed: boolean;
	reason?: "unchanged" | "manual_sentiment";
}> {
	const {
		db,
		conversation: conv,
		organizationId,
		websiteId,
		aiAgentId,
		sentiment,
		confidence,
		emitTimelineEvent = false,
	} = params;

	const currentConversation = await loadCurrentConversation(db, conv.id);
	if (!currentConversation) {
		return {
			changed: false,
		};
	}

	if (currentConversation.sentimentSource === "user") {
		return {
			changed: false,
			reason: "manual_sentiment",
		};
	}

	if (
		isSentimentEffectivelyUnchanged({
			currentSentiment: currentConversation.sentiment,
			currentConfidence: currentConversation.sentimentConfidence,
			nextSentiment: sentiment,
			nextConfidence: confidence,
		})
	) {
		return {
			changed: false,
			reason: "unchanged",
		};
	}

	const now = new Date().toISOString();

	// Update conversation
	const [updatedConversation] = await db
		.update(conversation)
		.set({
			sentiment,
			sentimentConfidence: confidence,
			sentimentSource: "ai",
			updatedAt: now,
		})
		.where(
			and(
				eq(conversation.id, currentConversation.id),
				or(
					isNull(conversation.sentimentSource),
					eq(conversation.sentimentSource, "ai")
				)
			)
		)
		.returning();

	if (!updatedConversation) {
		return {
			changed: false,
			reason: "manual_sentiment",
		};
	}

	if (emitTimelineEvent) {
		const eventText = `AI analyzed sentiment: ${sentiment} (${Math.round(confidence * 100)}% confidence)`;
		await createTimelineItem({
			db,
			organizationId,
			websiteId,
			conversationId: currentConversation.id,
			conversationOwnerVisitorId: currentConversation.visitorId,
			item: {
				type: ConversationTimelineType.EVENT,
				visibility: TimelineItemVisibility.PRIVATE,
				text: eventText,
				parts: [{ type: "text", text: eventText }],
				aiAgentId,
			},
		});
	}

	// Emit conversationUpdated event for real-time dashboard updates
	await realtime.emit("conversationUpdated", {
		websiteId,
		organizationId,
		visitorId: currentConversation.visitorId,
		userId: null,
		conversationId: currentConversation.id,
		updates: {
			sentiment: updatedConversation.sentiment,
			sentimentConfidence: updatedConversation.sentimentConfidence,
			sentimentSource: updatedConversation.sentimentSource,
		},
		aiAgentId,
	});

	return {
		changed: true,
	};
}
