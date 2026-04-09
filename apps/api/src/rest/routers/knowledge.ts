import {
	createKnowledge,
	deleteKnowledge,
	getKnowledgeById,
	listKnowledge,
	updateKnowledge,
} from "@api/db/queries/knowledge";
import { syncLinkSourceStatsFromKnowledge } from "@api/db/queries/link-source";
import {
	safelyExtractRequestData,
	validateResponse,
} from "@api/utils/validate";
import {
	createKnowledgeRestRequestSchema,
	type KnowledgeResponse,
	knowledgeResponseSchema,
	listKnowledgeResponseSchema,
	listKnowledgeRestRequestSchema,
	updateKnowledgeRestRequestSchema,
} from "@plasma/types";
import { OpenAPIHono, z } from "@hono/zod-openapi";
import { protectedPrivateApiKeyMiddleware } from "../middleware";
import { errorJsonResponse, privateControlAuth } from "../openapi";
import type { RestContext } from "../types";

export const knowledgeRouter = new OpenAPIHono<RestContext>();

// Apply private API key middleware to all routes - knowledge management is sensitive
knowledgeRouter.use("/*", ...protectedPrivateApiKeyMiddleware);

/**
 * Normalizes an aiAgentId query parameter value to either a valid ULID string or null.
 * Treats undefined, null, empty string, and the literal string "null" as actual null.
 */
function normalizeAiAgentId(value: string | null | undefined): string | null {
	if (
		value === undefined ||
		value === null ||
		value === "" ||
		value === "null"
	) {
		return null;
	}
	return value;
}

const VALID_KNOWLEDGE_TYPES = ["url", "faq", "article"] as const;
type KnowledgeType = (typeof VALID_KNOWLEDGE_TYPES)[number];

/**
 * Validates and parses the 'type' query parameter.
 * Returns the type if valid, undefined if not provided, or an error message if invalid.
 */
function parseKnowledgeType(
	value: string | undefined
): { value: KnowledgeType | undefined } | { error: string } {
	if (value === undefined || value === "") {
		return { value: undefined };
	}
	if (VALID_KNOWLEDGE_TYPES.includes(value as KnowledgeType)) {
		return { value: value as KnowledgeType };
	}
	return {
		error: `Invalid type '${value}'. Must be one of: ${VALID_KNOWLEDGE_TYPES.join(", ")}`,
	};
}

/**
 * Parses a numeric query parameter with defaults and bounds.
 * Returns the default if the value is undefined, empty, NaN, or out of bounds.
 */
function parsePositiveInt(
	value: string | undefined,
	defaultValue: number,
	max?: number
): number {
	if (value === undefined || value === "") {
		return defaultValue;
	}
	const parsed = Number.parseInt(value, 10);
	if (Number.isNaN(parsed) || parsed <= 0) {
		return defaultValue;
	}
	if (max !== undefined && parsed > max) {
		return max;
	}
	return parsed;
}

function formatKnowledgeResponse(entry: {
	id: string;
	organizationId: string;
	websiteId: string;
	aiAgentId: string | null;
	linkSourceId: string | null;
	type: "url" | "faq" | "article";
	sourceUrl: string | null;
	sourceTitle: string | null;
	origin: string;
	createdBy: string;
	contentHash: string;
	payload: unknown;
	metadata: unknown;
	isIncluded: boolean;
	sizeBytes: number;
	createdAt: string;
	updatedAt: string;
	deletedAt: string | null;
}): KnowledgeResponse {
	return {
		id: entry.id,
		organizationId: entry.organizationId,
		websiteId: entry.websiteId,
		aiAgentId: entry.aiAgentId,
		linkSourceId: entry.linkSourceId,
		type: entry.type,
		sourceUrl: entry.sourceUrl,
		sourceTitle: entry.sourceTitle,
		origin: entry.origin,
		createdBy: entry.createdBy,
		contentHash: entry.contentHash,
		payload: entry.payload as KnowledgeResponse["payload"],
		metadata: entry.metadata as KnowledgeResponse["metadata"],
		isIncluded: entry.isIncluded,
		sizeBytes: entry.sizeBytes,
		createdAt: entry.createdAt,
		updatedAt: entry.updatedAt,
		deletedAt: entry.deletedAt,
	};
}

