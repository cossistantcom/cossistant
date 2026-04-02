/**
 * Update Status Action
 *
 * Updates the conversation status (resolve, spam, reopen).
 */

import type { Database } from "@api/db";
import type { ConversationSelect } from "@api/db/schema/conversation";
import { conversation } from "@api/db/schema/conversation";
import { trackConversationMetricForVisitor } from "@api/lib/tinybird-sdk";
import { realtime } from "@api/realtime/emitter";
import { createConversationEvent } from "@api/utils/conversation-event";
import {
	ConversationEventType,
	TimelineItemVisibility,
} from "@plasma/types";
import { eq } from "drizzle-orm";

type UpdateStatusParams = {
	db: Database;
	conversation: ConversationSelect;
	organizationId: string;
	websiteId: string;
	aiAgentId: string;
	newStatus: "open" | "resolved" | "spam";
};

/**
 * Update conversation status
 */
export async function updateStatus(params: UpdateStatusParams): Promise<void> {
	const {
		db,
		conversation: conv,
		organizationId,
		websiteId,
		aiAgentId,
		newStatus,
	} = params;

	// Skip if already in desired status
	if (conv.status === newStatus) {
		return;
	}

	const now = new Date();
	const nowIso = now.toISOString();

	// Keep status transitions aligned with dashboard/manual mutations.
	const updateData: Record<string, unknown> = {
		status: newStatus,
		updatedAt: nowIso,
		resolvedAt: null,
		resolvedByUserId: null,
		resolvedByAiAgentId: null,
		resolutionTime: null,
	};

	if (newStatus === "resolved") {
		updateData.resolvedAt = nowIso;
		updateData.resolvedByAiAgentId = aiAgentId;
		if (conv.startedAt) {
			const diffSeconds = Math.max(
				0,
				Math.round(
					(new Date(nowIso).getTime() - new Date(conv.startedAt).getTime()) /
						1000
				)
			);
			updateData.resolutionTime = diffSeconds;
		} else {
			updateData.resolutionTime = conv.resolutionTime ?? null;
		}
	}

	const [updatedConversation] = await db
		.update(conversation)
		.set(updateData)
		.where(eq(conversation.id, conv.id))
		.returning();

	if (!updatedConversation) {
		return;
	}

	await createConversationEvent({
		db,
		context: {
			conversationId: conv.id,
			organizationId,
			websiteId,
			visitorId: conv.visitorId,
		},
		event: {
			type:
				newStatus === "resolved"
					? ConversationEventType.RESOLVED
					: ConversationEventType.STATUS_CHANGED,
			actorAiAgentId: aiAgentId,
			metadata: {
				previousStatus: conv.status,
				newStatus,
			},
			createdAt: now,
			visibility: TimelineItemVisibility.PRIVATE,
		},
	});

	await realtime.emit("conversationUpdated", {
		websiteId,
		organizationId,
		visitorId: conv.visitorId,
		userId: null,
		conversationId: conv.id,
		updates: {
			status: updatedConversation.status,
			resolvedAt: updatedConversation.resolvedAt,
			resolvedByUserId: updatedConversation.resolvedByUserId,
			resolvedByAiAgentId: updatedConversation.resolvedByAiAgentId,
			resolutionTime: updatedConversation.resolutionTime,
		},
		aiAgentId,
	});

	// Track ai_resolved event in Tinybird for analytics
	if (newStatus === "resolved") {
		void trackConversationMetricForVisitor(db, {
			website_id: websiteId,
			visitor_id: conv.visitorId,
			conversation_id: conv.id,
			event_type: "ai_resolved",
			duration_seconds: updatedConversation.resolutionTime ?? undefined,
		});
	}
}
