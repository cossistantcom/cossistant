import type { Database } from "@api/db";
import { getConversationById } from "@api/db/queries/conversation";
import { conversation, conversationTimelineItem } from "@api/db/schema";
import { trackConversationMetricForVisitor } from "@api/lib/tinybird-sdk";
import { realtime } from "@api/realtime/emitter";
import { generateULID } from "@api/utils/db/ids";
import {
	ConversationTimelineType,
	TimelineItemVisibility,
} from "@plasma/types";
import { timelineItemSchema } from "@plasma/types/api/timeline-item";
import type { RealtimeEventData } from "@plasma/types/realtime-events";
import { and, eq, isNull } from "drizzle-orm";
import * as linkify from "linkifyjs";

/**
 * Parses raw text and converts URLs to markdown link format
 * @param text - The raw text to parse
 * @returns The text with URLs converted to markdown links
 */
function parseTextToMarkdown(text: string): string {
	const matches = linkify.find(text);

	if (matches.length === 0) {
		return text;
	}

	let result = text;

	// Process matches in reverse to maintain correct positions
	for (let i = matches.length - 1; i >= 0; i--) {
		const match = matches[i];
		if (!match) {
			continue;
		}

		const markdownLink = `[${match.value}](${match.href})`;

		result =
			result.slice(0, match.start) + markdownLink + result.slice(match.end);
	}

	return result;
}

/**
 * Handle escalation when a human agent responds to an escalated conversation.
 * Sets escalationHandledAt and escalationHandledByUserId if the conversation
 * was escalated but not yet handled.
 */
async function handleEscalationIfNeeded(
	db: Database,
	conversationId: string,
	userId: string
): Promise<void> {
	try {
		// Get the conversation to check escalation status
		const conv = await getConversationById(db, { conversationId });

		if (!conv) {
			return;
		}

		// Check if escalated but not yet handled
		if (conv.escalatedAt && !conv.escalationHandledAt) {
			const now = new Date().toISOString();

			await db
				.update(conversation)
				.set({
					escalationHandledAt: now,
					escalationHandledByUserId: userId,
					updatedAt: now,
				})
				.where(eq(conversation.id, conversationId));

			console.log(
				`[timeline-item] conv=${conversationId} | Escalation handled by user=${userId}`
			);
		}
	} catch (error) {
		// Log but don't fail the message creation
		console.error(
			`[timeline-item] Failed to handle escalation for conv=${conversationId}:`,
			error
		);
	}
}

export type CreateTimelineItemOptions = {
	db: Database;
	organizationId: string;
	websiteId: string;
	conversationId: string;
	conversationOwnerVisitorId?: string | null;
	item: {
		id?: string;
		type:
			| typeof ConversationTimelineType.MESSAGE
			| typeof ConversationTimelineType.EVENT
			| typeof ConversationTimelineType.IDENTIFICATION
			| typeof ConversationTimelineType.TOOL;
		text?: string | null;
		parts: unknown[];
		userId?: string | null;
		aiAgentId?: string | null;
		visitorId?: string | null;
		visibility?:
			| typeof TimelineItemVisibility.PUBLIC
			| typeof TimelineItemVisibility.PRIVATE;
		createdAt?: Date;
		tool?: string | null;
	};
};

type TimelineItem = {
	id: string;
	conversationId: string;
	organizationId: string;
	visibility:
		| typeof TimelineItemVisibility.PUBLIC
		| typeof TimelineItemVisibility.PRIVATE;
	type:
		| typeof ConversationTimelineType.MESSAGE
		| typeof ConversationTimelineType.EVENT
		| typeof ConversationTimelineType.IDENTIFICATION
		| typeof ConversationTimelineType.TOOL;
	text: string | null;
	parts: unknown[];
	userId: string | null;
	visitorId: string | null;
	aiAgentId: string | null;
	createdAt: string;
	deletedAt: string | null;
	tool: string | null;
};

