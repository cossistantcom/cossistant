import { validateBehaviorSettings } from "@api/ai-pipeline/shared/settings";
import type { Database } from "@api/db";
import {
	type AiAgentBehaviorSettings,
	type AiAgentInsert,
	type AiAgentSelect,
	aiAgent,
} from "@api/db/schema/ai-agent";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ulid } from "ulid";

/**
 * Get an AI agent by ID
 */
export async function getAiAgentById(
	db: Database,
	params: {
		aiAgentId: string;
	}
): Promise<AiAgentSelect | null> {
	const [agent] = await db
		.select()
		.from(aiAgent)
		.where(and(eq(aiAgent.id, params.aiAgentId), isNull(aiAgent.deletedAt)))
		.limit(1);

	return agent ?? null;
}

/**
 * Get the active AI agent for a website
 * Returns the first active agent found for the website
 */
export async function getActiveAiAgentForWebsite(
	db: Database,
	params: {
		websiteId: string;
		organizationId: string;
	}
): Promise<AiAgentSelect | null> {
	const [agent] = await db
		.select()
		.from(aiAgent)
		.where(
			and(
				eq(aiAgent.websiteId, params.websiteId),
				eq(aiAgent.organizationId, params.organizationId),
				eq(aiAgent.isActive, true),
				isNull(aiAgent.deletedAt)
			)
		)
		.limit(1);

	return agent ?? null;
}

/**
 * Get the AI agent for a website (regardless of active status)
 * Returns the first non-deleted agent found for the website
 */
export async function getAiAgentForWebsite(
	db: Database,
	params: {
		websiteId: string;
		organizationId: string;
	}
): Promise<AiAgentSelect | null> {
	const [agent] = await db
		.select()
		.from(aiAgent)
		.where(
			and(
				eq(aiAgent.websiteId, params.websiteId),
				eq(aiAgent.organizationId, params.organizationId),
				isNull(aiAgent.deletedAt)
			)
		)
		.limit(1);

	return agent ?? null;
}

/**
 * Create a new AI agent
 */
export async function createAiAgent(
	db: Database,
	params: {
		name: string;
		image?: string | null;
		description?: string | null;
		basePrompt: string;
		model: string;
		temperature?: number | null;
		maxOutputTokens?: number | null;
		organizationId: string;
		websiteId: string;
		isActive?: boolean;
		goals?: string[] | null;
	}
): Promise<AiAgentSelect> {
	const now = new Date().toISOString();

	const newAgent: AiAgentInsert = {
		id: ulid(),
		name: params.name,
		image: params.image ?? null,
		description: params.description ?? null,
		basePrompt: params.basePrompt,
		model: params.model,
		temperature: params.temperature ?? 0.7,
		maxOutputTokens: params.maxOutputTokens ?? 1024,
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		isActive: params.isActive ?? true,
		usageCount: 0,
		goals: params.goals ?? null,
		createdAt: now,
		updatedAt: now,
	};

	const [agent] = await db.insert(aiAgent).values(newAgent).returning();

	if (!agent) {
		throw new Error("Failed to create AI agent");
	}

	return agent;
}

/**
 * Update an existing AI agent
 */
export async function updateAiAgent(
	db: Database,
	params: {
		aiAgentId: string;
		name: string;
		image?: string | null;
		description?: string | null;
		basePrompt: string;
		model: string;
		temperature?: number | null;
		maxOutputTokens?: number | null;
		goals?: string[] | null;
		onboardingCompletedAt?: string | null;
	}
): Promise<AiAgentSelect | null> {
	const now = new Date().toISOString();

	// Build the update object, only including onboardingCompletedAt if explicitly provided
	const updateData: Record<string, unknown> = {
		name: params.name,
		image: params.image ?? null,
		description: params.description ?? null,
		basePrompt: params.basePrompt,
		model: params.model,
		temperature: params.temperature ?? 0.7,
		maxOutputTokens: params.maxOutputTokens ?? 1024,
		goals: params.goals,
		updatedAt: now,
	};

	// Only set onboardingCompletedAt if it was explicitly provided in params
	if (params.onboardingCompletedAt !== undefined) {
		updateData.onboardingCompletedAt = params.onboardingCompletedAt;
	}

	const [agent] = await db
		.update(aiAgent)
		.set(updateData)
		.where(and(eq(aiAgent.id, params.aiAgentId), isNull(aiAgent.deletedAt)))
		.returning();

	return agent ?? null;
}

