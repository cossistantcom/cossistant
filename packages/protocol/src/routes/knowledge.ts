import {
	createKnowledgeRestRequestSchema,
	knowledgeResponseSchema,
	knowledgeSearchRequestSchema,
	knowledgeSearchResponseSchema,
	listKnowledgeResponseSchema,
	listKnowledgeRestRequestSchema,
	updateKnowledgeRestRequestSchema,
} from "@cossistant/types";
import { createRoute } from "@hono/zod-openapi";
import { privateControlAuth } from "../auth";
import { errorJsonResponse } from "../errors";

const knowledgeIdPathParameter = {
	name: "id",
	in: "path",
	required: true,
	description: "The knowledge entry ID",
	schema: {
		type: "string",
	},
} as const;

export const listKnowledgeRoute = createRoute({
	method: "get",
	path: "/",
	summary: "List knowledge entries",
	description:
		"Returns a paginated list of knowledge entries for the website. Supports filtering by type, AI agent, training inclusion, and link source.",
	operationId: "listKnowledge",
	request: {
		query: listKnowledgeRestRequestSchema,
	},
	responses: {
		200: {
			description: "Knowledge entries retrieved successfully",
			content: {
				"application/json": {
					schema: listKnowledgeResponseSchema,
				},
			},
		},
		400: errorJsonResponse("Bad request - Invalid query parameters"),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		500: errorJsonResponse("Internal server error"),
	},
	tags: ["Knowledge"],
	...privateControlAuth(),
});

export const searchKnowledgeRoute = createRoute({
	method: "get",
	path: "/search",
	summary: "Search knowledge",
	description:
		"Runs private semantic retrieval against indexed knowledge chunks for the authenticated website. Designed for CLI, MCP, and support-agent tools that need source-backed context.",
	operationId: "searchKnowledge",
	request: {
		query: knowledgeSearchRequestSchema,
	},
	responses: {
		200: {
			description: "Knowledge search completed successfully",
			content: {
				"application/json": {
					schema: knowledgeSearchResponseSchema,
				},
			},
		},
		400: errorJsonResponse("Bad request - Invalid query parameters"),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse("Forbidden - Private API key required"),
		500: errorJsonResponse("Internal server error"),
	},
	tags: ["Knowledge"],
	...privateControlAuth(),
});

export const getKnowledgeRoute = createRoute({
	method: "get",
	path: "/{id}",
	summary: "Get a knowledge entry",
	description: "Retrieves a single knowledge entry by ID",
	operationId: "getKnowledge",
	responses: {
		200: {
			description: "Knowledge entry retrieved successfully",
			content: {
				"application/json": {
					schema: knowledgeResponseSchema,
				},
			},
		},
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		404: errorJsonResponse("Knowledge entry not found"),
		500: errorJsonResponse("Internal server error"),
	},
	tags: ["Knowledge"],
	...privateControlAuth({
		parameters: [knowledgeIdPathParameter],
	}),
});

export const createKnowledgeRoute = createRoute({
	method: "post",
	path: "/",
	summary: "Create a knowledge entry",
	description: "Creates a new knowledge entry for the website",
	request: {
		body: {
			content: {
				"application/json": {
					schema: createKnowledgeRestRequestSchema,
				},
			},
		},
	},
	responses: {
		201: {
			description: "Knowledge entry created successfully",
			content: {
				"application/json": {
					schema: knowledgeResponseSchema,
				},
			},
		},
		400: errorJsonResponse("Invalid request data"),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse(
			"Forbidden - Plan knowledge limits prevent creating this entry"
		),
		500: errorJsonResponse("Internal server error"),
	},
	tags: ["Knowledge"],
	...privateControlAuth(),
});

export const updateKnowledgeRoute = createRoute({
	method: "patch",
	path: "/{id}",
	summary: "Update a knowledge entry",
	description: "Updates an existing knowledge entry",
	request: {
		body: {
			content: {
				"application/json": {
					schema: updateKnowledgeRestRequestSchema,
				},
			},
		},
	},
	responses: {
		200: {
			description: "Knowledge entry updated successfully",
			content: {
				"application/json": {
					schema: knowledgeResponseSchema,
				},
			},
		},
		400: errorJsonResponse("Invalid request data"),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse(
			"Forbidden - Plan knowledge limits prevent updating this entry"
		),
		404: errorJsonResponse("Knowledge entry not found"),
		500: errorJsonResponse("Internal server error"),
	},
	tags: ["Knowledge"],
	...privateControlAuth({
		parameters: [knowledgeIdPathParameter],
	}),
});

export const deleteKnowledgeRoute = createRoute({
	method: "delete",
	path: "/{id}",
	summary: "Delete a knowledge entry",
	description: "Permanently deletes a knowledge entry",
	responses: {
		204: {
			description: "Knowledge entry deleted successfully",
		},
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		404: errorJsonResponse("Knowledge entry not found"),
		500: errorJsonResponse("Internal server error"),
	},
	tags: ["Knowledge"],
	...privateControlAuth({
		parameters: [knowledgeIdPathParameter],
	}),
});

export const KNOWLEDGE_ROUTES = [
	listKnowledgeRoute,
	searchKnowledgeRoute,
	getKnowledgeRoute,
	createKnowledgeRoute,
	updateKnowledgeRoute,
	deleteKnowledgeRoute,
] as const;
