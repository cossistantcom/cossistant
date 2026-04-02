import { markConversationAsSeenByVisitor } from "@api/db/mutations/conversation";
import { getVisitor } from "@api/db/queries";
import {
	getConversationByIdWithLastMessage,
	getConversationHeader,
	getConversationSeenData,
	getConversationTimelineItems,
	listConversations,
	upsertConversation,
} from "@api/db/queries/conversation";
import {
	type conversation,
	conversationTimelineItem,
} from "@api/db/schema/conversation";
import {
	applyDashboardConversationHardLimit,
	getDashboardConversationLockCutoff,
	resolveDashboardHardLimitPolicy,
} from "@api/lib/hard-limits/dashboard";
import { getPlanForWebsite } from "@api/lib/plans/access";
import { markVisitorPresence } from "@api/services/presence";
import {
	emitConversationCreatedEvent,
	emitConversationSeenEvent,
	emitConversationTypingEvent,
} from "@api/utils/conversation-realtime";
import { generateIdempotentULID } from "@api/utils/db/ids";
import { extractGeoFromVisitor } from "@api/utils/geo-helpers";
import {
	addConversationParticipants,
	getDefaultParticipants,
} from "@api/utils/participant-helpers";
import { triggerMessageNotificationWorkflow } from "@api/utils/send-message-with-notification";
import {
	createMessageTimelineItem,
	createTimelineItem,
	type MessageTimelineActor,
	resolveMessageTimelineActor,
} from "@api/utils/timeline-item";
import {
	safelyExtractRequestData,
	safelyExtractRequestQuery,
	validateResponse,
} from "@api/utils/validate";
import { APIKeyType, TimelineItemVisibility } from "@plasma/types";
import {
	type CreateConversationConflictCode,
	createConversationConflictResponseSchema,
	createConversationRequestSchema,
	createConversationResponseSchema,
	getConversationRequestSchema,
	getConversationResponseSchema,
	listConversationsRequestSchema,
	listConversationsResponseSchema,
	markConversationSeenRequestSchema,
	markConversationSeenResponseSchema,
	setConversationTypingRequestSchema,
	setConversationTypingResponseSchema,
	submitConversationRatingRequestSchema,
	submitConversationRatingResponseSchema,
} from "@plasma/types/api/conversation";
import {
	getConversationTimelineItemsRequestSchema,
	getConversationTimelineItemsResponseSchema,
	type TimelineItem,
	timelineItemSchema,
} from "@plasma/types/api/timeline-item";
import {
	conversationSchema,
	conversationSeenSchema,
} from "@plasma/types/schemas";
import { OpenAPIHono, z } from "@hono/zod-openapi";
import { and, eq } from "drizzle-orm";
import { protectedPublicApiKeyMiddleware } from "../middleware";
import type { RestContext } from "../types";
import { mapDefaultTimelineItemForCreation } from "./conversation-default-timeline-item";
import { persistFeedbackSubmission } from "./feedback-shared";

type ConversationRow = typeof conversation.$inferSelect;
type ConversationTimelineItemRow = typeof conversationTimelineItem.$inferSelect;

const serializeTimelineItemForResponse = (
	item: (ConversationTimelineItemRow & { parts: unknown }) | TimelineItem
) =>
	timelineItemSchema.parse({
		id: item.id,
		conversationId: item.conversationId,
		organizationId: item.organizationId,
		visibility: item.visibility,
		type: item.type,
		text: "text" in item ? (item.text ?? null) : null,
		parts: Array.isArray(item.parts) ? item.parts : (item.parts as unknown[]),
		userId: "userId" in item ? (item.userId ?? null) : null,
		aiAgentId: "aiAgentId" in item ? (item.aiAgentId ?? null) : null,
		visitorId: "visitorId" in item ? (item.visitorId ?? null) : null,
		createdAt: item.createdAt,
		deletedAt: "deletedAt" in item ? (item.deletedAt ?? null) : null,
	});

