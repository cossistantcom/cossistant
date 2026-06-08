import type { Database } from "@api/db";
import { generateEmbedding } from "@api/lib/embedding-client";
import { and, cosineDistance, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { chunk, knowledge } from "../schema";

export type SourceType = "knowledge" | "visitor_memory" | "contact_memory";

export type VectorSearchOptions = {
	/** The website ID to search within (required for data isolation) */
	websiteId: string;
	/** Filter by source type */
	sourceType?: SourceType;
	/** Filter by visitor ID (for visitor memories) */
	visitorId?: string;
	/** Filter by contact ID (for contact memories) */
	contactId?: string;
	/** Filter by knowledge ID (for knowledge chunks) */
	knowledgeId?: string;
	/** Minimum similarity score (0-1, default: 0.3) */
	minSimilarity?: number;
	/** Maximum number of results (default: 10) */
	limit?: number;
};

export type ChunkSearchResult = {
	id: string;
	content: string;
	metadata: unknown;
	similarity: number;
	sourceType: string;
	knowledgeId: string | null;
	visitorId: string | null;
	contactId: string | null;
	chunkIndex: number | null;
	sourceTitle?: string | null;
	sourceUrl?: string | null;
};

/**
 * Find similar chunks using vector similarity search.
 *
 * @param db - The database instance
 * @param query - The search query text
 * @param options - Search options
 * @returns Array of similar chunks with their similarity scores
 */
export async function findSimilarChunks(
	db: Database,
	query: string,
	options: VectorSearchOptions
): Promise<ChunkSearchResult[]> {
	const {
		websiteId,
		sourceType,
		visitorId,
		contactId,
		knowledgeId,
		minSimilarity = 0.3,
		limit = 10,
	} = options;

	// Generate embedding for the query
	const queryEmbedding = await generateEmbedding(query);

	// Calculate similarity using cosine distance
	// Similarity = 1 - cosine_distance
	const similarity = sql<number>`1 - (${cosineDistance(chunk.embedding, queryEmbedding)})`;

	// Build the where conditions
	const conditions = [
		eq(chunk.websiteId, websiteId),
		gt(similarity, minSimilarity),
	];

	if (sourceType) {
		conditions.push(eq(chunk.sourceType, sourceType));
	}

	if (visitorId) {
		conditions.push(eq(chunk.visitorId, visitorId));
	}

	if (contactId) {
		conditions.push(eq(chunk.contactId, contactId));
	}

	if (knowledgeId) {
		conditions.push(eq(chunk.knowledgeId, knowledgeId));
	}

	// Execute the query
	const results = await db
		.select({
			id: chunk.id,
			content: chunk.content,
			metadata: chunk.metadata,
			similarity,
			sourceType: chunk.sourceType,
			knowledgeId: chunk.knowledgeId,
			visitorId: chunk.visitorId,
			contactId: chunk.contactId,
			chunkIndex: chunk.chunkIndex,
		})
		.from(chunk)
		.where(and(...conditions))
		.orderBy(desc(similarity))
		.limit(limit);

	return results;
}

/**
 * Find similar knowledge chunks for a website.
 * Convenience wrapper for findSimilarChunks with sourceType='knowledge'.
 */
export async function findSimilarKnowledge(
	db: Database,
	query: string,
	websiteId: string,
	options?: Omit<VectorSearchOptions, "websiteId" | "sourceType">
): Promise<ChunkSearchResult[]> {
	const { knowledgeId, minSimilarity = 0.3, limit = 10 } = options ?? {};

	const queryEmbedding = await generateEmbedding(query);
	const similarity = sql<number>`1 - (${cosineDistance(chunk.embedding, queryEmbedding)})`;
	const conditions = [
		eq(chunk.websiteId, websiteId),
		eq(chunk.sourceType, "knowledge"),
		isNull(knowledge.deletedAt),
		gt(similarity, minSimilarity),
	];

	if (knowledgeId) {
		conditions.push(eq(chunk.knowledgeId, knowledgeId));
	}

	return db
		.select({
			id: chunk.id,
			content: chunk.content,
			metadata: chunk.metadata,
			similarity,
			sourceType: chunk.sourceType,
			knowledgeId: chunk.knowledgeId,
			visitorId: chunk.visitorId,
			contactId: chunk.contactId,
			chunkIndex: chunk.chunkIndex,
			sourceTitle: knowledge.sourceTitle,
			sourceUrl: knowledge.sourceUrl,
		})
		.from(chunk)
		.innerJoin(knowledge, eq(chunk.knowledgeId, knowledge.id))
		.where(and(...conditions))
		.orderBy(desc(similarity))
		.limit(limit);
}

export type FindSimilarVisitorMemoriesOptions = {
	websiteId: string;
	visitorId: string;
} & Omit<VectorSearchOptions, "websiteId" | "sourceType" | "visitorId">;

/**
 * Find similar visitor memories.
 * Convenience wrapper for findSimilarChunks with sourceType='visitor_memory'.
 */
export async function findSimilarVisitorMemories(
	db: Database,
	query: string,
	options: FindSimilarVisitorMemoriesOptions
): Promise<ChunkSearchResult[]> {
	const { websiteId, visitorId, ...rest } = options;
	return findSimilarChunks(db, query, {
		...rest,
		websiteId,
		visitorId,
		sourceType: "visitor_memory",
	});
}

export type FindSimilarContactMemoriesOptions = {
	websiteId: string;
	contactId: string;
} & Omit<VectorSearchOptions, "websiteId" | "sourceType" | "contactId">;

/**
 * Find similar contact memories.
 * Convenience wrapper for findSimilarChunks with sourceType='contact_memory'.
 */
export async function findSimilarContactMemories(
	db: Database,
	query: string,
	options: FindSimilarContactMemoriesOptions
): Promise<ChunkSearchResult[]> {
	const { websiteId, contactId, ...rest } = options;
	return findSimilarChunks(db, query, {
		...rest,
		websiteId,
		contactId,
		sourceType: "contact_memory",
	});
}
