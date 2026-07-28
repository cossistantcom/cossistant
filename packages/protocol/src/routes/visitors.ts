import {
	updateVisitorMetadataRequestSchema,
	updateVisitorRequestSchema,
	visitorActivityRequestSchema,
	visitorActivityResponseSchema,
	visitorResponseSchema,
} from "@cossistant/types";
import { createRoute } from "@hono/zod-openapi";
import { privateControlAuth, runtimeDualAuth } from "../auth";
import { errorJsonResponse } from "../errors";

const visitorIdPathParameter = {
	name: "id",
	in: "path",
	required: true,
	description: "The visitor ID",
	schema: {
		type: "string",
	},
} as const;

export const getVisitorActivityRoute = createRoute({
	method: "post",
	path: "/{id}/activity",
	summary: "Track live visitor activity",
	description:
		"Records live visitor activity for realtime dashboards. This endpoint is the canonical ingestion path for live visitor presence and page activity.",
	request: {
		body: {
			content: {
				"application/json": {
					schema: visitorActivityRequestSchema,
				},
			},
		},
	},
	responses: {
		200: {
			description: "Live activity accepted",
			content: {
				"application/json": {
					schema: visitorActivityResponseSchema,
				},
			},
		},
		400: errorJsonResponse("Invalid request data"),
		401: errorJsonResponse("Unauthorized - Invalid or missing API key"),
		403: errorJsonResponse("Forbidden - Public key origin validation failed"),
		404: errorJsonResponse("Visitor not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...runtimeDualAuth({
		parameters: [visitorIdPathParameter],
	}),
});

export const updateVisitorRoute = createRoute({
	method: "patch",
	path: "/{id}",
	summary: "Update existing visitor information",
	description:
		"Updates an existing visitor's browser, device, and location data. The visitor must already exist in the system.",
	request: {
		body: {
			content: {
				"application/json": {
					schema: updateVisitorRequestSchema,
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: visitorResponseSchema,
				},
			},
			description: "Visitor information successfully created or updated",
		},
		400: errorJsonResponse("Invalid request data"),
		401: errorJsonResponse("Unauthorized - Invalid API key"),
		403: errorJsonResponse("Forbidden - Public key origin validation failed"),
		404: errorJsonResponse("Visitor not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...runtimeDualAuth({
		parameters: [
			{
				name: "id",
				in: "path",
				required: true,
				// Deliberately not the shared constant: this route's description
				// differs and the wording is part of the published contract.
				description: "The visitor ID to update",
				schema: {
					type: "string",
				},
			},
		],
	}),
});

export const updateVisitorMetadataRoute = createRoute({
	method: "patch",
	path: "/{id}/metadata",
	summary: "Update contact metadata for a visitor",
	description:
		"Merges the provided metadata into the contact profile associated with the visitor. The visitor must be identified first (linked to a contact) via the /contacts/identify endpoint.",
	request: {
		body: {
			content: {
				"application/json": {
					schema: updateVisitorMetadataRequestSchema,
				},
			},
		},
	},
	responses: {
		200: {
			description: "Contact metadata updated successfully",
			content: {
				"application/json": {
					schema: visitorResponseSchema,
				},
			},
		},
		400: errorJsonResponse("Invalid request data or visitor not identified"),
		401: errorJsonResponse("Unauthorized - Invalid API key"),
		403: errorJsonResponse("Forbidden - Public key origin validation failed"),
		404: errorJsonResponse("Visitor not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...runtimeDualAuth({
		parameters: [visitorIdPathParameter],
	}),
});

export const blockVisitorRoute = createRoute({
	method: "post",
	path: "/{id}/block",
	summary: "Block a visitor",
	description:
		"Blocks a visitor from sending new messages. Requires a private API key and an acting teammate.",
	operationId: "blockVisitor",
	responses: {
		200: {
			description: "Visitor blocked successfully",
			content: {
				"application/json": {
					schema: visitorResponseSchema,
				},
			},
		},
		400: errorJsonResponse(
			"Bad request - Missing actor for an unlinked private API key"
		),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse(
			"Forbidden - Private API key required or actor user not allowed for this website"
		),
		404: errorJsonResponse("Visitor not found"),
		500: errorJsonResponse("Internal server error"),
	},
	tags: ["Visitors"],
	...privateControlAuth({
		parameters: [visitorIdPathParameter],
		includeActorUserIdHeader: true,
	}),
});

export const unblockVisitorRoute = createRoute({
	method: "post",
	path: "/{id}/unblock",
	summary: "Unblock a visitor",
	description:
		"Unblocks a visitor so they can send messages again. Requires a private API key and an acting teammate.",
	operationId: "unblockVisitor",
	responses: {
		200: {
			description: "Visitor unblocked successfully",
			content: {
				"application/json": {
					schema: visitorResponseSchema,
				},
			},
		},
		400: errorJsonResponse(
			"Bad request - Missing actor for an unlinked private API key"
		),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse(
			"Forbidden - Private API key required or actor user not allowed for this website"
		),
		404: errorJsonResponse("Visitor not found"),
		500: errorJsonResponse("Internal server error"),
	},
	tags: ["Visitors"],
	...privateControlAuth({
		parameters: [visitorIdPathParameter],
		includeActorUserIdHeader: true,
	}),
});

export const getVisitorRoute = createRoute({
	method: "get",
	path: "/{id}",
	summary: "Get visitor information",
	description: "Retrieves visitor information by visitor ID",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: visitorResponseSchema,
				},
			},
			description: "Visitor information retrieved successfully",
		},
		401: errorJsonResponse("Unauthorized - Invalid API key"),
		403: errorJsonResponse("Forbidden - Public key origin validation failed"),
		404: errorJsonResponse("Visitor not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...runtimeDualAuth({
		parameters: [visitorIdPathParameter],
	}),
});

export const VISITOR_ROUTES = [
	getVisitorActivityRoute,
	updateVisitorRoute,
	updateVisitorMetadataRoute,
	blockVisitorRoute,
	unblockVisitorRoute,
	getVisitorRoute,
] as const;
