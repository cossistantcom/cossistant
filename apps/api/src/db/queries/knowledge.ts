import { createHash } from "node:crypto";
import type { Database } from "@api/db";
import { KNOWLEDGE_READ_CACHE_CONFIG } from "@api/db/cache/config";
import {
	type KnowledgeInsert,
	type KnowledgeSelect,
	knowledge,
} from "@api/db/schema/knowledge";
import { generateULID } from "@api/utils/db/ids";
import type { KnowledgeType } from "@cossistant/types";
import { and, count, eq, gt, isNull, sum } from "drizzle-orm";

/**
 * Generate a content hash for deduplication
 */
export function generateContentHash(payload: unknown): string {
	const content = JSON.stringify(payload);
	return createHash("md5").update(content).digest("hex");
}

/**
 * Get a knowledge entry by ID
 */
export async function getKnowledgeById(
	db: Database,
	params: {
		id: string;
		websiteId: string;
	}
): Promise<KnowledgeSelect | null> {
	const [entry] = await db
		.select()
		.from(knowledge)
		.where(
			and(
				eq(knowledge.id, params.id),
				eq(knowledge.websiteId, params.websiteId),
				isNull(knowledge.deletedAt)
			)
		)
		.limit(1)
		.$withCache({
			config: KNOWLEDGE_READ_CACHE_CONFIG,
		});

	return entry ?? null;
}

/**
 * Get knowledge entry by content hash (for deduplication)
 */
export async function getKnowledgeByContentHash(
	db: Database,
	params: {
		websiteId: string;
		aiAgentId: string | null;
		contentHash: string;
	}
): Promise<KnowledgeSelect | null> {
	const conditions = [
		eq(knowledge.websiteId, params.websiteId),
		eq(knowledge.contentHash, params.contentHash),
		isNull(knowledge.deletedAt),
	];

	// Handle null aiAgentId - shared knowledge
	if (params.aiAgentId === null) {
		conditions.push(isNull(knowledge.aiAgentId));
	} else {
		conditions.push(eq(knowledge.aiAgentId, params.aiAgentId));
	}

	const [entry] = await db
		.select()
		.from(knowledge)
		.where(and(...conditions))
		.limit(1);

	return entry ?? null;
}

/**
 * List knowledge entries with filters and pagination
 */
export async function listKnowledge(
	db: Database,
	params: {
		organizationId: string;
		websiteId: string;
		type?: KnowledgeType;
		aiAgentId?: string | null;
		isIncluded?: boolean;
		linkSourceId?: string;
		page?: number;
		limit?: number;
	}
): Promise<{
	items: KnowledgeSelect[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		hasMore: boolean;
	};
}> {
	const page = params.page ?? 1;
	const limit = params.limit ?? 20;
	const offset = (page - 1) * limit;

	// Build where conditions
	const whereConditions = [
		eq(knowledge.organizationId, params.organizationId),
		eq(knowledge.websiteId, params.websiteId),
		isNull(knowledge.deletedAt),
	];

	// Filter by type if provided
	if (params.type) {
		whereConditions.push(eq(knowledge.type, params.type));
	}

	// Filter by aiAgentId if explicitly provided (including null for shared)
	if (params.aiAgentId !== undefined) {
		if (params.aiAgentId === null) {
			whereConditions.push(isNull(knowledge.aiAgentId));
		} else {
			whereConditions.push(eq(knowledge.aiAgentId, params.aiAgentId));
		}
	}

	if (params.isIncluded !== undefined) {
		whereConditions.push(eq(knowledge.isIncluded, params.isIncluded));
	}

	if (params.linkSourceId) {
		whereConditions.push(eq(knowledge.linkSourceId, params.linkSourceId));
	}

	// Get total count
	const [countResult] = await db
		.select({ total: count() })
		.from(knowledge)
		.where(and(...whereConditions))
		.$withCache({
			config: KNOWLEDGE_READ_CACHE_CONFIG,
		});

	const total = Number(countResult?.total ?? 0);

	// Get paginated items
	const items = await db
		.select()
		.from(knowledge)
		.where(and(...whereConditions))
		.orderBy(knowledge.createdAt)
		.limit(limit)
		.offset(offset)
		.$withCache({
			config: KNOWLEDGE_READ_CACHE_CONFIG,
		});

	return {
		items,
		pagination: {
			page,
			limit,
			total,
			hasMore: page * limit < total,
		},
	};
}

