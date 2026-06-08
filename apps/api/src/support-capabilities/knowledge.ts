import type { Database } from "@api/db";
import { findSimilarKnowledge } from "@api/db/queries/vector-search";
import type { WebsiteSelect } from "@api/db/schema";
import {
	type KnowledgeSearchRequest,
	type KnowledgeSearchResponse,
	knowledgeSearchResponseSchema,
} from "@cossistant/types";
import { SupportCapabilityError } from "./errors";
import {
	resolveSupportWebsiteScope,
	type SupportWebsiteSelector,
} from "./website-scope";

const KNOWLEDGE_SNIPPET_MAX_LENGTH = 360;

function clipText(value: string, maxLength?: number | null): string {
	if (!maxLength || value.length <= maxLength) {
		return value;
	}

	return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

export function createKnowledgeSearchSnippet(content: string): string {
	const normalized = content.replace(/\s+/g, " ").trim();
	return clipText(normalized, KNOWLEDGE_SNIPPET_MAX_LENGTH);
}

export function getStringMetadataValue(
	metadata: unknown,
	keys: string[]
): string | null {
	if (!metadata || typeof metadata !== "object") {
		return null;
	}

	const record = metadata as Record<string, unknown>;
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.trim().length > 0) {
			return value;
		}
	}

	return null;
}

export function getRetrievalQuality(maxSimilarity: number | null) {
	if (maxSimilarity === null) {
		return "none" as const;
	}
	if (maxSimilarity >= 0.78) {
		return "high" as const;
	}
	if (maxSimilarity >= 0.55) {
		return "medium" as const;
	}
	return "low" as const;
}

export async function searchSupportKnowledge(
	db: Database,
	params: Partial<SupportWebsiteSelector> &
		KnowledgeSearchRequest & {
			userId?: string;
			website?: WebsiteSelect;
			maxContentLength?: number | null;
		}
): Promise<KnowledgeSearchResponse> {
	if (!(params.website || params.userId)) {
		throw new SupportCapabilityError(
			401,
			"UNAUTHORIZED",
			"Signed-in user is required"
		);
	}

	const site =
		params.website ??
		(await resolveSupportWebsiteScope(db, {
			userId: params.userId as string,
			websiteId: params.websiteId,
			websiteName: params.websiteName,
		}));

	const limit = Math.min(Math.max(params.limit ?? 4, 1), 20);
	const results = await findSimilarKnowledge(db, params.query, site.id, {
		knowledgeId: params.knowledgeId,
		limit,
		minSimilarity: params.minSimilarity,
	});
	const maxSimilarity = results[0]?.similarity ?? null;
	const response = {
		query: params.query,
		results: results.map((result) => ({
			id: result.id,
			content: clipText(result.content, params.maxContentLength),
			snippet: createKnowledgeSearchSnippet(result.content),
			metadata: result.metadata ?? null,
			similarity: Number(result.similarity),
			sourceType: result.sourceType,
			knowledgeId: result.knowledgeId,
			visitorId: result.visitorId,
			contactId: result.contactId,
			chunkIndex: result.chunkIndex,
			title:
				result.sourceTitle ??
				getStringMetadataValue(result.metadata, [
					"title",
					"sourceTitle",
					"question",
				]),
			sourceUrl:
				result.sourceUrl ??
				getStringMetadataValue(result.metadata, ["sourceUrl", "url"]),
		})),
		totalFound: results.length,
		maxSimilarity,
		retrievalQuality: getRetrievalQuality(maxSimilarity),
	};

	return knowledgeSearchResponseSchema.parse(response);
}
