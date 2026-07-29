import { generateUploadUrl } from "@api/services/upload";
import {
	safelyExtractRequestData,
	validateResponse,
} from "@api/utils/validate";
import { createUploadSignUrlRoute } from "@cossistant/protocol/routes";
import {
	generateUploadUrlRequestSchema,
	generateUploadUrlResponseSchema,
} from "@cossistant/types/api/upload";
import { OpenAPIHono, z } from "@hono/zod-openapi";
import { protectedPublicApiKeyMiddleware } from "../middleware";
import { errorJsonResponse, runtimeDualAuth } from "../openapi";
import type { RestContext } from "../types";

export const uploadRouter = new OpenAPIHono<RestContext>();

uploadRouter.use("/*", ...protectedPublicApiKeyMiddleware);

uploadRouter.openapi(createUploadSignUrlRoute, async (c) => {
	const { body, organization, website } = await safelyExtractRequestData(
		c,
		generateUploadUrlRequestSchema
	);

	if (!organization) {
		return c.json(
			validateResponse(
				{ error: "Organization context not found for API key" },
				z.object({ error: z.string() })
			),
			400
		);
	}

	if (body.scope.organizationId !== organization.id) {
		return c.json(
			validateResponse(
				{
					error:
						"Scope organization does not match the API key organization context",
				},
				z.object({ error: z.string() })
			),
			400
		);
	}

	if (website && body.scope.websiteId !== website.id) {
		return c.json(
			validateResponse(
				{
					error: "Scope website does not match the API key website context",
				},
				z.object({ error: z.string() })
			),
			400
		);
	}

	const result = await generateUploadUrl({
		contentType: body.contentType,
		fileName: body.fileName,
		fileExtension: body.fileExtension,
		path: body.path,
		scope: body.scope,
		useCdn: body.useCdn,
		expiresInSeconds: body.expiresInSeconds,
	});

	return c.json(validateResponse(result, generateUploadUrlResponseSchema), 200);
});