/**
 * Create a new knowledge entry
 */
export async function createKnowledge(
	db: Database,
	params: {
		organizationId: string;
		websiteId: string;
		aiAgentId?: string | null;
		linkSourceId?: string | null;
		type: KnowledgeType;
		sourceUrl?: string | null;
		sourceTitle?: string | null;
		origin: string;
		createdBy: string;
		payload: unknown;
		metadata?: Record<string, unknown> | null;
		isIncluded?: boolean;
		sizeBytes?: number;
	}
): Promise<KnowledgeSelect> {
	const now = new Date().toISOString();
	const contentHash = generateContentHash(params.payload);

	// Calculate size if not provided
	const sizeBytes =
		params.sizeBytes ??
		new TextEncoder().encode(JSON.stringify(params.payload)).length;

	const newEntry: KnowledgeInsert = {
		id: generateULID(),
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		aiAgentId: params.aiAgentId ?? null,
		linkSourceId: params.linkSourceId ?? null,
		type: params.type,
		sourceUrl: params.sourceUrl ?? null,
		sourceTitle: params.sourceTitle ?? null,
		origin: params.origin,
		createdBy: params.createdBy,
		contentHash,
		payload: params.payload,
		metadata: params.metadata ?? null,
		isIncluded: params.isIncluded ?? true,
		sizeBytes,
		createdAt: now,
		updatedAt: now,
	};

	const [entry] = await db.insert(knowledge).values(newEntry).returning();

	if (!entry) {
		throw new Error("Failed to create knowledge entry");
	}

	return entry;
}

/**
 * Create or update a knowledge entry (upsert)
 * If a knowledge entry with the same content hash already exists for the scope,
 * it updates the existing entry with the new data.
 *
 * Uses a manual select-then-insert/update pattern instead of ON CONFLICT
 * because the unique index includes a COALESCE expression that Drizzle
 * cannot target directly.
 */
export async function upsertKnowledge(
	db: Database,
	params: {
		organizationId: string;
		websiteId: string;
		aiAgentId?: string | null;
		linkSourceId?: string | null;
		type: KnowledgeType;
		sourceUrl?: string | null;
		sourceTitle?: string | null;
		origin: string;
		createdBy: string;
		payload: unknown;
		metadata?: Record<string, unknown> | null;
		isIncluded?: boolean;
		sizeBytes?: number;
	}
): Promise<KnowledgeSelect> {
	const now = new Date().toISOString();
	const contentHash = generateContentHash(params.payload);

	// Calculate size if not provided
	const sizeBytes =
		params.sizeBytes ??
		new TextEncoder().encode(JSON.stringify(params.payload)).length;

	// Check if entry with same content hash exists for the active scope.
	const existing = await getKnowledgeByContentHash(db, {
		websiteId: params.websiteId,
		aiAgentId: params.aiAgentId ?? null,
		contentHash,
	});

	if (existing) {
		const [updated] = await db
			.update(knowledge)
			.set({
				linkSourceId: params.linkSourceId ?? null,
				sourceUrl: params.sourceUrl ?? null,
				sourceTitle: params.sourceTitle ?? null,
				origin: params.origin,
				payload: params.payload,
				metadata: params.metadata ?? null,
				isIncluded: params.isIncluded ?? true,
				sizeBytes,
				updatedAt: now,
			})
			.where(eq(knowledge.id, existing.id))
			.returning();

		if (!updated) {
			throw new Error("Failed to update knowledge entry");
		}
		return updated;
	}

	// Insert new entry
	return createKnowledge(db, params);
}

