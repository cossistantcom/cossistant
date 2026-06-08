import type { Database } from "@api/db";
import {
	getConversationHeader,
	upsertConversation,
} from "@api/db/queries/conversation";
import {
	createFeedback,
	updateFeedbackConversationId,
} from "@api/db/queries/feedback";
import { conversation } from "@api/db/schema/conversation";
import { trackConversationMetricForVisitor } from "@api/lib/tinybird-sdk";
import { emitConversationCreatedEvent } from "@api/utils/conversation-realtime";
import {
	addConversationParticipants,
	getDefaultParticipants,
} from "@api/utils/participant-helpers";
import { triggerVisitorSentMessageWorkflow } from "@api/utils/send-message-with-notification";
import { createMessageTimelineItem } from "@api/utils/timeline-item";
import {
	createFeedbackTimelinePart,
	resolveFeedbackTimelineText,
} from "@cossistant/core";
import type { Feedback } from "@cossistant/types/api/feedback";
import { and, eq } from "drizzle-orm";

type FeedbackWebsite = {
	defaultParticipantIds: string[] | null;
	organizationId: string;
};

type PersistFeedbackSubmissionParams = {
	db: Database;
	organizationId: string;
	websiteId: string;
	website?: FeedbackWebsite | null;
	visitorId?: string;
	conversationOwnerVisitorId?: string | null;
	contactId?: string | null;
	conversationId?: string;
	rating: number;
	topic?: string;
	comment?: string;
	trigger?: string;
	source?: string;
	syncConversationRating?: boolean;
};

type FeedbackEntry = Awaited<ReturnType<typeof createFeedback>>;
type CreatedFeedbackConversation = Extract<
	Awaited<ReturnType<typeof upsertConversation>>,
	{ status: "created" }
>["conversation"];

export function formatFeedbackResponse(entry: {
	id: string;
	organizationId: string;
	websiteId: string;
	conversationId: string | null;
	visitorId: string | null;
	contactId: string | null;
	rating: number;
	topic: string | null;
	comment: string | null;
	trigger: string | null;
	source: string;
	createdAt: string;
	updatedAt: string;
	deletedAt: string | null;
}): Feedback {
	return {
		id: entry.id,
		organizationId: entry.organizationId,
		websiteId: entry.websiteId,
		conversationId: entry.conversationId,
		visitorId: entry.visitorId,
		contactId: entry.contactId,
		rating: entry.rating,
		topic: entry.topic,
		comment: entry.comment,
		trigger: entry.trigger,
		source: entry.source,
		createdAt: entry.createdAt,
		updatedAt: entry.updatedAt,
	};
}

async function addDefaultParticipantsForFeedbackConversation({
	db,
	organizationId,
	website,
	conversationId,
}: {
	db: Database;
	organizationId: string;
	website?: FeedbackWebsite | null;
	conversationId: string;
}): Promise<void> {
	const defaultParticipantIds = await getDefaultParticipants(db, {
		defaultParticipantIds: website?.defaultParticipantIds ?? null,
		organizationId,
	});

	if (defaultParticipantIds.length === 0) {
		return;
	}

	await addConversationParticipants(db, {
		conversationId,
		userIds: defaultParticipantIds,
		organizationId,
		reason: "Default participant",
	});
}

async function resolveFeedbackConversation({
	db,
	organizationId,
	websiteId,
	website,
	visitorId,
	conversationId,
	source,
}: {
	db: Database;
	organizationId: string;
	websiteId: string;
	website?: FeedbackWebsite | null;
	visitorId?: string;
	conversationId?: string;
	source: string;
}): Promise<{
	conversationId?: string;
	createdConversation: CreatedFeedbackConversation | null;
}> {
	if (conversationId || !visitorId) {
		return { conversationId, createdConversation: null };
	}

	const upsertResult = await upsertConversation(db, {
		organizationId,
		websiteId,
		visitorId,
		channel: source,
	});

	if (upsertResult.status === "conflict") {
		throw new Error("Failed to create conversation for feedback");
	}

	const resolvedConversationId = upsertResult.conversation.id;
	const createdConversation =
		upsertResult.status === "created" ? upsertResult.conversation : null;

	if (createdConversation) {
		await addDefaultParticipantsForFeedbackConversation({
			db,
			organizationId,
			website,
			conversationId: resolvedConversationId,
		});
	}

	return {
		conversationId: resolvedConversationId,
		createdConversation,
	};
}

async function linkFeedbackToConversation({
	db,
	entry,
	websiteId,
	conversationId,
}: {
	db: Database;
	entry: FeedbackEntry;
	websiteId: string;
	conversationId?: string;
}): Promise<FeedbackEntry> {
	if (!conversationId || entry.conversationId === conversationId) {
		return entry;
	}

	return updateFeedbackConversationId(db, {
		id: entry.id,
		websiteId,
		conversationId,
	});
}

async function touchConversationAfterFeedback({
	db,
	organizationId,
	websiteId,
	conversationId,
	ratedAt,
	rating,
	syncConversationRating,
	touchRecency,
}: {
	db: Database;
	organizationId: string;
	websiteId: string;
	conversationId: string;
	ratedAt: string;
	rating: number;
	syncConversationRating: boolean;
	touchRecency: boolean;
}): Promise<void> {
	const updates: {
		lastMessageAt?: string;
		updatedAt?: string;
		visitorRating?: number;
		visitorRatingAt?: string;
	} = {};

	if (touchRecency) {
		updates.lastMessageAt = ratedAt;
		updates.updatedAt = ratedAt;
	}

	if (syncConversationRating) {
		updates.visitorRating = rating;
		updates.visitorRatingAt = ratedAt;
		updates.updatedAt = ratedAt;
	}

	if (Object.keys(updates).length === 0) {
		return;
	}

	await db
		.update(conversation)
		.set(updates)
		.where(
			and(
				eq(conversation.id, conversationId),
				eq(conversation.organizationId, organizationId),
				eq(conversation.websiteId, websiteId)
			)
		);
}

