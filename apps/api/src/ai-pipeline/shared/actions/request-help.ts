/**
 * Request Help Action
 *
 * Requests a team member to join as a participant.
 */

import type { Database } from "@api/db";
import { conversationParticipant } from "@api/db/schema/conversation";
import { generateShortPrimaryId } from "@api/utils/db/ids";
import { createTimelineItem } from "@api/utils/timeline-item";
import {
	ConversationParticipationStatus,
	ConversationTimelineType,
	TimelineItemVisibility,
} from "@plasma/types";
import { and, eq } from "drizzle-orm";

type RequestHelpParams = {
	db: Database;
	conversationId: string;
	organizationId: string;
	websiteId: string;
	visitorId: string;
	userId: string;
	aiAgentId: string;
	reason: string;
};

/**
 * Request a user to participate in the conversation
 */
export async function requestHelp(params: RequestHelpParams): Promise<void> {
	const {
		db,
		conversationId,
		organizationId,
		websiteId,
		visitorId,
		userId,
		aiAgentId,
		reason,
	} = params;

	const now = new Date().toISOString();

	// Check if already a participant
	const existing = await db
		.select({ id: conversationParticipant.id })
		.from(conversationParticipant)
		.where(
			and(
				eq(conversationParticipant.conversationId, conversationId),
				eq(conversationParticipant.userId, userId)
			)
		)
		.limit(1);

	if (existing.length > 0) {
		// Already a participant
		return;
	}

	// Create participant request
	await db.insert(conversationParticipant).values({
		id: generateShortPrimaryId(),
		conversationId,
		organizationId,
		userId,
		status: ConversationParticipationStatus.REQUESTED,
		reason,
		requestedByAiAgentId: aiAgentId,
		requestedByUserId: null,
		joinedAt: now,
		createdAt: now,
	});

	// Create timeline event with proper realtime emission
	const eventText = `AI requested assistance: ${reason}`;
	await createTimelineItem({
		db,
		organizationId,
		websiteId,
		conversationId,
		conversationOwnerVisitorId: visitorId,
		item: {
			type: ConversationTimelineType.EVENT,
			visibility: TimelineItemVisibility.PRIVATE,
			text: eventText,
			parts: [{ type: "text", text: eventText }],
			aiAgentId,
		},
	});
}