/**
 * List knowledge entries for a specific link source
 */
export async function listKnowledgeByLinkSource(
	db: Database,
	params: {
		linkSourceId: string;
		page?: number;
		limit?: number;
	}
): Promise<{
	items: KnowledgeSelect[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		hasMore: boolean;
	};
}> {
	const page = params.page ?? 1;
	const limit = params.limit ?? 50;
	const offset = (page - 1) * limit;

	const whereConditions = [
		eq(knowledge.linkSourceId, params.linkSourceId),
		isNull(knowledge.deletedAt),
	];

	// Get total count
	const [countResult] = await db
		.select({ total: count() })
		.from(knowledge)
		.where(and(...whereConditions));

	const total = Number(countResult?.total ?? 0);

	// Get paginated items
	const items = await db
		.select()
		.from(knowledge)
		.where(and(...whereConditions))
		.orderBy(knowledge.createdAt)
		.limit(limit)
		.offset(offset);

	return {
		items,
		pagination: {
			page,
			limit,
			total,
			hasMore: page * limit < total,
		},
	};
}

/**
 * Update an existing knowledge entry
 */
export async function updateKnowledge(
	db: Database,
	params: {
		id: string;
		websiteId: string;
		aiAgentId?: string | null;
		sourceUrl?: string | null;
		sourceTitle?: string | null;
		payload?: unknown;
		metadata?: Record<string, unknown> | null;
		isIncluded?: boolean;
	}
): Promise<KnowledgeSelect | null> {
	const now = new Date().toISOString();

	// Debug: Log full params
	console.log(
		"[updateKnowledge] Full params:",
		JSON.stringify(params, null, 2)
	);

	// Build update object - only include fields that are explicitly provided
	const updateData: Partial<KnowledgeInsert> = {
		updatedAt: now,
	};

	if (params.aiAgentId !== undefined) {
		updateData.aiAgentId = params.aiAgentId;
	}

	if (params.sourceUrl !== undefined) {
		updateData.sourceUrl = params.sourceUrl;
	}

	if (params.sourceTitle !== undefined) {
		updateData.sourceTitle = params.sourceTitle;
	}

	if (params.payload !== undefined) {
		console.log(
			"[updateKnowledge] Setting payload:",
			JSON.stringify(params.payload, null, 2)
		);
		updateData.payload = params.payload;
		updateData.contentHash = generateContentHash(params.payload);
		// Recalculate sizeBytes when payload changes
		updateData.sizeBytes = new TextEncoder().encode(
			JSON.stringify(params.payload)
		).length;
	}

	console.log(
		"[updateKnowledge] Final updateData:",
		JSON.stringify(updateData, null, 2)
	);

	if (params.metadata !== undefined) {
		updateData.metadata = params.metadata;
	}

	if (params.isIncluded !== undefined) {
		updateData.isIncluded = params.isIncluded;
	}

	const [entry] = await db
		.update(knowledge)
		.set(updateData)
		.where(
			and(
				eq(knowledge.id, params.id),
				eq(knowledge.websiteId, params.websiteId),
				isNull(knowledge.deletedAt)
			)
		)
		.returning();

	return entry ?? null;
}

/**
 * Permanently delete a knowledge entry.
 */
export async function deleteKnowledge(
	db: Database,
	params: {
		id: string;
		websiteId: string;
	}
): Promise<boolean> {
	const [entry] = await db
		.delete(knowledge)
		.where(
			and(
				eq(knowledge.id, params.id),
				eq(knowledge.websiteId, params.websiteId)
			)
		)
		.returning({ id: knowledge.id });

	return Boolean(entry);
}

/**
 * Permanently delete all knowledge entries for a link source.
 */
export async function deleteKnowledgeByLinkSource(
	db: Database,
	params: {
		linkSourceId: string;
		websiteId: string;
	}
): Promise<number> {
	const deletedEntries = await db
		.delete(knowledge)
		.where(
			and(
				eq(knowledge.linkSourceId, params.linkSourceId),
				eq(knowledge.websiteId, params.websiteId)
			)
		)
		.returning({ id: knowledge.id });

	return deletedEntries.length;
}