// GET /knowledge - List knowledge entries with filters and pagination
knowledgeRouter.openapi(
	{
		method: "get",
		path: "/",
		summary: "List knowledge entries",
		description:
			"Returns a paginated list of knowledge entries for the website. Supports filtering by type and AI agent ID.",
		request: {
			query: listKnowledgeRestRequestSchema,
		},
		responses: {
			200: {
				description: "Knowledge entries retrieved successfully",
				content: {
					"application/json": {
						schema: listKnowledgeResponseSchema,
					},
				},
			},
			400: errorJsonResponse("Bad request - Invalid query parameters"),
			401: errorJsonResponse(
				"Unauthorized - Invalid or missing private API key"
			),
			500: errorJsonResponse("Internal server error"),
		},
		tags: ["Knowledge"],
		...privateControlAuth(),
	},
	async (c) => {
		try {
			const { db, website } = await safelyExtractRequestData(c);

			if (!(website?.id && website.organizationId)) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "Invalid API key" },
					401
				);
			}

			// Parse and validate query parameters
			const query = c.req.query();

			const typeResult = parseKnowledgeType(query.type);
			if ("error" in typeResult) {
				return c.json({ error: "BAD_REQUEST", message: typeResult.error }, 400);
			}

			const aiAgentId = normalizeAiAgentId(query.aiAgentId);
			const page = parsePositiveInt(query.page, 1);
			const limit = parsePositiveInt(query.limit, 20, 100);

			const result = await listKnowledge(db, {
				organizationId: website.organizationId,
				websiteId: website.id,
				type: typeResult.value,
				aiAgentId,
				page,
				limit,
			});

			return c.json(
				validateResponse(
					{
						items: result.items.map(formatKnowledgeResponse),
						pagination: result.pagination,
					},
					listKnowledgeResponseSchema
				),
				200
			);
		} catch (error) {
			console.error("Error listing knowledge:", error);
			return c.json(
				{
					error: "INTERNAL_SERVER_ERROR",
					message: "Failed to list knowledge entries",
				},
				500
			);
		}
	}
);

// GET /knowledge/:id - Get a single knowledge entry
knowledgeRouter.openapi(
	{
		method: "get",
		path: "/:id",
		summary: "Get a knowledge entry",
		description: "Retrieves a single knowledge entry by ID",
		responses: {
			200: {
				description: "Knowledge entry retrieved successfully",
				content: {
					"application/json": {
						schema: knowledgeResponseSchema,
					},
				},
			},
			401: errorJsonResponse(
				"Unauthorized - Invalid or missing private API key"
			),
			404: errorJsonResponse("Knowledge entry not found"),
			500: errorJsonResponse("Internal server error"),
		},
		tags: ["Knowledge"],
		...privateControlAuth({
			parameters: [
				{
					name: "id",
					in: "path",
					required: true,
					description: "The knowledge entry ID",
					schema: {
						type: "string",
					},
				},
			],
		}),
	},
	async (c) => {
		try {
			const { db, website } = await safelyExtractRequestData(c);
			const id = c.req.param("id");

			if (!id) {
				return c.json(
					{ error: "NOT_FOUND", message: "Knowledge entry not found" },
					404
				);
			}

			if (!website?.id) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "Invalid API key" },
					401
				);
			}

			const entry = await getKnowledgeById(db, {
				id,
				websiteId: website.id,
			});

			if (!entry) {
				return c.json(
					{ error: "NOT_FOUND", message: "Knowledge entry not found" },
					404
				);
			}

			return c.json(
				validateResponse(
					formatKnowledgeResponse(entry),
					knowledgeResponseSchema
				),
				200
			);
		} catch (error) {
			console.error("Error fetching knowledge:", error);
			return c.json(
				{
					error: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch knowledge entry",
				},
				500
			);
		}
	}
);

// POST /knowledge - Create a new knowledge entry
knowledgeRouter.openapi(
	{
		method: "post",
		path: "/",
		summary: "Create a knowledge entry",
		description: "Creates a new knowledge entry for the website",
		request: {
			body: {
				content: {
					"application/json": {
						schema: createKnowledgeRestRequestSchema,
					},
				},
			},
		},
		responses: {
			201: {
				description: "Knowledge entry created successfully",
				content: {
					"application/json": {
						schema: knowledgeResponseSchema,
					},
				},
			},
			400: errorJsonResponse("Invalid request data"),
			401: errorJsonResponse(
				"Unauthorized - Invalid or missing private API key"
			),
			500: errorJsonResponse("Internal server error"),
		},
		tags: ["Knowledge"],
		...privateControlAuth(),
	},
	async (c) => {
		try {
			const { db, website, apiKey, body } = await safelyExtractRequestData(
				c,
				createKnowledgeRestRequestSchema
			);

			if (!(website?.id && website.organizationId)) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "Invalid API key" },
					401
				);
			}

			const entry = await createKnowledge(db, {
				organizationId: website.organizationId,
				websiteId: website.id,
				aiAgentId: body.aiAgentId ?? null,
				type: body.type,
				sourceUrl: body.sourceUrl ?? null,
				sourceTitle: body.sourceTitle ?? null,
				origin: body.origin,
				createdBy: `api_key_${apiKey.id}`,
				payload: body.payload,
				metadata: body.metadata ?? null,
			});

			return c.json(
				validateResponse(
					formatKnowledgeResponse(entry),
					knowledgeResponseSchema
				),
				201
			);
		} catch (error) {
			console.error("Error creating knowledge:", error);
			return c.json(
				{
					error: "INTERNAL_SERVER_ERROR",
					message: "Failed to create knowledge entry",
				},
				500
			);
		}
	}
);

