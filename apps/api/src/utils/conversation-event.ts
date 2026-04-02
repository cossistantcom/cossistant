import type { Database } from "@api/db";
import { TimelineItemVisibility } from "@plasma/types";
import type { TimelineItem } from "@plasma/types/api";
import type { ConversationEventType } from "@plasma/types/enums";
import { createTimelineItem } from "./timeline-item";

type ConversationContext = {
	conversationId: string;
	organizationId: string;
	websiteId: string;
	visitorId?: string | null;
};

type CreateConversationEventPayload = {
	type: ConversationEventType;
	actorUserId?: string | null;
	actorAiAgentId?: string | null;
	targetUserId?: string | null;
	targetAiAgentId?: string | null;
	metadata?: Record<string, unknown> | null;
	message?: string | null;
	createdAt?: Date;
	visibility?:
		| typeof TimelineItemVisibility.PUBLIC
		| typeof TimelineItemVisibility.PRIVATE;
};

export type CreateConversationEventOptions = {
	db: Database;
	context: ConversationContext;
	event: CreateConversationEventPayload;
};

export async function createConversationEvent({
	db,
	context,
	event,
}: CreateConversationEventOptions): Promise<TimelineItem> {
	const createdAt = event.createdAt ?? new Date();

	const createdTimelineItem = await createTimelineItem({
		db,
		organizationId: context.organizationId,
		websiteId: context.websiteId,
		conversationId: context.conversationId,
		conversationOwnerVisitorId: context.visitorId ?? null,
		item: {
			type: "event",
			text: event.message ?? null,
			parts: [
				{
					type: "event",
					eventType: event.type,
					actorUserId: event.actorUserId ?? null,
					actorAiAgentId: event.actorAiAgentId ?? null,
					targetUserId: event.targetUserId ?? null,
					targetAiAgentId: event.targetAiAgentId ?? null,
					message: event.message ?? null,
				},
			],
			visibility: event.visibility ?? TimelineItemVisibility.PUBLIC,
			userId: event.actorUserId ?? null,
			aiAgentId: event.actorAiAgentId ?? null,
			visitorId: null,
			createdAt,
		},
	});

	return createdTimelineItem as TimelineItem;
}
