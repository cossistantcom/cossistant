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

feedbackCreateRouter.openapi(
	{
		method: "post",
		path: "/",
		summary: "Submit feedback",
		description:
			"Submit feedback with a rating, optional topic, and optional comment. Can be tied to a conversation or standalone.",
		request: {
			body: {
				content: {
					"application/json": {
						schema: submitFeedbackRequestSchema,
					},
				},
			},
		},
		responses: {
			201: {
				description: "Feedback submitted successfully",
				content: {
					"application/json": {
						schema: submitFeedbackResponseSchema,
					},
				},
			},
			400: errorJsonResponse("Invalid request data"),
			401: errorJsonResponse("Unauthorized - Invalid or missing API key"),
			403: errorJsonResponse("Forbidden - API key required"),
			404: errorJsonResponse("Conversation not found"),
			500: errorJsonResponse("Internal server error"),
		},
		tags: ["Feedback"],
		...runtimeDualAuth({ includeVisitorIdHeader: true }),
	},
	async (c) => {
		try {
			const { apiKey, db, organization, website, body, visitorIdHeader } =
				await safelyExtractRequestData(c, submitFeedbackRequestSchema);

			if (!(website?.id && website.organizationId && organization?.id)) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "Invalid API key" },
					401
				);
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
				const conversationRecord = await getConversationByIdWithLastMessage(
					db,
					{
						organizationId: website.organizationId,
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
	}
);

feedbackReadRouter.openapi(
	{
		method: "get",
		path: "/",
		summary: "List feedback",
		description:
			"Returns a paginated list of feedback for the website. Supports filtering by trigger, source, conversation, visitor, contact, topic, rating, and creation time.",
		request: {
			query: listFeedbackRequestSchema,
		},
		responses: {
			200: {
				description: "Feedback list retrieved successfully",
				content: {
					"application/json": {
						schema: listFeedbackResponseSchema,
					},
				},
			},
			401: errorJsonResponse(
				"Unauthorized - Invalid or missing private API key"
			),
			403: errorJsonResponse("Forbidden - Private API key required"),
			500: errorJsonResponse("Internal server error"),
		},
		tags: ["Feedback"],
		...privateControlAuth(),
	},
	async (c) => {
		try {
			const { db, website, query } = await safelyExtractRequestQuery(
				c,
				listFeedbackRequestSchema
			);

			if (!(website?.id && website.organizationId)) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "Invalid API key" },
					401
				);
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
	}
);

feedbackReadRouter.openapi(
	{
		method: "get",
		path: "/summary",
		summary: "Summarize feedback",
		description:
			"Returns aggregate feedback metrics for the website using the same filters as the feedback list endpoint.",
		request: {
			query: feedbackSummaryRequestSchema,
		},
		responses: {
			200: {
				description: "Feedback summary retrieved successfully",
				content: {
					"application/json": {
						schema: feedbackSummaryResponseSchema,
					},
				},
			},
			401: errorJsonResponse(
				"Unauthorized - Invalid or missing private API key"
			),
			403: errorJsonResponse("Forbidden - Private API key required"),
			500: errorJsonResponse("Internal server error"),
		},
		tags: ["Feedback"],
		...privateControlAuth(),
	},
	async (c) => {
		try {
			const { db, website, query } = await safelyExtractRequestQuery(
				c,
				feedbackSummaryRequestSchema
			);

			if (!(website?.id && website.organizationId)) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "Invalid API key" },
					401
				);
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
	}
);

feedbackReadRouter.openapi(
	{
		method: "get",
		path: "/{id}",
		summary: "Get feedback by ID",
		description: "Retrieves a single feedback entry by ID",
		responses: {
			200: {
				description: "Feedback retrieved successfully",
				content: {
					"application/json": {
						schema: getFeedbackResponseSchema,
					},
				},
			},
			401: errorJsonResponse(
				"Unauthorized - Invalid or missing private API key"
			),
			403: errorJsonResponse("Forbidden - Private API key required"),
			404: errorJsonResponse("Feedback not found"),
			500: errorJsonResponse("Internal server error"),
		},
		tags: ["Feedback"],
		...privateControlAuth({
			parameters: [
				{
					name: "id",
					in: "path",
					required: true,
					description: "The feedback ID",
					schema: {
						type: "string",
					},
				},
			],
		}),
	},
	async (c) => {
		try {
			const { db, website } = await safelyExtractRequestData(c);
			const id = c.req.param("id");

			if (!id) {
				return c.json(
					{ error: "NOT_FOUND", message: "Feedback not found" },
					404
				);
			}

			if (!website?.id) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "Invalid API key" },
					401
				);
			}

			const entry = await getFeedbackById(db, {
				id,
				websiteId: website.id,
			});

			if (!entry) {
				return c.json(
					{ error: "NOT_FOUND", message: "Feedback not found" },
					404
				);
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
	}
);

feedbackRouter.route("/", feedbackCreateRouter);
feedbackRouter.route("/", feedbackReadRouter);