export type MessageTimelineActor =
	| { type: "user"; userId: string }
	| { type: "visitor"; visitorId: string }
	| { type: "ai_agent"; aiAgentId: string };

export type MessageTimelineActorInput = {
	userId?: string | null;
	visitorId?: string | null;
	aiAgentId?: string | null;
};

export type CreateMessageTimelineItemOptions = {
	db: Database;
	organizationId: string;
	websiteId: string;
	conversationId: string;
	conversationOwnerVisitorId?: string | null;
	text: string; // Now required - the raw text content
	extraParts?: unknown[]; // Optional additional parts (images, files, events, etc.)
	id?: string; // Optional ID for the timeline item
	userId?: string | null;
	aiAgentId?: string | null;
	visitorId?: string | null;
	visibility?:
		| typeof TimelineItemVisibility.PUBLIC
		| typeof TimelineItemVisibility.PRIVATE;
	createdAt?: Date;
	tool?: string | null;
};

export type UpdateTimelineItemOptions = {
	db: Database;
	organizationId: string;
	websiteId: string;
	conversationId: string;
	conversationOwnerVisitorId?: string | null;
	itemId: string;
	item: {
		text?: string | null;
		parts?: unknown[];
		tool?: string | null;
	};
};

function extractToolNameFromParts(parts: unknown[]): string | null {
	for (const part of parts) {
		if (
			typeof part === "object" &&
			part !== null &&
			"type" in part &&
			"toolName" in part &&
			typeof part.type === "string" &&
			part.type.startsWith("tool-") &&
			typeof part.toolName === "string"
		) {
			return part.toolName;
		}
	}

	return null;
}

function getTimelineItemToolName(item: {
	tool?: string | null;
	parts: unknown[];
}): string | null {
	return item.tool ?? extractToolNameFromParts(item.parts);
}

function serializeTimelineItemForRealtimeItem(
	item: TimelineItem
): RealtimeEventData<"timelineItemCreated">["item"] {
	return {
		id: item.id,
		conversationId: item.conversationId,
		organizationId: item.organizationId,
		visibility: item.visibility,
		type: item.type,
		text: item.text,
		parts: item.parts as unknown[],
		userId: item.userId,
		visitorId: item.visitorId,
		aiAgentId: item.aiAgentId,
		createdAt: item.createdAt,
		deletedAt: item.deletedAt,
		tool: item.tool,
	};
}

function serializeTimelineItemForRealtimeCreated(
	item: TimelineItem,
	context: {
		conversationId: string;
		websiteId: string;
		organizationId: string;
		userId: string | null;
		visitorId: string | null;
	}
): RealtimeEventData<"timelineItemCreated"> {
	return {
		item: serializeTimelineItemForRealtimeItem(item),
		conversationId: context.conversationId,
		websiteId: context.websiteId,
		organizationId: context.organizationId,
		userId: context.userId,
		visitorId: context.visitorId,
	};
}

function serializeTimelineItemForRealtimeUpdated(
	item: TimelineItem,
	context: {
		conversationId: string;
		websiteId: string;
		organizationId: string;
		userId: string | null;
		visitorId: string | null;
	}
): RealtimeEventData<"timelineItemUpdated"> {
	return {
		item: serializeTimelineItemForRealtimeItem(item),
		conversationId: context.conversationId,
		websiteId: context.websiteId,
		organizationId: context.organizationId,
		userId: context.userId,
		visitorId: context.visitorId,
	};
}

export function resolveMessageTimelineActor(
	item: MessageTimelineActorInput,
	fallbackVisitorId?: string | null
): MessageTimelineActor | null {
	if (item.userId) {
		return { type: "user", userId: item.userId };
	}

	if (item.aiAgentId) {
		return { type: "ai_agent", aiAgentId: item.aiAgentId };
	}

	if (item.visitorId) {
		return { type: "visitor", visitorId: item.visitorId };
	}

	if (fallbackVisitorId) {
		return { type: "visitor", visitorId: fallbackVisitorId };
	}

	return null;
}

