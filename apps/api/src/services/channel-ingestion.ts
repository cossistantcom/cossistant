import type { Database } from "@api/db";
import { upsertConversation } from "@api/db/queries/conversation";
import {
	linkVisitorToContact,
	upsertContactByExternalId,
} from "@api/db/queries/contact";
import { getWebsiteById } from "@api/db/queries/website";
import { upsertVisitor } from "@api/db/queries/visitor";
import { generateIdempotentULID } from "@api/utils/db/ids";
import {
	addConversationParticipants,
	getDefaultParticipants,
} from "@api/utils/participant-helpers";
import { triggerMessageNotificationWorkflow } from "@api/utils/send-message-with-notification";
import { createMessageTimelineItem } from "@api/utils/timeline-item";
import type { ChannelMessage } from "@plasma/channels";

export type ChannelTarget = {
	organizationId: string;
	websiteId: string;
};

function getRecordString(
	record: Record<string, unknown> | undefined,
	key: string,
): string | null {
	const value = record?.[key];
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: null;
}

function getRecordNumber(
	record: Record<string, unknown> | undefined,
	key: string,
): number | null {
	const value = record?.[key];
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function deriveChannelVisitorId(message: ChannelMessage, websiteId: string): string {
	return generateIdempotentULID(
		`channel-visitor:${websiteId}:${message.channelType}:${message.visitorExternalId}`,
	);
}

function deriveChannelConversationScope(message: ChannelMessage): string {
	const metadata =
		message.metadata && typeof message.metadata === "object"
			? (message.metadata as Record<string, unknown>)
			: undefined;

	const scopedMetadata =
		getRecordString(metadata, "conversationId") ??
		getRecordString(metadata, "threadTs") ??
		(getRecordNumber(metadata, "chatId")?.toString() ?? null) ??
		getRecordString(metadata, "channelId");

	return scopedMetadata ?? message.visitorExternalId;
}

function deriveChannelConversationId(
	message: ChannelMessage,
	websiteId: string,
): string {
	return generateIdempotentULID(
		`channel-conversation:${websiteId}:${message.channelType}:${deriveChannelConversationScope(message)}:${message.visitorExternalId}`,
	);
}

function buildContactMetadata(message: ChannelMessage): Record<string, unknown> {
	return {
		channelType: message.channelType,
		channelVisitorExternalId: message.visitorExternalId,
		lastInboundExternalId: message.externalId,
		lastInboundTimestamp: message.timestamp,
		...(message.metadata ?? {}),
	};
}

export async function ingestInboundChannelMessage(params: {
	db: Database;
	target: ChannelTarget;
	message: ChannelMessage;
}): Promise<{
	conversationId: string;
	messageId: string;
	createdConversation: boolean;
}> {
	const website = await getWebsiteById(params.db, {
		orgId: params.target.organizationId,
		websiteId: params.target.websiteId,
	});

	if (!website) {
		throw new Error("Configured channel target website not found");
	}

	const visitorId = deriveChannelVisitorId(params.message, params.target.websiteId);
	await upsertVisitor(params.db, {
		visitorId,
		websiteId: params.target.websiteId,
		organizationId: params.target.organizationId,
	});

	const contactExternalId = `${params.message.channelType}:${params.message.visitorExternalId}`;
	const contactResult = await upsertContactByExternalId(params.db, {
		websiteId: params.target.websiteId,
		organizationId: params.target.organizationId,
		externalId: contactExternalId,
		name: params.message.visitorName,
		metadata: buildContactMetadata(params.message),
	});
	await linkVisitorToContact(params.db, {
		visitorId,
		contactId: contactResult.contact.id,
		websiteId: params.target.websiteId,
	});

	const conversationId = deriveChannelConversationId(
		params.message,
		params.target.websiteId,
	);
	const upsertResult = await upsertConversation(params.db, {
		organizationId: params.target.organizationId,
		websiteId: params.target.websiteId,
		visitorId,
		conversationId,
	});

	if (upsertResult.status === "conflict") {
		throw new Error(`Channel conversation conflict: ${upsertResult.reason}`);
	}

	if (upsertResult.status === "created") {
		const defaultParticipantIds = await getDefaultParticipants(params.db, website);
		if (defaultParticipantIds.length > 0) {
			await addConversationParticipants(params.db, {
				conversationId,
				userIds: defaultParticipantIds,
				organizationId: params.target.organizationId,
				reason: "Channel default participant",
			});
		}
	}

	const createdAt = Number.isNaN(Date.parse(params.message.timestamp))
		? undefined
		: new Date(params.message.timestamp);

	const created = await createMessageTimelineItem({
		db: params.db,
		organizationId: params.target.organizationId,
		websiteId: params.target.websiteId,
		conversationId,
		conversationOwnerVisitorId: visitorId,
		text: params.message.content,
		visitorId,
		visibility: "public",
		createdAt,
	});

	await triggerMessageNotificationWorkflow({
		conversationId,
		messageId: created.item.id,
		websiteId: params.target.websiteId,
		organizationId: params.target.organizationId,
		actor: {
			type: "visitor",
			visitorId,
		},
	});

	return {
		conversationId,
		messageId: created.item.id,
		createdConversation: upsertResult.status === "created",
	};
}