/**
 * Update only the model for an AI agent.
 * Used by runtime model auto-migration when legacy/unknown models are detected.
 */
export async function updateAiAgentModel(
	db: Database,
	params: {
		aiAgentId: string;
		model: string;
	}
): Promise<AiAgentSelect | null> {
	const now = new Date().toISOString();

	const [agent] = await db
		.update(aiAgent)
		.set({
			model: params.model,
			updatedAt: now,
		})
		.where(and(eq(aiAgent.id, params.aiAgentId), isNull(aiAgent.deletedAt)))
		.returning();

	return agent ?? null;
}

/**
 * Toggle AI agent active status
 */
export async function toggleAiAgentActive(
	db: Database,
	params: {
		aiAgentId: string;
		isActive: boolean;
	}
): Promise<AiAgentSelect | null> {
	const now = new Date().toISOString();

	const [agent] = await db
		.update(aiAgent)
		.set({
			isActive: params.isActive,
			updatedAt: now,
		})
		.where(and(eq(aiAgent.id, params.aiAgentId), isNull(aiAgent.deletedAt)))
		.returning();

	return agent ?? null;
}

/**
 * Update AI agent usage statistics
 */
export async function updateAiAgentUsage(
	db: Database,
	params: {
		aiAgentId: string;
	}
): Promise<void> {
	const now = new Date().toISOString();

	await db
		.update(aiAgent)
		.set({
			lastUsedAt: now,
			usageCount: sql`${aiAgent.usageCount} + 1`,
			updatedAt: now,
		})
		.where(eq(aiAgent.id, params.aiAgentId));
}

/**
 * Permanently delete an AI agent
 * Related knowledge entries and link sources will be cascade deleted by the database
 */
export async function deleteAiAgent(
	db: Database,
	params: {
		aiAgentId: string;
	}
): Promise<boolean> {
	const result = await db
		.delete(aiAgent)
		.where(eq(aiAgent.id, params.aiAgentId))
		.returning({ id: aiAgent.id });

	return result.length > 0;
}

/**
 * Update AI agent training status
 */
export async function updateAiAgentTrainingStatus(
	db: Database,
	params: {
		aiAgentId: string;
		trainingStatus: "idle" | "pending" | "training" | "completed" | "failed";
		trainingProgress?: number;
		trainingError?: string | null;
		trainingStartedAt?: string | null;
		trainedItemsCount?: number | null;
		lastTrainedAt?: string | null;
	}
): Promise<AiAgentSelect | null> {
	const now = new Date().toISOString();

	const updateData: Record<string, unknown> = {
		trainingStatus: params.trainingStatus,
		updatedAt: now,
	};

	if (params.trainingProgress !== undefined) {
		updateData.trainingProgress = params.trainingProgress;
	}

	if (params.trainingError !== undefined) {
		updateData.trainingError = params.trainingError;
	}

	if (params.trainingStartedAt !== undefined) {
		updateData.trainingStartedAt = params.trainingStartedAt;
	}

	if (params.trainedItemsCount !== undefined) {
		updateData.trainedItemsCount = params.trainedItemsCount;
	}

	if (params.lastTrainedAt !== undefined) {
		updateData.lastTrainedAt = params.lastTrainedAt;
	}

	const [agent] = await db
		.update(aiAgent)
		.set(updateData)
		.where(and(eq(aiAgent.id, params.aiAgentId), isNull(aiAgent.deletedAt)))
		.returning();

	return agent ?? null;
}

/**
 * Update AI agent behavior settings
 *
 * Merges the provided settings with existing settings.
 * Only updates fields that are explicitly provided.
 */
export async function updateAiAgentBehaviorSettings(
	db: Database,
	params: {
		aiAgentId: string;
		behaviorSettings: Partial<AiAgentBehaviorSettings>;
	}
): Promise<AiAgentSelect | null> {
	const now = new Date().toISOString();

	// First, get the current agent to merge settings
	const currentAgent = await getAiAgentById(db, {
		aiAgentId: params.aiAgentId,
	});
	if (!currentAgent) {
		return null;
	}

	// Merge new settings with existing settings
	const mergedSettings = validateBehaviorSettings({
		...(currentAgent.behaviorSettings ?? {}),
		...params.behaviorSettings,
	});

	const [agent] = await db
		.update(aiAgent)
		.set({
			behaviorSettings: mergedSettings,
			updatedAt: now,
		})
		.where(and(eq(aiAgent.id, params.aiAgentId), isNull(aiAgent.deletedAt)))
		.returning();

	return agent ?? null;
}
