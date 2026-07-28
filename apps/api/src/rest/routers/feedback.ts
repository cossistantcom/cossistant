import { getConversationByIdWithLastMessage } from "@api/db/queries/conversation";
import { canVisitorAccessConversation } from "@api/db/queries/conversation-access";
import {
	getFeedbackById,
	getFeedbackSummary,
	listFeedback,
} from "@api/db/queries/feedback";
import { getVisitor } from "@api/db/queries/visitor";
import {
	safelyExtractRequestData,
	safelyExtractRequestQuery,
	validateResponse,
} from "@api/utils/validate";
import {
	createFeedbackRoute,
	getFeedbackRoute,
	getFeedbackSummaryRoute,
	listFeedbackRoute,
} from "@cossistant/protocol/routes";
import { APIKeyType } from "@cossistant/types";
import {
	feedbackSummaryRequestSchema,
	feedbackSummaryResponseSchema,
	getFeedbackResponseSchema,
	listFeedbackRequestSchema,
	listFeedbackResponseSchema,
	submitFeedbackRequestSchema,
	submitFeedbackResponseSchema,
} from "@cossistant/types/api/feedback";
import { OpenAPIHono, z } from "@hono/zod-openapi";
import {
	protectedPrivateApiKeyMiddleware,
	protectedPublicApiKeyMiddleware,
} from "../middleware";
import {
	errorJsonResponse,
	privateControlAuth,
	runtimeDualAuth,
} from "../openapi";
import { resolveRuntimeVisitorIdentity } from "../runtime-visitor";
import type { RestContext } from "../types";
import {
	formatFeedbackResponse,
	persistFeedbackSubmission,
} from "./feedback-shared";

export const feedbackRouter = new OpenAPIHono<RestContext>();
const feedbackCreateRouter = new OpenAPIHono<RestContext>();
const feedbackReadRouter = new OpenAPIHono<RestContext>();

feedbackCreateRouter.use("/*", ...protectedPublicApiKeyMiddleware);
feedbackReadRouter.use("/*", ...protectedPrivateApiKeyMiddleware);

feedbackCreateRouter.openapi(createFeedbackRoute, async (c) => {
	try {
		const { apiKey, db, organization, website, body, visitorIdHeader } =
			await safelyExtractRequestData(c, submitFeedbackRequestSchema);

		if (!(website?.id && website.organizationId && organization?.id)) {
			return c.json({ error: "UNAUTHORIZED", message: "Invalid API key" }, 401);
		}

		if (apiKey?.keyType === APIKeyType.PUBLIC) {
			const visitorIdentity = await resolveRuntimeVisitorIdentity({
				c,
				db,
				apiKey,
				organizationId: organization.id,
				websiteId: website.id,
				headerVisitorId: visitorIdHeader,
				requestVisitorId: body.visitorId,
				publicOnly: true,
			});

			if (visitorIdentity.error) {
				return visitorIdentity.error;
			}

			const visitor = visitorIdentity.visitor;
			if (!visitor) {
				return c.json(
					{
						error: "BAD_REQUEST",
						message: "Visitor not found, please pass a valid visitorId",
					},
					400
				);
			}

			let conversationOwnerVisitorId: string | null = null;
			if (body.conversationId) {
				const conversationRecord = await getConversationByIdWithLastMessage(
					db,
					{
						organizationId: organization.id,
						websiteId: website.id,
						conversationId: body.conversationId,
					}
				);

				if (!conversationRecord) {
					return c.json(
						{
							error: "NOT_FOUND",
							message: "Conversation not found",
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
							error: "NOT_FOUND",
							message: "Conversation not found",
						},
						404
					);
				}

				conversationOwnerVisitorId = conversationRecord.visitorId;
			}

			const { entry: authenticatedEntry } = await persistFeedbackSubmission({
				db,
				organizationId: organization.id,
				websiteId: website.id,
				website,
				conversationId: body.conversationId,
				visitorId: visitor.id,
				conversationOwnerVisitorId,
				contactId: visitor.contactId,
				rating: body.rating,
				topic: body.topic,
				comment: body.comment,
				trigger: body.trigger,
				source: body.source ?? "widget",
			});

			return c.json(
				validateResponse(
					{ feedback: formatFeedbackResponse(authenticatedEntry) },
					submitFeedbackResponseSchema
				),
				201
			);
		}

		let privateVisitor:
			| Awaited<ReturnType<typeof getVisitor>>
			| null
			| undefined;
		let privateContactId = body.contactId;
		let privateConversationOwnerVisitorId: string | null = null;

		if (body.visitorId) {
			privateVisitor = await getVisitor(db, {
				visitorId: body.visitorId,
			});

			if (!privateVisitor || privateVisitor.websiteId !== website.id) {
				return c.json(
					{
						error: "BAD_REQUEST",
						message: "Visitor not found, please pass a valid visitorId",
					},
					400
				);
			}

			privateContactId =
				privateContactId ?? privateVisitor.contactId ?? undefined;
		}

		if (body.conversationId) {
			const conversationRecord = await getConversationByIdWithLastMessage(db, {
				organizationId: website.organizationId,
				websiteId: website.id,
				conversationId: body.conversationId,
			});

			if (!conversationRecord) {
				return c.json(
					{
						error: "NOT_FOUND",
						message: "Conversation not found",
					},
					404
				);
			}
			privateConversationOwnerVisitorId = conversationRecord.visitorId;

			if (privateVisitor) {
				const canAccessConversation = await canVisitorAccessConversation(db, {
					organizationId: website.organizationId,
					websiteId: website.id,
					viewerVisitorId: privateVisitor.id,
					conversationVisitorId: conversationRecord.visitorId,
				});

				if (!canAccessConversation) {
					return c.json(
						{
							error: "BAD_REQUEST",
							message: "Visitor does not match conversation",
						},
						400
					);
				}
			}

			if (!privateVisitor) {
				privateVisitor = await getVisitor(db, {
					visitorId: conversationRecord.visitorId,
				});

				if (!privateVisitor || privateVisitor.websiteId !== website.id) {
					return c.json(
						{
							error: "NOT_FOUND",
							message: "Conversation not found",
						},
						404
					);
				}
			}

			privateContactId = privateVisitor.contactId ?? undefined;
		}

		const { entry } = await persistFeedbackSubmission({
			db,
			organizationId: website.organizationId,
			websiteId: website.id,
			website,
			rating: body.rating,
			topic: body.topic,
			comment: body.comment,
			trigger: body.trigger,
			source: body.source ?? "widget",
			conversationId: body.conversationId,
			conversationOwnerVisitorId: privateConversationOwnerVisitorId,
			visitorId: privateVisitor?.id,
			contactId: privateContactId,
		});

		return c.json(
			validateResponse(
				{ feedback: formatFeedbackResponse(entry) },
				submitFeedbackResponseSchema
			),
			201
		);
	} catch (error) {
		console.error("Error submitting feedback:", error);
		return c.json(
			{
				error: "INTERNAL_SERVER_ERROR",
				message: "Failed to submit feedback",
			},
			500
		);
	}
});

