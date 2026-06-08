import { validateResponse } from "@api/utils/validate";
import { organizationResponseSchema } from "@cossistant/types";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { protectedPrivateApiKeyMiddleware } from "../middleware";
import {
	ensureAuthenticatedOrganizationMatch,
	errorJsonResponse,
	privateControlAuth,
	requirePrivateControlContext,
} from "../openapi";
import type { RestContext } from "../types";

const app = new OpenAPIHono<RestContext>();

app.use("/*", ...protectedPrivateApiKeyMiddleware);

app.openapi(
	createRoute({
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
			401: errorJsonResponse(
				"Unauthorized - Invalid or missing private API key"
			),
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
	}),
	async (c) => {
		const privateContext = requirePrivateControlContext(c, {
			apiKey: c.get("apiKey"),
			organization: c.get("organization"),
			website: c.get("website"),
		});
		if (privateContext instanceof Response) {
			return privateContext;
		}

		const organizationId = c.req.param("id");
		if (!organizationId) {
			return c.json(
				{ error: "NOT_FOUND", message: "Organization not found" },
				404
			);
		}
		const mismatchResponse = ensureAuthenticatedOrganizationMatch(
			c,
			organizationId,
			privateContext.organization.id
		);
		if (mismatchResponse) {
			return mismatchResponse;
		}

		return c.json(
			validateResponse(
				{
					id: privateContext.organization.id,
					name: privateContext.organization.name,
				},
				organizationResponseSchema
			),
			200
		);
	}
);

export const organizationRouter = app;
