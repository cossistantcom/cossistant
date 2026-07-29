import { organizationResponseSchema } from "@cossistant/types";
import { createRoute } from "@hono/zod-openapi";
import { privateControlAuth } from "../auth";
import { errorJsonResponse } from "../errors";

export const getOrganizationRoute = createRoute({
	method: "get",
	path: "/{id}",
	summary: "Retrieve an organization",
	description:
		"Retrieve an organization by its ID for the authenticated organization.",
	tags: ["Organizations"],
	responses: {
		200: {
			description: "Organization details",
			content: {
				"application/json": {
					schema: organizationResponseSchema,
				},
			},
		},
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse("Forbidden - Private API key required"),
		404: errorJsonResponse("Organization not found"),
	},
	...privateControlAuth({
		parameters: [
			{
				name: "id",
				in: "path",
				description: "The organization ID to retrieve.",
				required: true,
				schema: {
					type: "string",
				},
			},
		],
	}),
});

export const ORGANIZATION_ROUTES = [getOrganizationRoute] as const;
