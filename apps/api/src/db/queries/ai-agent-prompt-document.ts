import {
	assertCorePromptDocumentName,
	assertSkillPromptDocumentName,
	isUniqueViolation,
	normalizePromptDocumentName,
	PromptDocumentConflictError,
	PromptDocumentValidationError,
} from "@api/ai-pipeline/shared/prompt/documents";
import type { Database } from "@api/db";
import {
	type AiAgentPromptDocumentInsert,
	type AiAgentPromptDocumentSelect,
	aiAgentPromptDocument,
} from "@api/db/schema/ai-agent-prompt-document";
import {
	deriveSkillDescriptionFromBody,
	parseSkillFileContent,
	serializeSkillFileContent,
	stripSkillMarkdownExtension,
} from "@plasma/types";
import { and, asc, desc, eq } from "drizzle-orm";
import { ulid } from "ulid";

const UNIQUE_NAME_CONSTRAINT = "ai_agent_prompt_document_unique_name_per_agent";

type PromptDocumentScope = {
	organizationId: string;
	websiteId: string;
	aiAgentId: string;
};

type PromptDocumentListFilters = {
	kind?: "core" | "skill";
	enabled?: boolean;
};

function normalizeSkillContentForStorage(input: {
	content: string;
	canonicalFileName: string;
}): string {
	const parsed = parseSkillFileContent({
		content: input.content,
		canonicalFileName: input.canonicalFileName,
	});
	const canonicalFrontmatterName = stripSkillMarkdownExtension(
		input.canonicalFileName
	);
	const description =
		parsed.description.trim() ||
		deriveSkillDescriptionFromBody(parsed.body) ||
		`Instructions for ${canonicalFrontmatterName}`;

	return serializeSkillFileContent({
		name: canonicalFrontmatterName,
		description,
		body: parsed.body,
	});
}

function scopeCondition(scope: PromptDocumentScope) {
	return and(
		eq(aiAgentPromptDocument.organizationId, scope.organizationId),
		eq(aiAgentPromptDocument.websiteId, scope.websiteId),
		eq(aiAgentPromptDocument.aiAgentId, scope.aiAgentId)
	);
}

async function getPromptDocumentById(
	db: Database,
	scope: PromptDocumentScope,
	id: string
): Promise<AiAgentPromptDocumentSelect | null> {
	const [document] = await db
		.select()
		.from(aiAgentPromptDocument)
		.where(and(scopeCondition(scope), eq(aiAgentPromptDocument.id, id)))
		.limit(1);

	return document ?? null;
}

export async function listAiAgentPromptDocuments(
	db: Database,
	scope: PromptDocumentScope,
	filters: PromptDocumentListFilters = {}
): Promise<AiAgentPromptDocumentSelect[]> {
	const conditions = [scopeCondition(scope)];

	if (filters.kind) {
		conditions.push(eq(aiAgentPromptDocument.kind, filters.kind));
	}

	if (filters.enabled !== undefined) {
		conditions.push(eq(aiAgentPromptDocument.enabled, filters.enabled));
	}

	return db
		.select()
		.from(aiAgentPromptDocument)
		.where(and(...conditions))
		.orderBy(
			asc(aiAgentPromptDocument.kind),
			desc(aiAgentPromptDocument.priority),
			asc(aiAgentPromptDocument.name)
		);
}

export async function upsertAiAgentCorePromptDocument(
	db: Database,
	params: PromptDocumentScope & {
		name: string;
		content: string;
		priority?: number;
		updatedByUserId: string;
	}
): Promise<AiAgentPromptDocumentSelect> {
	const normalizedName = normalizePromptDocumentName(params.name);
	assertCorePromptDocumentName(normalizedName);

	const [existing] = await db
		.select()
		.from(aiAgentPromptDocument)
		.where(
			and(
				scopeCondition(params),
				eq(aiAgentPromptDocument.name, normalizedName)
			)
		)
		.limit(1);

	if (existing && existing.kind !== "core") {
		throw new PromptDocumentValidationError(
			`Document '${normalizedName}' exists as a skill and cannot be reused as core`
		);
	}

	const now = new Date().toISOString();
	const nextPriority = params.priority ?? existing?.priority ?? 0;
	const nextContent = params.content.trim();

	if (existing) {
		const [updated] = await db
			.update(aiAgentPromptDocument)
			.set({
				content: nextContent,
				enabled: true,
				priority: nextPriority,
				updatedByUserId: params.updatedByUserId,
				updatedAt: now,
			})
			.where(eq(aiAgentPromptDocument.id, existing.id))
			.returning();

		if (!updated) {
			throw new Error(
				`Failed to update core prompt document '${normalizedName}'`
			);
		}

		return updated;
	}

	const insertData: AiAgentPromptDocumentInsert = {
		id: ulid(),
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		aiAgentId: params.aiAgentId,
		kind: "core",
		name: normalizedName,
		content: nextContent,
		enabled: true,
		priority: nextPriority,
		createdByUserId: params.updatedByUserId,
		updatedByUserId: params.updatedByUserId,
		createdAt: now,
		updatedAt: now,
	};

	try {
		const [created] = await db
			.insert(aiAgentPromptDocument)
			.values(insertData)
			.returning();

		if (!created) {
			throw new Error(
				`Failed to create core prompt document '${normalizedName}'`
			);
		}

		return created;
	} catch (error) {
		if (isUniqueViolation(error, UNIQUE_NAME_CONSTRAINT)) {
			throw new PromptDocumentConflictError(
				`A prompt document named '${normalizedName}' already exists for this agent`
			);
		}
		throw error;
	}
}

