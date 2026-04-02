import type { Database } from "@api/db";
import { conversationTimelineItem } from "@api/db/schema";
import { realtime } from "@api/realtime/emitter";
import { generateShortPrimaryId } from "@api/utils/db/ids";
import {
	ConversationEventType,
	ConversationTimelineType,
	TimelineItemVisibility,
} from "@plasma/types";
import type { TimelineItemParts } from "@plasma/types/api/timeline-item";

/**
 * Create a PARTICIPANT_REQUESTED event in the conversation timeline
 * This is triggered when AI escalates and requests human support.
 * The event is PUBLIC so the visitor knows a human has been requested.
 */
export async function createParticipantRequestedEvent(
	db: Database,
	params: {
		conversationId: string;
		organizationId: string;
		websiteId: string;
		visitorId: string;
		actorAiAgentId: string;
		reason?: string;
	}
): Promise<string> {
	const eventId = generateShortPrimaryId();
	const now = new Date().toISOString();

	const parts: TimelineItemParts = [
		{
			type: "event",
			eventType: ConversationEventType.PARTICIPANT_REQUESTED,
			actorUserId: null,
			actorAiAgentId: params.actorAiAgentId,
			targetUserId: null,
			targetAiAgentId: null,
			message: "requested a team member to join",
		},
	];

	await db.insert(conversationTimelineItem).values({
		id: eventId,
		conversationId: params.conversationId,
		organizationId: params.organizationId,
		type: ConversationTimelineType.EVENT,
		visibility: TimelineItemVisibility.PUBLIC,
		parts,
		userId: null,
		aiAgentId: params.actorAiAgentId,
		visitorId: null,
		createdAt: now,
	});

	// Emit realtime event so visitor sees the update immediately
	await realtime.emit("timelineItemCreated", {
		websiteId: params.websiteId,
		organizationId: params.organizationId,
		visitorId: params.visitorId,
		userId: null,
		conversationId: params.conversationId,
		item: {
			id: eventId,
			conversationId: params.conversationId,
			organizationId: params.organizationId,
			visibility: TimelineItemVisibility.PUBLIC,
			type: ConversationTimelineType.EVENT,
			text: null,
			parts,
			userId: null,
			visitorId: null,
			aiAgentId: params.actorAiAgentId,
			createdAt: now,
			deletedAt: null,
		},
	});

	return eventId;
}

/**
 * Create a PARTICIPANT_JOINED event in the conversation timeline
 * This is PUBLIC so visitors can see when a team member joins.
 */
export async function createParticipantJoinedEvent(
	db: Database,
	params: {
		conversationId: string;
		organizationId: string;
		websiteId: string;
		visitorId: string;
		targetUserId: string;
		actorUserId?: string;
		actorAiAgentId?: string;
		isAutoAdded?: boolean;
		/** Custom message for the event (e.g., "joined to help" for escalation handling) */
		customMessage?: string;
	}
): Promise<string> {
	const eventId = generateShortPrimaryId();
	const now = new Date().toISOString();

	const message =
		params.customMessage ??
		(params.isAutoAdded
			? "joined the conversation by sending a message"
			: "was added to the conversation");

	const parts: TimelineItemParts = [
		{
			type: "event",
			eventType: ConversationEventType.PARTICIPANT_JOINED,
			actorUserId: params.actorUserId ?? null,
			actorAiAgentId: params.actorAiAgentId ?? null,
			targetUserId: params.targetUserId,
			targetAiAgentId: null,
			message,
		},
	];

	await db.insert(conversationTimelineItem).values({
		id: eventId,
		conversationId: params.conversationId,
		organizationId: params.organizationId,
		type: ConversationTimelineType.EVENT,
		visibility: TimelineItemVisibility.PUBLIC,
		parts,
		userId: params.actorUserId ?? null,
		aiAgentId: params.actorAiAgentId ?? null,
		visitorId: null,
		createdAt: now,
	});

	// Emit realtime event so visitor sees the update immediately
	await realtime.emit("timelineItemCreated", {
		websiteId: params.websiteId,
		organizationId: params.organizationId,
		visitorId: params.visitorId,
		userId: params.actorUserId ?? null,
		conversationId: params.conversationId,
		item: {
			id: eventId,
			conversationId: params.conversationId,
			organizationId: params.organizationId,
			visibility: TimelineItemVisibility.PUBLIC,
			type: ConversationTimelineType.EVENT,
			text: null,
			parts,
			userId: params.actorUserId ?? null,
			visitorId: null,
			aiAgentId: params.actorAiAgentId ?? null,
			createdAt: now,
			deletedAt: null,
		},
	});

	return eventId;
}

/**
 * Create a PARTICIPANT_LEFT event in the conversation timeline
 */
export async function createParticipantLeftEvent(
	db: Database,
	params: {
		conversationId: string;
		organizationId: string;
		targetUserId: string;
		actorUserId?: string;
		actorAiAgentId?: string;
	}
): Promise<string> {
	const eventId = generateShortPrimaryId();
	const now = new Date().toISOString();

	const parts: TimelineItemParts = [
		{
			type: "event",
			eventType: ConversationEventType.PARTICIPANT_LEFT,
			actorUserId: params.actorUserId ?? null,
			actorAiAgentId: params.actorAiAgentId ?? null,
			targetUserId: params.targetUserId,
			targetAiAgentId: null,
			message: "left the conversation",
		},
	];

	await db.insert(conversationTimelineItem).values({
		id: eventId,
		conversationId: params.conversationId,
		organizationId: params.organizationId,
		type: ConversationTimelineType.EVENT,
		visibility: TimelineItemVisibility.PUBLIC,
		parts,
		userId: params.actorUserId ?? null,
		aiAgentId: params.actorAiAgentId ?? null,
		visitorId: null,
		createdAt: now,
	});

	return eventId;
}
