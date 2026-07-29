import {
	feedbackSummaryRequestSchema,
	feedbackSummaryResponseSchema,
	getFeedbackResponseSchema,
	listFeedbackRequestSchema,
	listFeedbackResponseSchema,
	submitFeedbackRequestSchema,
	submitFeedbackResponseSchema,
} from "@cossistant/types/api/feedback";
import { createRoute } from "@hono/zod-openapi";
import { privateControlAuth, runtimeDualAuth } from "../auth";
import { errorJsonResponse } from "../errors";

export const createFeedbackRoute = createRoute({
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
});

export const listFeedbackRoute = createRoute({
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
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse("Forbidden - Private API key required"),
		500: errorJsonResponse("Internal server error"),
	},
	tags: ["Feedback"],
	...privateControlAuth(),
});

export const getFeedbackSummaryRoute = createRoute({
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
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse("Forbidden - Private API key required"),
		500: errorJsonResponse("Internal server error"),
	},
	tags: ["Feedback"],
	...privateControlAuth(),
});

export const getFeedbackRoute = createRoute({
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
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
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
});

/** Public-key runtime routes (`feedbackCreateRouter` in apps/api). */
export const FEEDBACK_CREATE_ROUTES = [createFeedbackRoute] as const;

/** Private-key control routes (`feedbackReadRouter` in apps/api). */
export const FEEDBACK_READ_ROUTES = [
	listFeedbackRoute,
	getFeedbackSummaryRoute,
	getFeedbackRoute,
] as const;