export async function createMessageTimelineItem(
	options: CreateMessageTimelineItemOptions
): Promise<{ item: TimelineItem; actor: MessageTimelineActor | null }> {
	const {
		conversationOwnerVisitorId,
		text,
		extraParts = [],
		id,
		db,
		organizationId,
		websiteId,
		conversationId,
		userId,
		aiAgentId,
		visitorId,
		visibility,
		createdAt,
		tool,
	} = options;

	// Parse the text to convert URLs to markdown links
	const parsedText = parseTextToMarkdown(text);

	// Construct the parts array with the text part first
	const parts = [{ type: "text", text: parsedText }, ...extraParts];

	const createdTimelineItem = await createTimelineItem({
		db,
		organizationId,
		websiteId,
		conversationId,
		conversationOwnerVisitorId,
		item: {
			id,
			type: ConversationTimelineType.MESSAGE,
			text: parsedText,
			parts,
			userId,
			aiAgentId,
			visitorId,
			visibility,
			createdAt,
			tool,
		},
	});

	const isResponseFromTeam = Boolean(userId || aiAgentId);

	if (isResponseFromTeam) {
		const [updated] = await db
			.update(conversation)
			.set({
				firstResponseAt: createdTimelineItem.createdAt,
				updatedAt: createdTimelineItem.createdAt,
			})
			.where(
				and(
					eq(conversation.id, conversationId),
					eq(conversation.organizationId, organizationId),
					eq(conversation.websiteId, websiteId),
					isNull(conversation.firstResponseAt)
				)
			)
			.returning({
				id: conversation.id,
				startedAt: conversation.startedAt,
				visitorId: conversation.visitorId,
			});

		// Track first_response event in Tinybird for analytics
		if (updated?.startedAt) {
			const durationSeconds = Math.max(
				0,
				Math.round(
					(new Date(createdTimelineItem.createdAt).getTime() -
						new Date(updated.startedAt).getTime()) /
						1000
				)
			);

			void trackConversationMetricForVisitor(db, {
				website_id: websiteId,
				visitor_id: updated.visitorId,
				conversation_id: conversationId,
				event_type: "first_response",
				duration_seconds: durationSeconds,
			});
		}
	}

	const actor = resolveMessageTimelineActor(
		createdTimelineItem,
		conversationOwnerVisitorId ?? null
	);

	// If a human agent is sending a message, handle any pending escalation
	if (userId) {
		await handleEscalationIfNeeded(db, conversationId, userId);
	}

	return { item: createdTimelineItem, actor };
}

export async function createTimelineItem(
	options: CreateTimelineItemOptions
): Promise<TimelineItem> {
	const { db, organizationId, websiteId, conversationId, item } = options;

	const timelineItemId = item.id ?? generateULID();
	const createdAt = item.createdAt
		? item.createdAt.toISOString()
		: new Date().toISOString();

	const [createdItem] = await db
		.insert(conversationTimelineItem)
		.values({
			id: timelineItemId,
			conversationId,
			organizationId,
			visibility: item.visibility ?? TimelineItemVisibility.PUBLIC,
			type: item.type,
			text: item.text ?? null,
			parts: item.parts as unknown,
			userId: item.userId ?? null,
			visitorId: item.visitorId ?? null,
			aiAgentId: item.aiAgentId ?? null,
			createdAt,
			deletedAt: null,
		})
		.returning();

	if (!createdItem) {
		throw new Error("Failed to create timeline item: no record returned");
	}

	const parsedItem = timelineItemSchema.parse({
		...createdItem,
		parts: createdItem.parts,
	});

	let visitorIdForEvent =
		options.conversationOwnerVisitorId ?? parsedItem.visitorId ?? null;

	if (!visitorIdForEvent) {
		visitorIdForEvent =
			(await resolveConversationVisitorId(options.db, conversationId)) ?? null;
	}

	if (!parsedItem.id) {
		throw new Error("Timeline item ID is required");
	}

	const normalizedItem: TimelineItem = {
		id: parsedItem.id,
		conversationId: parsedItem.conversationId,
		organizationId: parsedItem.organizationId,
		visibility: parsedItem.visibility,
		type: parsedItem.type,
		text: parsedItem.text ?? null,
		parts: parsedItem.parts,
		userId: parsedItem.userId,
		visitorId: parsedItem.visitorId,
		aiAgentId: parsedItem.aiAgentId,
		createdAt: parsedItem.createdAt,
		deletedAt: parsedItem.deletedAt ?? null,
		tool: getTimelineItemToolName({
			tool: parsedItem.tool ?? null,
			parts: parsedItem.parts,
		}),
	};

	const realtimePayload = serializeTimelineItemForRealtimeCreated(
		normalizedItem,
		{
			conversationId,
			websiteId,
			organizationId,
			userId: parsedItem.userId,
			visitorId: visitorIdForEvent,
		}
	);

	await realtime.emit("timelineItemCreated", realtimePayload);

	return normalizedItem;
}