// PATCH /knowledge/:id - Update a knowledge entry
knowledgeRouter.openapi(
	{
		method: "patch",
		path: "/:id",
		summary: "Update a knowledge entry",
		description: "Updates an existing knowledge entry",
		request: {
			body: {
				content: {
					"application/json": {
						schema: updateKnowledgeRestRequestSchema,
					},
				},
			},
		},
		responses: {
			200: {
				description: "Knowledge entry updated successfully",
				content: {
					"application/json": {
						schema: knowledgeResponseSchema,
					},
				},
			},
			400: errorJsonResponse("Invalid request data"),
			401: errorJsonResponse(
				"Unauthorized - Invalid or missing private API key"
			),
			404: errorJsonResponse("Knowledge entry not found"),
			500: errorJsonResponse("Internal server error"),
		},
		tags: ["Knowledge"],
		...privateControlAuth({
			parameters: [
				{
					name: "id",
					in: "path",
					required: true,
					description: "The knowledge entry ID",
					schema: {
						type: "string",
					},
				},
			],
		}),
	},
	async (c) => {
		try {
			const { db, website, body } = await safelyExtractRequestData(
				c,
				updateKnowledgeRestRequestSchema
			);
			const id = c.req.param("id");

			if (!id) {
				return c.json(
					{ error: "NOT_FOUND", message: "Knowledge entry not found" },
					404
				);
			}

			if (!website?.id) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "Invalid API key" },
					401
				);
			}

			const entry = await updateKnowledge(db, {
				id,
				websiteId: website.id,
				aiAgentId: body.aiAgentId,
				sourceUrl: body.sourceUrl,
				sourceTitle: body.sourceTitle,
				payload: body.payload,
				metadata: body.metadata,
			});

			if (!entry) {
				return c.json(
					{ error: "NOT_FOUND", message: "Knowledge entry not found" },
					404
				);
			}

			return c.json(
				validateResponse(
					formatKnowledgeResponse(entry),
					knowledgeResponseSchema
				),
				200
			);
		} catch (error) {
			console.error("Error updating knowledge:", error);
			return c.json(
				{
					error: "INTERNAL_SERVER_ERROR",
					message: "Failed to update knowledge entry",
				},
				500
			);
		}
	}
);

// DELETE /knowledge/:id - Delete a knowledge entry
knowledgeRouter.openapi(
	{
		method: "delete",
		path: "/:id",
		summary: "Delete a knowledge entry",
		description: "Soft deletes a knowledge entry",
		responses: {
			204: {
				description: "Knowledge entry deleted successfully",
			},
			401: errorJsonResponse(
				"Unauthorized - Invalid or missing private API key"
			),
			404: errorJsonResponse("Knowledge entry not found"),
			500: errorJsonResponse("Internal server error"),
		},
		tags: ["Knowledge"],
		...privateControlAuth({
			parameters: [
				{
					name: "id",
					in: "path",
					required: true,
					description: "The knowledge entry ID",
					schema: {
						type: "string",
					},
				},
			],
		}),
	},
	async (c) => {
		try {
			const { db, website } = await safelyExtractRequestData(c);
			const id = c.req.param("id");

			if (!id) {
				return c.json(
					{ error: "NOT_FOUND", message: "Knowledge entry not found" },
					404
				);
			}

			if (!website?.id) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "Invalid API key" },
					401
				);
			}

			const knowledgeEntry = await getKnowledgeById(db, {
				id,
				websiteId: website.id,
			});

			if (!knowledgeEntry) {
				return c.json(
					{ error: "NOT_FOUND", message: "Knowledge entry not found" },
					404
				);
			}

			const deleted = await deleteKnowledge(db, {
				id,
				websiteId: website.id,
			});

			if (!deleted) {
				return c.json(
					{ error: "NOT_FOUND", message: "Knowledge entry not found" },
					404
				);
			}

			if (knowledgeEntry.linkSourceId && knowledgeEntry.type === "url") {
				await syncLinkSourceStatsFromKnowledge(db, {
					id: knowledgeEntry.linkSourceId,
					websiteId: website.id,
				});
			}

			return c.body(null, 204);
		} catch (error) {
			console.error("Error deleting knowledge:", error);
			return c.json(
				{
					error: "INTERNAL_SERVER_ERROR",
					message: "Failed to delete knowledge entry",
				},
				500
			);
		}
	}
);
