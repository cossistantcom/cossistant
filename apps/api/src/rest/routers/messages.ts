import {
	type ConversationActor,
	markConversationAsSeen,
} from "@api/db/mutations/conversation";
import { getConversationById } from "@api/db/queries/conversation";
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
import {
	sendTimelineItemRequestSchema,
	sendTimelineItemResponseSchema,
	type TimelineItem,
} from "@plasma/types/api/timeline-item";
import {
	ConversationStatus,
	ConversationTimelineType,
} from "@plasma/types/enums";
import { OpenAPIHono, z } from "@hono/zod-openapi";
import { protectedPublicApiKeyMiddleware } from "../middleware";
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

messagesRouter.openapi(
	{
		method: "post",
		path: "/",
		summary: "Send a message (timeline item) to a conversation",
		description:
			"Send a new message (timeline item) to an existing conversation.",
		tags: ["Messages", "Timeline item"],
		request: {
			body: {
				required: true,
				content: {
					"application/json": {
						schema: sendTimelineItemRequestSchema,
					},
				},
			},
		},
		responses: {
			200: {
				description: "Timeline item sent successfully",
				content: {
					"application/json": {
						schema: sendTimelineItemResponseSchema,
					},
				},
			},
			400: {
				description: "Invalid request",
				content: {
					"application/json": {
						schema: z.object({ error: z.string() }),
					},
				},
			},
		},
		security: [
			{
				"Public API Key": [],
			},
			{
				"Private API Key": [],
			},
		],
		parameters: [
			{
				name: "Authorization",
				in: "header",
				description:
					"Private API key in Bearer token format. Use this for server-to-server authentication. Format: `Bearer sk_[live|test]_...`",
				required: false,
				schema: {
					type: "string",
					pattern: "^Bearer sk_(live|test)_[a-f0-9]{64}$",
					example: "Bearer sk_test_xxx",
				},
			},
			{
				name: "X-Public-Key",
				in: "header",
				description:
					"Public API key for browser-based authentication. Can only be used from whitelisted domains. Format: `pk_[live|test]_...`",
				required: false,
				schema: {
					type: "string",
					pattern: "^pk_(live|test)_[a-f0-9]{64}$",
					example: "pk_test_xxx",
				},
			},
			{
				name: "X-Visitor-Id",
				in: "header",
				description: "Visitor ID from localStorage.",
				required: false,
				schema: {
					type: "string",
					pattern: "^[0-9A-HJKMNP-TV-Z]{26}$",
					example: "01JG000000000000000000000",
				},
			},
		],
	},
	async (c) => {
		const { db, website, organization, body, visitorIdHeader, apiKey } =
			await safelyExtractRequestData(c, sendTimelineItemRequestSchema);

		const visitorId = body.item.visitorId || visitorIdHeader || null;

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

		// With a public key,
		const isPublic = apiKey?.keyType === "public";

		// Visitor must own the conversation when using the public key
		if (isPublic && conversation.visitorId !== visitorId) {
			return c.json(
				validateResponse(
					{ error: "Forbidden: visitor does not own the conversation" },
					z.object({ error: z.string() })
				),
				403
			);
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
						error:
							"Forbidden: cannot set userId/aiAgentId with a public API key",
					},
					z.object({ error: z.string() })
				),
				403
			);
		}

		// Check if user needs to be added as participant
		if (body.item.userId && !isPublic) {
			const isParticipant = await isUserParticipant(db, {
				conversationId: body.conversationId,
				userId: body.item.userId,
			});

			if (!isParticipant) {
				// Add user as participant
				await addConversationParticipant(db, {
					conversationId: body.conversationId,
					userId: body.item.userId,
					organizationId: organization.id,
					reason: "Sent message",
				});

				// Create participant joined event (PUBLIC so visitor sees it)
				await createParticipantJoinedEvent(db, {
					conversationId: body.conversationId,
					organizationId: organization.id,
					websiteId: website.id,
					visitorId: conversation.visitorId,
					targetUserId: body.item.userId,
					isAutoAdded: true,
				});
			}
		}

		const timelineItemType = body.item.type ?? ConversationTimelineType.MESSAGE;

		const resolvedUserId = isPublic ? null : (body.item.userId ?? null);
		const resolvedAiAgentId = isPublic ? null : (body.item.aiAgentId ?? null);

		const { item: createdTimelineItem, actor } =
			timelineItemType === ConversationTimelineType.MESSAGE
				? await createMessageTimelineItem({
						db,
						organizationId: organization.id,
						websiteId: website.id,
						conversationId: body.conversationId,
						conversationOwnerVisitorId: visitorId,
						id: body.item.id,
						text: body.item.text ?? "",
						extraParts:
							body.item.parts?.filter((part) => part.type !== "text") ?? [],
						visibility: body.item.visibility,
						userId: resolvedUserId,
						aiAgentId: resolvedAiAgentId,
						visitorId: visitorId ?? null,
						createdAt: body.item.createdAt
							? new Date(body.item.createdAt)
							: undefined,
						tool: body.item.tool ?? null,
					})
				: {
						item: await createTimelineItem({
							db,
							organizationId: organization.id,
							websiteId: website.id,
							conversationId: body.conversationId,
							conversationOwnerVisitorId: visitorId,
							item: {
								id: body.item.id,
								type: timelineItemType,
								text: body.item.text ?? null,
								parts: body.item.parts ?? [],
								userId: resolvedUserId,
								aiAgentId: resolvedAiAgentId,
								visitorId: visitorId ?? null,
								visibility: body.item.visibility,
								createdAt: body.item.createdAt
									? new Date(body.item.createdAt)
									: undefined,
								tool: body.item.tool ?? null,
							},
						}),
						actor: null,
					};

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
			)
		);
	}
);
