import {
	pauseAiForConversation,
	resumeAiForConversation,
} from "@api/ai-pipeline/shared/safety/kill-switch";
import {
	archiveConversation,
	type ConversationRecord,
	joinEscalation,
	markConversationAsNotSpam,
	markConversationAsRead,
	markConversationAsSeenByVisitor,
	markConversationAsSpam,
	markConversationAsUnread,
	mergeConversationMetadata,
	reopenConversation,
	resolveConversation,
	unarchiveConversation,
	updateConversationPriority,
	updateConversationSentiment,
	updateConversationTitle,
} from "@api/db/mutations/conversation";
import {
	getConversationById,
	getConversationByIdWithLastMessage,
	getConversationHeader,
	getConversationSeenData,
	getConversationTimelineItemByIdForOrganization,
	getConversationTimelineItems,
	listConversations,
	upsertConversation,
} from "@api/db/queries/conversation";
import { canVisitorAccessConversation } from "@api/db/queries/conversation-access";
import type {
	ConversationTimelineItemSelect,
	conversation,
} from "@api/db/schema/conversation";
import { env } from "@api/env";
import { AuthValidationError } from "@api/lib/auth-validation";
import {
	applyDashboardConversationHardLimit,
	getDashboardConversationLockCutoff,
	resolveDashboardHardLimitPolicy,
} from "@api/lib/hard-limits/dashboard";
import type { OpenRouterBillingSource } from "@api/lib/openrouter-byok/resolver";
import { getPlanForWebsite } from "@api/lib/plans/access";
import {
	type ResolvedPrivateApiKeyActor,
	resolvePrivateApiKeyActorUser,
} from "@api/lib/private-api-key-actor";
import {
	detectVisitorMessageLanguage,
	finalizeConversationTranslation,
	isAutomaticTranslationEnabled,
	prepareInboundVisitorTranslation,
	prepareOutboundVisitorTranslation,
	shouldMaskTypingPreview,
	syncConversationVisitorTitle,
} from "@api/lib/translation";
import { realtime } from "@api/realtime/emitter";
import { getRedis } from "@api/redis";
import { markVisitorPresence } from "@api/services/presence";
import {
	getSupportConversation,
	listSupportConversations,
	SupportCapabilityError,
} from "@api/support-capabilities";
import { createConversationEvent } from "@api/utils/conversation-event";
import { createParticipantJoinedEvent } from "@api/utils/conversation-events";
import { buildConversationExport } from "@api/utils/conversation-export";
import {
	emitConversationCreatedEvent,
	emitConversationSeenEvent,
	emitConversationTypingEvent,
} from "@api/utils/conversation-realtime";
import { generateIdempotentULID } from "@api/utils/db/ids";
import { extractGeoFromVisitor } from "@api/utils/geo-helpers";
import {
	addConversationParticipant,
	addConversationParticipants,
	getDefaultParticipants,
	isUserParticipant,
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
import {
	archiveConversationRoute,
	createConversationRatingRoute,
	createConversationRoute,
	exportConversationRoute,
	getConversationContextRoute,
	getConversationRoute,
	getConversationSeenRoute,
	getConversationTimelineRoute,
	joinConversationEscalationRoute,
	listConversationsRoute,
	listInboxConversationsRoute,
	markConversationAsNotSpamRoute,
	markConversationAsReadRoute,
	markConversationAsSpamRoute,
	markConversationAsUnreadRoute,
	markConversationSeenRoute,
	pauseConversationAiRoute,
	reopenConversationRoute,
	resolveConversationRoute,
	resumeConversationAiRoute,
	setConversationTypingRoute,
	unarchiveConversationRoute,
	updateConversationMetadataRoute,
	updateConversationPriorityRoute,
	updateConversationSentimentRoute,
	updateConversationTitleRoute,
} from "@cossistant/protocol/routes";
import {
	APIKeyType,
	ConversationEventType,
	TimelineItemVisibility,
} from "@cossistant/types";
import {
	type CreateConversationConflictCode,
	conversationContextRequestSchema,
	conversationContextResponseSchema,
	createConversationConflictResponseSchema,
	createConversationRequestSchema,
	createConversationResponseSchema,
	getConversationRequestSchema,
	getConversationResponseSchema,
	getConversationSeenDataResponseSchema,
	listConversationsRequestSchema,
	listConversationsResponseSchema,
	listInboxConversationsRequestSchema,
	listInboxConversationsResponseSchema,
	markConversationSeenRequestSchema,
	markConversationSeenResponseSchema,
	pauseConversationAiRestRequestSchema,
	privateConversationMutationResponseSchema,
	setConversationTypingRequestSchema,
	setConversationTypingResponseSchema,
	submitConversationRatingRequestSchema,
	submitConversationRatingResponseSchema,
	updateConversationMetadataRequestSchema,
	updateConversationPriorityRestRequestSchema,
	updateConversationSentimentRestRequestSchema,
	updateConversationTitleRestRequestSchema,
} from "@cossistant/types/api/conversation";
import {
	getConversationTimelineItemsRequestSchema,
	getConversationTimelineItemsResponseSchema,
	type TimelineItem,
	type TimelineItemCreateInput,
	timelineItemSchema,
} from "@cossistant/types/api/timeline-item";
import { conversationSchema } from "@cossistant/types/schemas";
import { OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
	ClientTimelineItemCreatedAtValidationError,
	normalizeClientTimelineItemCreatedAt,
} from "../client-timeline-item-created-at";
import { protectedPublicApiKeyMiddleware } from "../middleware";
import {
	errorJsonResponse,
	privateControlAuth,
	requirePrivateControlContext,
	restError,
	runtimeDualAuth,
} from "../openapi";
import { resolveRuntimeVisitorIdentity } from "../runtime-visitor";
import type { RestContext } from "../types";
import { mapDefaultTimelineItemForCreation } from "./conversation-default-timeline-item";
import { persistFeedbackSubmission } from "./feedback-shared";

type ConversationRow = typeof conversation.$inferSelect;
type ConversationTimelineItemRow = ConversationTimelineItemSelect;
const AI_PAUSE_DURATION_MAX_MINUTES = 60 * 24 * 365 * 100;
const AI_PAUSE_FURTHER_NOTICE_MINUTES = 60 * 24 * 365 * 99;

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
		visitorTitle: record.visitorTitle ?? null,
		visitorTitleLanguage: record.visitorTitleLanguage ?? null,
		visitorLanguage: record.visitorLanguage ?? null,
		translationActivatedAt: record.translationActivatedAt ?? null,
		translationChargedAt: record.translationChargedAt ?? null,
		metadata:
			typeof record.metadata === "object" && record.metadata !== null
				? (record.metadata as Record<string, string | number | boolean | null>)
				: null,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
		visitorId: record.visitorId,
		websiteId: record.websiteId,
		channel: record.channel ?? "widget",
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

type DefaultTimelineItemIdSource = {
	type?: TimelineItemCreateInput["type"];
	text: TimelineItemCreateInput["text"];
	parts?: TimelineItemCreateInput["parts"];
	visibility: TimelineItemCreateInput["visibility"];
	userId?: string | null;
	aiAgentId?: string | null;
	visitorId?: string | null;
	tool?: string | null;
};

function buildDefaultTimelineItemId(params: {
	conversationId: string;
	index: number;
	item: DefaultTimelineItemIdSource;
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

function replaceAudienceTranslationPart(
	parts: unknown[],
	audience: "team" | "visitor",
	nextPart: unknown
): unknown[] {
	return [
		...parts.filter((part) => {
			if (!(part && typeof part === "object")) {
				return true;
			}

			return !(
				"type" in part &&
				part.type === "translation" &&
				"audience" in part &&
				part.audience === audience
			);
		}),
		nextPart,
	];
}

function resolveCreateConversationVisitorLanguage(params: {
	defaultTimelineItems: ReturnType<typeof mapDefaultTimelineItemForCreation>[];
	visitorLanguage: string | null;
}) {
	let hasVisitorMessage = false;
	for (const item of params.defaultTimelineItems) {
		if (item.kind !== "message") {
			continue;
		}

		const isVisitorMessage =
			Boolean(item.input.visitorId) &&
			!item.input.userId &&
			!item.input.aiAgentId;

		if (!isVisitorMessage) {
			continue;
		}

		hasVisitorMessage = true;
		const detectedLanguage = detectVisitorMessageLanguage({
			text: item.input.text,
			hintLanguage: params.visitorLanguage,
		});

		if (detectedLanguage) {
			return detectedLanguage;
		}
	}

	if (hasVisitorMessage) {
		return null;
	}

	return params.visitorLanguage;
}

function applyTranslationFinalizeResult(
	conversationRecord: ConversationRecord,
	result: Awaited<ReturnType<typeof finalizeConversationTranslation>>
): ConversationRecord {
	if (result.status === "activated") {
		return {
			...conversationRecord,
			visitorLanguage: result.visitorLanguage,
			translationActivatedAt: result.translationActivatedAt,
			translationChargedAt: result.translationChargedAt,
			visitorTitle: result.visitorTitle,
			visitorTitleLanguage: result.visitorTitleLanguage,
		};
	}

	if (result.status === "language_updated") {
		return {
			...conversationRecord,
			visitorLanguage: result.visitorLanguage,
		};
	}

	return conversationRecord;
}

const conversationIdPathParameter = {
	name: "conversationId",
	in: "path",
	description: "The ID of the conversation.",
	required: true,
	schema: {
		type: "string",
	},
} as const;

const emptyQuerySchema = z.object({});

function getConversationPathParams(c: {
	req: { param(name: string): string | undefined };
}) {
	return getConversationRequestSchema.parse({
		conversationId: c.req.param("conversationId"),
	});
}

async function safelyExtractOptionalRequestData<T>(
	c: Parameters<typeof safelyExtractRequestData>[0],
	schema: z.ZodType<T>
) {
	const extracted = await safelyExtractRequestData(c);
	const rawBody = await c.req.text();
	let parsedBody: unknown;

	try {
		parsedBody = rawBody.trim().length === 0 ? {} : JSON.parse(rawBody);
	} catch (error) {
		throw new HTTPException(400, {
			message: "Invalid JSON in request body",
			cause: error,
		});
	}

	const result = schema.safeParse(parsedBody);

	if (!result.success) {
		throw new HTTPException(400, {
			message: "Request validation failed",
			cause: result.error.flatten(),
		});
	}

	return {
		...extracted,
		body: result.data,
	};
}

function getActorUserIdHeader(c: {
	req: { header(name: string): string | undefined };
}) {
	const actorUserId = c.req.header("X-Actor-User-Id")?.trim();
	return actorUserId && actorUserId.length > 0 ? actorUserId : null;
}

function assertPrivateConversationControlContext(
	context: Pick<
		Awaited<ReturnType<typeof safelyExtractRequestData>>,
		"apiKey" | "website" | "organization"
	>
) {
	if (context.apiKey?.keyType !== APIKeyType.PRIVATE) {
		throw new HTTPException(403, {
			message: "Private API key required",
		});
	}

	if (!(context.website?.id && context.organization?.id)) {
		throw new HTTPException(401, {
			message: "Invalid API key",
		});
	}

	return {
		apiKey: context.apiKey,
		website: context.website,
		organization: context.organization,
	};
}

function createPrivateConversationMutationResponse(
	conversationRecord: ConversationRecord
) {
	return validateResponse(
		{ conversation: conversationRecord },
		privateConversationMutationResponseSchema
	);
}

function buildAiPauseEventMessage(durationMinutes: number): string {
	if (durationMinutes >= AI_PAUSE_FURTHER_NOTICE_MINUTES) {
		return "paused AI answers until further notice";
	}

	if (durationMinutes === 10) {
		return "paused AI answers for 10-min";
	}

	if (durationMinutes === 60) {
		return "paused AI answers for 1-hour";
	}

	return `paused AI answers for ${durationMinutes}-min`;
}

async function emitPrivateConversationUpdate(
	conversationRecord: ConversationRecord,
	updates: {
		status?: ConversationRecord["status"];
		deletedAt?: string | null;
		aiPausedUntil?: string | null;
		title?: string | null;
		titleSource?: ConversationRecord["titleSource"];
		visitorTitle?: string | null;
		visitorTitleLanguage?: string | null;
		priority?: ConversationRecord["priority"];
		prioritySource?: ConversationRecord["prioritySource"];
		sentiment?: ConversationRecord["sentiment"];
		sentimentConfidence?: number | null;
		sentimentSource?: ConversationRecord["sentimentSource"];
	}
) {
	await realtime.emit("conversationUpdated", {
		websiteId: conversationRecord.websiteId,
		organizationId: conversationRecord.organizationId,
		visitorId: conversationRecord.visitorId ?? null,
		userId: null,
		conversationId: conversationRecord.id,
		updates,
		aiAgentId: null,
	});
}

async function loadPrivateConversationRecord(params: {
	db: RestContext["Variables"]["db"];
	organizationId: string;
	websiteId: string;
	conversationId: string;
}) {
	const conversationRecord = await getConversationById(params.db, {
		conversationId: params.conversationId,
	});

	if (!conversationRecord) {
		return null;
	}

	if (
		conversationRecord.organizationId !== params.organizationId ||
		conversationRecord.websiteId !== params.websiteId
	) {
		return null;
	}

	return conversationRecord;
}

async function requirePrivateConversationActor(params: {
	c: Parameters<typeof restError>[0];
	db: RestContext["Variables"]["db"];
	apiKey: NonNullable<RestContext["Variables"]["apiKey"]>;
	organizationId: string;
	websiteTeamId: string | null | undefined;
	required: true;
	missingActorMessage?: string;
	invalidActorMessage?: string;
}): Promise<ResolvedPrivateApiKeyActor>;
async function requirePrivateConversationActor(params: {
	c: Parameters<typeof restError>[0];
	db: RestContext["Variables"]["db"];
	apiKey: NonNullable<RestContext["Variables"]["apiKey"]>;
	organizationId: string;
	websiteTeamId: string | null | undefined;
	required: false;
	missingActorMessage?: string;
	invalidActorMessage?: string;
}): Promise<ResolvedPrivateApiKeyActor | null>;
async function requirePrivateConversationActor(params: {
	c: Parameters<typeof restError>[0];
	db: RestContext["Variables"]["db"];
	apiKey: NonNullable<RestContext["Variables"]["apiKey"]>;
	organizationId: string;
	websiteTeamId: string | null | undefined;
	required: boolean;
	missingActorMessage?: string;
	invalidActorMessage?: string;
}): Promise<ResolvedPrivateApiKeyActor | null> {
	try {
		return await resolvePrivateApiKeyActorUser({
			db: params.db,
			apiKey: params.apiKey,
			organizationId: params.organizationId,
			websiteTeamId: params.websiteTeamId,
			explicitActorUserId: getActorUserIdHeader(params.c),
			required: params.required,
			missingActorMessage: params.missingActorMessage,
			invalidActorMessage: params.invalidActorMessage,
		});
	} catch (error) {
		if (error instanceof AuthValidationError) {
			throw new HTTPException(error.statusCode === 400 ? 400 : 403, {
				message: error.message,
			});
		}

		throw error;
	}
}

async function resolvePublicConversationVisitor(params: {
	c: Parameters<typeof restError>[0];
	db: RestContext["Variables"]["db"];
	organizationId: string;
	websiteId: string;
	apiKey: RestContext["Variables"]["apiKey"] | null | undefined;
	headerVisitorId: string | null;
	requestVisitorId?: string | null;
}) {
	return resolveRuntimeVisitorIdentity({
		c: params.c,
		db: params.db,
		apiKey: params.apiKey,
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		headerVisitorId: params.headerVisitorId,
		requestVisitorId: params.requestVisitorId,
		publicOnly: true,
	});
}

async function ensurePublicConversationAccess(params: {
	c: Parameters<typeof restError>[0];
	db: RestContext["Variables"]["db"];
	organizationId: string;
	websiteId: string;
	conversationVisitorId: string | null;
	viewerVisitorId: string | null;
}) {
	if (!params.viewerVisitorId) {
		return null;
	}

	const canAccess = await canVisitorAccessConversation(params.db, {
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		viewerVisitorId: params.viewerVisitorId,
		conversationVisitorId: params.conversationVisitorId,
	});

	if (!canAccess) {
		return restError(params.c, 404, "NOT_FOUND", "Conversation not found");
	}

	return null;
}

export const conversationRouter = new OpenAPIHono<RestContext>();

// Apply middleware to all routes in this router
conversationRouter.use("/*", ...protectedPublicApiKeyMiddleware);

conversationRouter.openapi(createConversationRoute, async (c) => {
	const { db, website, organization, body, visitorIdHeader } =
		await safelyExtractRequestData(c, createConversationRequestSchema);

	type NormalizedDefaultTimelineItemInput = Omit<
		TimelineItemCreateInput,
		"createdAt"
	> & {
		createdAt?: Date;
	};

	let normalizedDefaults: NormalizedDefaultTimelineItemInput[];
	try {
		normalizedDefaults = (body.defaultTimelineItems ?? []).map(
			(item, index) => ({
				...item,
				createdAt: normalizeClientTimelineItemCreatedAt({
					createdAt: item.createdAt,
					field: `defaultTimelineItems[${index}].createdAt`,
				}),
			})
		);
	} catch (error) {
		if (error instanceof ClientTimelineItemCreatedAtValidationError) {
			return restError(c, 400, "BAD_REQUEST", error.message);
		}

		throw error;
	}

	const visitorIdentity = await resolveRuntimeVisitorIdentity({
		c,
		db,
		organizationId: organization.id,
		websiteId: website.id,
		headerVisitorId: visitorIdHeader,
		requestVisitorId: body.visitorId,
	});

	if (visitorIdentity.error) {
		return visitorIdentity.error;
	}

	const visitor = visitorIdentity.visitor;
	if (!visitor) {
		return restError(
			c,
			400,
			"BAD_REQUEST",
			"Visitor not found, please pass a valid visitorId"
		);
	}

	const upsertResult = await upsertConversation(db, {
		organizationId: organization.id,
		websiteId: website.id,
		visitorId: visitor.id,
		conversationId: body.conversationId,
		channel: body.channel,
		metadata: body.metadata,
		visitorLanguage: null,
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

	const planInfo = await getPlanForWebsite(website);
	const autoTranslateEnabled = isAutomaticTranslationEnabled({
		planAllowsAutoTranslate: planInfo.features["auto-translate"] === true,
		websiteAutoTranslateEnabled: website.autoTranslateEnabled,
	});
	const preparedDefaults = normalizedDefaults.map((item, index) =>
		mapDefaultTimelineItemForCreation({
			...item,
			id:
				item.id ??
				buildDefaultTimelineItemId({
					conversationId: conversationRecord.id,
					index,
					item,
				}),
		})
	);
	let resolvedVisitorLanguage = resolveCreateConversationVisitorLanguage({
		defaultTimelineItems: preparedDefaults,
		visitorLanguage: conversationRecord.visitorLanguage ?? null,
	});
	let hasBootstrapTranslationPart = false;
	let bootstrapBillingSource: OpenRouterBillingSource | undefined;
	const translatedDefaults: ReturnType<
		typeof mapDefaultTimelineItemForCreation
	>[] = [];

	for (const preparedItem of preparedDefaults) {
		if (preparedItem.kind !== "message") {
			translatedDefaults.push(preparedItem);
			continue;
		}

		const isVisitorMessage =
			Boolean(preparedItem.input.visitorId) &&
			!preparedItem.input.userId &&
			!preparedItem.input.aiAgentId;
		const inboundTranslation = isVisitorMessage
			? await prepareInboundVisitorTranslation({
					text: preparedItem.input.text,
					websiteDefaultLanguage: website.defaultLanguage,
					visitorLanguageHint: resolvedVisitorLanguage,
					mode: "auto",
					autoTranslateEnabled,
					aiContext: {
						db,
						organizationId: organization.id,
						websiteId: website.id,
					},
				})
			: null;
		const outboundTranslation =
			!isVisitorMessage && autoTranslateEnabled
				? await prepareOutboundVisitorTranslation({
						text: preparedItem.input.text,
						sourceLanguage: website.defaultLanguage,
						visitorLanguage: resolvedVisitorLanguage,
						mode: "auto",
						aiContext: {
							db,
							organizationId: organization.id,
							websiteId: website.id,
						},
					})
				: null;

		if (inboundTranslation?.visitorLanguage) {
			resolvedVisitorLanguage = inboundTranslation.visitorLanguage;
		}

		let extraParts = preparedItem.input.extraParts;

		if (inboundTranslation?.translationPart) {
			hasBootstrapTranslationPart = true;
			if (inboundTranslation.translationResult.status === "translated") {
				bootstrapBillingSource =
					inboundTranslation.translationResult.billingSource ??
					bootstrapBillingSource;
			}
			extraParts = replaceAudienceTranslationPart(
				extraParts,
				"team",
				inboundTranslation.translationPart
			);
		}

		if (outboundTranslation?.translationPart) {
			hasBootstrapTranslationPart = true;
			if (outboundTranslation.translationResult.status === "translated") {
				bootstrapBillingSource =
					outboundTranslation.translationResult.billingSource ??
					bootstrapBillingSource;
			}
			extraParts = replaceAudienceTranslationPart(
				extraParts,
				"visitor",
				outboundTranslation.translationPart
			);
		}

		translatedDefaults.push({
			...preparedItem,
			input: {
				...preparedItem.input,
				extraParts,
			},
		});
	}

	const createdItemsWithActors: Array<{
		item: (ConversationTimelineItemRow & { parts: unknown }) | TimelineItem;
		actor: MessageTimelineActor | null;
		isNew: boolean;
	}> = [];

	for (const preparedItem of translatedDefaults) {
		const timelineItemId = preparedItem.input.id;

		if (!timelineItemId) {
			throw new Error("Expected prepared default timeline item id");
		}

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

			const existingTimelineItem =
				await getConversationTimelineItemByIdForOrganization(db, {
					timelineItemId,
					organizationId: organization.id,
				});

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
	const shouldFinalizeBootstrapTranslation =
		hasBootstrapTranslationPart ||
		Boolean(
			resolvedVisitorLanguage &&
				resolvedVisitorLanguage !== conversationRecord.visitorLanguage
		);
	const responseConversation = shouldFinalizeBootstrapTranslation
		? applyTranslationFinalizeResult(
				conversationRecord,
				await finalizeConversationTranslation({
					db,
					conversation: conversationRecord,
					websiteDefaultLanguage: website.defaultLanguage,
					visitorLanguage: resolvedVisitorLanguage,
					hasTranslationPart: hasBootstrapTranslationPart,
					chargeCredits: autoTranslateEnabled,
					billingSource: bootstrapBillingSource,
					emitRealtime: false,
				})
			)
		: conversationRecord;

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
			conversation: responseConversation,
			header: eventHeader,
		});
	}

	const lastTimelineItem =
		createdItems.at(-1) ?? header?.lastTimelineItem ?? undefined;

	const response = {
		initialTimelineItems: createdItems.map(serializeTimelineItemForResponse),
		conversation: serializeConversationForResponse({
			...responseConversation,
			lastTimelineItem,
		}),
	};

	return c.json(
		validateResponse(response, createConversationResponseSchema),
		200
	);
});

conversationRouter.openapi(listConversationsRoute, async (c) => {
	const { db, website, organization, query, visitorIdHeader, apiKey } =
		await safelyExtractRequestQuery(c, listConversationsRequestSchema);

	const visitorIdentity = await resolveRuntimeVisitorIdentity({
		c,
		db,
		apiKey,
		organizationId: organization.id,
		websiteId: website.id,
		headerVisitorId: visitorIdHeader,
		requestVisitorId: query.visitorId,
	});

	if (visitorIdentity.error) {
		return visitorIdentity.error;
	}

	const visitor = visitorIdentity.visitor;
	if (!visitor) {
		return restError(
			c,
			400,
			"BAD_REQUEST",
			"Visitor not found, please pass a valid visitorId"
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

	return c.json(
		validateResponse(response, listConversationsResponseSchema),
		200
	);
});

conversationRouter.openapi(resolveConversationRoute, async (c) => {
	const extracted = await safelyExtractRequestData(c);
	const privateContext = assertPrivateConversationControlContext(extracted);

	const { conversationId } = getConversationPathParams(c);
	const conversationRecord = await loadPrivateConversationRecord({
		db: extracted.db,
		organizationId: privateContext.organization.id,
		websiteId: privateContext.website.id,
		conversationId,
	});

	if (!conversationRecord) {
		return restError(c, 404, "NOT_FOUND", "Conversation not found");
	}

	const actor = await requirePrivateConversationActor({
		c,
		db: extracted.db,
		apiKey: privateContext.apiKey,
		organizationId: privateContext.organization.id,
		websiteTeamId: privateContext.website.teamId,
		required: true,
	});

	const updatedConversation = await resolveConversation(extracted.db, {
		conversation: conversationRecord,
		actorUserId: actor.userId,
	});

	if (!updatedConversation) {
		return restError(
			c,
			500,
			"INTERNAL_SERVER_ERROR",
			"Unable to resolve conversation"
		);
	}

	await emitPrivateConversationUpdate(updatedConversation, {
		status: updatedConversation.status,
	});

	return c.json(
		createPrivateConversationMutationResponse(updatedConversation),
		200
	);
});

conversationRouter.openapi(reopenConversationRoute, async (c) => {
	const extracted = await safelyExtractRequestData(c);
	const privateContext = assertPrivateConversationControlContext(extracted);

	const { conversationId } = getConversationPathParams(c);
	const conversationRecord = await loadPrivateConversationRecord({
		db: extracted.db,
		organizationId: privateContext.organization.id,
		websiteId: privateContext.website.id,
		conversationId,
	});

	if (!conversationRecord) {
		return restError(c, 404, "NOT_FOUND", "Conversation not found");
	}

	const actor = await requirePrivateConversationActor({
		c,
		db: extracted.db,
		apiKey: privateContext.apiKey,
		organizationId: privateContext.organization.id,
		websiteTeamId: privateContext.website.teamId,
		required: true,
	});

	const updatedConversation = await reopenConversation(extracted.db, {
		conversation: conversationRecord,
		actorUserId: actor.userId,
	});

	if (!updatedConversation) {
		return restError(
			c,
			500,
			"INTERNAL_SERVER_ERROR",
			"Unable to reopen conversation"
		);
	}

	await emitPrivateConversationUpdate(updatedConversation, {
		status: updatedConversation.status,
	});

	return c.json(
		createPrivateConversationMutationResponse(updatedConversation),
		200
	);
});

conversationRouter.openapi(markConversationAsSpamRoute, async (c) => {
	const extracted = await safelyExtractRequestData(c);
	const privateContext = assertPrivateConversationControlContext(extracted);

	const { conversationId } = getConversationPathParams(c);
	const conversationRecord = await loadPrivateConversationRecord({
		db: extracted.db,
		organizationId: privateContext.organization.id,
		websiteId: privateContext.website.id,
		conversationId,
	});

	if (!conversationRecord) {
		return restError(c, 404, "NOT_FOUND", "Conversation not found");
	}

	const actor = await requirePrivateConversationActor({
		c,
		db: extracted.db,
		apiKey: privateContext.apiKey,
		organizationId: privateContext.organization.id,
		websiteTeamId: privateContext.website.teamId,
		required: true,
	});

	const updatedConversation = await markConversationAsSpam(extracted.db, {
		conversation: conversationRecord,
		actorUserId: actor.userId,
	});

	if (!updatedConversation) {
		return restError(
			c,
			500,
			"INTERNAL_SERVER_ERROR",
			"Unable to mark conversation as spam"
		);
	}

	await emitPrivateConversationUpdate(updatedConversation, {
		status: updatedConversation.status,
	});

	return c.json(
		createPrivateConversationMutationResponse(updatedConversation),
		200
	);
});

conversationRouter.openapi(markConversationAsNotSpamRoute, async (c) => {
	const extracted = await safelyExtractRequestData(c);
	const privateContext = assertPrivateConversationControlContext(extracted);

	const { conversationId } = getConversationPathParams(c);
	const conversationRecord = await loadPrivateConversationRecord({
		db: extracted.db,
		organizationId: privateContext.organization.id,
		websiteId: privateContext.website.id,
		conversationId,
	});

	if (!conversationRecord) {
		return restError(c, 404, "NOT_FOUND", "Conversation not found");
	}

	const actor = await requirePrivateConversationActor({
		c,
		db: extracted.db,
		apiKey: privateContext.apiKey,
		organizationId: privateContext.organization.id,
		websiteTeamId: privateContext.website.teamId,
		required: true,
	});

	const updatedConversation = await markConversationAsNotSpam(extracted.db, {
		conversation: conversationRecord,
		actorUserId: actor.userId,
	});

	if (!updatedConversation) {
		return restError(
			c,
			500,
			"INTERNAL_SERVER_ERROR",
			"Unable to mark conversation as not spam"
		);
	}

	await emitPrivateConversationUpdate(updatedConversation, {
		status: updatedConversation.status,
	});

	return c.json(
		createPrivateConversationMutationResponse(updatedConversation),
		200
	);
});

conversationRouter.openapi(archiveConversationRoute, async (c) => {
	const extracted = await safelyExtractRequestData(c);
	const privateContext = assertPrivateConversationControlContext(extracted);

	const { conversationId } = getConversationPathParams(c);
	const conversationRecord = await loadPrivateConversationRecord({
		db: extracted.db,
		organizationId: privateContext.organization.id,
		websiteId: privateContext.website.id,
		conversationId,
	});

	if (!conversationRecord) {
		return restError(c, 404, "NOT_FOUND", "Conversation not found");
	}

	const actor = await requirePrivateConversationActor({
		c,
		db: extracted.db,
		apiKey: privateContext.apiKey,
		organizationId: privateContext.organization.id,
		websiteTeamId: privateContext.website.teamId,
		required: true,
	});

	const updatedConversation = await archiveConversation(extracted.db, {
		conversation: conversationRecord,
		actorUserId: actor.userId,
	});

	if (!updatedConversation) {
		return restError(
			c,
			500,
			"INTERNAL_SERVER_ERROR",
			"Unable to archive conversation"
		);
	}

	await emitPrivateConversationUpdate(updatedConversation, {
		deletedAt: updatedConversation.deletedAt,
	});

	return c.json(
		createPrivateConversationMutationResponse(updatedConversation),
		200
	);
});

conversationRouter.openapi(unarchiveConversationRoute, async (c) => {
	const extracted = await safelyExtractRequestData(c);
	const privateContext = assertPrivateConversationControlContext(extracted);

	const { conversationId } = getConversationPathParams(c);
	const conversationRecord = await loadPrivateConversationRecord({
		db: extracted.db,
		organizationId: privateContext.organization.id,
		websiteId: privateContext.website.id,
		conversationId,
	});

	if (!conversationRecord) {
		return restError(c, 404, "NOT_FOUND", "Conversation not found");
	}

	const actor = await requirePrivateConversationActor({
		c,
		db: extracted.db,
		apiKey: privateContext.apiKey,
		organizationId: privateContext.organization.id,
		websiteTeamId: privateContext.website.teamId,
		required: true,
	});

	const updatedConversation = await unarchiveConversation(extracted.db, {
		conversation: conversationRecord,
		actorUserId: actor.userId,
	});

	if (!updatedConversation) {
		return restError(
			c,
			500,
			"INTERNAL_SERVER_ERROR",
			"Unable to unarchive conversation"
		);
	}

	await emitPrivateConversationUpdate(updatedConversation, {
		deletedAt: updatedConversation.deletedAt,
	});

	return c.json(
		createPrivateConversationMutationResponse(updatedConversation),
		200
	);
});

conversationRouter.openapi(markConversationAsReadRoute, async (c) => {
	const extracted = await safelyExtractRequestData(c);
	const privateContext = assertPrivateConversationControlContext(extracted);

	const { conversationId } = getConversationPathParams(c);
	const conversationRecord = await loadPrivateConversationRecord({
		db: extracted.db,
		organizationId: privateContext.organization.id,
		websiteId: privateContext.website.id,
		conversationId,
	});

	if (!conversationRecord) {
		return restError(c, 404, "NOT_FOUND", "Conversation not found");
	}

	const actor = await requirePrivateConversationActor({
		c,
		db: extracted.db,
		apiKey: privateContext.apiKey,
		organizationId: privateContext.organization.id,
		websiteTeamId: privateContext.website.teamId,
		required: true,
	});

	const { conversation: updatedConversation, lastSeenAt } =
		await markConversationAsRead(extracted.db, {
			conversation: conversationRecord,
			actorUserId: actor.userId,
		});

	await emitConversationSeenEvent({
		conversation: updatedConversation,
		actor: { type: "user", userId: actor.userId },
		lastSeenAt,
	});

	return c.json(
		createPrivateConversationMutationResponse(updatedConversation),
		200
	);
});

conversationRouter.openapi(markConversationAsUnreadRoute, async (c) => {
	const extracted = await safelyExtractRequestData(c);
	const privateContext = assertPrivateConversationControlContext(extracted);

	const { conversationId } = getConversationPathParams(c);
	const conversationRecord = await loadPrivateConversationRecord({
		db: extracted.db,
		organizationId: privateContext.organization.id,
		websiteId: privateContext.website.id,
		conversationId,
	});

	if (!conversationRecord) {
		return restError(c, 404, "NOT_FOUND", "Conversation not found");
	}

	const actor = await requirePrivateConversationActor({
		c,
		db: extracted.db,
		apiKey: privateContext.apiKey,
		organizationId: privateContext.organization.id,
		websiteTeamId: privateContext.website.teamId,
		required: true,
	});

	const updatedConversation = await markConversationAsUnread(extracted.db, {
		conversation: conversationRecord,
		actorUserId: actor.userId,
	});

	return c.json(
		createPrivateConversationMutationResponse(updatedConversation),
		200
	);
});

conversationRouter.openapi(updateConversationMetadataRoute, async (c) => {
	const extracted = await safelyExtractRequestData(
		c,
		updateConversationMetadataRequestSchema
	);
	const privateContext = assertPrivateConversationControlContext(extracted);

	const { conversationId } = getConversationPathParams(c);
	const conversationRecord = await loadPrivateConversationRecord({
		db: extracted.db,
		organizationId: privateContext.organization.id,
		websiteId: privateContext.website.id,
		conversationId,
	});

	if (!conversationRecord) {
		return restError(c, 404, "NOT_FOUND", "Conversation not found");
	}

	const updatedConversation = await mergeConversationMetadata(extracted.db, {
		conversation: conversationRecord,
		metadata: extracted.body.metadata,
	});

	if (!updatedConversation) {
		return restError(
			c,
			500,
			"INTERNAL_SERVER_ERROR",
			"Unable to update conversation metadata"
		);
	}

	return c.json(
		createPrivateConversationMutationResponse(updatedConversation),
		200
	);
});

conversationRouter.openapi(updateConversationPriorityRoute, async (c) => {
	const extracted = await safelyExtractRequestData(
		c,
		updateConversationPriorityRestRequestSchema
	);
	const privateContext = assertPrivateConversationControlContext(extracted);

	const { conversationId } = getConversationPathParams(c);
	const conversationRecord = await loadPrivateConversationRecord({
		db: extracted.db,
		organizationId: privateContext.organization.id,
		websiteId: privateContext.website.id,
		conversationId,
	});

	if (!conversationRecord) {
		return restError(c, 404, "NOT_FOUND", "Conversation not found");
	}

	const actor = await requirePrivateConversationActor({
		c,
		db: extracted.db,
		apiKey: privateContext.apiKey,
		organizationId: privateContext.organization.id,
		websiteTeamId: privateContext.website.teamId,
		required: true,
	});

	const updatedConversation = await updateConversationPriority(extracted.db, {
		conversation: conversationRecord,
		priority: extracted.body.priority,
		actorUserId: actor.userId,
	});

	if (!updatedConversation) {
		return restError(
			c,
			500,
			"INTERNAL_SERVER_ERROR",
			"Unable to update conversation priority"
		);
	}

	await emitPrivateConversationUpdate(updatedConversation, {
		priority: updatedConversation.priority,
		prioritySource: updatedConversation.prioritySource,
	});

	return c.json(
		createPrivateConversationMutationResponse(updatedConversation),
		200
	);
});

conversationRouter.openapi(updateConversationSentimentRoute, async (c) => {
	const extracted = await safelyExtractRequestData(
		c,
		updateConversationSentimentRestRequestSchema
	);
	const privateContext = assertPrivateConversationControlContext(extracted);

	const { conversationId } = getConversationPathParams(c);
	const conversationRecord = await loadPrivateConversationRecord({
		db: extracted.db,
		organizationId: privateContext.organization.id,
		websiteId: privateContext.website.id,
		conversationId,
	});

	if (!conversationRecord) {
		return restError(c, 404, "NOT_FOUND", "Conversation not found");
	}

	const actor = await requirePrivateConversationActor({
		c,
		db: extracted.db,
		apiKey: privateContext.apiKey,
		organizationId: privateContext.organization.id,
		websiteTeamId: privateContext.website.teamId,
		required: true,
	});

	const updatedConversation = await updateConversationSentiment(extracted.db, {
		conversation: conversationRecord,
		sentiment: extracted.body.sentiment,
		actorUserId: actor.userId,
	});

	if (!updatedConversation) {
		return restError(
			c,
			500,
			"INTERNAL_SERVER_ERROR",
			"Unable to update conversation sentiment"
		);
	}

	await emitPrivateConversationUpdate(updatedConversation, {
		sentiment: updatedConversation.sentiment,
		sentimentConfidence: updatedConversation.sentimentConfidence,
		sentimentSource: updatedConversation.sentimentSource,
	});

	return c.json(
		createPrivateConversationMutationResponse(updatedConversation),
		200
	);
});

conversationRouter.openapi(updateConversationTitleRoute, async (c) => {
	const extracted = await safelyExtractRequestData(
		c,
		updateConversationTitleRestRequestSchema
	);
	const privateContext = assertPrivateConversationControlContext(extracted);

	const { conversationId } = getConversationPathParams(c);
	const conversationRecord = await loadPrivateConversationRecord({
		db: extracted.db,
		organizationId: privateContext.organization.id,
		websiteId: privateContext.website.id,
		conversationId,
	});

	if (!conversationRecord) {
		return restError(c, 404, "NOT_FOUND", "Conversation not found");
	}

	const normalizedTitle = extracted.body.title?.trim() || null;
	const updatedConversation = await updateConversationTitle(extracted.db, {
		conversation: conversationRecord,
		title: normalizedTitle,
		titleSource: "user",
	});

	if (!updatedConversation) {
		return restError(
			c,
			500,
			"INTERNAL_SERVER_ERROR",
			"Unable to update conversation title"
		);
	}

	const planInfo = await getPlanForWebsite(privateContext.website);
	const titleTranslation = await syncConversationVisitorTitle({
		db: extracted.db,
		conversationId: updatedConversation.id,
		organizationId: updatedConversation.organizationId,
		websiteId: updatedConversation.websiteId,
		title: updatedConversation.title,
		websiteDefaultLanguage: privateContext.website.defaultLanguage,
		visitorLanguage: updatedConversation.visitorLanguage,
		autoTranslateEnabled: isAutomaticTranslationEnabled({
			planAllowsAutoTranslate: planInfo.features["auto-translate"] === true,
			websiteAutoTranslateEnabled: privateContext.website.autoTranslateEnabled,
		}),
		aiContext: {
			db: extracted.db,
			organizationId: updatedConversation.organizationId,
			websiteId: updatedConversation.websiteId,
		},
	});
	const responseConversation = {
		...updatedConversation,
		visitorTitle: titleTranslation.visitorTitle,
		visitorTitleLanguage: titleTranslation.visitorTitleLanguage,
	};

	await emitPrivateConversationUpdate(responseConversation, {
		title: responseConversation.title,
		titleSource: responseConversation.titleSource,
		visitorTitle: responseConversation.visitorTitle,
		visitorTitleLanguage: responseConversation.visitorTitleLanguage,
	});

	return c.json(
		createPrivateConversationMutationResponse(responseConversation),
		200
	);
});

conversationRouter.openapi(pauseConversationAiRoute, async (c) => {
	const extracted = await safelyExtractOptionalRequestData(
		c,
		pauseConversationAiRestRequestSchema
	);
	const privateContext = assertPrivateConversationControlContext(extracted);

	const { conversationId } = getConversationPathParams(c);
	const conversationRecord = await loadPrivateConversationRecord({
		db: extracted.db,
		organizationId: privateContext.organization.id,
		websiteId: privateContext.website.id,
		conversationId,
	});

	if (!conversationRecord) {
		return restError(c, 404, "NOT_FOUND", "Conversation not found");
	}

	const actor = await requirePrivateConversationActor({
		c,
		db: extracted.db,
		apiKey: privateContext.apiKey,
		organizationId: privateContext.organization.id,
		websiteTeamId: privateContext.website.teamId,
		required: true,
	});

	const durationMinutes =
		extracted.body.durationMinutes ?? env.AI_AGENT_ROGUE_PAUSE_MINUTES;

	if (durationMinutes > AI_PAUSE_DURATION_MAX_MINUTES) {
		return restError(
			c,
			400,
			"BAD_REQUEST",
			"durationMinutes exceeds the supported maximum"
		);
	}

	const updatedConversation = await pauseAiForConversation({
		db: extracted.db,
		redis: getRedis(),
		conversationId: conversationRecord.id,
		organizationId: conversationRecord.organizationId,
		durationMinutes,
		reason: `manual:${actor.userId}`,
		mode: "replace",
	});

	if (!updatedConversation) {
		return restError(
			c,
			500,
			"INTERNAL_SERVER_ERROR",
			"Unable to pause AI for conversation"
		);
	}

	await Promise.all([
		emitPrivateConversationUpdate(updatedConversation, {
			aiPausedUntil: updatedConversation.aiPausedUntil,
		}),
		createConversationEvent({
			db: extracted.db,
			context: {
				conversationId: updatedConversation.id,
				organizationId: updatedConversation.organizationId,
				websiteId: updatedConversation.websiteId,
				visitorId: updatedConversation.visitorId,
			},
			event: {
				type: ConversationEventType.AI_PAUSED,
				actorUserId: actor.userId,
				message: buildAiPauseEventMessage(durationMinutes),
				visibility: TimelineItemVisibility.PRIVATE,
			},
		}),
	]);

	return c.json(
		createPrivateConversationMutationResponse(updatedConversation),
		200
	);
});

conversationRouter.openapi(resumeConversationAiRoute, async (c) => {
	const extracted = await safelyExtractRequestData(c);
	const privateContext = assertPrivateConversationControlContext(extracted);

	const { conversationId } = getConversationPathParams(c);
	const conversationRecord = await loadPrivateConversationRecord({
		db: extracted.db,
		organizationId: privateContext.organization.id,
		websiteId: privateContext.website.id,
		conversationId,
	});

	if (!conversationRecord) {
		return restError(c, 404, "NOT_FOUND", "Conversation not found");
	}

	const actor = await requirePrivateConversationActor({
		c,
		db: extracted.db,
		apiKey: privateContext.apiKey,
		organizationId: privateContext.organization.id,
		websiteTeamId: privateContext.website.teamId,
		required: true,
	});

	const updatedConversation = await resumeAiForConversation({
		db: extracted.db,
		redis: getRedis(),
		conversationId: conversationRecord.id,
		organizationId: conversationRecord.organizationId,
	});

	if (!updatedConversation) {
		return restError(
			c,
			500,
			"INTERNAL_SERVER_ERROR",
			"Unable to resume AI for conversation"
		);
	}

	await Promise.all([
		emitPrivateConversationUpdate(updatedConversation, {
			aiPausedUntil: null,
		}),
		createConversationEvent({
			db: extracted.db,
			context: {
				conversationId: updatedConversation.id,
				organizationId: updatedConversation.organizationId,
				websiteId: updatedConversation.websiteId,
				visitorId: updatedConversation.visitorId,
			},
			event: {
				type: ConversationEventType.AI_RESUMED,
				actorUserId: actor.userId,
				message: "resumed AI answers",
				visibility: TimelineItemVisibility.PRIVATE,
			},
		}),
	]);

	return c.json(
		createPrivateConversationMutationResponse(updatedConversation),
		200
	);
});

conversationRouter.openapi(joinConversationEscalationRoute, async (c) => {
	const extracted = await safelyExtractRequestData(c);
	const privateContext = assertPrivateConversationControlContext(extracted);

	const { conversationId } = getConversationPathParams(c);
	const conversationRecord = await loadPrivateConversationRecord({
		db: extracted.db,
		organizationId: privateContext.organization.id,
		websiteId: privateContext.website.id,
		conversationId,
	});

	if (!conversationRecord) {
		return restError(c, 404, "NOT_FOUND", "Conversation not found");
	}

	const actor = await requirePrivateConversationActor({
		c,
		db: extracted.db,
		apiKey: privateContext.apiKey,
		organizationId: privateContext.organization.id,
		websiteTeamId: privateContext.website.teamId,
		required: true,
	});

	const isParticipant = await isUserParticipant(extracted.db, {
		conversationId,
		userId: actor.userId,
	});

	if (!isParticipant) {
		await addConversationParticipant(extracted.db, {
			conversationId,
			userId: actor.userId,
			organizationId: privateContext.organization.id,
			requestedByUserId: actor.userId,
			reason: "Joined escalation",
		});
	}

	await createParticipantJoinedEvent(extracted.db, {
		conversationId,
		organizationId: privateContext.organization.id,
		websiteId: privateContext.website.id,
		visitorId: conversationRecord.visitorId,
		targetUserId: actor.userId,
		actorUserId: actor.userId,
		isAutoAdded: false,
		customMessage: "joined to help",
	});

	const updatedConversation = await joinEscalation(extracted.db, {
		conversation: conversationRecord,
		actorUserId: actor.userId,
	});

	return c.json(
		createPrivateConversationMutationResponse(updatedConversation),
		200
	);
});

conversationRouter.openapi(listInboxConversationsRoute, async (c) => {
	const extracted = await safelyExtractRequestQuery(
		c,
		listInboxConversationsRequestSchema
	);
	const privateContext = requirePrivateControlContext(c, extracted);

	if (privateContext instanceof Response) {
		return privateContext;
	}

	const actor = await requirePrivateConversationActor({
		c,
		db: extracted.db,
		apiKey: privateContext.apiKey,
		organizationId: privateContext.organization.id,
		websiteTeamId: privateContext.website.teamId,
		required: false,
	});

	const response = await listSupportConversations(extracted.db, {
		website: privateContext.website,
		actorUserId: actor?.userId ?? null,
		limit: extracted.query.limit,
		cursor: extracted.query.cursor ?? null,
		status: extracted.query.status,
		priority: extracted.query.priority,
		sentiment: extracted.query.sentiment,
		visitorId: extracted.query.visitorId,
		contactId: extracted.query.contactId,
		assignedToUserId: extracted.query.assignedToUserId,
		viewId: extracted.query.viewId,
		createdAtFrom: extracted.query.createdAtFrom,
		createdAtTo: extracted.query.createdAtTo,
		updatedAtFrom: extracted.query.updatedAtFrom,
		updatedAtTo: extracted.query.updatedAtTo,
		q: extracted.query.q,
		orderBy: extracted.query.orderBy,
		order: extracted.query.order,
	});

	return c.json(
		validateResponse(response, listInboxConversationsResponseSchema),
		200
	);
});

conversationRouter.openapi(getConversationContextRoute, async (c) => {
	const extracted = await safelyExtractRequestQuery(
		c,
		conversationContextRequestSchema
	);
	const privateContext = requirePrivateControlContext(c, extracted);

	if (privateContext instanceof Response) {
		return privateContext;
	}

	const { conversationId } = getConversationPathParams(c);
	const actor = await requirePrivateConversationActor({
		c,
		db: extracted.db,
		apiKey: privateContext.apiKey,
		organizationId: privateContext.organization.id,
		websiteTeamId: privateContext.website.teamId,
		required: false,
	});

	let response: Awaited<ReturnType<typeof getSupportConversation>>;
	try {
		response = await getSupportConversation(extracted.db, {
			website: privateContext.website,
			actorUserId: actor?.userId ?? null,
			conversationId,
			timelineLimit: extracted.query.timelineLimit,
			timelineCursor: extracted.query.timelineCursor ?? null,
			feedbackLimit: extracted.query.feedbackLimit,
		});
	} catch (error) {
		if (error instanceof SupportCapabilityError) {
			const status = error.status === 409 ? 400 : error.status;
			return restError(c, status, error.code, error.message);
		}
		throw error;
	}

	return c.json(
		validateResponse(response, conversationContextResponseSchema),
		200
	);
});

conversationRouter.openapi(getConversationRoute, async (c) => {
	const { db, website, organization, apiKey, visitorIdHeader } =
		await safelyExtractRequestData(c);
	const params = getConversationPathParams(c);

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

	const publicVisitor = await resolvePublicConversationVisitor({
		c,
		db,
		organizationId: organization.id,
		websiteId: website.id,
		apiKey,
		headerVisitorId: visitorIdHeader,
	});

	if (publicVisitor.error) {
		return publicVisitor.error;
	}

	const ownershipError = await ensurePublicConversationAccess({
		c,
		db,
		organizationId: organization.id,
		websiteId: website.id,
		conversationVisitorId: conversationRecord.visitorId,
		viewerVisitorId: publicVisitor.visitor?.id ?? null,
	});

	if (ownershipError) {
		return ownershipError;
	}

	try {
		const response = {
			conversation: serializeConversationForResponse(conversationRecord),
		};

		return c.json(
			validateResponse(response, getConversationResponseSchema),
			200
		);
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

		return c.json({ error: "Failed to serialize conversation response" }, 500);
	}
});

conversationRouter.openapi(markConversationSeenRoute, async (c) => {
	const { db, website, organization, body, visitorIdHeader } =
		await safelyExtractRequestData(c, markConversationSeenRequestSchema);

	const params = getConversationRequestSchema.parse({
		conversationId: c.req.param("conversationId"),
	});

	const [visitorIdentity, conversationRecord] = await Promise.all([
		resolveRuntimeVisitorIdentity({
			c,
			db,
			organizationId: organization.id,
			websiteId: website.id,
			headerVisitorId: visitorIdHeader,
			requestVisitorId: body.visitorId,
		}),
		getConversationByIdWithLastMessage(db, {
			organizationId: organization.id,
			websiteId: website.id,
			conversationId: params.conversationId,
		}),
	]);

	if (visitorIdentity.error) {
		return visitorIdentity.error;
	}

	const visitor = visitorIdentity.visitor;
	if (!visitor) {
		return restError(
			c,
			400,
			"BAD_REQUEST",
			"Visitor not found, please pass a valid visitorId"
		);
	}

	if (!conversationRecord) {
		return c.json(
			{
				error: "Conversation not found",
			},
			404
		);
	}

	const canAccessConversation = await canVisitorAccessConversation(db, {
		organizationId: organization.id,
		websiteId: website.id,
		viewerVisitorId: visitor.id,
		conversationVisitorId: conversationRecord.visitorId,
	});

	if (!canAccessConversation) {
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
});

conversationRouter.openapi(setConversationTypingRoute, async (c) => {
	const { db, website, organization, body, visitorIdHeader } =
		await safelyExtractRequestData(c, setConversationTypingRequestSchema);

	const params = getConversationRequestSchema.parse({
		conversationId: c.req.param("conversationId"),
	});

	const [visitorIdentity, conversationRecord] = await Promise.all([
		resolveRuntimeVisitorIdentity({
			c,
			db,
			organizationId: organization.id,
			websiteId: website.id,
			headerVisitorId: visitorIdHeader,
			requestVisitorId: body.visitorId,
		}),
		getConversationByIdWithLastMessage(db, {
			organizationId: organization.id,
			websiteId: website.id,
			conversationId: params.conversationId,
		}),
	]);

	if (visitorIdentity.error) {
		return visitorIdentity.error;
	}

	const visitor = visitorIdentity.visitor;
	if (!visitor) {
		return restError(
			c,
			400,
			"BAD_REQUEST",
			"Visitor not found, please pass a valid visitorId"
		);
	}

	if (!conversationRecord) {
		return c.json(
			{
				error: "Conversation not found",
			},
			404
		);
	}

	const canAccessConversation = await canVisitorAccessConversation(db, {
		organizationId: organization.id,
		websiteId: website.id,
		viewerVisitorId: visitor.id,
		conversationVisitorId: conversationRecord.visitorId,
	});

	if (!canAccessConversation) {
		return c.json(
			{
				error: "Conversation not found",
			},
			404
		);
	}

	const trimmedPreview = body.visitorPreview?.trim() ?? "";
	let effectivePreview =
		body.isTyping && trimmedPreview.length > 0
			? trimmedPreview.slice(0, 2000)
			: null;

	if (effectivePreview) {
		const stickyVisitorLanguage =
			conversationRecord.visitorLanguage ?? visitor.language ?? null;
		const autoTranslateEnabled =
			website.autoTranslateEnabled === true
				? isAutomaticTranslationEnabled({
						planAllowsAutoTranslate:
							(await getPlanForWebsite(website)).features["auto-translate"] ===
							true,
						websiteAutoTranslateEnabled: website.autoTranslateEnabled,
					})
				: false;
		if (
			autoTranslateEnabled &&
			shouldMaskTypingPreview({
				preview: effectivePreview,
				websiteDefaultLanguage: website.defaultLanguage,
				visitorLanguageHint: stickyVisitorLanguage,
			})
		) {
			effectivePreview = "Typing in another language";
		}
	}

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
});

conversationRouter.openapi(createConversationRatingRoute, async (c) => {
	const { db, website, organization, body, visitorIdHeader } =
		await safelyExtractRequestData(c, submitConversationRatingRequestSchema);

	const params = getConversationRequestSchema.parse({
		conversationId: c.req.param("conversationId"),
	});

	const [visitorIdentity, conversationRecord] = await Promise.all([
		resolveRuntimeVisitorIdentity({
			c,
			db,
			organizationId: organization.id,
			websiteId: website.id,
			headerVisitorId: visitorIdHeader,
			requestVisitorId: body.visitorId,
		}),
		getConversationByIdWithLastMessage(db, {
			organizationId: organization.id,
			websiteId: website.id,
			conversationId: params.conversationId,
		}),
	]);

	if (visitorIdentity.error) {
		return visitorIdentity.error;
	}

	const visitor = visitorIdentity.visitor;
	if (!visitor) {
		return restError(
			c,
			400,
			"BAD_REQUEST",
			"Visitor not found, please pass a valid visitorId"
		);
	}

	if (!conversationRecord) {
		return c.json(
			{
				error: "Conversation not found",
			},
			404
		);
	}

	const canAccessConversation = await canVisitorAccessConversation(db, {
		organizationId: organization.id,
		websiteId: website.id,
		viewerVisitorId: visitor.id,
		conversationVisitorId: conversationRecord.visitorId,
	});

	if (!canAccessConversation) {
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
		website,
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
});

// GET /conversations/:conversationId/seen - Fetch seen data for a conversation
conversationRouter.openapi(getConversationSeenRoute, async (c) => {
	const { db, website, organization, apiKey, visitorIdHeader } =
		await safelyExtractRequestQuery(c, z.object({}));

	const params = getConversationPathParams(c);

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

	const publicVisitor = await resolvePublicConversationVisitor({
		c,
		db,
		organizationId: organization.id,
		websiteId: website.id,
		apiKey,
		headerVisitorId: visitorIdHeader,
	});

	if (publicVisitor.error) {
		return publicVisitor.error;
	}

	const ownershipError = await ensurePublicConversationAccess({
		c,
		db,
		organizationId: organization.id,
		websiteId: website.id,
		conversationVisitorId: conversationRecord.visitorId,
		viewerVisitorId: publicVisitor.visitor?.id ?? null,
	});

	if (ownershipError) {
		return ownershipError;
	}

	const seenData = await getConversationSeenData(db, {
		conversationId: params.conversationId,
		organizationId: organization.id,
	});

	return c.json(
		validateResponse({ seenData }, getConversationSeenDataResponseSchema),
		200
	);
});

conversationRouter.openapi(exportConversationRoute, async (c) => {
	const extracted = await safelyExtractRequestQuery(c, emptyQuerySchema);
	const privateContext = requirePrivateControlContext(c, extracted);

	if (privateContext instanceof Response) {
		return privateContext;
	}

	const params = getConversationPathParams(c);
	const conversationRecord = await getConversationByIdWithLastMessage(
		extracted.db,
		{
			organizationId: privateContext.organization.id,
			websiteId: privateContext.website.id,
			conversationId: params.conversationId,
		}
	);

	if (!conversationRecord) {
		return c.json(
			{
				error: "Conversation not found",
			},
			404
		);
	}

	const exportResult = await buildConversationExport({
		db: extracted.db,
		website: {
			id: privateContext.website.id,
			slug: privateContext.website.slug,
			organizationId: privateContext.website.organizationId,
			teamId: privateContext.website.teamId,
		},
		conversation: {
			id: conversationRecord.id,
			title: conversationRecord.title,
			createdAt: conversationRecord.createdAt,
			visitorId: conversationRecord.visitorId,
		},
	});

	return c.text(exportResult.content, 200, {
		"Content-Disposition": `attachment; filename="${exportResult.filename}"`,
		"Content-Type": exportResult.mimeType,
	});
});

// GET /conversations/:conversationId/timeline - Fetch timeline items for a conversation
conversationRouter.openapi(getConversationTimelineRoute, async (c) => {
	const { db, website, organization, query, apiKey, visitorIdHeader } =
		await safelyExtractRequestQuery(
			c,
			getConversationTimelineItemsRequestSchema
		);

	const params = getConversationPathParams(c);

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

	const publicVisitor = await resolvePublicConversationVisitor({
		c,
		db,
		organizationId: organization.id,
		websiteId: website.id,
		apiKey,
		headerVisitorId: visitorIdHeader,
	});

	if (publicVisitor.error) {
		return publicVisitor.error;
	}

	const ownershipError = await ensurePublicConversationAccess({
		c,
		db,
		organizationId: organization.id,
		websiteId: website.id,
		conversationVisitorId: conversationRecord.visitorId,
		viewerVisitorId: publicVisitor.visitor?.id ?? null,
	});

	if (ownershipError) {
		return ownershipError;
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
});