feedbackReadRouter.openapi(listFeedbackRoute, async (c) => {
	try {
		const { db, website, query } = await safelyExtractRequestQuery(
			c,
			listFeedbackRequestSchema
		);

		if (!(website?.id && website.organizationId)) {
			return c.json({ error: "UNAUTHORIZED", message: "Invalid API key" }, 401);
		}

		const result = await listFeedback(db, {
			organizationId: website.organizationId,
			websiteId: website.id,
			trigger: query.trigger,
			source: query.source,
			conversationId: query.conversationId,
			visitorId: query.visitorId,
			contactId: query.contactId,
			topic: query.topic,
			rating: query.rating,
			createdAtFrom: query.createdAtFrom,
			createdAtTo: query.createdAtTo,
			order: query.order,
			page: query.page,
			limit: query.limit,
		});

		return c.json(
			validateResponse(
				{
					feedback: result.items.map(formatFeedbackResponse),
					pagination: result.pagination,
				},
				listFeedbackResponseSchema
			),
			200
		);
	} catch (error) {
		console.error("Error listing feedback:", error);
		return c.json(
			{
				error: "INTERNAL_SERVER_ERROR",
				message: "Failed to list feedback",
			},
			500
		);
	}
});

feedbackReadRouter.openapi(getFeedbackSummaryRoute, async (c) => {
	try {
		const { db, website, query } = await safelyExtractRequestQuery(
			c,
			feedbackSummaryRequestSchema
		);

		if (!(website?.id && website.organizationId)) {
			return c.json({ error: "UNAUTHORIZED", message: "Invalid API key" }, 401);
		}

		const summary = await getFeedbackSummary(db, {
			organizationId: website.organizationId,
			websiteId: website.id,
			trigger: query.trigger,
			source: query.source,
			conversationId: query.conversationId,
			visitorId: query.visitorId,
			contactId: query.contactId,
			topic: query.topic,
			rating: query.rating,
			createdAtFrom: query.createdAtFrom,
			createdAtTo: query.createdAtTo,
		});

		return c.json(
			validateResponse(summary, feedbackSummaryResponseSchema),
			200
		);
	} catch (error) {
		console.error("Error summarizing feedback:", error);
		return c.json(
			{
				error: "INTERNAL_SERVER_ERROR",
				message: "Failed to summarize feedback",
			},
			500
		);
	}
});

feedbackReadRouter.openapi(getFeedbackRoute, async (c) => {
	try {
		const { db, website } = await safelyExtractRequestData(c);
		const id = c.req.param("id");

		if (!id) {
			return c.json({ error: "NOT_FOUND", message: "Feedback not found" }, 404);
		}

		if (!website?.id) {
			return c.json({ error: "UNAUTHORIZED", message: "Invalid API key" }, 401);
		}

		const entry = await getFeedbackById(db, {
			id,
			websiteId: website.id,
		});

		if (!entry) {
			return c.json({ error: "NOT_FOUND", message: "Feedback not found" }, 404);
		}

		return c.json(
			validateResponse(
				{ feedback: formatFeedbackResponse(entry) },
				getFeedbackResponseSchema
			),
			200
		);
	} catch (error) {
		console.error("Error fetching feedback:", error);
		return c.json(
			{
				error: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch feedback",
			},
			500
		);
	}
});

feedbackRouter.route("/", feedbackCreateRouter);
feedbackRouter.route("/", feedbackReadRouter);
