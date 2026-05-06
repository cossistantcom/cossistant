import type { Database } from "@api/db";
import { conversation, conversationSeen } from "@api/db/schema";
import { trackConversationMetricForVisitor } from "@api/lib/tinybird-sdk";
import { createConversationEvent } from "@api/utils/conversation-event";
import { generateULID } from "@api/utils/db/ids";
import { createTimelineItem } from "@api/utils/timeline-item";
import {
	ConversationEventType,
	ConversationStatus,
	ConversationTimelineType,
	TimelineItemVisibility,
} from "@cossistant/types";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { and, eq } from "drizzle-orm";

export type ConversationRecord = InferSelectModel<typeof conversation>;
type ConversationInsert = InferInsertModel<typeof conversation>;
type ConversationMetadataMap = Record<string, string | number | boolean | null>;

function computeResolutionTime(
	conversationRecord: ConversationRecord,
	resolvedAt: string
): number | null {
	if (!conversationRecord.startedAt) {
		return conversationRecord.resolutionTime ?? null;
	}

	const durationMs =
		new Date(resolvedAt).getTime() -
		new Date(conversationRecord.startedAt).getTime();
	return durationMs > 0 ? Math.round(durationMs / 1000) : 0;
}

export async function resolveConversation(
	db: Database,
	params: {
		conversation: ConversationRecord;
		actorUserId: string;
	}
) {
	const resolvedAt = new Date();
	const resolvedAtIso = resolvedAt.toISOString();

	const [updated] = await db
		.update(conversation)
		.set({
			status: ConversationStatus.RESOLVED,
			resolvedAt: resolvedAtIso,
			resolvedByUserId: params.actorUserId,
			resolvedByAiAgentId: null,
			resolutionTime: computeResolutionTime(params.conversation, resolvedAtIso),
			updatedAt: resolvedAtIso,
		})
		.where(
			and(
				eq(conversation.id, params.conversation.id),
				eq(conversation.organizationId, params.conversation.organizationId),
				eq(conversation.websiteId, params.conversation.websiteId)
			)
		)
		.returning();

	if (!updated) {
		return null;
	}

	await createConversationEvent({
		db,
		context: {
			conversationId: params.conversation.id,
			organizationId: params.conversation.organizationId,
			websiteId: params.conversation.websiteId,
			visitorId: params.conversation.visitorId,
		},
		event: {
			type: ConversationEventType.RESOLVED,
			actorUserId: params.actorUserId,
			createdAt: resolvedAt,
			visibility: TimelineItemVisibility.PRIVATE,
		},
	});

	// Track conversation_resolved event in Tinybird for analytics
	void trackConversationMetricForVisitor(db, {
		website_id: params.conversation.websiteId,
		visitor_id: params.conversation.visitorId,
		conversation_id: params.conversation.id,
		event_type: "conversation_resolved",
		duration_seconds: updated.resolutionTime ?? undefined,
	});

	return updated;
}

export async function reopenConversation(
	db: Database,
	params: {
		conversation: ConversationRecord;
		actorUserId: string;
	}
) {
	const reopenedAt = new Date();
	const reopenedAtIso = reopenedAt.toISOString();

	const [updated] = await db
		.update(conversation)
		.set({
			status: ConversationStatus.OPEN,
			resolvedAt: null,
			resolvedByUserId: null,
			resolvedByAiAgentId: null,
			resolutionTime: null,
			updatedAt: reopenedAtIso,
		})
		.where(
			and(
				eq(conversation.id, params.conversation.id),
				eq(conversation.organizationId, params.conversation.organizationId),
				eq(conversation.websiteId, params.conversation.websiteId)
			)
		)
		.returning();

	if (!updated) {
		return null;
	}

	await createConversationEvent({
		db,
		context: {
			conversationId: params.conversation.id,
			organizationId: params.conversation.organizationId,
			websiteId: params.conversation.websiteId,
			visitorId: params.conversation.visitorId,
		},
		event: {
			type: ConversationEventType.REOPENED,
			actorUserId: params.actorUserId,
			createdAt: reopenedAt,
			visibility: TimelineItemVisibility.PRIVATE,
		},
	});

	return updated;
}