export async function deleteAiAgentCorePromptDocumentByName(
	db: Database,
	params: PromptDocumentScope & {
		name: string;
	}
): Promise<boolean> {
	const normalizedName = normalizePromptDocumentName(params.name);
	assertCorePromptDocumentName(normalizedName);

	const deleted = await db
		.delete(aiAgentPromptDocument)
		.where(
			and(
				scopeCondition(params),
				eq(aiAgentPromptDocument.kind, "core"),
				eq(aiAgentPromptDocument.name, normalizedName)
			)
		)
		.returning({ id: aiAgentPromptDocument.id });

	return deleted.length > 0;
}

export async function createAiAgentSkillPromptDocument(
	db: Database,
	params: PromptDocumentScope & {
		name: string;
		content: string;
		enabled?: boolean;
		priority?: number;
		createdByUserId: string;
	}
): Promise<AiAgentPromptDocumentSelect> {
	const normalizedName = normalizePromptDocumentName(params.name);
	assertSkillPromptDocumentName(normalizedName);

	const now = new Date().toISOString();
	const normalizedContent = normalizeSkillContentForStorage({
		content: params.content,
		canonicalFileName: normalizedName,
	});

	const insertData: AiAgentPromptDocumentInsert = {
		id: ulid(),
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		aiAgentId: params.aiAgentId,
		kind: "skill",
		name: normalizedName,
		content: normalizedContent,
		enabled: params.enabled ?? true,
		priority: params.priority ?? 0,
		createdByUserId: params.createdByUserId,
		updatedByUserId: params.createdByUserId,
		createdAt: now,
		updatedAt: now,
	};

	try {
		const [created] = await db
			.insert(aiAgentPromptDocument)
			.values(insertData)
			.returning();

		if (!created) {
			throw new Error("Failed to create skill prompt document");
		}

		return created;
	} catch (error) {
		if (isUniqueViolation(error, UNIQUE_NAME_CONSTRAINT)) {
			throw new PromptDocumentConflictError(
				`A skill named '${normalizedName}' already exists for this agent`
			);
		}
		throw error;
	}
}

export async function updateAiAgentSkillPromptDocument(
	db: Database,
	params: PromptDocumentScope & {
		skillDocumentId: string;
		name?: string;
		content?: string;
		enabled?: boolean;
		priority?: number;
		updatedByUserId: string;
	}
): Promise<AiAgentPromptDocumentSelect | null> {
	const existing = await getPromptDocumentById(
		db,
		params,
		params.skillDocumentId
	);
	if (!existing) {
		return null;
	}

	if (existing.kind !== "skill") {
		throw new PromptDocumentValidationError(
			"Only skill prompt documents can be updated with this endpoint"
		);
	}

	const nextName =
		params.name === undefined
			? existing.name
			: normalizePromptDocumentName(params.name);
	assertSkillPromptDocumentName(nextName);
	const contentSource = params.content ?? existing.content;
	const normalizedContent = normalizeSkillContentForStorage({
		content: contentSource,
		canonicalFileName: nextName,
	});

	const now = new Date().toISOString();

	const updateData: Partial<AiAgentPromptDocumentInsert> = {
		name: nextName,
		content: normalizedContent,
		enabled: params.enabled ?? existing.enabled,
		priority: params.priority ?? existing.priority,
		updatedByUserId: params.updatedByUserId,
		updatedAt: now,
	};

	try {
		const [updated] = await db
			.update(aiAgentPromptDocument)
			.set(updateData)
			.where(eq(aiAgentPromptDocument.id, existing.id))
			.returning();

		return updated ?? null;
	} catch (error) {
		if (isUniqueViolation(error, UNIQUE_NAME_CONSTRAINT)) {
			throw new PromptDocumentConflictError(
				`A skill named '${nextName}' already exists for this agent`
			);
		}
		throw error;
	}
}

export async function deleteAiAgentSkillPromptDocument(
	db: Database,
	params: PromptDocumentScope & {
		skillDocumentId: string;
	}
): Promise<boolean> {
	const result = await db
		.delete(aiAgentPromptDocument)
		.where(
			and(
				scopeCondition(params),
				eq(aiAgentPromptDocument.id, params.skillDocumentId),
				eq(aiAgentPromptDocument.kind, "skill")
			)
		)
		.returning({ id: aiAgentPromptDocument.id });

	return result.length > 0;
}

export async function toggleAiAgentSkillPromptDocument(
	db: Database,
	params: PromptDocumentScope & {
		skillDocumentId: string;
		enabled: boolean;
		updatedByUserId: string;
	}
): Promise<AiAgentPromptDocumentSelect | null> {
	const now = new Date().toISOString();

	const [updated] = await db
		.update(aiAgentPromptDocument)
		.set({
			enabled: params.enabled,
			updatedByUserId: params.updatedByUserId,
			updatedAt: now,
		})
		.where(
			and(
				scopeCondition(params),
				eq(aiAgentPromptDocument.id, params.skillDocumentId),
				eq(aiAgentPromptDocument.kind, "skill")
			)
		)
		.returning();

	return updated ?? null;
}