async function createFeedbackTimelineItem({
	db,
	organizationId,
	websiteId,
	conversationId,
	visitorId,
	conversationOwnerVisitorId,
	entry,
}: {
	db: Database;
	organizationId: string;
	websiteId: string;
	conversationId: string;
	visitorId: string;
	conversationOwnerVisitorId?: string | null;
	entry: FeedbackEntry;
}) {
	const feedbackPart = createFeedbackTimelinePart({
		feedbackId: entry.id,
		rating: entry.rating,
		topic: entry.topic,
		trigger: entry.trigger,
		source: entry.source,
	});

	return createMessageTimelineItem({
		db,
		organizationId,
		websiteId,
		conversationId,
		conversationOwnerVisitorId: conversationOwnerVisitorId ?? visitorId,
		text: resolveFeedbackTimelineText({
			comment: entry.comment,
			rating: entry.rating,
		}),
		extraParts: [feedbackPart],
		visitorId,
		createdAt: new Date(entry.createdAt),
	});
}

async function notifyFeedbackTimelineItem({
	conversationId,
	messageId,
	websiteId,
	organizationId,
	visitorId,
}: {
	conversationId: string;
	messageId: string;
	websiteId: string;
	organizationId: string;
	visitorId: string;
}): Promise<void> {
	try {
		await triggerVisitorSentMessageWorkflow({
			conversationId,
			messageId,
			websiteId,
			organizationId,
			visitorId,
		});
	} catch (error) {
		console.error("[feedback] Notification trigger failed", {
			conversationId,
			messageId,
			organizationId,
			websiteId,
			error,
		});
	}
}

async function emitCreatedFeedbackConversation({
	db,
	organizationId,
	websiteId,
	createdConversation,
	createdTimelineItemId,
}: {
	db: Database;
	organizationId: string;
	websiteId: string;
	createdConversation: CreatedFeedbackConversation;
	createdTimelineItemId: string | null;
}): Promise<void> {
	const header = await getConversationHeader(db, {
		organizationId,
		websiteId,
		conversationId: createdConversation.id,
		userId: null,
	});

	if (header) {
		await emitConversationCreatedEvent({
			conversation: createdConversation,
			header,
		});
		return;
	}

	console.warn("[feedback] Created conversation without header", {
		conversationId: createdConversation.id,
		createdTimelineItemId,
		organizationId,
		websiteId,
	});
}

export async function persistFeedbackSubmission({
	db,
	organizationId,
	websiteId,
	website,
	visitorId,
	conversationOwnerVisitorId,
	contactId,
	conversationId,
	rating,
	topic,
	comment,
	trigger,
	source = "widget",
	syncConversationRating = false,
}: PersistFeedbackSubmissionParams): Promise<{
	entry: Awaited<ReturnType<typeof createFeedback>>;
	ratedAt: string;
}> {
	let entry = await createFeedback(db, {
		organizationId,
		websiteId,
		conversationId,
		visitorId,
		contactId: contactId ?? undefined,
		rating,
		topic,
		comment,
		trigger,
		source,
	});
	const ratedAt = entry.createdAt;
	const { conversationId: resolvedConversationId, createdConversation } =
		await resolveFeedbackConversation({
			db,
			organizationId,
			websiteId,
			website,
			visitorId,
			conversationId,
			source,
		});

	entry = await linkFeedbackToConversation({
		db,
		entry,
		websiteId,
		conversationId: resolvedConversationId,
	});

	let createdTimelineItemId: string | null = null;
	if (resolvedConversationId && visitorId) {
		const { item } = await createFeedbackTimelineItem({
			db,
			organizationId,
			websiteId,
			conversationId: resolvedConversationId,
			visitorId,
			conversationOwnerVisitorId:
				createdConversation?.visitorId ?? conversationOwnerVisitorId,
			entry,
		});
		createdTimelineItemId = item.id;

		await touchConversationAfterFeedback({
			db,
			organizationId,
			websiteId,
			conversationId: resolvedConversationId,
			ratedAt,
			rating,
			syncConversationRating,
			touchRecency: !createdConversation,
		});

		await notifyFeedbackTimelineItem({
			conversationId: resolvedConversationId,
			messageId: item.id,
			websiteId,
			organizationId,
			visitorId,
		});

		void trackConversationMetricForVisitor(db, {
			website_id: websiteId,
			visitor_id: visitorId,
			conversation_id: resolvedConversationId,
			event_type: "feedback_submitted",
		});
	}

	if (syncConversationRating && resolvedConversationId && !visitorId) {
		await touchConversationAfterFeedback({
			db,
			organizationId,
			websiteId,
			conversationId: resolvedConversationId,
			ratedAt,
			rating,
			syncConversationRating,
			touchRecency: false,
		});
	}

	if (createdConversation) {
		await emitCreatedFeedbackConversation({
			db,
			organizationId,
			websiteId,
			createdConversation,
			createdTimelineItemId,
		});
	}

	return {
		entry,
		ratedAt,
	};
}