export async function updateConversationAiCursor(
	db: Database,
	params: {
		conversationId: string;
		organizationId: string;
		messageId: string;
		messageCreatedAt: string;
	}
) {
	const [updated] = await db
		.update(conversation)
		.set({
			aiAgentLastProcessedMessageId: params.messageId,
			aiAgentLastProcessedMessageCreatedAt: params.messageCreatedAt,
		})
		.where(
			and(
				eq(conversation.id, params.conversationId),
				eq(conversation.organizationId, params.organizationId)
			)
		)
		.returning();

	return updated ?? null;
}

export async function setConversationAiPausedUntil(
	db: Database,
	params: {
		conversationId: string;
		organizationId: string;
		aiPausedUntil: string | null;
	}
) {
	const updatedAt = new Date().toISOString();

	const [updated] = await db
		.update(conversation)
		.set({
			aiPausedUntil: params.aiPausedUntil,
			updatedAt,
		})
		.where(
			and(
				eq(conversation.id, params.conversationId),
				eq(conversation.organizationId, params.organizationId)
			)
		)
		.returning();

	return updated ?? null;
}

export async function updateConversationTitle(
	db: Database,
	params: {
		conversation: ConversationRecord;
		title: string | null;
		titleSource: "ai" | "user";
	}
) {
	const updatedAt = new Date().toISOString();

	const [updated] = await db
		.update(conversation)
		.set({
			title: params.title,
			titleSource: params.titleSource,
			updatedAt,
		})
		.where(
			and(
				eq(conversation.id, params.conversation.id),
				eq(conversation.organizationId, params.conversation.organizationId),
				eq(conversation.websiteId, params.conversation.websiteId)
			)
		)
		.returning();

	return updated ?? null;
}

export async function updateConversationPriority(
	db: Database,
	params: {
		conversation: ConversationRecord;
		priority: ConversationRecord["priority"];
		actorUserId: string;
	}
) {
	if (
		params.conversation.priority === params.priority &&
		params.conversation.prioritySource === "user"
	) {
		return params.conversation;
	}

	const updatedAt = new Date();
	const updatedAtIso = updatedAt.toISOString();

	const [updated] = await db
		.update(conversation)
		.set({
			priority: params.priority,
			prioritySource: "user",
			updatedAt: updatedAtIso,
		})
		.where(
			and(
				eq(conversation.id, params.conversation.id),
				eq(conversation.organizationId, params.conversation.organizationId),
				eq(conversation.websiteId, params.conversation.websiteId)
			)
		)
		.returning();

	if (!updated) {
		return null;
	}

	if (
		params.conversation.priority !== params.priority ||
		params.conversation.prioritySource !== "user"
	) {
		await createConversationEvent({
			db,
			context: {
				conversationId: params.conversation.id,
				organizationId: params.conversation.organizationId,
				websiteId: params.conversation.websiteId,
				visitorId: params.conversation.visitorId,
			},
			event: {
				type: ConversationEventType.PRIORITY_CHANGED,
				actorUserId: params.actorUserId,
				metadata: {
					previousPriority: params.conversation.priority,
					newPriority: params.priority,
				},
				createdAt: updatedAt,
				visibility: TimelineItemVisibility.PRIVATE,
			},
		});
	}

	return updated;
}