export async function updateTimelineItem(
	options: UpdateTimelineItemOptions
): Promise<TimelineItem> {
	const {
		db,
		organizationId,
		websiteId,
		conversationId,
		itemId,
		item,
		conversationOwnerVisitorId,
	} = options;

	const updates: Partial<{
		text: string | null;
		parts: unknown;
	}> = {};

	if ("text" in item) {
		updates.text = item.text ?? null;
	}

	if ("parts" in item && item.parts) {
		updates.parts = item.parts as unknown;
	}

	if (Object.keys(updates).length === 0) {
		throw new Error("No timeline item updates were provided");
	}

	const [updatedItem] = await db
		.update(conversationTimelineItem)
		.set(updates)
		.where(
			and(
				eq(conversationTimelineItem.id, itemId),
				eq(conversationTimelineItem.organizationId, organizationId),
				eq(conversationTimelineItem.conversationId, conversationId),
				isNull(conversationTimelineItem.deletedAt)
			)
		)
		.returning();

	if (!updatedItem) {
		throw new Error("Failed to update timeline item: item not found");
	}

	const parsedItem = timelineItemSchema.parse({
		...updatedItem,
		parts: updatedItem.parts,
	});

	const normalizedItem: TimelineItem = {
		id: parsedItem.id ?? updatedItem.id,
		conversationId: parsedItem.conversationId,
		organizationId: parsedItem.organizationId,
		visibility: parsedItem.visibility,
		type: parsedItem.type,
		text: parsedItem.text ?? null,
		parts: parsedItem.parts,
		userId: parsedItem.userId,
		visitorId: parsedItem.visitorId,
		aiAgentId: parsedItem.aiAgentId,
		createdAt: parsedItem.createdAt,
		deletedAt: parsedItem.deletedAt ?? null,
		tool:
			item.tool ??
			getTimelineItemToolName({
				tool: parsedItem.tool ?? null,
				parts: parsedItem.parts,
			}),
	};

	let visitorIdForEvent =
		conversationOwnerVisitorId ?? normalizedItem.visitorId;
	if (!visitorIdForEvent) {
		visitorIdForEvent =
			(await resolveConversationVisitorId(options.db, conversationId)) ?? null;
	}

	await realtime.emit(
		"timelineItemUpdated",
		serializeTimelineItemForRealtimeUpdated(normalizedItem, {
			conversationId,
			websiteId,
			organizationId,
			userId: normalizedItem.userId,
			visitorId: visitorIdForEvent,
		})
	);

	return normalizedItem;
}

async function resolveConversationVisitorId(
	db: Database,
	conversationId: string
): Promise<string | undefined> {
	try {
		const conversationRecord = await getConversationById(db, {
			conversationId,
		});
		return conversationRecord?.visitorId ?? undefined;
	} catch (error) {
		console.error(
			"[TIMELINE_ITEM_CREATED] Failed to resolve conversation visitor",
			{
				error,
				conversationId,
			}
		);
		return;
	}
}
