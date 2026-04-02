/**
 * Assign Action
 *
 * Assigns a conversation to a team member.
 */

import type { Database } from "@api/db";
import { conversationAssignee } from "@api/db/schema/conversation";
import { generateShortPrimaryId } from "@api/utils/db/ids";
import { createTimelineItem } from "@api/utils/timeline-item";
import {
	ConversationTimelineType,
	TimelineItemVisibility,
} from "@plasma/types";
import { and, eq, isNull } from "drizzle-orm";

type AssignParams = {
	db: Database;
	conversationId: string;
	organizationId: string;
	websiteId: string;
	visitorId: string;
	userId: string;
	aiAgentId: string;
};

/**
 * Assign a conversation to a user
 */
export async function assign(params: AssignParams): Promise<void> {
	const {
		db,
		conversationId,
		organizationId,
		websiteId,
		visitorId,
		userId,
		aiAgentId,
	} = params;

	const now = new Date().toISOString();

	// Check if already assigned
	const existing = await db
		.select({ id: conversationAssignee.id })
		.from(conversationAssignee)
		.where(
			and(
				eq(conversationAssignee.conversationId, conversationId),
				eq(conversationAssignee.userId, userId),
				isNull(conversationAssignee.unassignedAt)
			)
		)
		.limit(1);

	if (existing.length > 0) {
		// Already assigned
		return;
	}

	// Create assignee record
	await db.insert(conversationAssignee).values({
		id: generateShortPrimaryId(),
		conversationId,
		organizationId,
		userId,
		assignedByAiAgentId: aiAgentId,
		assignedByUserId: null,
		assignedAt: now,
		createdAt: now,
	});

	// Create timeline event with proper realtime emission
	const eventText = "AI assigned conversation";
	await createTimelineItem({
		db,
		organizationId,
		websiteId,
		conversationId,
		conversationOwnerVisitorId: visitorId,
		item: {
			type: ConversationTimelineType.EVENT,
			visibility: TimelineItemVisibility.PUBLIC,
			text: eventText,
			parts: [{ type: "text", text: eventText }],
			aiAgentId,
		},
	});
}