export async function updateConversationSentiment(
	db: Database,
	params: {
		conversation: ConversationRecord;
		sentiment: ConversationRecord["sentiment"];
		actorUserId: string;
	}
) {
	if (
		params.conversation.sentiment === params.sentiment &&
		params.conversation.sentimentConfidence === null &&
		params.conversation.sentimentSource === "user"
	) {
		return params.conversation;
	}

	const updatedAt = new Date();
	const updatedAtIso = updatedAt.toISOString();

	const [updated] = await db
		.update(conversation)
		.set({
			sentiment: params.sentiment,
			sentimentConfidence: null,
			sentimentSource: "user",
			updatedAt: updatedAtIso,
		})
		.where(
			and(
				eq(conversation.id, params.conversation.id),
				eq(conversation.organizationId, params.conversation.organizationId),
				eq(conversation.websiteId, params.conversation.websiteId)
			)
		)
		.returning();

	if (!updated) {
		return null;
	}

	if (
		params.conversation.sentiment !== params.sentiment ||
		params.conversation.sentimentConfidence !== null ||
		params.conversation.sentimentSource !== "user"
	) {
		const sentimentLabel = params.sentiment ?? "unknown";
		const eventText = `changed sentiment to ${sentimentLabel}`;

		await createTimelineItem({
			db,
			organizationId: params.conversation.organizationId,
			websiteId: params.conversation.websiteId,
			conversationId: params.conversation.id,
			conversationOwnerVisitorId: params.conversation.visitorId,
			item: {
				type: ConversationTimelineType.EVENT,
				visibility: TimelineItemVisibility.PRIVATE,
				text: eventText,
				parts: [{ type: "text", text: eventText }],
				userId: params.actorUserId,
			},
		});
	}

	return updated;
}

export async function mergeConversationMetadata(
	db: Database,
	params: {
		conversation: ConversationRecord;
		metadata: NonNullable<ConversationInsert["metadata"]>;
	}
) {
	const existingMetadata =
		typeof params.conversation.metadata === "object" &&
		params.conversation.metadata !== null
			? (params.conversation.metadata as ConversationMetadataMap)
			: {};
	const mergedMetadata: ConversationMetadataMap = {
		...existingMetadata,
		...(params.metadata as ConversationMetadataMap),
	};
	const updatedAt = new Date().toISOString();

	const [updated] = await db
		.update(conversation)
		.set({
			metadata: mergedMetadata,
			updatedAt,
		})
		.where(
			and(
				eq(conversation.id, params.conversation.id),
				eq(conversation.organizationId, params.conversation.organizationId),
				eq(conversation.websiteId, params.conversation.websiteId)
			)
		)
		.returning();

	return updated ?? null;
}

export async function markConversationAsSpam(
	db: Database,
	params: {
		conversation: ConversationRecord;
		actorUserId: string;
	}
) {
	const updatedAt = new Date();
	const updatedAtIso = updatedAt.toISOString();

	const [updated] = await db
		.update(conversation)
		.set({
			status: ConversationStatus.SPAM,
			resolvedAt: null,
			resolvedByUserId: null,
			resolvedByAiAgentId: null,
			updatedAt: updatedAtIso,
		})
		.where(
			and(
				eq(conversation.id, params.conversation.id),
				eq(conversation.organizationId, params.conversation.organizationId),
				eq(conversation.websiteId, params.conversation.websiteId)
			)
		)
		.returning();

	if (!updated) {
		return null;
	}

	await createConversationEvent({
		db,
		context: {
			conversationId: params.conversation.id,
			organizationId: params.conversation.organizationId,
			websiteId: params.conversation.websiteId,
			visitorId: params.conversation.visitorId,
		},
		event: {
			type: ConversationEventType.STATUS_CHANGED,
			actorUserId: params.actorUserId,
			metadata: {
				previousStatus: params.conversation.status,
				newStatus: ConversationStatus.SPAM,
			},
			createdAt: updatedAt,
			visibility: TimelineItemVisibility.PRIVATE,
		},
	});

	return updated;
}

