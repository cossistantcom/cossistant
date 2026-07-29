import {
	generateUploadUrlRequestSchema,
	generateUploadUrlResponseSchema,
} from "@cossistant/types/api/upload";
import { createRoute } from "@hono/zod-openapi";
import { runtimeDualAuth } from "../auth";
import { errorJsonResponse } from "../errors";

export const createUploadSignUrlRoute = createRoute({
	method: "post",
	path: "/sign-url",
	summary: "Generate a signed S3 upload URL",
	description:
		"Creates a temporary signed URL that can be used to upload a file directly to the configured S3 bucket.",
	tags: ["Uploads"],
	request: {
		body: {
			required: true,
			content: {
				"application/json": {
					schema: generateUploadUrlRequestSchema,
				},
			},
		},
	},
	responses: {
		200: {
			description: "Signed URL generated successfully",
			content: {
				"application/json": {
					schema: generateUploadUrlResponseSchema,
				},
			},
		},
		400: errorJsonResponse("Invalid request"),
		401: errorJsonResponse("Unauthorized - Invalid or missing API key"),
		403: errorJsonResponse("Forbidden - Public key origin validation failed"),
	},
	...runtimeDualAuth(),
});

export const UPLOAD_ROUTES = [createUploadSignUrlRoute] as const;
