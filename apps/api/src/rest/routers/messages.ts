import {
	type ConversationActor,
	markConversationAsSeen,
} from "@api/db/mutations/conversation";
import { getConversationById } from "@api/db/queries/conversation";
import { canVisitorAccessConversation } from "@api/db/queries/conversation-access";
import { AuthValidationError } from "@api/lib/auth-validation";
import { getPlanForWebsite } from "@api/lib/plans/access";
import { resolvePrivateApiKeyActorUser } from "@api/lib/private-api-key-actor";
import {
	finalizeConversationTranslation,
	isAutomaticTranslationEnabled,
	prepareInboundVisitorTranslation,
	prepareOutboundVisitorTranslation,
} from "@api/lib/translation";
import { markUserPresence, markVisitorPresence } from "@api/services/presence";
import { createParticipantJoinedEvent } from "@api/utils/conversation-events";
import { emitConversationSeenEvent } from "@api/utils/conversation-realtime";
import {
	addConversationParticipant,
	isUserParticipant,
} from "@api/utils/participant-helpers";
import { triggerMessageNotificationWorkflow } from "@api/utils/send-message-with-notification";
import {
	createMessageTimelineItem,
	createTimelineItem,
} from "@api/utils/timeline-item";
import {
	safelyExtractRequestData,
	validateResponse,
} from "@api/utils/validate";
import { createMessageRoute } from "@cossistant/protocol/routes";
import {
	sendTimelineItemRequestSchema,
	sendTimelineItemResponseSchema,
	type TimelineItem,
} from "@cossistant/types/api/timeline-item";
import {
	APIKeyType,
	ConversationStatus,
	ConversationTimelineType,
} from "@cossistant/types/enums";
import { OpenAPIHono, z } from "@hono/zod-openapi";
import {
	ClientTimelineItemCreatedAtValidationError,
	normalizeClientTimelineItemCreatedAt,
} from "../client-timeline-item-created-at";
import { protectedPublicApiKeyMiddleware } from "../middleware";
import { errorJsonResponse, restError, runtimeDualAuth } from "../openapi";
import { resolveRuntimeVisitorIdentity } from "../runtime-visitor";
import type { RestContext } from "../types";

export const messagesRouter = new OpenAPIHono<RestContext>();

function resolveTimelineActor(params: {
	actor: ConversationActor | null;
	userId: string | null;
	aiAgentId: string | null;
	visitorId: string | null;
}): ConversationActor | null {
	if (params.actor) {
		return params.actor;
	}

	if (params.userId) {
		return { type: "user", userId: params.userId } satisfies ConversationActor;
	}

	if (params.aiAgentId) {
		return {
			type: "ai_agent",
			aiAgentId: params.aiAgentId,
		} satisfies ConversationActor;
	}

	if (params.visitorId) {
		return {
			type: "visitor",
			visitorId: params.visitorId,
		} satisfies ConversationActor;
	}

	return null;
}

// Apply middleware to all routes in this router
messagesRouter.use("/*", ...protectedPublicApiKeyMiddleware);

// GET /messages endpoint removed - use /conversations/:id/timeline instead

