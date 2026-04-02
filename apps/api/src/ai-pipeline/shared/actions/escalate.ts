/**
 * Escalate Action
 *
 * Escalates a conversation to human support.
 * This is a compound action that may assign and update priority.
 * Also sends real-time events and notifications to team members.
 */

import type { Database } from "@api/db";
import type { ConversationSelect } from "@api/db/schema/conversation";
import {
	conversation,
	conversationTimelineItem,
} from "@api/db/schema/conversation";
import { trackConversationMetricForVisitor } from "@api/lib/tinybird-sdk";
import { realtime } from "@api/realtime/emitter";
import { createParticipantRequestedEvent } from "@api/utils/conversation-events";
import { generateShortPrimaryId } from "@api/utils/db/ids";
import { createTimelineItem } from "@api/utils/timeline-item";
import {
	ConversationTimelineType,
	TimelineItemVisibility,
} from "@plasma/types";
import { eq } from "drizzle-orm";
import { generateEscalationSummary } from "./analysis/escalation-summary";
import { assign } from "./assign";
import { sendEscalationNotifications } from "./send-escalation-notification";
import { updatePriority } from "./update-priority";

type EscalateParams = {
	db: Database;
	conversation: ConversationSelect;
	organizationId: string;
	websiteId: string;
	aiAgentId: string;
	aiAgentName: string;
	reason: string;
	visitorMessage?: string | null; // Optional - message may already be sent via tool
	visitorName: string;
	assignToUserId?: string | null;
	urgency?: "normal" | "high" | "urgent";
};

/**
 * Escalate a conversation to human support
 */
export async function escalate(params: EscalateParams): Promise<void> {
	const {
		db,
		conversation: conv,
		organizationId,
		websiteId,
		aiAgentId,
		aiAgentName,
		reason,
		visitorMessage,
		visitorName,
		assignToUserId,
		urgency = "normal",
	} = params;

	const now = new Date().toISOString();

	// Update conversation with escalation info
	await db
		.update(conversation)
		.set({
			updatedAt: now,
			escalatedAt: now,
			escalatedByAiAgentId: aiAgentId,
			escalationReason: reason,
		})
		.where(eq(conversation.id, conv.id));

	// Track escalation metric
	void trackConversationMetricForVisitor(db, {
		website_id: websiteId,
		visitor_id: conv.visitorId,
		conversation_id: conv.id,
		event_type: "escalated",
	});

	// Create public message to visitor if provided (may already be sent via tool)
	if (visitorMessage) {
		const visitorMessageId = generateShortPrimaryId();
		await db.insert(conversationTimelineItem).values({
			id: visitorMessageId,
			conversationId: conv.id,
			organizationId,
			type: ConversationTimelineType.MESSAGE,
			visibility: TimelineItemVisibility.PUBLIC,
			text: visitorMessage,
			aiAgentId,
			userId: null,
			visitorId: null,
			createdAt: now,
		});

		// Emit timeline item created event for the visitor message
		await realtime.emit("timelineItemCreated", {
			websiteId,
			organizationId,
			visitorId: conv.visitorId,
			userId: null,
			conversationId: conv.id,
			item: {
				id: visitorMessageId,
				conversationId: conv.id,
				organizationId,
				visibility: TimelineItemVisibility.PUBLIC,
				type: ConversationTimelineType.MESSAGE,
				text: visitorMessage,
				parts: [{ type: "text", text: visitorMessage }],
				userId: null,
				visitorId: null,
				aiAgentId,
				createdAt: now,
				deletedAt: null,
			},
		});
	}

	// Create escalation event (private - AI_ESCALATED) for team visibility with proper realtime emission
	const escalationEventText = `AI escalated: ${reason}`;
	await createTimelineItem({
		db,
		organizationId,
		websiteId,
		conversationId: conv.id,
		conversationOwnerVisitorId: conv.visitorId,
		item: {
			type: ConversationTimelineType.EVENT,
			visibility: TimelineItemVisibility.PRIVATE,
			text: escalationEventText,
			parts: [{ type: "text", text: escalationEventText }],
			aiAgentId,
		},
	});

	// Create public PARTICIPANT_REQUESTED event so visitor knows human help is coming
	await createParticipantRequestedEvent(db, {
		conversationId: conv.id,
		organizationId,
		websiteId,
		visitorId: conv.visitorId,
		actorAiAgentId: aiAgentId,
		reason,
	});

	// Emit conversationUpdated event for real-time dashboard updates
	await realtime.emit("conversationUpdated", {
		websiteId,
		organizationId,
		visitorId: conv.visitorId,
		userId: null,
		conversationId: conv.id,
		updates: {
			escalatedAt: now,
			escalationReason: reason,
		},
		aiAgentId,
	});

	// Assign to specific user if provided
	if (assignToUserId) {
		await assign({
			db,
			conversationId: conv.id,
			organizationId,
			websiteId,
			visitorId: conv.visitorId,
			userId: assignToUserId,
			aiAgentId,
		});
	}

	// Update priority based on urgency
	if (urgency !== "normal") {
		await updatePriority({
			db,
			conversation: conv,
			organizationId,
			websiteId,
			aiAgentId,
			newPriority: urgency,
		});
	}

	// Generate summary and send notifications (fire and forget)
	generateEscalationSummary({
		db,
		conversation: conv,
		organizationId,
		websiteId,
		escalationReason: reason,
	})
		.then((summary) =>
			sendEscalationNotifications({
				db,
				conversationId: conv.id,
				websiteId,
				organizationId,
				escalationReason: reason,
				summary,
				aiAgentName,
				visitorName,
			})
		)
		.catch((error) => {
			console.error(
				`[ai-agent:escalate] Failed to send escalation notifications for conversation ${conv.id}:`,
				error
			);
		});
}