const serializeConversationForResponse = (
	record: ConversationRow & {
		lastTimelineItem?:
			| (ConversationTimelineItemRow & { parts: unknown })
			| TimelineItem
			| undefined;
		visitorLastSeenAt?: string | null;
	}
) => {
	const serializedConversation = conversationSchema.parse({
		id: record.id,
		title: record.title ?? undefined,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
		visitorId: record.visitorId,
		websiteId: record.websiteId,
		status: record.status,
		visitorRating: record.visitorRating ?? null,
		visitorRatingAt: record.visitorRatingAt ?? null,
		deletedAt: record.deletedAt ?? null,
		lastTimelineItem: record.lastTimelineItem
			? serializeTimelineItemForResponse(record.lastTimelineItem)
			: undefined,
	});

	return {
		...serializedConversation,
		visitorLastSeenAt: record.visitorLastSeenAt ?? null,
	};
};

function createConversationConflictResponse(params: {
	code: CreateConversationConflictCode;
	error: string;
}) {
	return validateResponse(params, createConversationConflictResponseSchema);
}

function isUniqueViolationError(error: unknown): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}

	const code = "code" in error ? String(error.code) : null;
	const message = "message" in error ? String(error.message) : "";

	return code === "23505" || message.includes("duplicate key");
}

function canonicalizeForStableStringify(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(canonicalizeForStableStringify);
	}

	if (value && typeof value === "object") {
		const normalizedEntries = Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, nestedValue]) => [
				key,
				canonicalizeForStableStringify(nestedValue),
			]);

		return Object.fromEntries(normalizedEntries);
	}

	return value;
}

function buildDefaultTimelineItemId(params: {
	conversationId: string;
	index: number;
	item: TimelineItem;
}): string {
	const normalizedShape = {
		type: params.item.type ?? "message",
		text: params.item.text ?? null,
		parts: params.item.parts ?? [],
		visibility: params.item.visibility ?? null,
		userId: params.item.userId ?? null,
		aiAgentId: params.item.aiAgentId ?? null,
		visitorId: params.item.visitorId ?? null,
		tool: params.item.tool ?? null,
	};

	return generateIdempotentULID(
		`conversation-default:${params.conversationId}:${params.index}:${JSON.stringify(canonicalizeForStableStringify(normalizedShape))}`
	);
}

export const conversationRouter = new OpenAPIHono<RestContext>();

// Apply middleware to all routes in this router
conversationRouter.use("/*", ...protectedPublicApiKeyMiddleware);