messagesRouter.openapi(createMessageRoute, async (c) => {
	const { db, website, organization, body, visitorIdHeader, apiKey } =
		await safelyExtractRequestData(c, sendTimelineItemRequestSchema);

	let visitorId = body.item.visitorId || visitorIdHeader || null;
	const isPublic = apiKey?.keyType === APIKeyType.PUBLIC;
	const publicVisitorIdentity = await resolveRuntimeVisitorIdentity({
		c,
		db,
		apiKey,
		organizationId: organization.id,
		websiteId: website.id,
		headerVisitorId: visitorIdHeader,
		requestVisitorId: body.item.visitorId,
		publicOnly: true,
	});

	if (publicVisitorIdentity.error) {
		return publicVisitorIdentity.error;
	}

	if (isPublic) {
		visitorId = publicVisitorIdentity.visitor?.id ?? null;
	}

	let itemCreatedAt: Date | undefined;
	try {
		itemCreatedAt = normalizeClientTimelineItemCreatedAt({
			createdAt: body.item.createdAt,
			field: "item.createdAt",
		});
	} catch (error) {
		if (error instanceof ClientTimelineItemCreatedAtValidationError) {
			return restError(c, 400, "BAD_REQUEST", error.message);
		}

		throw error;
	}

	const conversation = await getConversationById(db, {
		conversationId: body.conversationId,
	});

	if (!conversation || conversation.websiteId !== website.id) {
		return c.json(
			validateResponse(
				{ error: "Conversation for website not found" },
				z.object({ error: z.string() })
			),
			404
		);
	}

	if (isPublic) {
		if (!visitorId) {
			return c.json(
				validateResponse(
					{ error: "Forbidden: visitor does not own the conversation" },
					z.object({ error: z.string() })
				),
				403
			);
		}

		const canAccessConversation = await canVisitorAccessConversation(db, {
			organizationId: organization.id,
			websiteId: website.id,
			viewerVisitorId: visitorId,
			conversationVisitorId: conversation.visitorId,
		});

		if (!canAccessConversation) {
			return c.json(
				validateResponse(
					{ error: "Forbidden: visitor does not own the conversation" },
					z.object({ error: z.string() })
				),
				403
			);
		}
	}

	const conversationIsClosed =
		conversation.status === ConversationStatus.RESOLVED ||
		conversation.status === ConversationStatus.SPAM ||
		Boolean(conversation.deletedAt);

	if (isPublic && conversationIsClosed) {
		return c.json(
			validateResponse(
				{
					error:
						"Forbidden: this conversation is closed and cannot receive new messages",
				},
				z.object({ error: z.string() })
			),
			403
		);
	}

	// Disallow setting user/ai actor via public key
	if (isPublic && (body.item.userId || body.item.aiAgentId)) {
		return c.json(
			validateResponse(
				{
					error: "Forbidden: cannot set userId/aiAgentId with a public API key",
				},
				z.object({ error: z.string() })
			),
			403
		);
	}

	const timelineItemType = body.item.type ?? ConversationTimelineType.MESSAGE;
	const shouldResolvePrivateUserActor =
		!isPublic &&
		(body.item.userId ||
			(timelineItemType === ConversationTimelineType.MESSAGE &&
				!body.item.aiAgentId &&
				!visitorId));
	let privateActorUserId: string | null = null;

	if (shouldResolvePrivateUserActor) {
		if (!apiKey) {
			return restError(c, 401, "UNAUTHORIZED", "Invalid API key");
		}

		try {
			const privateActor = await resolvePrivateApiKeyActorUser({
				db,
				apiKey,
				organizationId: organization.id,
				websiteTeamId: website.teamId,
				explicitActorUserId: c.req.header("X-Actor-User-Id") ?? null,
				required: true,
			});
			privateActorUserId = privateActor?.userId ?? null;
		} catch (error) {
			if (error instanceof AuthValidationError) {
				const status = error.statusCode === 400 ? 400 : 403;
				return restError(
					c,
					status,
					status === 400 ? "BAD_REQUEST" : "FORBIDDEN",
					error.message
				);
			}
			throw error;
		}

		if (body.item.userId && body.item.userId !== privateActorUserId) {
			return restError(
				c,
				403,
				"FORBIDDEN",
				"Body item.userId must match the resolved private API actor"
			);
		}
	}

	const resolvedUserId = isPublic
		? null
		: (privateActorUserId ?? body.item.userId ?? null);
	const resolvedAiAgentId = isPublic ? null : (body.item.aiAgentId ?? null);

	// Check if user needs to be added as participant
	if (resolvedUserId && !isPublic) {
		const isParticipant = await isUserParticipant(db, {
			conversationId: body.conversationId,
			userId: resolvedUserId,
		});

		if (!isParticipant) {
			// Add user as participant
			await addConversationParticipant(db, {
				conversationId: body.conversationId,
				userId: resolvedUserId,
				organizationId: organization.id,
				reason: "Sent message",
			});

			// Create participant joined event (PUBLIC so visitor sees it)
			await createParticipantJoinedEvent(db, {
				conversationId: body.conversationId,
				organizationId: organization.id,
				websiteId: website.id,
				visitorId: conversation.visitorId,
				targetUserId: resolvedUserId,
				isAutoAdded: true,
			});
		}
	}

	const planInfo = await getPlanForWebsite(website);
	const autoTranslateEnabled = isAutomaticTranslationEnabled({
		planAllowsAutoTranslate: planInfo.features["auto-translate"] === true,
		websiteAutoTranslateEnabled: website.autoTranslateEnabled,
	});

	const aiContext = {
		db,
		organizationId: organization.id,
		websiteId: website.id,
	};
	const isVisitorMessage =
		timelineItemType === ConversationTimelineType.MESSAGE &&
		Boolean(visitorId) &&
		!resolvedUserId &&
		!resolvedAiAgentId;

	const inboundTranslation = isVisitorMessage
		? await prepareInboundVisitorTranslation({
				text: body.item.text ?? "",
				websiteDefaultLanguage: website.defaultLanguage,
				visitorLanguageHint: conversation.visitorLanguage,
				mode: "auto",
				autoTranslateEnabled,
				aiContext,
			})
		: null;

	const outboundTranslation =
		timelineItemType === ConversationTimelineType.MESSAGE &&
		!isVisitorMessage &&
		autoTranslateEnabled
			? await prepareOutboundVisitorTranslation({
					text: body.item.text ?? "",
					sourceLanguage: website.defaultLanguage,
					visitorLanguage: conversation.visitorLanguage,
					mode: "auto",
					aiContext,
				})
			: null;

	const { item: createdTimelineItem, actor } =
		timelineItemType === ConversationTimelineType.MESSAGE
			? await createMessageTimelineItem({
					db,
					organizationId: organization.id,
					websiteId: website.id,
					conversationId: body.conversationId,
					conversationOwnerVisitorId: conversation.visitorId,
					id: body.item.id,
					text: body.item.text ?? "",
					extraParts: [
						...(body.item.parts?.filter((part) => part.type !== "text") ?? []),
						...(inboundTranslation?.translationPart
							? [inboundTranslation.translationPart]
							: []),
						...(outboundTranslation?.translationPart
							? [outboundTranslation.translationPart]
							: []),
					],
					visibility: body.item.visibility,
					userId: resolvedUserId,
					aiAgentId: resolvedAiAgentId,
					visitorId: visitorId ?? null,
					createdAt: itemCreatedAt,
					tool: body.item.tool ?? null,
				})
			: {
					item: await createTimelineItem({
						db,
						organizationId: organization.id,
						websiteId: website.id,
						conversationId: body.conversationId,
						conversationOwnerVisitorId: conversation.visitorId,
						item: {
							id: body.item.id,
							type: timelineItemType,
							text: body.item.text ?? null,
							parts: body.item.parts ?? [],
							userId: resolvedUserId,
							aiAgentId: resolvedAiAgentId,
							visitorId: visitorId ?? null,
							visibility: body.item.visibility,
							createdAt: itemCreatedAt,
							tool: body.item.tool ?? null,
						},
					}),
					actor: null,
				};

	if (isVisitorMessage && inboundTranslation?.visitorLanguage) {
		await finalizeConversationTranslation({
			db,
			conversation,
			websiteDefaultLanguage: website.defaultLanguage,
			visitorLanguage: inboundTranslation.visitorLanguage,
			hasTranslationPart: Boolean(inboundTranslation.translationPart),
			chargeCredits: autoTranslateEnabled,
			billingSource:
				inboundTranslation.translationResult.status === "translated"
					? inboundTranslation.translationResult.billingSource
					: undefined,
		});
	}

	if (!isVisitorMessage && outboundTranslation?.translationPart) {
		await finalizeConversationTranslation({
			db,
			conversation,
			websiteDefaultLanguage: website.defaultLanguage,
			visitorLanguage: conversation.visitorLanguage,
			hasTranslationPart: true,
			chargeCredits: autoTranslateEnabled,
			billingSource:
				outboundTranslation.translationResult.status === "translated"
					? outboundTranslation.translationResult.billingSource
					: undefined,
		});
	}

	const resolvedActor: ConversationActor | null = resolveTimelineActor({
		actor,
		userId: resolvedUserId,
		aiAgentId: resolvedAiAgentId,
		visitorId: visitorId ?? null,
	});

	if (
		timelineItemType === ConversationTimelineType.MESSAGE &&
		resolvedActor !== null
	) {
		try {
			await triggerMessageNotificationWorkflow({
				conversationId: body.conversationId,
				messageId: createdTimelineItem.id,
				websiteId: website.id,
				organizationId: organization.id,
				actor: resolvedActor,
			});
		} catch (error) {
			console.error(
				"[notification] Failed to trigger workflow for rest message route",
				error
			);
		}
	}

	// Build promises for realtime events and presence tracking
	const promises: Promise<unknown>[] = [];

	// Mark conversations as seen for users and AI agents when sending timeline items.
	// For visitors, we rely on the frontend auto-seen mechanism which checks widget visibility.
	// This prevents conversations from being marked as seen when the widget is closed.
	let lastSeenAt: string | undefined;
	if (resolvedActor && resolvedActor.type !== "visitor") {
		lastSeenAt = await markConversationAsSeen(db, {
			conversation,
			actor: resolvedActor,
		});

		// Emit conversation seen event for users and AI agents
		promises.push(
			emitConversationSeenEvent({
				conversation,
				actor: resolvedActor,
				lastSeenAt,
			})
		);

		if (resolvedActor.type === "user") {
			promises.push(
				markUserPresence({
					websiteId: website.id,
					userId: resolvedActor.userId,
					lastSeenAt,
				})
			);
		}
	} else if (resolvedActor?.type === "visitor" && resolvedActor.visitorId) {
		// For visitors, just create a timestamp for presence tracking
		// without marking the conversation as seen
		lastSeenAt = new Date().toISOString();

		promises.push(
			markVisitorPresence({
				websiteId: website.id,
				visitorId: resolvedActor.visitorId,
				lastSeenAt,
			})
		);
	}

	await Promise.allSettled(promises);

	return c.json(
		validateResponse(
			{ item: createdTimelineItem as TimelineItem },
			sendTimelineItemResponseSchema
		),
		200
	);
});
