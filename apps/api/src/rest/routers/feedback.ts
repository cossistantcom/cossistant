import { getConversationByIdWithLastMessage } from "@api/db/queries/conversation";
import { getFeedbackById, listFeedback } from "@api/db/queries/feedback";
import { getVisitor } from "@api/db/queries/visitor";
import {
	safelyExtractRequestData,
	validateResponse,
} from "@api/utils/validate";
import { APIKeyType } from "@plasma/types";
import {
	type Feedback,
	getFeedbackResponseSchema,
	listFeedbackResponseSchema,
	submitFeedbackRequestSchema,
	submitFeedbackResponseSchema,
} from "@plasma/types/api/feedback";
import { OpenAPIHono, z } from "@hono/zod-openapi";
import {
	protectedPrivateApiKeyMiddleware,
	protectedPublicApiKeyMiddleware,
} from "../middleware";
import type { RestContext } from "../types";
import { persistFeedbackSubmission } from "./feedback-shared";

export const feedbackRouter = new OpenAPIHono<RestContext>();
const feedbackCreateRouter = new OpenAPIHono<RestContext>();
const feedbackReadRouter = new OpenAPIHono<RestContext>();

feedbackCreateRouter.use("/*", ...protectedPublicApiKeyMiddleware);
feedbackReadRouter.use("/*", ...protectedPrivateApiKeyMiddleware);

function formatFeedbackResponse(entry: {
	id: string;
	organizationId: string;
	websiteId: string;
	conversationId: string | null;
	visitorId: string | null;
	contactId: string | null;
	rating: number;
	topic: string | null;
	comment: string | null;
	trigger: string | null;
	source: string;
	createdAt: string;
	updatedAt: string;
	deletedAt: string | null;
}): Feedback {
	return {
		id: entry.id,
		organizationId: entry.organizationId,
		websiteId: entry.websiteId,
		conversationId: entry.conversationId,
		visitorId: entry.visitorId,
		contactId: entry.contactId,
		rating: entry.rating,
		topic: entry.topic,
		comment: entry.comment,
		trigger: entry.trigger,
		source: entry.source,
		createdAt: entry.createdAt,
		updatedAt: entry.updatedAt,
	};
}

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
			400: {
				description: "Invalid request data",
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
			},
			401: {
				description: "Unauthorized - Invalid or missing API key",
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
			},
			403: {
				description: "Forbidden - API key required",
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
			},
			404: {
				description: "Conversation not found",
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
			},
			500: {
				description: "Internal server error",
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
			},
		},
		security: [
			{
				"Public API Key": [],
			},
		],
		tags: ["Feedback"],
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
				const visitor = await getVisitor(db, {
					visitorId: body.visitorId || visitorIdHeader,
				});

				if (!visitor || visitor.websiteId !== website.id) {
					return c.json(
						{
							error: "BAD_REQUEST",
							message: "Visitor not found, please pass a valid visitorId",
						},
						400
					);
				}

				if (body.conversationId) {
					const conversationRecord = await getConversationByIdWithLastMessage(
						db,
						{
							organizationId: organization.id,
							websiteId: website.id,
							conversationId: body.conversationId,
						}
					);

					if (
						!conversationRecord ||
						conversationRecord.visitorId !== visitor.id
					) {
						return c.json(
							{
								error: "NOT_FOUND",
								message: "Conversation not found",
							},
							404
						);
					}
				}

				const { entry: authenticatedEntry } = await persistFeedbackSubmission({
					db,
					organizationId: organization.id,
					websiteId: website.id,
					conversationId: body.conversationId,
					visitorId: visitor.id,
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

			const { entry } = await persistFeedbackSubmission({
				db,
				organizationId: website.organizationId,
				websiteId: website.id,
				rating: body.rating,
				topic: body.topic,
				comment: body.comment,
				trigger: body.trigger,
				source: body.source ?? "widget",
				conversationId: body.conversationId,
				visitorId: body.visitorId,
				contactId: body.contactId,
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
			"Returns a paginated list of feedback for the website. Supports filtering by trigger, source, conversation, and visitor.",
		request: {
			query: z.object({
				trigger: z.string().optional(),
				source: z.string().optional(),
				conversationId: z.string().optional(),
				visitorId: z.string().optional(),
				page: z.string().optional(),
				limit: z.string().optional(),
			}),
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
			401: {
				description: "Unauthorized - Invalid or missing private API key",
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
			},
			403: {
				description: "Forbidden - Private API key required",
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
			},
			500: {
				description: "Internal server error",
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
			},
		},
		security: [
			{
				"Private API Key": [],
			},
		],
		tags: ["Feedback"],
	},
	async (c) => {
		try {
			const { db, website } = await safelyExtractRequestData(c);

			if (!(website?.id && website.organizationId)) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "Invalid API key" },
					401
				);
			}

			const query = c.req.query();
			const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
			const limit = Math.min(
				100,
				Math.max(1, Number.parseInt(query.limit ?? "20", 10) || 20)
			);

			const result = await listFeedback(db, {
				organizationId: website.organizationId,
				websiteId: website.id,
				trigger: query.trigger || undefined,
				source: query.source || undefined,
				conversationId: query.conversationId || undefined,
				visitorId: query.visitorId || undefined,
				page,
				limit,
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
		path: "/:id",
		summary: "Get feedback by ID",
		description: "Retrieves a single feedback entry by ID",
		inputSchema: [
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
		responses: {
			200: {
				description: "Feedback retrieved successfully",
				content: {
					"application/json": {
						schema: getFeedbackResponseSchema,
					},
				},
			},
			401: {
				description: "Unauthorized - Invalid or missing private API key",
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
			},
			403: {
				description: "Forbidden - Private API key required",
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
			},
			404: {
				description: "Feedback not found",
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
			},
			500: {
				description: "Internal server error",
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
			},
		},
		security: [
			{
				"Private API Key": [],
			},
		],
		tags: ["Feedback"],
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
