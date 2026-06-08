import {
	getBehaviorPromptCatalog,
	getBehaviorPromptDefinition,
	getEditableCorePromptCatalog,
} from "@api/ai-pipeline/shared/prompt/behavior-catalog";
import { buildCapabilitiesStudioResponse } from "@api/ai-pipeline/shared/prompt/capabilities-studio";
import {
	EDITABLE_CORE_PROMPT_DOCUMENT_NAME_SET,
	PromptDocumentConflictError,
	PromptDocumentValidationError,
} from "@api/ai-pipeline/shared/prompt/documents";
import { buildFallbackCoreDocuments } from "@api/ai-pipeline/shared/prompt/resolver";
import { getBehaviorSettings } from "@api/ai-pipeline/shared/settings";
import {
	createAiAgent,
	deleteAiAgent,
	getAiAgentForWebsite,
	getAiAgentForWebsiteById,
	toggleAiAgentActive,
	updateAiAgent,
	updateAiAgentBehaviorSettings,
	updateAiAgentModel,
	updateAiAgentTrainingStatus,
} from "@api/db/queries/ai-agent";
import {
	createAiAgentSkillPromptDocument,
	deleteAiAgentCorePromptDocumentByName,
	deleteAiAgentSkillPromptDocument,
	listAiAgentPromptDocuments,
	toggleAiAgentSkillPromptDocument,
	updateAiAgentSkillPromptDocument,
	upsertAiAgentCorePromptDocument,
} from "@api/db/queries/ai-agent-prompt-document";
import { countIncludedKnowledgeSources } from "@api/db/queries/knowledge";
import { scheduleAiAgentLifecycleEmail } from "@api/db/queries/lifecycle-email";
import {
	getWebsiteBySlugWithAccess,
	updateWebsite,
} from "@api/db/queries/website";
import {
	isKnownModel,
	resolveModelForExecution,
} from "@api/lib/ai-credits/config";
import { canUseSelectedModelForPlan } from "@api/lib/ai-credits/entitlement";
import { getPlanForWebsite } from "@api/lib/plans/access";
import { firecrawlService } from "@api/services/firecrawl";
import { generateAgentBasePrompt } from "@api/services/prompt-generator";
import { triggerAiTraining } from "@api/utils/queue-triggers";
import {
	AI_AGENT_DROPPED_SKILL_TEMPLATE_NAMES,
	AI_AGENT_RESERVED_TOOL_SKILL_TEMPLATE_NAMES,
	AI_AGENT_TOOL_CATALOG,
	aiAgentPromptDocumentResponseSchema,
	aiAgentResponseSchema,
	createAiAgentRequestSchema,
	createSkillDocumentRequestSchema,
	deleteAiAgentRequestSchema,
	deleteSkillDocumentRequestSchema,
	generateBasePromptRequestSchema,
	generateBasePromptResponseSchema,
	getAiAgentRequestSchema,
	getBehaviorSettingsRequestSchema,
	getBehaviorSettingsResponseSchema,
	getBehaviorStudioRequestSchema,
	getBehaviorStudioResponseSchema,
	getCapabilitiesStudioRequestSchema,
	getCapabilitiesStudioResponseSchema,
	getPromptStudioRequestSchema,
	getPromptStudioResponseSchema,
	resetBehaviorPromptRequestSchema,
	resetBehaviorPromptResponseSchema,
	resetCorePromptRequestSchema,
	resetCorePromptResponseSchema,
	resetToolSkillOverrideRequestSchema,
	toggleAiAgentActiveRequestSchema,
	toggleSkillDocumentRequestSchema,
	updateAiAgentRequestSchema,
	updateBehaviorSettingsRequestSchema,
	updateBehaviorSettingsResponseSchema,
	updateSkillDocumentRequestSchema,
	upsertBehaviorPromptRequestSchema,
	upsertBehaviorPromptResponseSchema,
	upsertCorePromptRequestSchema,
	upsertCorePromptResponseSchema,
	upsertToolSkillOverrideRequestSchema,
} from "@cossistant/types";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";

/** Get training cooldown in ms from plan's training interval (in minutes) */
function getTrainingCooldownMs(
	trainingIntervalMinutes: number | boolean | null
): number {
	if (
		trainingIntervalMinutes === null ||
		trainingIntervalMinutes === true ||
		trainingIntervalMinutes === false ||
		trainingIntervalMinutes <= 0
	) {
		return 0;
	}
	return (trainingIntervalMinutes as number) * 60 * 1000;
}

function toAiAgentResponse(agent: {
	id: string;
	name: string;
	image: string | null;
	description: string | null;
	basePrompt: string;
	model: string;
	temperature: number | null;
	maxOutputTokens: number | null;
	isActive: boolean;
	lastUsedAt: string | null;
	usageCount: number;
	goals: string[] | null;
	createdAt: string;
	updatedAt: string;
	onboardingCompletedAt: string | null;
}) {
	return {
		id: agent.id,
		name: agent.name,
		image: agent.image,
		description: agent.description,
		basePrompt: agent.basePrompt,
		model: agent.model,
		temperature: agent.temperature,
		maxOutputTokens: agent.maxOutputTokens,
		isActive: agent.isActive,
		lastUsedAt: agent.lastUsedAt,
		usageCount: agent.usageCount,
		goals: agent.goals,
		createdAt: agent.createdAt,
		updatedAt: agent.updatedAt,
		onboardingCompletedAt: agent.onboardingCompletedAt,
	};
}

