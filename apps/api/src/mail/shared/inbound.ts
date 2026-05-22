import { db } from "@api/db";
import { getConversationById } from "@api/db/queries/conversation";
import { member, user, website } from "@api/db/schema";
import { env } from "@api/env";
import { getPlanForWebsite } from "@api/lib/plans/access";
import {
	finalizeConversationTranslation,
	isAutomaticTranslationEnabled,
	prepareInboundVisitorTranslation,
	prepareOutboundVisitorTranslation,
} from "@api/lib/translation";
import type { ParsedInboundReplyAddress } from "@api/utils/email-threading";
import { parseInboundReplyAddress } from "@api/utils/email-threading";
import { triggerMessageNotificationWorkflow } from "@api/utils/send-message-with-notification";
import { createMessageTimelineItem } from "@api/utils/timeline-item";
import { and, eq } from "drizzle-orm";
import { extractEmailAddress } from "./extract-email-address";
import { sanitizeIncomingEmailBody } from "./sanitize-incoming-email-body";
import type { ReceivedEmailPayload } from "./types";

export function findParsedInboundReplyAddress(
	addresses: readonly string[]
): { address: string; parsed: ParsedInboundReplyAddress } | null {
	for (const address of addresses) {
		const parsed = parseInboundReplyAddress(address);

		if (parsed) {
			return { address, parsed };
		}
	}

	return null;
}

export async function handleReceivedEmail(
	event: ReceivedEmailPayload
): Promise<void> {
	if (!Array.isArray(event.to) || event.to.length === 0) {
		console.warn("[Mail Webhook] email.received event has no recipients");
		return;
	}

	const inboundMatch = event.inboundAddress
		? (() => {
				const parsed = parseInboundReplyAddress(event.inboundAddress);
				return parsed
					? { address: event.inboundAddress as string, parsed }
					: null;
			})()
		: findParsedInboundReplyAddress(event.to);

	if (!inboundMatch) {
		console.warn(
			"[Mail Webhook] email.received event without a recognized inbound reply address"
		);
		return;
	}

	const isProdEnv = env.NODE_ENV === "production";
	const isInboundProd = inboundMatch.parsed.environment === "production";

	if (isProdEnv !== isInboundProd) {
		console.log(
			`[Mail Webhook] Skipping email.received for conversation ${inboundMatch.parsed.conversationId} due to environment mismatch (parsed=${inboundMatch.parsed.environment}, env=${env.NODE_ENV})`
		);
		return;
	}

	const conversation = await getConversationById(db, {
		conversationId: inboundMatch.parsed.conversationId,
	});

	if (!conversation) {
		console.warn(
			`[Mail Webhook] Conversation not found for inbound reply: ${inboundMatch.parsed.conversationId}`
		);
		return;
	}

	const messageText = sanitizeIncomingEmailBody({
		textBody: event.text,
		htmlBody: event.html,
		textWithoutSignature: event.textWithoutSignature,
	});

	if (!messageText) {
		console.warn(
			`[Mail Webhook] Received email ${event.messageId ?? "unknown"} has no usable body content`
		);
		return;
	}

	const senderEmail = extractEmailAddress(event.from);

	let timelineUserId: string | null = null;
	let timelineVisitorId: string | null = conversation.visitorId;

	if (senderEmail) {
		const [memberMatch] = await db
			.select({
				userId: user.id,
			})
			.from(user)
			.innerJoin(member, eq(member.userId, user.id))
			.where(
				and(
					eq(user.email, senderEmail),
					eq(member.organizationId, conversation.organizationId)
				)
			)
			.limit(1);

		if (memberMatch) {
			timelineUserId = memberMatch.userId;
			timelineVisitorId = null;
		}
	}

	const websiteRecord = await db.query.website.findFirst({
		where: eq(website.id, conversation.websiteId),
	});
	const aiContext = {
		db,
		organizationId: conversation.organizationId,
		websiteId: conversation.websiteId,
	};
	const autoTranslateEnabled = websiteRecord
		? isAutomaticTranslationEnabled({
				planAllowsAutoTranslate:
					(await getPlanForWebsite(websiteRecord)).features[
						"auto-translate"
					] === true,
				websiteAutoTranslateEnabled: websiteRecord.autoTranslateEnabled,
			})
		: false;
	const inboundTranslation =
		timelineVisitorId && websiteRecord
			? await prepareInboundVisitorTranslation({
					text: messageText,
					websiteDefaultLanguage: websiteRecord.defaultLanguage,
					visitorLanguageHint: conversation.visitorLanguage,
					mode: "auto",
					autoTranslateEnabled,
					aiContext,
				})
			: null;
	const outboundTranslation =
		timelineUserId && websiteRecord && autoTranslateEnabled
			? await prepareOutboundVisitorTranslation({
					text: messageText,
					sourceLanguage: websiteRecord.defaultLanguage,
					visitorLanguage: conversation.visitorLanguage,
					mode: "auto",
					aiContext,
				})
			: null;

	const { item: createdTimelineItem, actor } = await createMessageTimelineItem({
		db,
		organizationId: conversation.organizationId,
		websiteId: conversation.websiteId,
		conversationId: conversation.id,
		conversationOwnerVisitorId: conversation.visitorId,
		text: messageText,
		extraParts: [
			{ type: "metadata", source: "email" },
			...(inboundTranslation?.translationPart
				? [inboundTranslation.translationPart]
				: []),
			...(outboundTranslation?.translationPart
				? [outboundTranslation.translationPart]
				: []),
		],
		userId: timelineUserId,
		visitorId: timelineVisitorId,
		aiAgentId: null,
	});

	if (
		timelineVisitorId &&
		websiteRecord &&
		inboundTranslation?.visitorLanguage
	) {
		await finalizeConversationTranslation({
			db,
			conversation,
			websiteDefaultLanguage: websiteRecord.defaultLanguage,
			visitorLanguage: inboundTranslation.visitorLanguage,
			hasTranslationPart: Boolean(inboundTranslation.translationPart),
			chargeCredits: autoTranslateEnabled,
			billingSource:
				inboundTranslation.translationResult.status === "translated"
					? inboundTranslation.translationResult.billingSource
					: undefined,
		});
	}

	if (timelineUserId && websiteRecord && outboundTranslation?.translationPart) {
		await finalizeConversationTranslation({
			db,
			conversation,
			websiteDefaultLanguage: websiteRecord.defaultLanguage,
			visitorLanguage: conversation.visitorLanguage,
			hasTranslationPart: true,
			chargeCredits: autoTranslateEnabled,
			billingSource:
				outboundTranslation.translationResult.status === "translated"
					? outboundTranslation.translationResult.billingSource
					: undefined,
		});
	}

	if (actor) {
		try {
			await triggerMessageNotificationWorkflow({
				conversationId: conversation.id,
				messageId: createdTimelineItem.id,
				websiteId: conversation.websiteId,
				organizationId: conversation.organizationId,
				actor,
			});
		} catch (error) {
			console.error(
				`[Mail Webhook] Failed to trigger workflow for inbound email message ${createdTimelineItem.id}`,
				error
			);
		}
	}

	console.log(
		`[Mail Webhook] Created timeline message from inbound email for conversation ${conversation.id}`
	);
}
