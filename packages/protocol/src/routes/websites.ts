import {
	publicWebsiteResponseSchema,
	websiteTeamMembersResponseSchema,
} from "@cossistant/types";
import { createRoute } from "@hono/zod-openapi";
import { privateControlAuth, runtimeDualAuth } from "../auth";
import { errorJsonResponse } from "../errors";

// GET /website - Get website information linked to the API key
// NOTE: `tags: ["Website"]` is singular here while the tag fallback map uses
// "Websites". Preserved verbatim — the tag is part of the published contract.
export const getWebsiteRoute = createRoute({
	method: "get",
	path: "/",
	summary: "Get website information",
	description:
		"Returns the website information associated with the provided API key. This endpoint supports both public and private API keys with different authentication methods.",
	responses: {
		200: {
			description: "Website information successfully retrieved",
			content: {
				"application/json": {
					schema: publicWebsiteResponseSchema,
				},
			},
		},
		401: errorJsonResponse("Unauthorized - Invalid or missing API key"),
		403: errorJsonResponse(
			"Forbidden - Origin validation failed for public key or domain not whitelisted"
		),
		404: errorJsonResponse("Website not found for this API key"),
	},
	tags: ["Website"],
	...runtimeDualAuth({ includeVisitorIdHeader: true }),
});

export const listWebsiteTeamMembersRoute = createRoute({
	method: "get",
	path: "/team-members",
	summary: "List website team members",
	description:
		"Returns the website-access teammates that can be linked to private API keys or used as actor IDs on actor-aware private API routes.",
	operationId: "listWebsiteTeamMembers",
	responses: {
		200: {
			description: "Website team members retrieved successfully",
			content: {
				"application/json": {
					schema: websiteTeamMembersResponseSchema,
				},
			},
		},
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse("Forbidden - Private API key required"),
		500: errorJsonResponse("Internal server error"),
	},
	tags: ["Website"],
	...privateControlAuth(),
});

export const WEBSITE_ROUTES = [
	getWebsiteRoute,
	listWebsiteTeamMembersRoute,
] as const;