function toPromptDocumentResponse(document: {
	id: string;
	organizationId: string;
	websiteId: string;
	aiAgentId: string;
	kind: "core" | "skill";
	name: string;
	content: string;
	enabled: boolean;
	priority: number;
	createdByUserId: string | null;
	updatedByUserId: string | null;
	createdAt: string;
	updatedAt: string;
}) {
	return {
		id: document.id,
		organizationId: document.organizationId,
		websiteId: document.websiteId,
		aiAgentId: document.aiAgentId,
		kind: document.kind,
		name: document.name,
		content: document.content,
		enabled: document.enabled,
		priority: document.priority,
		createdByUserId: document.createdByUserId,
		updatedByUserId: document.updatedByUserId,
		createdAt: document.createdAt,
		updatedAt: document.updatedAt,
	};
}

function handlePromptDocumentMutationError(error: unknown): never {
	if (error instanceof PromptDocumentValidationError) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: error.message,
		});
	}

	if (error instanceof PromptDocumentConflictError) {
		throw new TRPCError({
			code: "CONFLICT",
			message: error.message,
		});
	}

	throw error;
}

function assertEditableCorePromptDocumentName(name: string): void {
	if (!EDITABLE_CORE_PROMPT_DOCUMENT_NAME_SET.has(name)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "This core prompt document is immutable.",
		});
	}
}

async function buildPromptStudioEntries(params: {
	db: Parameters<typeof listAiAgentPromptDocuments>[0];
	organizationId: string;
	websiteId: string;
	aiAgent: NonNullable<Awaited<ReturnType<typeof getAiAgentForWebsite>>>;
}) {
	const coreDocuments = await listAiAgentPromptDocuments(
		params.db,
		{
			organizationId: params.organizationId,
			websiteId: params.websiteId,
			aiAgentId: params.aiAgent.id,
		},
		{ kind: "core" }
	);

	const coreDocumentByName = new Map(
		coreDocuments
			.filter((document) => document.enabled)
			.map((document) => [document.name, document])
	);

	const fallbackDocuments = buildFallbackCoreDocuments(
		params.aiAgent,
		"respond_to_visitor"
	);

	const corePrompts = getEditableCorePromptCatalog().map((definition) => {
		const overrideDocument = coreDocumentByName.get(definition.documentName);
		const defaultContent = fallbackDocuments[definition.documentName].trim();
		const content = overrideDocument?.content ?? defaultContent;
		const hasOverride = overrideDocument
			? overrideDocument.content.trim() !== defaultContent
			: false;

		return {
			documentName: definition.documentName,
			label: definition.label,
			description: definition.description,
			content,
			defaultContent,
			hasOverride,
			documentId: overrideDocument?.id ?? null,
			presets: [...definition.presets],
		};
	});

	return {
		aiAgentId: params.aiAgent.id,
		corePrompts,
	};
}

async function upsertEditableCorePromptDocument(params: {
	db: Parameters<typeof upsertAiAgentCorePromptDocument>[0];
	organizationId: string;
	websiteId: string;
	aiAgent: NonNullable<Awaited<ReturnType<typeof getAiAgentForWebsite>>>;
	updatedByUserId: string;
	documentName: string;
	content: string;
}) {
	assertEditableCorePromptDocumentName(params.documentName);

	const nextContent = params.content.trim();
	if (!nextContent) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Prompt content cannot be empty",
		});
	}

	const fallbackDocuments = buildFallbackCoreDocuments(
		params.aiAgent,
		"respond_to_visitor"
	);
	const defaultContent =
		fallbackDocuments[
			params.documentName as keyof typeof fallbackDocuments
		]?.trim() ?? "";

	if (nextContent === defaultContent) {
		const removed = await deleteAiAgentCorePromptDocumentByName(params.db, {
			organizationId: params.organizationId,
			websiteId: params.websiteId,
			aiAgentId: params.aiAgent.id,
			name: params.documentName,
		});

		return {
			removed,
			document: null,
		};
	}

	try {
		const document = await upsertAiAgentCorePromptDocument(params.db, {
			organizationId: params.organizationId,
			websiteId: params.websiteId,
			aiAgentId: params.aiAgent.id,
			name: params.documentName,
			content: nextContent,
			updatedByUserId: params.updatedByUserId,
		});

		return {
			removed: false,
			document: toPromptDocumentResponse(document),
		};
	} catch (error) {
		handlePromptDocumentMutationError(error);
	}
}

async function resetEditableCorePromptDocument(params: {
	db: Parameters<typeof deleteAiAgentCorePromptDocumentByName>[0];
	organizationId: string;
	websiteId: string;
	aiAgentId: string;
	documentName: string;
}) {
	assertEditableCorePromptDocumentName(params.documentName);

	const removed = await deleteAiAgentCorePromptDocumentByName(params.db, {
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		aiAgentId: params.aiAgentId,
		name: params.documentName,
	});

	return { removed };
}

async function getWebsiteAndAgentForPromptStudio(params: {
	db: Parameters<typeof getWebsiteBySlugWithAccess>[0];
	userId: string;
	websiteSlug: string;
	aiAgentId: string;
}) {
	const websiteData = await getWebsiteBySlugWithAccess(params.db, {
		userId: params.userId,
		websiteSlug: params.websiteSlug,
	});

	if (!websiteData) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Website not found or access denied",
		});
	}

	const agent = await getAiAgentForWebsite(params.db, {
		websiteId: websiteData.id,
		organizationId: websiteData.organizationId,
	});

	if (!agent || agent.id !== params.aiAgentId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "AI agent not found",
		});
	}

	return { websiteData, agent };
}

const RESERVED_TOOL_SKILL_NAME_SET = new Set<string>(
	AI_AGENT_RESERVED_TOOL_SKILL_TEMPLATE_NAMES
);
const DROPPED_SKILL_NAME_SET = new Set<string>(
	AI_AGENT_DROPPED_SKILL_TEMPLATE_NAMES
);

