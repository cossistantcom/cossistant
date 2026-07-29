import {
	createKnowledge,
	deleteKnowledge,
	getKnowledgeById,
	getKnowledgeCountByType,
	getTotalKnowledgeSizeBytes,
	listKnowledge,
	updateKnowledge,
} from "@api/db/queries/knowledge";
import { syncLinkSourceStatsFromKnowledge } from "@api/db/queries/link-source";
import { getPlanForWebsite } from "@api/lib/plans/access";
import { searchSupportKnowledge } from "@api/support-capabilities";
import {
	safelyExtractRequestData,
	safelyExtractRequestQuery,
	validateResponse,
} from "@api/utils/validate";
import {
	createKnowledgeRoute,
	deleteKnowledgeRoute,
	getKnowledgeRoute,
	listKnowledgeRoute,
	searchKnowledgeRoute,
	updateKnowledgeRoute,
} from "@cossistant/protocol/routes";
import {
	type CreateKnowledgeRestRequest,
	createKnowledgeRestRequestSchema,
	type KnowledgeResponse,
	knowledgeResponseSchema,
	knowledgeSearchRequestSchema,
	knowledgeSearchResponseSchema,
	listKnowledgeResponseSchema,
	listKnowledgeRestRequestSchema,
	type UpdateKnowledgeRestRequest,
	updateKnowledgeRestRequestSchema,
} from "@cossistant/types";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
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

function normalizeIsIncluded(
	value: "true" | "false" | undefined
): boolean | undefined {
	if (value === undefined) {
		return;
	}

	return value === "true";
}

function toNumericLimit(value: number | boolean | null): number | null {
	if (value === null || value === true) {
		return null;
	}

	if (value === false) {
		return 0;
	}

	return value;
}

function getErrorCodeForStatus(status: number): string {
	switch (status) {
		case 400:
			return "BAD_REQUEST";
		case 401:
			return "UNAUTHORIZED";
		case 403:
			return "FORBIDDEN";
		case 404:
			return "NOT_FOUND";
		case 409:
			return "CONFLICT";
		case 429:
			return "TOO_MANY_REQUESTS";
		default:
			return "INTERNAL_SERVER_ERROR";
	}
}

function handleKnowledgeRouterError(
	c: Context<RestContext>,
	error: unknown,
	fallbackMessage: string
) {
	if (error instanceof HTTPException) {
		return c.json(
			{
				error: getErrorCodeForStatus(error.status),
				message: error.message,
			},
			error.status as 400 | 401 | 403 | 404 | 409 | 429 | 500
		);
	}

	console.error(fallbackMessage, error);
	return c.json(
		{
			error: "INTERNAL_SERVER_ERROR",
			message: fallbackMessage,
		},
		500
	);
}

async function enforceKnowledgeCreateLimits(params: {
	db: RestContext["Variables"]["db"];
	website: RestContext["Variables"]["website"];
	body: CreateKnowledgeRestRequest;
}) {
	const planInfo = await getPlanForWebsite(params.website);

	if (params.body.type === "faq") {
		const faqLimit = toNumericLimit(
			planInfo.features["ai-agent-training-faqs"]
		);
		if (faqLimit !== null) {
			const currentCount = await getKnowledgeCountByType(params.db, {
				websiteId: params.website.id,
				aiAgentId: params.body.aiAgentId ?? null,
				type: "faq",
			});

			if (currentCount >= faqLimit) {
				throw new HTTPException(403, {
					message: `You have reached the limit of ${faqLimit} FAQs for your plan. Please upgrade to add more.`,
				});
			}
		}
	} else if (params.body.type === "article") {
		const fileLimit = toNumericLimit(
			planInfo.features["ai-agent-training-files"]
		);
		if (fileLimit !== null) {
			const currentCount = await getKnowledgeCountByType(params.db, {
				websiteId: params.website.id,
				aiAgentId: params.body.aiAgentId ?? null,
				type: "article",
			});

			if (currentCount >= fileLimit) {
				throw new HTTPException(403, {
					message: `You have reached the limit of ${fileLimit} files for your plan. Please upgrade to add more.`,
				});
			}
		}
	}

	const sizeLimitMb = toNumericLimit(planInfo.features["ai-agent-training-mb"]);
	if (sizeLimitMb !== null) {
		const sizeLimitBytes = sizeLimitMb * 1024 * 1024;
		const currentSize = await getTotalKnowledgeSizeBytes(params.db, {
			websiteId: params.website.id,
			aiAgentId: params.body.aiAgentId ?? null,
		});
		const newEntrySize = new TextEncoder().encode(
			JSON.stringify(params.body.payload)
		).length;

		if (currentSize + newEntrySize > sizeLimitBytes) {
			throw new HTTPException(403, {
				message: `Adding this entry would exceed your ${sizeLimitMb}MB knowledge base limit. Please upgrade for more storage.`,
			});
		}
	}
}

