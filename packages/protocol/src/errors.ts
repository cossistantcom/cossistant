import { z } from "@hono/zod-openapi";

export const restErrorResponseSchema = z.object({
	error: z.string(),
	message: z.string().optional(),
});

/**
 * Shared error response declaration.
 *
 * The return type is deliberately left inferred: annotating it as
 * `ResponseConfig` collapses the schema property and every 4xx response in
 * every route descriptor loses its content typing.
 */
export function errorJsonResponse(description: string) {
	return {
		description,
		content: {
			"application/json": {
				schema: restErrorResponseSchema,
			},
		},
	};
}