function assertCustomSkillNameAllowed(name: string): void {
	if (RESERVED_TOOL_SKILL_NAME_SET.has(name)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "This skill name is reserved for a default tool-attached skill.",
		});
	}

	if (DROPPED_SKILL_NAME_SET.has(name)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "This skill name is reserved and cannot be used.",
		});
	}
}

async function assertModelAllowedForWebsite(params: {
	website: Parameters<typeof getPlanForWebsite>[0];
	modelId: string;
}): Promise<void> {
	const planInfo = await getPlanForWebsite(params.website);
	const latestModelsFeature = planInfo.features["latest-ai-models"];
	const modelSelectionError = getModelSelectionError({
		modelId: params.modelId,
		latestModelsFeature,
	});
	if (modelSelectionError) {
		throw new TRPCError(modelSelectionError);
	}
}

async function assertCustomAvatarAllowedForWebsite(params: {
	website: Parameters<typeof getPlanForWebsite>[0];
	nextImage: string | null | undefined;
	currentImage?: string | null;
}): Promise<void> {
	const avatarAccessError = getCustomAvatarAccessError({
		customAvatarFeature: (await getPlanForWebsite(params.website)).features[
			"custom-ai-agent-avatar"
		],
		nextImage: params.nextImage,
		currentImage: params.currentImage,
	});

	if (avatarAccessError) {
		throw new TRPCError(avatarAccessError);
	}
}

export function getModelSelectionError(params: {
	modelId: string;
	latestModelsFeature: unknown;
}): { code: "BAD_REQUEST" | "FORBIDDEN"; message: string } | null {
	if (!isKnownModel(params.modelId)) {
		return {
			code: "BAD_REQUEST",
			message:
				"Unknown AI model selected. Please choose one of the supported models.",
		};
	}

	if (
		!canUseSelectedModelForPlan({
			modelId: params.modelId,
			latestModelsFeature: params.latestModelsFeature,
		})
	) {
		return {
			code: "FORBIDDEN",
			message:
				"This model requires a plan with access to latest AI models. Please upgrade your plan or choose a lower-tier model.",
		};
	}

	return null;
}

export function getCustomAvatarAccessError(params: {
	customAvatarFeature: unknown;
	nextImage: string | null | undefined;
	currentImage?: string | null;
}): { code: "FORBIDDEN"; message: string } | null {
	const nextImage = params.nextImage ?? null;
	const currentImage = params.currentImage ?? null;

	if (!nextImage || nextImage === currentImage) {
		return null;
	}

	if (params.customAvatarFeature === true) {
		return null;
	}

	return {
		code: "FORBIDDEN",
		message:
			"Custom AI agent avatars require the Pro plan. Please upgrade your plan or use the default Cossistant logo.",
	};
}

const GENERATE_BASE_PROMPT_FIRECRAWL_SCRAPE_MAX_AGE_MS = 3_600_000;

export function getGenerateBasePromptFirecrawlOptions(): {
	scrapeOptions: NonNullable<
		Parameters<typeof firecrawlService.extractBrandInfo>[1]
	>;
	mapOptions: Parameters<typeof firecrawlService.mapSite>[1];
} {
	return {
		scrapeOptions: {
			maxAge: GENERATE_BASE_PROMPT_FIRECRAWL_SCRAPE_MAX_AGE_MS,
		},
		mapOptions: {
			limit: 100,
			ignoreCache: false,
		},
	};
}

async function resolveAiAgentModelForRead(params: {
	db: Parameters<typeof updateAiAgentModel>[0];
	agent: Awaited<ReturnType<typeof getAiAgentForWebsite>>;
	websiteSlug: string;
}): Promise<NonNullable<Awaited<ReturnType<typeof getAiAgentForWebsite>>>> {
	if (!params.agent) {
		throw new Error("resolveAiAgentModelForRead requires an agent");
	}

	const modelResolution = resolveModelForExecution(params.agent.model);
	if (!modelResolution.modelMigrationApplied) {
		return params.agent;
	}

	console.warn(
		`[ai-agent] website=${params.websiteSlug} | Migrating unknown saved model to default`,
		{
			aiAgentId: params.agent.id,
			modelIdOriginal: modelResolution.modelIdOriginal,
			modelIdResolved: modelResolution.modelIdResolved,
			migrationApplied: true,
		}
	);

	try {
		const persisted = await updateAiAgentModel(params.db, {
			aiAgentId: params.agent.id,
			model: modelResolution.modelIdResolved,
		});
		if (persisted) {
			return persisted;
		}
	} catch (error) {
		console.warn(
			`[ai-agent] website=${params.websiteSlug} | Failed to persist migrated model`,
			error
		);
	}

	return {
		...params.agent,
		model: modelResolution.modelIdResolved,
	};
}