async function enforceKnowledgeUpdateSizeLimit(params: {
	db: RestContext["Variables"]["db"];
	website: RestContext["Variables"]["website"];
	existingEntry: Awaited<ReturnType<typeof getKnowledgeById>>;
	body: UpdateKnowledgeRestRequest;
}) {
	if (!params.existingEntry) {
		return;
	}

	if (
		params.body.payload === undefined &&
		params.body.aiAgentId === undefined
	) {
		return;
	}

	const planInfo = await getPlanForWebsite(params.website);
	const sizeLimitMb = toNumericLimit(planInfo.features["ai-agent-training-mb"]);
	if (sizeLimitMb === null) {
		return;
	}

	const targetAiAgentId =
		params.body.aiAgentId !== undefined
			? params.body.aiAgentId
			: params.existingEntry.aiAgentId;
	const nextSizeBytes =
		params.body.payload !== undefined
			? new TextEncoder().encode(JSON.stringify(params.body.payload)).length
			: params.existingEntry.sizeBytes;
	const currentScopedSize = await getTotalKnowledgeSizeBytes(params.db, {
		websiteId: params.website.id,
		aiAgentId: targetAiAgentId ?? null,
	});
	const sizeLimitBytes = sizeLimitMb * 1024 * 1024;
	const adjustedSize =
		targetAiAgentId === params.existingEntry.aiAgentId
			? currentScopedSize - params.existingEntry.sizeBytes + nextSizeBytes
			: currentScopedSize + nextSizeBytes;

	if (adjustedSize > sizeLimitBytes) {
		throw new HTTPException(403, {
			message: `Updating this entry would exceed your ${sizeLimitMb}MB knowledge base limit. Please upgrade for more storage.`,
		});
	}
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
knowledgeRouter.openapi(listKnowledgeRoute, async (c) => {
	try {
		const { db, website, query } = await safelyExtractRequestQuery(
			c,
			listKnowledgeRestRequestSchema
		);

		if (!(website?.id && website.organizationId)) {
			return c.json({ error: "UNAUTHORIZED", message: "Invalid API key" }, 401);
		}

		const aiAgentId = normalizeAiAgentId(query.aiAgentId);
		const isIncluded = normalizeIsIncluded(query.isIncluded);

		const result = await listKnowledge(db, {
			organizationId: website.organizationId,
			websiteId: website.id,
			type: query.type,
			aiAgentId,
			isIncluded,
			linkSourceId: query.linkSourceId,
			page: query.page,
			limit: query.limit,
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
		return handleKnowledgeRouterError(
			c,
			error,
			"Failed to list knowledge entries"
		) as never;
	}
});

knowledgeRouter.openapi(searchKnowledgeRoute, async (c) => {
	try {
		const { db, website, query } = await safelyExtractRequestQuery(
			c,
			knowledgeSearchRequestSchema
		);

		if (!(website?.id && website.organizationId)) {
			return c.json({ error: "UNAUTHORIZED", message: "Invalid API key" }, 401);
		}

		const response = await searchSupportKnowledge(db, {
			website,
			query: query.query,
			knowledgeId: query.knowledgeId,
			limit: query.limit,
			minSimilarity: query.minSimilarity,
		});

		return c.json(
			validateResponse(response, knowledgeSearchResponseSchema),
			200
		);
	} catch (error) {
		return handleKnowledgeRouterError(
			c,
			error,
			"Failed to search knowledge"
		) as never;
	}
});

// GET /knowledge/:id - Get a single knowledge entry
knowledgeRouter.openapi(getKnowledgeRoute, async (c) => {
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
			return c.json({ error: "UNAUTHORIZED", message: "Invalid API key" }, 401);
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
			validateResponse(formatKnowledgeResponse(entry), knowledgeResponseSchema),
			200
		);
	} catch (error) {
		return handleKnowledgeRouterError(
			c,
			error,
			"Failed to fetch knowledge entry"
		) as never;
	}
});

// POST /knowledge - Create a new knowledge entry
knowledgeRouter.openapi(createKnowledgeRoute, async (c) => {
	try {
		const { db, website, apiKey, body } = await safelyExtractRequestData(
			c,
			createKnowledgeRestRequestSchema
		);

		if (!(website?.id && website.organizationId)) {
			return c.json({ error: "UNAUTHORIZED", message: "Invalid API key" }, 401);
		}

		await enforceKnowledgeCreateLimits({
			db,
			website,
			body,
		});

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
			validateResponse(formatKnowledgeResponse(entry), knowledgeResponseSchema),
			201
		);
	} catch (error) {
		return handleKnowledgeRouterError(
			c,
			error,
			"Failed to create knowledge entry"
		) as never;
	}
});

// PATCH /knowledge/:id - Update a knowledge entry
knowledgeRouter.openapi(updateKnowledgeRoute, async (c) => {
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
			return c.json({ error: "UNAUTHORIZED", message: "Invalid API key" }, 401);
		}

		const existingEntry = await getKnowledgeById(db, {
			id,
			websiteId: website.id,
		});

		if (!existingEntry) {
			return c.json(
				{ error: "NOT_FOUND", message: "Knowledge entry not found" },
				404
			);
		}

		await enforceKnowledgeUpdateSizeLimit({
			db,
			website,
			existingEntry,
			body,
		});

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
			validateResponse(formatKnowledgeResponse(entry), knowledgeResponseSchema),
			200
		);
	} catch (error) {
		return handleKnowledgeRouterError(
			c,
			error,
			"Failed to update knowledge entry"
		) as never;
	}
});

// DELETE /knowledge/:id - Delete a knowledge entry
knowledgeRouter.openapi(deleteKnowledgeRoute, async (c) => {
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
			return c.json({ error: "UNAUTHORIZED", message: "Invalid API key" }, 401);
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
		return handleKnowledgeRouterError(
			c,
			error,
			"Failed to delete knowledge entry"
		) as never;
	}
});
