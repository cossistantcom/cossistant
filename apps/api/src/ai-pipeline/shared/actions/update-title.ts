/**
 * Update Title Action
 *
 * Updates the conversation title (background analysis).
 * Creates a private event - not visible to visitors.
 * Emits real-time event for dashboard and widget updates.
 */

import type { Database } from "@api/db";
import type { ConversationSelect } from "@api/db/schema/conversation";
import { conversation } from "@api/db/schema/conversation";
import { syncConversationVisitorTitle } from "@api/lib/translation";
import { realtime } from "@api/realtime/emitter";
import { createTimelineItem } from "@api/utils/timeline-item";
import {
	ConversationTimelineType,
	TimelineItemVisibility,
} from "@cossistant/types";
import { and, eq, isNull, or } from "drizzle-orm";
import { loadCurrentConversation } from "./load-current-conversation";

type UpdateTitleParams = {
	db: Database;
	conversation: ConversationSelect;
	organizationId: string;
	websiteId: string;
	aiAgentId: string;
	title: string;
	translationContext: {
		websiteDefaultLanguage: string;
		visitorLanguage?: string | null;
		autoTranslateEnabled: boolean;
	};
	emitTimelineEvent?: boolean;
};

/**
 * Normalize title for comparison (lowercase, trim whitespace)
 */
function normalizeTitle(title: string): string {
	return title.toLowerCase().trim().replace(/\s+/g, " ");
}

function normalizeDisplayTitle(title: string): string {
	return title.trim().replace(/\s+/g, " ");
}

/**
 * Check if two titles are meaningfully different
 */
function isTitleDifferent(oldTitle: string | null, newTitle: string): boolean {
	if (!oldTitle) {
		return true;
	}
	return normalizeTitle(oldTitle) !== normalizeTitle(newTitle);
}

/**
 * Update conversation title
 */
export async function updateTitle(params: UpdateTitleParams): Promise<{
	changed: boolean;
	reason?: "unchanged" | "manual_title" | "invalid_title";
}> {
	const {
		db,
		conversation: conv,
		organizationId,
		websiteId,
		aiAgentId,
		translationContext,
		emitTimelineEvent = false,
	} = params;
	const title = normalizeDisplayTitle(params.title);

	if (!title) {
		return {
			changed: false,
			reason: "invalid_title",
		};
	}

	const currentConversation = await loadCurrentConversation(db, conv.id);
	if (!currentConversation) {
		return {
			changed: false,
		};
	}

	if (currentConversation.titleSource === "user") {
		return {
			changed: false,
			reason: "manual_title",
		};
	}

	// Skip if title is not meaningfully different
	if (!isTitleDifferent(currentConversation.title, title)) {
		return {
			changed: false,
			reason: "unchanged",
		};
	}

	const isUpdate = Boolean(currentConversation.title);
	const now = new Date().toISOString();

	// Update conversation
	const [updatedConversation] = await db
		.update(conversation)
		.set({
			title,
			titleSource: "ai",
			updatedAt: now,
		})
		.where(
			and(
				eq(conversation.id, currentConversation.id),
				or(isNull(conversation.titleSource), eq(conversation.titleSource, "ai"))
			)
		)
		.returning({
			id: conversation.id,
			visitorId: conversation.visitorId,
			titleSource: conversation.titleSource,
		});

	if (!updatedConversation) {
		return {
			changed: false,
			reason: "manual_title",
		};
	}

	const titleTranslation = await syncConversationVisitorTitle({
		db,
		conversationId: currentConversation.id,
		organizationId,
		websiteId,
		title,
		websiteDefaultLanguage: translationContext.websiteDefaultLanguage,
		visitorLanguage:
			translationContext.visitorLanguage ?? currentConversation.visitorLanguage,
		autoTranslateEnabled: translationContext.autoTranslateEnabled,
		aiContext: { db, organizationId, websiteId },
	});

	if (emitTimelineEvent) {
		const eventText = isUpdate
			? `AI updated title: "${title}" (was: "${currentConversation.title}")`
			: `AI generated title: "${title}"`;

		await createTimelineItem({
			db,
			organizationId,
			websiteId,
			conversationId: currentConversation.id,
			conversationOwnerVisitorId: currentConversation.visitorId,
			item: {
				type: ConversationTimelineType.EVENT,
				visibility: TimelineItemVisibility.PRIVATE,
				text: eventText,
				parts: [{ type: "text", text: eventText }],
				aiAgentId,
			},
		});
	}

	// Emit conversationUpdated event for real-time dashboard and widget updates
	await realtime.emit("conversationUpdated", {
		websiteId,
		organizationId,
		visitorId: updatedConversation.visitorId,
		userId: null,
		conversationId: currentConversation.id,
		updates: {
			title,
			titleSource: updatedConversation.titleSource ?? "ai",
			visitorTitle: titleTranslation.visitorTitle,
			visitorTitleLanguage: titleTranslation.visitorTitleLanguage,
		},
		aiAgentId,
	});

	return {
		changed: true,
	};
}