/**
 * Get total count of URL-type knowledge entries for a website/agent
 * Used for enforcing total pages limit
 */
export async function getTotalUrlKnowledgeCount(
	db: Database,
	params: {
		websiteId: string;
		aiAgentId: string | null;
	}
): Promise<number> {
	const whereConditions = [
		eq(knowledge.websiteId, params.websiteId),
		eq(knowledge.type, "url"),
		isNull(knowledge.deletedAt),
	];

	// Handle null aiAgentId
	if (params.aiAgentId === null) {
		whereConditions.push(isNull(knowledge.aiAgentId));
	} else {
		whereConditions.push(eq(knowledge.aiAgentId, params.aiAgentId));
	}

	const [result] = await db
		.select({ total: count() })
		.from(knowledge)
		.where(and(...whereConditions));

	return Number(result?.total ?? 0);
}

/**
 * Get count of knowledge entries by type for a website/agent
 * Used for enforcing FAQ and file count limits
 */
export async function getKnowledgeCountByType(
	db: Database,
	params: {
		websiteId: string;
		aiAgentId: string | null;
		type: KnowledgeType;
	}
): Promise<number> {
	const whereConditions = [
		eq(knowledge.websiteId, params.websiteId),
		eq(knowledge.type, params.type),
		isNull(knowledge.deletedAt),
	];

	// Handle null aiAgentId
	if (params.aiAgentId === null) {
		whereConditions.push(isNull(knowledge.aiAgentId));
	} else {
		whereConditions.push(eq(knowledge.aiAgentId, params.aiAgentId));
	}

	const [result] = await db
		.select({ total: count() })
		.from(knowledge)
		.where(and(...whereConditions));

	return Number(result?.total ?? 0);
}

/**
 * Count included knowledge sources for a website, optionally since the last
 * training run. Used by training status read models.
 */
export async function countIncludedKnowledgeSources(
	db: Database,
	params: {
		websiteId: string;
		lastTrainedAt?: string | null;
	}
): Promise<number> {
	const conditions = [
		eq(knowledge.websiteId, params.websiteId),
		eq(knowledge.isIncluded, true),
		isNull(knowledge.deletedAt),
	];

	if (params.lastTrainedAt) {
		conditions.push(gt(knowledge.updatedAt, params.lastTrainedAt));
	}

	const [result] = await db
		.select({ count: count() })
		.from(knowledge)
		.where(and(...conditions));

	return Number(result?.count ?? 0);
}

/**
 * Get total size in bytes of all knowledge entries for a website/agent
 * Used for enforcing MB limit across all knowledge types
 */
export async function getTotalKnowledgeSizeBytes(
	db: Database,
	params: {
		websiteId: string;
		aiAgentId: string | null;
	}
): Promise<number> {
	const whereConditions = [
		eq(knowledge.websiteId, params.websiteId),
		isNull(knowledge.deletedAt),
	];

	// Handle null aiAgentId
	if (params.aiAgentId === null) {
		whereConditions.push(isNull(knowledge.aiAgentId));
	} else {
		whereConditions.push(eq(knowledge.aiAgentId, params.aiAgentId));
	}

	const [result] = await db
		.select({ total: sum(knowledge.sizeBytes) })
		.from(knowledge)
		.where(and(...whereConditions));

	return Number(result?.total ?? 0);
}

/**
 * List all knowledge entries included in training for a website
 * Returns all items where isIncluded = true
 */
export async function listKnowledgeForTraining(
	db: Database,
	params: {
		websiteId: string;
	}
): Promise<KnowledgeSelect[]> {
	const items = await db
		.select()
		.from(knowledge)
		.where(
			and(
				eq(knowledge.websiteId, params.websiteId),
				eq(knowledge.isIncluded, true),
				isNull(knowledge.deletedAt)
			)
		)
		.orderBy(knowledge.createdAt);

	return items;
}
