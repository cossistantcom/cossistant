/**
 * Update Priority Action
 *
 * Updates the conversation priority.
 * Creates a private event - not visible to visitors.
 */

import type { Database } from "@api/db";
import type { ConversationSelect } from "@api/db/schema/conversation";
import { conversation } from "@api/db/schema/conversation";
import { realtime } from "@api/realtime/emitter";
import { createConversationEvent } from "@api/utils/conversation-event";
import {
	ConversationEventType,
	TimelineItemVisibility,
} from "@cossistant/types";
import { and, eq, isNull, or } from "drizzle-orm";
import { loadCurrentConversation } from "./load-current-conversation";

type UpdatePriorityParams = {
	db: Database;
	conversation: ConversationSelect;
	organizationId: string;
	websiteId: string;
	aiAgentId: string;
	newPriority: "low" | "normal" | "high" | "urgent";
	emitTimelineEvent?: boolean;
};

/**
 * Update conversation priority
 */
export async function updatePriority(params: UpdatePriorityParams): Promise<{
	changed: boolean;
	reason?: "unchanged" | "manual_priority";
}> {
	const {
		db,
		conversation: conv,
		organizationId,
		websiteId,
		aiAgentId,
		newPriority,
		emitTimelineEvent = true,
	} = params;

	const currentConversation = await loadCurrentConversation(db, conv.id);
	if (!currentConversation) {
		return {
			changed: false,
		};
	}

	if (currentConversation.prioritySource === "user") {
		return {
			changed: false,
			reason: "manual_priority",
		};
	}

	// Skip if already at desired priority
	if (currentConversation.priority === newPriority) {
		return {
			changed: false,
			reason: "unchanged",
		};
	}

	const now = new Date();
	const nowIso = now.toISOString();

	const [updatedConversation] = await db
		.update(conversation)
		.set({
			priority: newPriority,
			prioritySource: "ai",
			updatedAt: nowIso,
		})
		.where(
			and(
				eq(conversation.id, currentConversation.id),
				or(
					isNull(conversation.prioritySource),
					eq(conversation.prioritySource, "ai")
				)
			)
		)
		.returning();

	if (!updatedConversation) {
		return {
			changed: false,
			reason: "manual_priority",
		};
	}

	if (emitTimelineEvent) {
		await createConversationEvent({
			db,
			context: {
				conversationId: currentConversation.id,
				organizationId,
				websiteId,
				visitorId: currentConversation.visitorId,
			},
			event: {
				type: ConversationEventType.PRIORITY_CHANGED,
				actorAiAgentId: aiAgentId,
				metadata: {
					previousPriority: currentConversation.priority,
					newPriority,
				},
				createdAt: now,
				visibility: TimelineItemVisibility.PRIVATE,
			},
		});
	}

	await realtime.emit("conversationUpdated", {
		websiteId,
		organizationId,
		visitorId: null,
		userId: null,
		conversationId: currentConversation.id,
		updates: {
			priority: updatedConversation.priority,
			prioritySource: updatedConversation.prioritySource,
		},
		aiAgentId,
	});

	return {
		changed: true,
	};
}
