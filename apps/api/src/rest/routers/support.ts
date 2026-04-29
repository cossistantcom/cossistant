import {
	getSupportStateForVisitor,
	listAffectedVisitorIdsForFeatureFlagTarget,
	mutateFeatureFlagsForTarget,
	updateOnboardingForVisitor,
} from "@api/db/queries/support";
import { emitSupportStateUpdated } from "@api/realtime/support-state";
import {
	safelyExtractRequestData,
	validateResponse,
} from "@api/utils/validate";
import {
	supportFeatureFlagMutationRequestSchema,
	supportFeatureFlagMutationResponseSchema,
	supportOnboardingUpdateRequestSchema,
	supportStateResponseSchema,
} from "@cossistant/types/api/support";
import { OpenAPIHono } from "@hono/zod-openapi";
import {
	protectedPrivateApiKeyMiddleware,
	protectedPublicApiKeyMiddleware,
} from "../middleware";
import {
	errorJsonResponse,
	privateControlAuth,
	requirePrivateControlContext,
	runtimeDualAuth,
} from "../openapi";
import type { RestContext } from "../types";

const supportRuntimeRouter = new OpenAPIHono<RestContext>();
const supportControlRouter = new OpenAPIHono<RestContext>();

supportRuntimeRouter.use("/*", ...protectedPublicApiKeyMiddleware);
supportControlRouter.use("/*", ...protectedPrivateApiKeyMiddleware);

supportRuntimeRouter.openapi(
	{
		method: "get",
		path: "/state",
		summary: "Get support state",
		description:
			"Returns resolved feature flags and onboarding progress for the current visitor.",
		tags: ["Support"],
		responses: {
			200: {
				description: "Support state retrieved successfully",
				content: {
					"application/json": {
						schema: supportStateResponseSchema,
					},
				},
			},
			400: errorJsonResponse("Visitor ID is required"),
			401: errorJsonResponse("Unauthorized - Invalid API key"),
			404: errorJsonResponse("Visitor not found"),
		},
		...runtimeDualAuth({ includeVisitorIdHeader: true }),
	},
	async (c) => {
		const { db, website, visitorIdHeader } = await safelyExtractRequestData(c);

		if (!visitorIdHeader) {
			return c.json(
				{ error: "BAD_REQUEST", message: "Visitor ID is required" },
				400
			);
		}

		const state = await getSupportStateForVisitor(db, {
			websiteId: website.id,
			visitorId: visitorIdHeader,
		});

		if (!state) {
			return c.json({ error: "NOT_FOUND", message: "Visitor not found" }, 404);
		}

		return c.json(validateResponse(state, supportStateResponseSchema), 200);
	}
);

supportRuntimeRouter.openapi(
	{
		method: "patch",
		path: "/onboarding",
		summary: "Update onboarding state",
		description:
			"Updates onboarding progress or metadata for the current visitor/contact.",
		tags: ["Support"],
		request: {
			body: {
				content: {
					"application/json": {
						schema: supportOnboardingUpdateRequestSchema,
					},
				},
			},
		},
		responses: {
			200: {
				description: "Onboarding state updated successfully",
				content: {
					"application/json": {
						schema: supportStateResponseSchema,
					},
				},
			},
			400: errorJsonResponse("Invalid request data"),
			401: errorJsonResponse("Unauthorized - Invalid API key"),
			404: errorJsonResponse("Visitor not found"),
		},
		...runtimeDualAuth({ includeVisitorIdHeader: true }),
	},
	async (c) => {
		const { db, website, organization, body, visitorIdHeader } =
			await safelyExtractRequestData(c, supportOnboardingUpdateRequestSchema);

		if (!visitorIdHeader) {
			return c.json(
				{ error: "BAD_REQUEST", message: "Visitor ID is required" },
				400
			);
		}

		const state = await updateOnboardingForVisitor(db, {
			websiteId: website.id,
			visitorId: visitorIdHeader,
			update: body,
		});

		if (!state) {
			return c.json({ error: "NOT_FOUND", message: "Visitor not found" }, 404);
		}

		await emitSupportStateUpdated({
			db,
			websiteId: website.id,
			organizationId: organization.id,
			visitorId: visitorIdHeader,
			state,
		});

		return c.json(validateResponse(state, supportStateResponseSchema), 200);
	}
);

supportControlRouter.openapi(
	{
		method: "patch",
		path: "/feature-flags",
		summary: "Mutate feature flags",
		description:
			"Adds, removes, or replaces feature flags on a visitor, contact, or contact organization.",
		tags: ["Support"],
		request: {
			body: {
				content: {
					"application/json": {
						schema: supportFeatureFlagMutationRequestSchema,
					},
				},
			},
		},
		responses: {
			200: {
				description: "Feature flags updated successfully",
				content: {
					"application/json": {
						schema: supportFeatureFlagMutationResponseSchema,
					},
				},
			},
			401: errorJsonResponse(
				"Unauthorized - Invalid or missing private API key"
			),
			403: errorJsonResponse("Forbidden - Private API key required"),
			404: errorJsonResponse("Target not found"),
		},
		...privateControlAuth(),
	},
	async (c) => {
		const context = await safelyExtractRequestData(
			c,
			supportFeatureFlagMutationRequestSchema
		);
		const privateContext = requirePrivateControlContext(c, context);

		if (privateContext instanceof Response) {
			return privateContext;
		}

		const flags = await mutateFeatureFlagsForTarget(context.db, {
			websiteId: privateContext.website.id,
			organizationId: privateContext.organization.id,
			request: context.body,
		});

		if (!flags) {
			return c.json({ error: "NOT_FOUND", message: "Target not found" }, 404);
		}

		const affectedVisitorIds = await listAffectedVisitorIdsForFeatureFlagTarget(
			context.db,
			{
				websiteId: privateContext.website.id,
				organizationId: privateContext.organization.id,
				target: context.body.target,
			}
		);

		await Promise.all(
			affectedVisitorIds.map((visitorId) =>
				emitSupportStateUpdated({
					db: context.db,
					websiteId: privateContext.website.id,
					organizationId: privateContext.organization.id,
					visitorId,
				})
			)
		);

		return c.json(
			validateResponse(
				{
					target: context.body.target,
					flags,
				},
				supportFeatureFlagMutationResponseSchema
			),
			200
		);
	}
);

export const supportRouter = new OpenAPIHono<RestContext>()
	.route("/", supportRuntimeRouter)
	.route("/", supportControlRouter);