export async function markConversationAsNotSpam(
	db: Database,
	params: {
		conversation: ConversationRecord;
		actorUserId: string;
	}
) {
	const updatedAt = new Date();
	const updatedAtIso = updatedAt.toISOString();

	const [updated] = await db
		.update(conversation)
		.set({
			status: ConversationStatus.OPEN,
			resolvedAt: null,
			resolvedByUserId: null,
			resolvedByAiAgentId: null,
			resolutionTime: null,
			updatedAt: updatedAtIso,
		})
		.where(
			and(
				eq(conversation.id, params.conversation.id),
				eq(conversation.organizationId, params.conversation.organizationId),
				eq(conversation.websiteId, params.conversation.websiteId)
			)
		)
		.returning();

	if (!updated) {
		return null;
	}

	await createConversationEvent({
		db,
		context: {
			conversationId: params.conversation.id,
			organizationId: params.conversation.organizationId,
			websiteId: params.conversation.websiteId,
			visitorId: params.conversation.visitorId,
		},
		event: {
			type: ConversationEventType.STATUS_CHANGED,
			actorUserId: params.actorUserId,
			metadata: {
				previousStatus: params.conversation.status,
				newStatus: ConversationStatus.OPEN,
			},
			createdAt: updatedAt,
			visibility: TimelineItemVisibility.PRIVATE,
		},
	});

	return updated;
}

export async function archiveConversation(
	db: Database,
	params: {
		conversation: ConversationRecord;
		actorUserId: string;
	}
) {
	const archivedAt = new Date();
	const archivedAtIso = archivedAt.toISOString();

	const [updated] = await db
		.update(conversation)
		.set({
			deletedAt: archivedAtIso,
			updatedAt: archivedAtIso,
		})
		.where(
			and(
				eq(conversation.id, params.conversation.id),
				eq(conversation.organizationId, params.conversation.organizationId),
				eq(conversation.websiteId, params.conversation.websiteId)
			)
		)
		.returning();

	if (!updated) {
		return null;
	}

	await createConversationEvent({
		db,
		context: {
			conversationId: params.conversation.id,
			organizationId: params.conversation.organizationId,
			websiteId: params.conversation.websiteId,
			visitorId: params.conversation.visitorId,
		},
		event: {
			type: ConversationEventType.STATUS_CHANGED,
			actorUserId: params.actorUserId,
			metadata: {
				archived: true,
			},
			createdAt: archivedAt,
			visibility: TimelineItemVisibility.PRIVATE,
		},
	});

	return updated;
}

export async function unarchiveConversation(
	db: Database,
	params: {
		conversation: ConversationRecord;
		actorUserId: string;
	}
) {
	const unarchivedAt = new Date();
	const unarchivedAtIso = unarchivedAt.toISOString();

	const [updated] = await db
		.update(conversation)
		.set({
			deletedAt: null,
			updatedAt: unarchivedAtIso,
		})
		.where(
			and(
				eq(conversation.id, params.conversation.id),
				eq(conversation.organizationId, params.conversation.organizationId),
				eq(conversation.websiteId, params.conversation.websiteId)
			)
		)
		.returning();

	if (!updated) {
		return null;
	}

	await createConversationEvent({
		db,
		context: {
			conversationId: params.conversation.id,
			organizationId: params.conversation.organizationId,
			websiteId: params.conversation.websiteId,
			visitorId: params.conversation.visitorId,
		},
		event: {
			type: ConversationEventType.STATUS_CHANGED,
			actorUserId: params.actorUserId,
			metadata: {
				archived: false,
			},
			createdAt: unarchivedAt,
			visibility: TimelineItemVisibility.PRIVATE,
		},
	});

	return updated;
}

export async function markConversationAsRead(
	db: Database,
	params: {
		conversation: ConversationRecord;
		actorUserId: string;
	}
): Promise<{ conversation: ConversationRecord; lastSeenAt: string }> {
	const lastSeenAt = new Date().toISOString();

	await db
		.insert(conversationSeen)
		.values({
			id: generateULID(),
			conversationId: params.conversation.id,
			organizationId: params.conversation.organizationId,
			userId: params.actorUserId,
			visitorId: null,
			aiAgentId: null,
			lastSeenAt,
			createdAt: lastSeenAt,
			updatedAt: lastSeenAt,
		})
		.onConflictDoUpdate({
			target: [conversationSeen.conversationId, conversationSeen.userId],
			set: {
				lastSeenAt,
				updatedAt: lastSeenAt,
			},
		});

	return {
		conversation: params.conversation,
		lastSeenAt,
	};
}