export const aiAgentRouter = createTRPCRouter({
	/**
	 * Get the AI agent for a website
	 * Returns null if no agent exists
	 */
	get: protectedProcedure
		.input(getAiAgentRequestSchema)
		.output(aiAgentResponseSchema.nullable())
		.query(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const agent = await getAiAgentForWebsite(db, {
				websiteId: websiteData.id,
				organizationId: websiteData.organizationId,
			});

			if (!agent) {
				return null;
			}

			const resolvedAgent = await resolveAiAgentModelForRead({
				db,
				agent,
				websiteSlug: input.websiteSlug,
			});

			return toAiAgentResponse(resolvedAgent);
		}),

	/**
	 * Create a new AI agent for a website
	 * Only one agent per website is allowed
	 */
	create: protectedProcedure
		.input(createAiAgentRequestSchema)
		.output(aiAgentResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			// Check if an agent already exists for this website
			const existingAgent = await getAiAgentForWebsite(db, {
				websiteId: websiteData.id,
				organizationId: websiteData.organizationId,
			});

			if (existingAgent) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "An AI agent already exists for this website",
				});
			}

			await assertModelAllowedForWebsite({
				website: websiteData,
				modelId: input.model,
			});
			await assertCustomAvatarAllowedForWebsite({
				website: websiteData,
				nextImage: input.image,
			});

			const agent = await createAiAgent(db, {
				name: input.name,
				image: input.image,
				description: input.description,
				basePrompt: input.basePrompt,
				model: input.model,
				temperature: input.temperature,
				maxOutputTokens: input.maxOutputTokens,
				goals: input.goals,
				organizationId: websiteData.organizationId,
				websiteId: websiteData.id,
			});

			return toAiAgentResponse(agent);
		}),

	/**
	 * Update an existing AI agent
	 */
	update: protectedProcedure
		.input(updateAiAgentRequestSchema)
		.output(aiAgentResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			await assertModelAllowedForWebsite({
				website: websiteData,
				modelId: input.model,
			});

			const existingAgent = await getAiAgentForWebsiteById(db, {
				aiAgentId: input.aiAgentId,
				websiteId: websiteData.id,
				organizationId: websiteData.organizationId,
			});

			if (!existingAgent) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "AI agent not found",
				});
			}

			await assertCustomAvatarAllowedForWebsite({
				website: websiteData,
				nextImage: input.image,
				currentImage: existingAgent.image,
			});

			const agent = await updateAiAgent(db, {
				aiAgentId: input.aiAgentId,
				name: input.name,
				image: input.image,
				description: input.description,
				basePrompt: input.basePrompt,
				model: input.model,
				temperature: input.temperature,
				maxOutputTokens: input.maxOutputTokens,
				goals: input.goals,
				onboardingCompletedAt: input.onboardingCompletedAt,
			});

			if (!agent) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "AI agent not found",
				});
			}

			if (input.onboardingCompletedAt && !existingAgent.onboardingCompletedAt) {
				try {
					await scheduleAiAgentLifecycleEmail(db, {
						organizationId: websiteData.organizationId,
						websiteId: websiteData.id,
						websiteName: websiteData.name,
						websiteSlug: websiteData.slug,
					});
				} catch (error) {
					console.error("[lifecycle-email] Failed to schedule AI agent email", {
						organizationId: websiteData.organizationId,
						websiteId: websiteData.id,
						error,
					});
				}
			}

			return toAiAgentResponse(agent);
		}),

	/**
	 * Toggle an AI agent's active status
	 */
	toggleActive: protectedProcedure
		.input(toggleAiAgentActiveRequestSchema)
		.output(aiAgentResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const agent = await toggleAiAgentActive(db, {
				aiAgentId: input.aiAgentId,
				isActive: input.isActive,
			});

			if (!agent) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "AI agent not found",
				});
			}

			return toAiAgentResponse(agent);
		}),

	/**
	 * Permanently delete an AI agent
	 * This will also cascade delete all related knowledge entries and link sources
	 */
	delete: protectedProcedure
		.input(deleteAiAgentRequestSchema)
		.output(aiAgentResponseSchema.pick({ id: true }))
		.mutation(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const deleted = await deleteAiAgent(db, {
				aiAgentId: input.aiAgentId,
			});

			if (!deleted) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "AI agent not found",
				});
			}

			return { id: input.aiAgentId };
		}),

	/**
	 * Generate a base prompt by scraping a website and using AI
	 * This endpoint:
	 * 1. Optionally scrapes the provided URL for content and brand information
	 * 2. Uses manualDescription if provided (takes priority over scraped)
	 * 3. Updates the website.description if we got one
	 * 4. Generates a tailored base prompt using AI
	 * 5. Returns the prompt along with extracted brand data
	 */
	generateBasePrompt: protectedProcedure
		.input(generateBasePromptRequestSchema)
		.output(generateBasePromptResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			// Initialize variables for scraped data
			let brandInfo: Awaited<
				ReturnType<typeof firecrawlService.extractBrandInfo>
			> | null = null;
			let mapResult: Awaited<
				ReturnType<typeof firecrawlService.mapSite>
			> | null = null;

			// Only scrape if URL is provided
			if (input.sourceUrl) {
				// Run brand extraction (which scrapes internally) and site mapping in parallel
				// extractBrandInfo returns company name, description, logo, favicon, AND markdown content
				// Use scrape maxAge of 1 hour (in ms) to enable Firecrawl caching - avoids re-paying
				// for API calls when user refreshes the page during onboarding
				const firecrawlOptions = getGenerateBasePromptFirecrawlOptions();
				[brandInfo, mapResult] = await Promise.all([
					firecrawlService.extractBrandInfo(
						input.sourceUrl,
						firecrawlOptions.scrapeOptions
					),
					firecrawlService.mapSite(
						input.sourceUrl,
						firecrawlOptions.mapOptions
					),
				]);

				// Log what Firecrawl returned for debugging
				console.log("[generateBasePrompt] Firecrawl brandInfo:", {
					success: brandInfo?.success,
					companyName: brandInfo?.companyName,
					description: brandInfo?.description?.substring(0, 150),
					hasMarkdown: !!brandInfo?.markdown,
					markdownLength: brandInfo?.markdown?.length ?? 0,
					error: brandInfo?.error,
				});
				console.log("[generateBasePrompt] Firecrawl mapResult:", {
					success: mapResult?.success,
					urlsCount: mapResult?.urls?.length ?? 0,
					error: mapResult?.error,
				});
			}

			// Determine description: manual > scraped > null
			// Manual description takes priority
			const websiteDescription =
				input.manualDescription ?? brandInfo?.description ?? null;

			console.log("[generateBasePrompt] Description resolution:", {
				manualDescription: input.manualDescription?.substring(0, 100),
				brandInfoDescription: brandInfo?.description?.substring(0, 100),
				finalDescription: websiteDescription?.substring(0, 100),
			});

			// Update the website description if we have one and it's not already set
			if (websiteDescription && !websiteData.description) {
				console.log("[generateBasePrompt] Saving description to website:", {
					websiteId: websiteData.id,
					descriptionLength: websiteDescription.length,
				});
				try {
					await updateWebsite(db, {
						orgId: websiteData.organizationId,
						websiteId: websiteData.id,
						data: {
							description: websiteDescription,
						},
					});
					console.log(
						"[generateBasePrompt] Website description saved successfully"
					);
				} catch (error) {
					// Log but don't fail - updating description is nice-to-have
					console.error(
						"[generateBasePrompt] Failed to update website description:",
						error
					);
				}
			} else if (websiteDescription && websiteData.description) {
				console.log(
					"[generateBasePrompt] Website already has description, skipping update"
				);
			} else {
				console.log("[generateBasePrompt] No description to save");
			}

			// Generate the base prompt using AI
			const promptOptions = {
				brandInfo: {
					success: brandInfo?.success ?? false,
					companyName: brandInfo?.companyName ?? websiteData.name,
					description: websiteDescription ?? undefined,
					logo: brandInfo?.logo,
					favicon: brandInfo?.favicon,
					language: brandInfo?.language,
					keywords: brandInfo?.keywords,
				},
				content: brandInfo?.markdown,
				goals: input.goals,
				agentName: input.agentName,
				domain: websiteData.domain,
				aiContext: {
					db,
					organizationId: websiteData.organizationId,
					websiteId: websiteData.id,
				},
			};

			console.log("[generateBasePrompt] Calling prompt generator with:", {
				companyName: promptOptions.brandInfo.companyName,
				description: promptOptions.brandInfo.description?.substring(0, 100),
				hasContent: !!promptOptions.content,
				contentLength: promptOptions.content?.length ?? 0,
				goals: promptOptions.goals,
				agentName: promptOptions.agentName,
				domain: promptOptions.domain,
			});

			const promptResult = await generateAgentBasePrompt(promptOptions);

			return {
				basePrompt: promptResult.prompt,
				isGenerated: promptResult.isGenerated,
				companyName: brandInfo?.companyName ?? websiteData.name,
				websiteDescription,
				logo: brandInfo?.logo ?? null,
				favicon: brandInfo?.favicon ?? null,
				discoveredLinksCount: mapResult?.success
					? (mapResult.urls?.length ?? 0)
					: 0,
			};
		}),

	/**
	 * Get behavior settings for an AI agent
	 * Returns the settings merged with defaults
	 */
	getBehaviorSettings: protectedProcedure
		.input(getBehaviorSettingsRequestSchema)
		.output(getBehaviorSettingsResponseSchema)
		.query(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const agent = await getAiAgentForWebsite(db, {
				websiteId: websiteData.id,
				organizationId: websiteData.organizationId,
			});

			if (!agent) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "AI agent not found for this website",
				});
			}

			// Get settings merged with defaults
			const settings = getBehaviorSettings(agent);

			return {
				aiAgentId: agent.id,
				...settings,
			};
		}),

	/**
	 * Update behavior settings for an AI agent
	 * Merges provided settings with existing settings
	 */
	updateBehaviorSettings: protectedProcedure
		.input(updateBehaviorSettingsRequestSchema)
		.output(updateBehaviorSettingsResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const agent = await updateAiAgentBehaviorSettings(db, {
				aiAgentId: input.aiAgentId,
				behaviorSettings: input.settings,
			});

			if (!agent) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "AI agent not found",
				});
			}

			// Return the updated settings merged with defaults
			return getBehaviorSettings(agent);
		}),

	getPromptStudio: protectedProcedure
		.input(getPromptStudioRequestSchema)
		.output(getPromptStudioResponseSchema)
		.query(async ({ ctx: { db, user }, input }) => {
			const { websiteData, agent } = await getWebsiteAndAgentForPromptStudio({
				db,
				userId: user.id,
				websiteSlug: input.websiteSlug,
				aiAgentId: input.aiAgentId,
			});

			return buildPromptStudioEntries({
				db,
				organizationId: websiteData.organizationId,
				websiteId: websiteData.id,
				aiAgent: agent,
			});
		}),

	upsertCorePrompt: protectedProcedure
		.input(upsertCorePromptRequestSchema)
		.output(upsertCorePromptResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { websiteData, agent } = await getWebsiteAndAgentForPromptStudio({
				db,
				userId: user.id,
				websiteSlug: input.websiteSlug,
				aiAgentId: input.aiAgentId,
			});

			return upsertEditableCorePromptDocument({
				db,
				organizationId: websiteData.organizationId,
				websiteId: websiteData.id,
				aiAgent: agent,
				updatedByUserId: user.id,
				documentName: input.documentName,
				content: input.content,
			});
		}),

	resetCorePrompt: protectedProcedure
		.input(resetCorePromptRequestSchema)
		.output(resetCorePromptResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { websiteData } = await getWebsiteAndAgentForPromptStudio({
				db,
				userId: user.id,
				websiteSlug: input.websiteSlug,
				aiAgentId: input.aiAgentId,
			});

			return resetEditableCorePromptDocument({
				db,
				organizationId: websiteData.organizationId,
				websiteId: websiteData.id,
				aiAgentId: input.aiAgentId,
				documentName: input.documentName,
			});
		}),

	getBehaviorStudio: protectedProcedure
		.input(getBehaviorStudioRequestSchema)
		.output(getBehaviorStudioResponseSchema)
		.query(async ({ ctx: { db, user }, input }) => {
			const { websiteData, agent } = await getWebsiteAndAgentForPromptStudio({
				db,
				userId: user.id,
				websiteSlug: input.websiteSlug,
				aiAgentId: input.aiAgentId,
			});

			const promptStudio = await buildPromptStudioEntries({
				db,
				organizationId: websiteData.organizationId,
				websiteId: websiteData.id,
				aiAgent: agent,
			});
			const corePromptByDocumentName = new Map(
				promptStudio.corePrompts.map((entry) => [entry.documentName, entry])
			);

			const behaviors = getBehaviorPromptCatalog().map((behavior) => {
				const corePrompt = corePromptByDocumentName.get(behavior.documentName);
				const defaultContent =
					corePrompt?.defaultContent ?? behavior.defaultContent;

				return {
					id: behavior.id,
					label: behavior.label,
					description: behavior.description,
					documentName: behavior.documentName,
					content: corePrompt?.content ?? defaultContent,
					defaultContent,
					hasOverride: corePrompt?.hasOverride ?? false,
					documentId: corePrompt?.documentId ?? null,
					presets: corePrompt ? [...corePrompt.presets] : [...behavior.presets],
				};
			});

			return {
				aiAgentId: promptStudio.aiAgentId,
				behaviors,
			};
		}),

	upsertBehaviorPrompt: protectedProcedure
		.input(upsertBehaviorPromptRequestSchema)
		.output(upsertBehaviorPromptResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { websiteData, agent } = await getWebsiteAndAgentForPromptStudio({
				db,
				userId: user.id,
				websiteSlug: input.websiteSlug,
				aiAgentId: input.aiAgentId,
			});

			const behaviorDefinition = getBehaviorPromptDefinition(input.behaviorId);
			if (!behaviorDefinition) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Unknown behavior id",
				});
			}

			return upsertEditableCorePromptDocument({
				db,
				organizationId: websiteData.organizationId,
				websiteId: websiteData.id,
				aiAgent: agent,
				updatedByUserId: user.id,
				documentName: behaviorDefinition.documentName,
				content: input.content,
			});
		}),

	resetBehaviorPrompt: protectedProcedure
		.input(resetBehaviorPromptRequestSchema)
		.output(resetBehaviorPromptResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { websiteData } = await getWebsiteAndAgentForPromptStudio({
				db,
				userId: user.id,
				websiteSlug: input.websiteSlug,
				aiAgentId: input.aiAgentId,
			});

			const behaviorDefinition = getBehaviorPromptDefinition(input.behaviorId);
			if (!behaviorDefinition) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Unknown behavior id",
				});
			}

			return resetEditableCorePromptDocument({
				db,
				organizationId: websiteData.organizationId,
				websiteId: websiteData.id,
				aiAgentId: input.aiAgentId,
				documentName: behaviorDefinition.documentName,
			});
		}),

	getCapabilitiesStudio: protectedProcedure
		.input(getCapabilitiesStudioRequestSchema)
		.output(getCapabilitiesStudioResponseSchema)
		.query(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const agent = await getAiAgentForWebsite(db, {
				websiteId: websiteData.id,
				organizationId: websiteData.organizationId,
			});

			if (!agent || agent.id !== input.aiAgentId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "AI agent not found",
				});
			}

			const documents = await listAiAgentPromptDocuments(db, {
				organizationId: websiteData.organizationId,
				websiteId: websiteData.id,
				aiAgentId: input.aiAgentId,
			});

			return buildCapabilitiesStudioResponse({
				aiAgent: agent,
				documents,
			});
		}),

	upsertToolSkillOverride: protectedProcedure
		.input(upsertToolSkillOverrideRequestSchema)
		.output(aiAgentPromptDocumentResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const agent = await getAiAgentForWebsite(db, {
				websiteId: websiteData.id,
				organizationId: websiteData.organizationId,
			});

			if (!agent || agent.id !== input.aiAgentId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "AI agent not found",
				});
			}

			const tool = AI_AGENT_TOOL_CATALOG.find(
				(entry) => entry.id === input.toolId
			);
			if (!tool) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Unknown tool id",
				});
			}

			const documents = await listAiAgentPromptDocuments(
				db,
				{
					organizationId: websiteData.organizationId,
					websiteId: websiteData.id,
					aiAgentId: input.aiAgentId,
				},
				{ kind: "skill" }
			);
			const existing = documents.find(
				(document) => document.name === tool.defaultSkill.name
			);

			try {
				if (existing) {
					const updated = await updateAiAgentSkillPromptDocument(db, {
						organizationId: websiteData.organizationId,
						websiteId: websiteData.id,
						aiAgentId: input.aiAgentId,
						skillDocumentId: existing.id,
						name: tool.defaultSkill.name,
						content: input.content,
						enabled: true,
						priority: tool.order,
						updatedByUserId: user.id,
					});

					if (!updated) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Skill document not found",
						});
					}

					return toPromptDocumentResponse(updated);
				}

				const created = await createAiAgentSkillPromptDocument(db, {
					organizationId: websiteData.organizationId,
					websiteId: websiteData.id,
					aiAgentId: input.aiAgentId,
					name: tool.defaultSkill.name,
					content: input.content,
					enabled: true,
					priority: tool.order,
					createdByUserId: user.id,
				});

				return toPromptDocumentResponse(created);
			} catch (error) {
				handlePromptDocumentMutationError(error);
			}
		}),

	resetToolSkillOverride: protectedProcedure
		.input(resetToolSkillOverrideRequestSchema)
		.output(z.object({ removed: z.boolean() }))
		.mutation(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const agent = await getAiAgentForWebsite(db, {
				websiteId: websiteData.id,
				organizationId: websiteData.organizationId,
			});

			if (!agent || agent.id !== input.aiAgentId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "AI agent not found",
				});
			}

			const tool = AI_AGENT_TOOL_CATALOG.find(
				(entry) => entry.id === input.toolId
			);
			if (!tool) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Unknown tool id",
				});
			}

			const documents = await listAiAgentPromptDocuments(
				db,
				{
					organizationId: websiteData.organizationId,
					websiteId: websiteData.id,
					aiAgentId: input.aiAgentId,
				},
				{ kind: "skill" }
			);
			const existing = documents.find(
				(document) => document.name === tool.defaultSkill.name
			);

			if (!existing) {
				return { removed: false };
			}

			const removed = await deleteAiAgentSkillPromptDocument(db, {
				organizationId: websiteData.organizationId,
				websiteId: websiteData.id,
				aiAgentId: input.aiAgentId,
				skillDocumentId: existing.id,
			});

			return { removed };
		}),

	createSkillDocument: protectedProcedure
		.input(createSkillDocumentRequestSchema)
		.output(aiAgentPromptDocumentResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const agent = await getAiAgentForWebsite(db, {
				websiteId: websiteData.id,
				organizationId: websiteData.organizationId,
			});

			if (!agent || agent.id !== input.aiAgentId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "AI agent not found",
				});
			}

			assertCustomSkillNameAllowed(input.name);

			try {
				const document = await createAiAgentSkillPromptDocument(db, {
					organizationId: websiteData.organizationId,
					websiteId: websiteData.id,
					aiAgentId: input.aiAgentId,
					name: input.name,
					content: input.content,
					enabled: input.enabled,
					priority: input.priority,
					createdByUserId: user.id,
				});

				return toPromptDocumentResponse(document);
			} catch (error) {
				handlePromptDocumentMutationError(error);
			}
		}),

	updateSkillDocument: protectedProcedure
		.input(updateSkillDocumentRequestSchema)
		.output(aiAgentPromptDocumentResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const agent = await getAiAgentForWebsite(db, {
				websiteId: websiteData.id,
				organizationId: websiteData.organizationId,
			});

			if (!agent || agent.id !== input.aiAgentId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "AI agent not found",
				});
			}

			const skillDocuments = await listAiAgentPromptDocuments(
				db,
				{
					organizationId: websiteData.organizationId,
					websiteId: websiteData.id,
					aiAgentId: input.aiAgentId,
				},
				{ kind: "skill" }
			);
			const existingSkill = skillDocuments.find(
				(doc) => doc.id === input.skillDocumentId
			);
			if (!existingSkill) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Skill document not found",
				});
			}
			assertCustomSkillNameAllowed(existingSkill.name);

			if (input.name) {
				assertCustomSkillNameAllowed(input.name);
			}

			try {
				const document = await updateAiAgentSkillPromptDocument(db, {
					organizationId: websiteData.organizationId,
					websiteId: websiteData.id,
					aiAgentId: input.aiAgentId,
					skillDocumentId: input.skillDocumentId,
					name: input.name,
					content: input.content,
					enabled: input.enabled,
					priority: input.priority,
					updatedByUserId: user.id,
				});

				if (!document) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Skill document not found",
					});
				}

				return toPromptDocumentResponse(document);
			} catch (error) {
				handlePromptDocumentMutationError(error);
			}
		}),

	deleteSkillDocument: protectedProcedure
		.input(deleteSkillDocumentRequestSchema)
		.output(z.object({ id: z.ulid() }))
		.mutation(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const agent = await getAiAgentForWebsite(db, {
				websiteId: websiteData.id,
				organizationId: websiteData.organizationId,
			});

			if (!agent || agent.id !== input.aiAgentId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "AI agent not found",
				});
			}

			const skillDocuments = await listAiAgentPromptDocuments(
				db,
				{
					organizationId: websiteData.organizationId,
					websiteId: websiteData.id,
					aiAgentId: input.aiAgentId,
				},
				{ kind: "skill" }
			);
			const existingSkill = skillDocuments.find(
				(document) => document.id === input.skillDocumentId
			);
			if (!existingSkill) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Skill document not found",
				});
			}
			assertCustomSkillNameAllowed(existingSkill.name);

			const deleted = await deleteAiAgentSkillPromptDocument(db, {
				organizationId: websiteData.organizationId,
				websiteId: websiteData.id,
				aiAgentId: input.aiAgentId,
				skillDocumentId: input.skillDocumentId,
			});

			if (!deleted) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Skill document not found",
				});
			}

			return { id: input.skillDocumentId };
		}),

	toggleSkillDocument: protectedProcedure
		.input(toggleSkillDocumentRequestSchema)
		.output(aiAgentPromptDocumentResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const agent = await getAiAgentForWebsite(db, {
				websiteId: websiteData.id,
				organizationId: websiteData.organizationId,
			});

			if (!agent || agent.id !== input.aiAgentId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "AI agent not found",
				});
			}

			const skillDocuments = await listAiAgentPromptDocuments(
				db,
				{
					organizationId: websiteData.organizationId,
					websiteId: websiteData.id,
					aiAgentId: input.aiAgentId,
				},
				{ kind: "skill" }
			);
			const existingSkill = skillDocuments.find(
				(doc) => doc.id === input.skillDocumentId
			);
			if (!existingSkill) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Skill document not found",
				});
			}
			assertCustomSkillNameAllowed(existingSkill.name);

			const document = await toggleAiAgentSkillPromptDocument(db, {
				organizationId: websiteData.organizationId,
				websiteId: websiteData.id,
				aiAgentId: input.aiAgentId,
				skillDocumentId: input.skillDocumentId,
				enabled: input.enabled,
				updatedByUserId: user.id,
			});

			if (!document) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Skill document not found",
				});
			}

			return toPromptDocumentResponse(document);
		}),

	/**
	 * Check if the AI agent needs training and whether the user can train now.
	 * Used to gate the Train button in the UI.
	 */
	getTrainingReadiness: protectedProcedure
		.input(z.object({ websiteSlug: z.string() }))
		.output(
			z.object({
				needsTraining: z.boolean(),
				canTrainAt: z.string().nullable(),
				isFreePlan: z.boolean(),
				updatedSourcesCount: z.number(),
			})
		)
		.query(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const agent = await getAiAgentForWebsite(db, {
				websiteId: websiteData.id,
				organizationId: websiteData.organizationId,
			});

			if (!agent) {
				return {
					needsTraining: false,
					canTrainAt: null,
					isFreePlan: true,
					updatedSourcesCount: 0,
				};
			}

			const updatedSourcesCount = await countIncludedKnowledgeSources(db, {
				websiteId: websiteData.id,
				lastTrainedAt: agent.lastTrainedAt,
			});

			// If never trained, check if there are any sources at all
			let needsTraining: boolean;
			if (agent.lastTrainedAt) {
				needsTraining = updatedSourcesCount > 0;
			} else {
				const totalSourcesCount = await countIncludedKnowledgeSources(db, {
					websiteId: websiteData.id,
				});
				needsTraining = totalSourcesCount > 0;
			}

			// Check plan and training interval cooldown
			const planInfo = await getPlanForWebsite(websiteData);
			const isFreePlan = planInfo.planName === "free";
			const cooldownMs = getTrainingCooldownMs(
				planInfo.features["ai-agent-training-interval"]
			);

			let canTrainAt: string | null = null;
			if (cooldownMs > 0 && agent.lastTrainedAt) {
				const lastTrainedDate = new Date(agent.lastTrainedAt);
				const cooldownEnd = new Date(lastTrainedDate.getTime() + cooldownMs);
				if (cooldownEnd > new Date()) {
					canTrainAt = cooldownEnd.toISOString();
				}
			}

			return {
				needsTraining,
				canTrainAt,
				isFreePlan,
				updatedSourcesCount,
			};
		}),

	/**
	 * Start training the AI agent's knowledge base
	 * Processes all included knowledge items and generates embeddings
	 */
	startTraining: protectedProcedure
		.input(
			z.object({
				websiteSlug: z.string(),
				aiAgentId: z.string(),
			})
		)
		.output(
			z.object({
				jobId: z.string(),
				status: z.string(),
			})
		)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const agent = await getAiAgentForWebsite(db, {
				websiteId: websiteData.id,
				organizationId: websiteData.organizationId,
			});

			if (!agent || agent.id !== input.aiAgentId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "AI agent not found",
				});
			}

			// Check if already training
			if (
				agent.trainingStatus === "training" ||
				agent.trainingStatus === "pending"
			) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "Training is already in progress",
				});
			}

			// Check training interval cooldown
			const planInfo = await getPlanForWebsite(websiteData);
			const cooldownMs = getTrainingCooldownMs(
				planInfo.features["ai-agent-training-interval"]
			);
			if (cooldownMs > 0 && agent.lastTrainedAt) {
				const cooldownEnd = new Date(
					new Date(agent.lastTrainedAt).getTime() + cooldownMs
				);
				if (cooldownEnd > new Date()) {
					throw new TRPCError({
						code: "TOO_MANY_REQUESTS",
						message: `Your plan allows training every ${Math.round(cooldownMs / 60_000)} minutes. Try again after ${cooldownEnd.toISOString()}`,
					});
				}
			}

			// Update status to pending
			await updateAiAgentTrainingStatus(db, {
				aiAgentId: agent.id,
				trainingStatus: "pending",
				trainingProgress: 0,
				trainingError: null,
			});

			// Enqueue the training job
			const jobId = await triggerAiTraining({
				websiteId: websiteData.id,
				organizationId: websiteData.organizationId,
				aiAgentId: agent.id,
				triggeredBy: user.id,
			});

			return {
				jobId,
				status: "pending",
			};
		}),

	/**
	 * Get the current training status for an AI agent
	 */
	getTrainingStatus: protectedProcedure
		.input(
			z.object({
				websiteSlug: z.string(),
			})
		)
		.output(
			z.object({
				trainingStatus: z.enum([
					"idle",
					"pending",
					"training",
					"completed",
					"failed",
				]),
				trainingProgress: z.number(),
				trainingError: z.string().nullable(),
				trainingStartedAt: z.string().nullable(),
				trainedItemsCount: z.number().nullable(),
				lastTrainedAt: z.string().nullable(),
			})
		)
		.query(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const agent = await getAiAgentForWebsite(db, {
				websiteId: websiteData.id,
				organizationId: websiteData.organizationId,
			});

			if (!agent) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "AI agent not found",
				});
			}

			return {
				trainingStatus: (agent.trainingStatus ?? "idle") as
					| "idle"
					| "pending"
					| "training"
					| "completed"
					| "failed",
				trainingProgress: agent.trainingProgress ?? 0,
				trainingError: agent.trainingError ?? null,
				trainingStartedAt: agent.trainingStartedAt ?? null,
				trainedItemsCount: agent.trainedItemsCount ?? null,
				lastTrainedAt: agent.lastTrainedAt ?? null,
			};
		}),
});