conversationRouter.openapi(
	{
		method: "post",
		path: "/",
		summary: "Create a conversation (optionally with initial timeline items)",
		description:
			"Create a conversation; optionally pass a conversationId and a set of default timeline items.",
		tags: ["Conversations"],
		request: {
			body: {
				required: true,
				content: {
					"application/json": {
						schema: createConversationRequestSchema,
					},
				},
			},
		},
		responses: {
			200: {
				description: "Conversation created",
				content: {
					"application/json": {
						schema: createConversationResponseSchema,
					},
				},
			},
			409: {
				description:
					"Conversation ID conflict (already exists for a different visitor or tenant)",
				content: {
					"application/json": {
						schema: createConversationConflictResponseSchema,
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
		const { db, website, organization, body, visitorIdHeader } =
			await safelyExtractRequestData(c, createConversationRequestSchema);

		const visitor = await getVisitor(db, {
			visitorId: body.visitorId || visitorIdHeader,
		});

		if (!visitor) {
			return c.json(
				{
					error: "Visitor not found, please pass a valid visitorId",
				},
				400
			);
		}

		const upsertResult = await upsertConversation(db, {
			organizationId: organization.id,
			websiteId: website.id,
			visitorId: visitor.id,
			conversationId: body.conversationId,
		});
		if (upsertResult.status === "conflict") {
			return c.json(
				createConversationConflictResponse({
					code: "CONVERSATION_ID_CONFLICT",
					error: "Conversation ID already exists for another visitor",
				}),
				409
			);
		}
		const conversationRecord = upsertResult.conversation;

		// Add default participants if configured
		const defaultParticipantIds = await getDefaultParticipants(db, website);
		if (defaultParticipantIds.length > 0) {
			await addConversationParticipants(db, {
				conversationId: conversationRecord.id,
				userIds: defaultParticipantIds,
				organizationId: organization.id,
				reason: "Default participant",
			});
		}

		const defaults = body.defaultTimelineItems ?? [];
		const createdItemsWithActors: Array<{
			item: (ConversationTimelineItemRow & { parts: unknown }) | TimelineItem;
			actor: MessageTimelineActor | null;
			isNew: boolean;
		}> = [];

		for (const [index, item] of defaults.entries()) {
			const timelineItemId =
				item.id ??
				buildDefaultTimelineItemId({
					conversationId: conversationRecord.id,
					index,
					item,
				});

			const preparedItem = mapDefaultTimelineItemForCreation({
				...item,
				id: timelineItemId,
			});

			try {
				if (preparedItem.kind === "message") {
					const created = await createMessageTimelineItem({
						db,
						organizationId: organization.id,
						websiteId: website.id,
						conversationId: conversationRecord.id,
						conversationOwnerVisitorId: conversationRecord.visitorId,
						id: preparedItem.input.id,
						text: preparedItem.input.text,
						extraParts: preparedItem.input.extraParts,
						visibility: preparedItem.input.visibility,
						userId: preparedItem.input.userId,
						aiAgentId: preparedItem.input.aiAgentId,
						visitorId: preparedItem.input.visitorId,
						createdAt: preparedItem.input.createdAt,
						tool: preparedItem.input.tool,
					});
					createdItemsWithActors.push({
						item: created.item,
						actor: created.actor,
						isNew: true,
					});
					continue;
				}

				const createdItem = await createTimelineItem({
					db,
					organizationId: organization.id,
					websiteId: website.id,
					conversationId: conversationRecord.id,
					conversationOwnerVisitorId: conversationRecord.visitorId,
					item: preparedItem.input,
				});
				createdItemsWithActors.push({
					item: createdItem,
					actor: null,
					isNew: true,
				});
			} catch (error) {
				if (!isUniqueViolationError(error)) {
					throw error;
				}

				const [existingTimelineItem] = await db
					.select()
					.from(conversationTimelineItem)
					.where(
						and(
							eq(conversationTimelineItem.id, timelineItemId),
							eq(conversationTimelineItem.organizationId, organization.id)
						)
					)
					.limit(1);

				if (!existingTimelineItem) {
					throw new Error(
						`Unable to resolve timeline item conflict for id ${timelineItemId}`
					);
				}

				if (existingTimelineItem.conversationId !== conversationRecord.id) {
					return c.json(
						createConversationConflictResponse({
							code: "TIMELINE_ITEM_ID_CONFLICT",
							error: "Timeline item ID collision detected",
						}),
						409
					);
				}

				const actor = resolveMessageTimelineActor(
					existingTimelineItem,
					conversationRecord.visitorId
				);

				createdItemsWithActors.push({
					item: existingTimelineItem,
					actor: existingTimelineItem.type === "message" ? actor : null,
					isNew: false,
				});
			}
		}

		const createdItems = createdItemsWithActors.map(({ item }) => item);

		// Trigger notification workflow for initial message items explicitly.
		for (const { item, actor, isNew } of createdItemsWithActors) {
			if (!isNew || item.type !== "message" || !actor || !item.id) {
				continue;
			}

			try {
				await triggerMessageNotificationWorkflow({
					conversationId: conversationRecord.id,
					messageId: item.id,
					websiteId: website.id,
					organizationId: organization.id,
					actor,
				});
			} catch (error) {
				console.error("[conversation.create] Notification trigger failed", {
					stage: "trigger_notification_workflow",
					conversationId: conversationRecord.id,
					messageId: item.id,
					organizationId: organization.id,
					websiteId: website.id,
					error,
				});
			}
		}

		const header = await getConversationHeader(db, {
			organizationId: organization.id,
			websiteId: website.id,
			conversationId: conversationRecord.id,
			userId: null,
		});

		if (header && upsertResult.status === "created") {
			const planInfo = await getPlanForWebsite(website);
			const hardLimitPolicy = resolveDashboardHardLimitPolicy(planInfo);
			const lockCutoff = await getDashboardConversationLockCutoff(db, {
				websiteId: website.id,
				organizationId: organization.id,
				policy: hardLimitPolicy,
			});
			const eventHeader = applyDashboardConversationHardLimit({
				conversation: header,
				policy: hardLimitPolicy,
				cutoff: lockCutoff,
			});

			await emitConversationCreatedEvent({
				conversation: conversationRecord,
				header: eventHeader,
			});
		}

		const lastTimelineItem =
			createdItems.at(-1) ?? header?.lastTimelineItem ?? undefined;

		const response = {
			initialTimelineItems: createdItems.map(serializeTimelineItemForResponse),
			conversation: serializeConversationForResponse({
				...conversationRecord,
				lastTimelineItem,
			}),
		};

		return c.json(validateResponse(response, createConversationResponseSchema));
	}
);

conversationRouter.openapi(
	{
		method: "get",
		path: "/",
		summary: "List conversations for a visitor",
		description:
			"Fetch paginated list of conversations for a specific visitor with optional filters.",
		tags: ["Conversations"],
		request: {
			query: listConversationsRequestSchema,
		},
		responses: {
			200: {
				description: "List of conversations retrieved successfully",
				content: {
					"application/json": {
						schema: listConversationsResponseSchema,
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
		const { db, website, organization, query, visitorIdHeader } =
			await safelyExtractRequestQuery(c, listConversationsRequestSchema);

		const visitor = await getVisitor(db, {
			visitorId: query.visitorId || visitorIdHeader,
		});

		if (!visitor) {
			return c.json(
				{
					error: "Visitor not found, please pass a valid visitorId",
				},
				400
			);
		}

		const result = await listConversations(db, {
			organizationId: organization.id,
			websiteId: website.id,
			visitorId: visitor.id,
			page: query.page,
			limit: query.limit,
			status: query.status,
			orderBy: query.orderBy,
			order: query.order,
		});

		const response = {
			conversations: result.conversations.map((conv) =>
				serializeConversationForResponse(conv)
			),
			pagination: result.pagination,
		};

		return c.json(validateResponse(response, listConversationsResponseSchema));
	}
);

conversationRouter.openapi(
	{
		method: "get",
		path: "/{conversationId}",
		summary: "Get a single conversation by ID",
		description: "Fetch a specific conversation by its ID.",
		tags: ["Conversations"],
		request: {
			params: getConversationRequestSchema,
		},
		responses: {
			200: {
				description: "Conversation retrieved successfully",
				content: {
					"application/json": {
						schema: getConversationResponseSchema,
					},
				},
			},
			404: {
				description: "Conversation not found",
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
				name: "conversationId",
				in: "path",
				description: "The ID of the conversation to retrieve",
				required: true,
				schema: {
					type: "string",
				},
			},
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
		const { db, website, organization } = await safelyExtractRequestData(c);

		// Validate path params manually for now
		const params = getConversationRequestSchema.parse({
			conversationId: c.req.param("conversationId"),
		});

		const conversationRecord = await getConversationByIdWithLastMessage(db, {
			organizationId: organization.id,
			websiteId: website.id,
			conversationId: params.conversationId,
		});

		if (!conversationRecord) {
			return c.json(
				{
					error: "Conversation not found",
				},
				404
			);
		}

		try {
			const response = {
				conversation: serializeConversationForResponse(conversationRecord),
			};

			return c.json(validateResponse(response, getConversationResponseSchema));
		} catch (error) {
			console.error(
				"[GET_CONVERSATION] Failed to serialize conversation response",
				{
					error,
					conversationId: params.conversationId,
					organizationId: organization.id,
					websiteId: website.id,
				}
			);

			return c.json(
				{ error: "Failed to serialize conversation response" },
				500
			);
		}
	}
);

conversationRouter.openapi(
	{
		method: "post",
		path: "/{conversationId}/seen",
		summary: "Mark a conversation as seen by the visitor",
		description:
			"Record a visitor's last seen timestamp for a specific conversation.",
		tags: ["Conversations"],
		request: {
			body: {
				required: false,
				content: {
					"application/json": {
						schema: markConversationSeenRequestSchema,
					},
				},
			},
		},
		responses: {
			200: {
				description: "Conversation seen timestamp recorded",
				content: {
					"application/json": {
						schema: markConversationSeenResponseSchema,
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
			404: {
				description: "Conversation not found",
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
		],
		inputSchema: [
			{
				name: "conversationId",
				in: "path",
				description: "The ID of the conversation to mark as seen",
				required: true,
				schema: {
					type: "string",
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
		const { db, website, organization, body, visitorIdHeader } =
			await safelyExtractRequestData(c, markConversationSeenRequestSchema);

		const params = getConversationRequestSchema.parse({
			conversationId: c.req.param("conversationId"),
		});

		const [visitor, conversationRecord] = await Promise.all([
			getVisitor(db, {
				visitorId: body.visitorId || visitorIdHeader,
			}),
			getConversationByIdWithLastMessage(db, {
				organizationId: organization.id,
				websiteId: website.id,
				conversationId: params.conversationId,
			}),
		]);

		if (!visitor || visitor.websiteId !== website.id) {
			return c.json(
				{
					error: "Visitor not found, please pass a valid visitorId",
				},
				400
			);
		}

		if (!conversationRecord || conversationRecord.visitorId !== visitor.id) {
			return c.json(
				{
					error: "Conversation not found",
				},
				404
			);
		}

		const lastSeenAt = await markConversationAsSeenByVisitor(db, {
			conversation: conversationRecord,
			visitorId: visitor.id,
		});

		await emitConversationSeenEvent({
			conversation: conversationRecord,
			actor: { type: "visitor", visitorId: visitor.id },
			lastSeenAt,
		});

		const response = {
			conversationId: conversationRecord.id,
			lastSeenAt,
		};

		return c.json(
			validateResponse(response, markConversationSeenResponseSchema),
			200
		);
	}
);

conversationRouter.openapi(
	{
		method: "post",
		path: "/{conversationId}/typing",
		summary: "Report a visitor typing state",
		description:
			"Emit a typing indicator event for the visitor. Either visitorId must be provided via body or headers.",
		tags: ["Conversations"],
		request: {
			body: {
				required: true,
				content: {
					"application/json": {
						schema: setConversationTypingRequestSchema,
					},
				},
			},
		},
		responses: {
			200: {
				description: "Typing state recorded",
				content: {
					"application/json": {
						schema: setConversationTypingResponseSchema,
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
			404: {
				description: "Conversation not found",
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
		],
		inputSchema: [
			{
				name: "conversationId",
				in: "path",
				description: "The ID of the conversation receiving the typing update",
				required: true,
				schema: {
					type: "string",
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
				},
			},
		],
	},
	async (c) => {
		const { db, website, organization, body, visitorIdHeader } =
			await safelyExtractRequestData(c, setConversationTypingRequestSchema);

		const params = getConversationRequestSchema.parse({
			conversationId: c.req.param("conversationId"),
		});

		const [visitor, conversationRecord] = await Promise.all([
			getVisitor(db, {
				visitorId: body.visitorId || visitorIdHeader,
			}),
			getConversationByIdWithLastMessage(db, {
				organizationId: organization.id,
				websiteId: website.id,
				conversationId: params.conversationId,
			}),
		]);

		if (!visitor || visitor.websiteId !== website.id) {
			return c.json(
				{
					error: "Visitor not found, please pass a valid visitorId",
				},
				400
			);
		}

		if (!conversationRecord || conversationRecord.visitorId !== visitor.id) {
			return c.json(
				{
					error: "Conversation not found",
				},
				404
			);
		}

		const trimmedPreview = body.visitorPreview?.trim() ?? "";
		const effectivePreview =
			body.isTyping && trimmedPreview.length > 0
				? trimmedPreview.slice(0, 2000)
				: null;

		await emitConversationTypingEvent({
			conversation: conversationRecord,
			actor: { type: "visitor", visitorId: visitor.id },
			isTyping: body.isTyping,
			visitorPreview: effectivePreview ?? undefined,
		});

		const sentAt = new Date();

		await markVisitorPresence({
			websiteId: website.id,
			visitorId: visitor.id,
			lastSeenAt: sentAt,
			geo: extractGeoFromVisitor(visitor),
		});

		const response = {
			conversationId: conversationRecord.id,
			isTyping: body.isTyping,
			visitorPreview: effectivePreview,
			sentAt: sentAt.toISOString(),
		};

		return c.json(
			validateResponse(response, setConversationTypingResponseSchema),
			200
		);
	}
);

conversationRouter.openapi(
	{
		method: "post",
		path: "/{conversationId}/rating",
		summary: "Submit a visitor rating for a conversation",
		description:
			"Record a visitor rating (1-5) for a resolved conversation. Requires visitor ownership.",
		tags: ["Conversations"],
		request: {
			body: {
				required: true,
				content: {
					"application/json": {
						schema: submitConversationRatingRequestSchema,
					},
				},
			},
		},
		responses: {
			200: {
				description: "Conversation rating recorded",
				content: {
					"application/json": {
						schema: submitConversationRatingResponseSchema,
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
			403: {
				description: "Forbidden",
				content: {
					"application/json": {
						schema: z.object({ error: z.string() }),
					},
				},
			},
			404: {
				description: "Conversation not found",
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
		],
		inputSchema: [
			{
				name: "conversationId",
				in: "path",
				description: "The ID of the conversation to rate",
				required: true,
				schema: {
					type: "string",
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
		const { db, website, organization, body, visitorIdHeader } =
			await safelyExtractRequestData(c, submitConversationRatingRequestSchema);

		const params = getConversationRequestSchema.parse({
			conversationId: c.req.param("conversationId"),
		});

		const [visitor, conversationRecord] = await Promise.all([
			getVisitor(db, {
				visitorId: body.visitorId || visitorIdHeader,
			}),
			getConversationByIdWithLastMessage(db, {
				organizationId: organization.id,
				websiteId: website.id,
				conversationId: params.conversationId,
			}),
		]);

		if (!visitor || visitor.websiteId !== website.id) {
			return c.json(
				{
					error: "Visitor not found, please pass a valid visitorId",
				},
				400
			);
		}

		if (!conversationRecord || conversationRecord.visitorId !== visitor.id) {
			return c.json(
				{
					error: "Conversation not found",
				},
				404
			);
		}

		if (conversationRecord.status !== "resolved") {
			return c.json(
				{
					error: "Conversation must be resolved before submitting a rating",
				},
				403
			);
		}

		const { ratedAt } = await persistFeedbackSubmission({
			db,
			organizationId: organization.id,
			websiteId: website.id,
			conversationId: conversationRecord.id,
			visitorId: visitor.id,
			contactId: visitor.contactId,
			rating: body.rating,
			topic: undefined,
			comment: body.comment,
			trigger: "conversation_resolved",
			source: "widget",
			syncConversationRating: true,
		});

		const response = {
			conversationId: conversationRecord.id,
			rating: body.rating,
			ratedAt,
		};

		return c.json(
			validateResponse(response, submitConversationRatingResponseSchema),
			200
		);
	}
);

// GET /conversations/:conversationId/seen - Fetch seen data for a conversation
conversationRouter.openapi(
	{
		method: "get",
		path: "/{conversationId}/seen",
		summary: "Get conversation seen data",
		description:
			"Fetch the seen data (read receipts) for a conversation, showing who has seen messages and when.",
		tags: ["Conversations"],
		responses: {
			200: {
				description: "Seen data retrieved successfully",
				content: {
					"application/json": {
						schema: z.object({
							seenData: z.array(conversationSeenSchema),
						}),
					},
				},
			},
			404: {
				description: "Conversation not found",
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
		],
		inputSchema: [
			{
				name: "conversationId",
				in: "path",
				description: "The ID of the conversation",
				required: true,
				schema: {
					type: "string",
				},
			},
			{
				name: "X-Public-Key",
				in: "header",
				description: "Public API key for browser-based authentication.",
				required: false,
				schema: {
					type: "string",
					pattern: "^pk_(live|test)_[a-f0-9]{64}$",
				},
			},
		],
	},
	async (c) => {
		const { db, website, organization } = await safelyExtractRequestQuery(
			c,
			z.object({})
		);

		const params = getConversationRequestSchema.parse({
			conversationId: c.req.param("conversationId"),
		});

		const conversationRecord = await getConversationByIdWithLastMessage(db, {
			organizationId: organization.id,
			websiteId: website.id,
			conversationId: params.conversationId,
		});

		if (!conversationRecord) {
			return c.json(
				{
					error: "Conversation not found",
				},
				404
			);
		}

		const seenData = await getConversationSeenData(db, {
			conversationId: params.conversationId,
			organizationId: organization.id,
		});

		return c.json({ seenData }, 200);
	}
);

// GET /conversations/:conversationId/timeline - Fetch timeline items for a conversation
conversationRouter.openapi(
	{
		method: "get",
		path: "/{conversationId}/timeline",
		summary: "Get conversation timeline items",
		description:
			"Fetch paginated timeline items (messages and events) for a conversation in chronological order.",
		tags: ["Conversations"],
		request: {
			query: getConversationTimelineItemsRequestSchema,
		},
		responses: {
			200: {
				description: "Timeline items retrieved successfully",
				content: {
					"application/json": {
						schema: getConversationTimelineItemsResponseSchema,
					},
				},
			},
			404: {
				description: "Conversation not found",
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
		],
		inputSchema: [
			{
				name: "conversationId",
				in: "path",
				description: "The ID of the conversation",
				required: true,
				schema: {
					type: "string",
				},
			},
			{
				name: "X-Public-Key",
				in: "header",
				description: "Public API key for browser-based authentication.",
				required: false,
				schema: {
					type: "string",
					pattern: "^pk_(live|test)_[a-f0-9]{64}$",
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
				},
			},
		],
	},
	async (c) => {
		const { db, website, organization, query, apiKey } =
			await safelyExtractRequestQuery(
				c,
				getConversationTimelineItemsRequestSchema
			);

		const params = getConversationRequestSchema.parse({
			conversationId: c.req.param("conversationId"),
		});

		const conversationRecord = await getConversationByIdWithLastMessage(db, {
			organizationId: organization.id,
			websiteId: website.id,
			conversationId: params.conversationId,
		});

		if (!conversationRecord) {
			return c.json(
				{
					error: "Conversation not found",
				},
				404
			);
		}

		const visibilityFilter =
			apiKey?.keyType === APIKeyType.PUBLIC
				? [TimelineItemVisibility.PUBLIC]
				: undefined;

		const result = await getConversationTimelineItems(db, {
			organizationId: organization.id,
			conversationId: params.conversationId,
			websiteId: website.id,
			limit: query.limit,
			cursor: query.cursor,
			visibility: visibilityFilter,
		});

		return c.json(
			{
				items: result.items as TimelineItem[],
				nextCursor: result.nextCursor ?? null,
				hasNextPage: result.hasNextPage,
			},
			200
		);
	}
);