export async function markConversationAsSeenByVisitor(
	db: Database,
	params: {
		conversation: ConversationRecord;
		visitorId: string;
	}
) {
	const updatedAt = new Date().toISOString();

	await db
		.insert(conversationSeen)
		.values({
			id: generateULID(),
			conversationId: params.conversation.id,
			organizationId: params.conversation.organizationId,
			userId: null,
			visitorId: params.visitorId,
			aiAgentId: null,
			lastSeenAt: updatedAt,
			createdAt: updatedAt,
			updatedAt,
		})
		.onConflictDoUpdate({
			target: [conversationSeen.conversationId, conversationSeen.visitorId],
			set: {
				lastSeenAt: updatedAt,
				updatedAt,
			},
		});

	return updatedAt;
}

export async function markConversationAsUnread(
	db: Database,
	params: {
		conversation: ConversationRecord;
		actorUserId: string;
	}
) {
	await db
		.delete(conversationSeen)
		.where(
			and(
				eq(conversationSeen.conversationId, params.conversation.id),
				eq(conversationSeen.userId, params.actorUserId)
			)
		);

	return params.conversation;
}

/**
 * Join an escalated conversation
 *
 * Marks the escalation as handled and returns the updated conversation.
 * The caller is responsible for adding the user as a participant and
 * creating the participant joined event.
 */
export async function joinEscalation(
	db: Database,
	params: {
		conversation: ConversationRecord;
		actorUserId: string;
	}
) {
	const handledAt = new Date();
	const handledAtIso = handledAt.toISOString();

	// Only update if escalation hasn't been handled yet
	if (params.conversation.escalationHandledAt) {
		return params.conversation;
	}

	const [updated] = await db
		.update(conversation)
		.set({
			escalationHandledAt: handledAtIso,
			escalationHandledByUserId: params.actorUserId,
			updatedAt: handledAtIso,
		})
		.where(
			and(
				eq(conversation.id, params.conversation.id),
				eq(conversation.organizationId, params.conversation.organizationId),
				eq(conversation.websiteId, params.conversation.websiteId)
			)
		)
		.returning();

	return updated ?? params.conversation;
}

export type ConversationActor =
	| { type: "visitor"; visitorId: string }
	| { type: "user"; userId: string }
	| { type: "ai_agent"; aiAgentId: string };

export async function markConversationAsSeen(
	db: Database,
	params: {
		conversation: ConversationRecord;
		actor: ConversationActor;
	}
): Promise<string> {
	const updatedAt = new Date().toISOString();

	const baseValues = {
		id: generateULID(),
		conversationId: params.conversation.id,
		organizationId: params.conversation.organizationId,
		lastSeenAt: updatedAt,
		createdAt: updatedAt,
		updatedAt,
	};

	switch (params.actor.type) {
		case "visitor":
			await db
				.insert(conversationSeen)
				.values({
					...baseValues,
					userId: null,
					visitorId: params.actor.visitorId,
					aiAgentId: null,
				})
				.onConflictDoUpdate({
					target: [conversationSeen.conversationId, conversationSeen.visitorId],
					set: {
						lastSeenAt: updatedAt,
						updatedAt,
					},
				});
			break;

		case "user":
			await db
				.insert(conversationSeen)
				.values({
					...baseValues,
					userId: params.actor.userId,
					visitorId: null,
					aiAgentId: null,
				})
				.onConflictDoUpdate({
					target: [conversationSeen.conversationId, conversationSeen.userId],
					set: {
						lastSeenAt: updatedAt,
						updatedAt,
					},
				});
			break;

		case "ai_agent":
			await db
				.insert(conversationSeen)
				.values({
					...baseValues,
					userId: null,
					visitorId: null,
					aiAgentId: params.actor.aiAgentId,
				})
				.onConflictDoUpdate({
					target: [conversationSeen.conversationId, conversationSeen.aiAgentId],
					set: {
						lastSeenAt: updatedAt,
						updatedAt,
					},
				});
			break;

		default:
			throw new Error(`Unknown actor type: ${JSON.stringify(params.actor)}`);
	}

	return updatedAt;
}
