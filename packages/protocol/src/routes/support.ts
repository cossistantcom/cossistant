import {
	supportFeatureFlagMutationRequestSchema,
	supportFeatureFlagMutationResponseSchema,
	supportOnboardingUpdateRequestSchema,
	supportStateResponseSchema,
} from "@cossistant/types/api/support";
import { createRoute } from "@hono/zod-openapi";
import { privateControlAuth, runtimeDualAuth } from "../auth";
import { errorJsonResponse } from "../errors";

export const getSupportStateRoute = createRoute({
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
});

export const updateSupportOnboardingRoute = createRoute({
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
});

export const updateSupportFeatureFlagsRoute = createRoute({
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
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse("Forbidden - Private API key required"),
		404: errorJsonResponse("Target not found"),
	},
	...privateControlAuth(),
});

/** Public-key runtime routes (`supportRuntimeRouter` in apps/api). */
export const SUPPORT_RUNTIME_ROUTES = [
	getSupportStateRoute,
	updateSupportOnboardingRoute,
] as const;

/** Private-key control routes (`supportControlRouter` in apps/api). */
export const SUPPORT_CONTROL_ROUTES = [updateSupportFeatureFlagsRoute] as const;
