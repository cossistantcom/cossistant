/**
 * Send Message Action
 *
 * Sends a visible message to the visitor.
 * Idempotent - uses idempotencyKey as message ID to prevent duplicates.
 */

import type { Database } from "@api/db";
import { getConversationById } from "@api/db/queries/conversation";
import { conversationTimelineItem } from "@api/db/schema/conversation";
import { website } from "@api/db/schema/website";
import { getPlanForWebsite } from "@api/lib/plans/access";
import {
	finalizeConversationTranslation,
	isAutomaticTranslationEnabled,
	prepareOutboundVisitorTranslation,
} from "@api/lib/translation";
import { getRedis } from "@api/redis";
import { generateIdempotentULID } from "@api/utils/db/ids";
import { createMessageTimelineItem } from "@api/utils/timeline-item";
import { eq } from "drizzle-orm";
import {
	isAiPausedForConversation,
	recordOutboundPublicAiMessageAndMaybePause,
} from "../safety/kill-switch";

type SendMessageParams = {
	db: Database;
	conversationId: string;
	organizationId: string;
	websiteId: string;
	visitorId: string;
	aiAgentId: string;
	text: string;
	idempotencyKey: string;
	createdAt?: Date;
};

type SendMessageResult = {
	messageId: string;
	created: boolean;
	paused?: boolean;
};

/**
 * Send a visible message to the visitor
 */
export async function sendMessage(
	params: SendMessageParams
): Promise<SendMessageResult> {
	const {
		db,
		conversationId,
		organizationId,
		websiteId,
		visitorId,
		aiAgentId,
		text,
		idempotencyKey,
		createdAt,
	} = params;

	// Generate a valid 26-char ULID from the idempotency key
	const messageId = generateIdempotentULID(idempotencyKey);
	const redis = getRedis();

	const paused = await isAiPausedForConversation({
		db,
		redis,
		conversationId,
	});
	if (paused) {
		console.warn(
			`[ai-agent:send-message] conv=${conversationId} | Skipping - AI paused`
		);
		return {
			messageId,
			created: false,
			paused: true,
		};
	}

	console.log(
		`[ai-agent:send-message] conv=${conversationId} | idempotencyKey=${idempotencyKey} | messageId=${messageId}`
	);

	// Check for existing message with this ID
	const existing = await db
		.select({ id: conversationTimelineItem.id })
		.from(conversationTimelineItem)
		.where(eq(conversationTimelineItem.id, messageId))
		.limit(1);

	if (existing.length > 0) {
		console.log(
			`[ai-agent:send-message] conv=${conversationId} | Skipping - message already exists`
		);
		return {
			messageId: existing[0].id,
			created: false,
		};
	}

	const [conversationRecord, websiteRecord] = await Promise.all([
		getConversationById(db, {
			conversationId,
		}),
		db.query.website.findFirst({
			where: eq(website.id, websiteId),
		}),
	]);

	const autoTranslateEnabled = websiteRecord
		? isAutomaticTranslationEnabled({
				planAllowsAutoTranslate:
					(await getPlanForWebsite(websiteRecord)).features[
						"auto-translate"
					] === true,
				websiteAutoTranslateEnabled: websiteRecord.autoTranslateEnabled,
			})
		: false;
	const outboundTranslation =
		autoTranslateEnabled && websiteRecord && conversationRecord
			? await prepareOutboundVisitorTranslation({
					text,
					sourceLanguage: websiteRecord.defaultLanguage,
					visitorLanguage: conversationRecord.visitorLanguage,
					mode: "auto",
					aiContext: { db, organizationId, websiteId },
				})
			: null;

	const result = await createMessageTimelineItem({
		db,
		organizationId,
		websiteId,
		conversationId,
		conversationOwnerVisitorId: visitorId,
		text,
		extraParts: outboundTranslation?.translationPart
			? [outboundTranslation.translationPart]
			: undefined,
		aiAgentId,
		id: messageId, // Use deterministic ULID for deduplication
		userId: null,
		visitorId: null,
		createdAt,
	});

	try {
		const status = await recordOutboundPublicAiMessageAndMaybePause({
			db,
			redis,
			conversationId,
			organizationId,
			messageId: result.item.id,
		});
		if (status.paused) {
			console.warn(
				`[ai-agent:send-message] conv=${conversationId} | Auto-paused after ${status.messageCount} AI messages in window`
			);
		}
	} catch (error) {
		console.error(
			`[ai-agent:send-message] conv=${conversationId} | Failed to run rogue protection:`,
			error
		);
	}

	if (
		conversationRecord &&
		websiteRecord &&
		outboundTranslation?.translationPart
	) {
		await finalizeConversationTranslation({
			db,
			conversation: conversationRecord,
			websiteDefaultLanguage: websiteRecord.defaultLanguage,
			visitorLanguage: conversationRecord.visitorLanguage,
			hasTranslationPart: true,
			chargeCredits: autoTranslateEnabled,
			billingSource:
				outboundTranslation.translationResult.status === "translated"
					? outboundTranslation.translationResult.billingSource
					: undefined,
			aiAgentId,
		});
	}

	return {
		messageId: result.item.id,
		created: true,
	};
}
