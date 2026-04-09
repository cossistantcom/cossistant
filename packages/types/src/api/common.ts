import { z } from "@hono/zod-openapi";

/**
 * Common validation schemas used across multiple API endpoints
 */

const canonicalApiTimestampSchema = z.string().datetime({ precision: 3 });

function normalizeApiTimestampValue(value: unknown): unknown {
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? value : value.toISOString();
	}

	if (typeof value !== "string") {
		return value;
	}

	const normalizedDate = new Date(value);
	if (Number.isNaN(normalizedDate.getTime())) {
		return value;
	}

	return normalizedDate.toISOString();
}

/**
 * Canonical API timestamp schema for request payloads.
 * Accepts Date instances and parseable timestamp strings, then normalizes them
 * to RFC 3339 / ISO 8601 UTC with fixed millisecond precision.
 */
export const apiTimestampInputSchema = z
	.preprocess(normalizeApiTimestampValue, canonicalApiTimestampSchema)
	.openapi({
		description:
			"RFC 3339 / ISO 8601 timestamp in UTC with millisecond precision.",
		example: "2026-04-06T14:37:05.820Z",
	});

/**
 * Canonical API timestamp schema for response payloads.
 */
export const apiTimestampSchema = z
	.preprocess(normalizeApiTimestampValue, canonicalApiTimestampSchema)
	.openapi({
		description:
			"RFC 3339 / ISO 8601 timestamp in UTC with millisecond precision.",
		example: "2026-04-06T14:37:05.820Z",
	});

/**
 * Nullable variant of the canonical API timestamp schema.
 */
export const nullableApiTimestampSchema = z
	.preprocess(
		(value) => (value === null ? null : normalizeApiTimestampValue(value)),
		canonicalApiTimestampSchema.nullable()
	)
	.openapi({
		description:
			"RFC 3339 / ISO 8601 timestamp in UTC with millisecond precision, or null.",
		example: "2026-04-06T14:37:05.820Z",
	});

/**
 * Email validation schema
 */
export const emailSchema = z.email().openapi({
	description: "A valid email address.",
	example: "user@example.com",
});

/**
 * User ID validation schema
 */
export const userIdSchema = z.ulid().openapi({
	description: "A valid user identifier.",
	example: "01JG000000000000000000000",
});

/**
 * Optional user ID validation schema
 */
export const optionalUserIdSchema = z.ulid().optional().openapi({
	description: "An optional user identifier.",
	example: "01JG000000000000000000000",
});

/**
 * Common pagination schema
 */
export const paginationSchema = z.object({
	page: z.coerce.number().int().positive().default(1).openapi({
		description: "The page number to retrieve.",
		example: 1,
	}),
	limit: z.coerce.number().int().positive().max(100).default(20).openapi({
		description: "The number of items per page (max 100).",
		example: 20,
	}),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

/**
 * Pagination response schema
 */
export const paginationResponseSchema = z.object({
	page: z.number().int().positive().openapi({
		description: "The current page number.",
		example: 1,
	}),
	limit: z.number().int().positive().openapi({
		description: "The number of items per page.",
		example: 20,
	}),
	total: z.number().int().nonnegative().openapi({
		description: "The total number of items.",
		example: 100,
	}),
	hasMore: z.boolean().openapi({
		description: "Whether there are more items available.",
		example: true,
	}),
});

export type PaginationResponse = z.infer<typeof paginationResponseSchema>;
