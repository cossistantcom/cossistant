import { z } from "@hono/zod-openapi";
import {
	AI_AGENT_BEHAVIOR_SETTING_KEYS,
	AI_AGENT_DROPPED_SKILL_TEMPLATE_NAMES,
	AI_AGENT_RESERVED_TOOL_SKILL_TEMPLATE_NAMES,
	AI_AGENT_TOOL_CATEGORIES,
	AI_AGENT_TOOL_GROUPS,
	AI_AGENT_TOOL_IDS,
} from "./ai-agent-capabilities";
import { apiTimestampSchema, nullableApiTimestampSchema } from "./common";

/**
 * Model selection options are API-canonical and returned by `plan.getPlanInfo.aiModels`.
 * Keep request/response schemas generic to avoid hard-coded frontend model policy drift.
 */

/**
 * Available AI agent goals/intents
 */
export const AI_AGENT_GOALS = [
	{ value: "sales", label: "Increase sales conversions" },
	{ value: "support", label: "Provide customer support" },
	{ value: "product_qa", label: "Answer product questions" },
	{ value: "lead_qualification", label: "Qualify leads" },
	{ value: "scheduling", label: "Schedule appointments" },
	{ value: "feedback", label: "Collect customer feedback" },
] as const;

export type AIAgentGoal = (typeof AI_AGENT_GOALS)[number]["value"];

export const AI_AGENT_CORE_PROMPT_DOCUMENT_NAMES = [
	"agent.md",
	"security.md",
	"behaviour.md",
	"visitor-contact.md",
	"participation.md",
	"decision.md",
	"grounding.md",
	"capabilities.md",
] as const;
export type AiAgentCorePromptDocumentName =
	(typeof AI_AGENT_CORE_PROMPT_DOCUMENT_NAMES)[number];

export const AI_AGENT_EDITABLE_CORE_PROMPT_DOCUMENT_NAMES = [
	"behaviour.md",
	"participation.md",
	"grounding.md",
	"capabilities.md",
	"visitor-contact.md",
	"decision.md",
] as const;
export type AiAgentEditableCorePromptDocumentName =
	(typeof AI_AGENT_EDITABLE_CORE_PROMPT_DOCUMENT_NAMES)[number];

export const AI_AGENT_BEHAVIOR_PROMPT_IDS = [
	"visitor_contact",
	"smart_decision",
] as const;
export type AiAgentBehaviorPromptId =
	(typeof AI_AGENT_BEHAVIOR_PROMPT_IDS)[number];

export const AI_AGENT_BEHAVIOR_PROMPT_DOCUMENT_NAMES = [
	"visitor-contact.md",
	"decision.md",
] as const;
export type AiAgentBehaviorPromptDocumentName =
	(typeof AI_AGENT_BEHAVIOR_PROMPT_DOCUMENT_NAMES)[number];

export const aiAgentPromptDocumentKindSchema = z.enum(["core", "skill"]);

export const aiAgentSkillPromptDocumentNameSchema = z
	.string()
	.regex(/^[a-z0-9][a-z0-9-]{1,62}\.md$/, {
		message: "Skill name must match ^[a-z0-9][a-z0-9-]{1,62}\\.md$",
	})
	.refine(
		(value) => !AI_AGENT_CORE_PROMPT_DOCUMENT_NAMES.includes(value as never),
		{
			message: "Skill name cannot use reserved core document names.",
		}
	);

export const aiAgentCustomSkillPromptDocumentNameSchema =
	aiAgentSkillPromptDocumentNameSchema
		.refine(
			(value) =>
				!AI_AGENT_RESERVED_TOOL_SKILL_TEMPLATE_NAMES.includes(value as never),
			{
				message: "Skill name is reserved for a default tool-attached skill.",
			}
		)
		.refine(
			(value) =>
				!AI_AGENT_DROPPED_SKILL_TEMPLATE_NAMES.includes(value as never),
			{
				message: "Skill name is reserved and cannot be used.",
			}
		);

export const aiAgentPromptDocumentResponseSchema = z.object({
	id: z.ulid(),
	organizationId: z.ulid(),
	websiteId: z.ulid(),
	aiAgentId: z.ulid(),
	kind: aiAgentPromptDocumentKindSchema,
	name: z.string(),
	content: z.string(),
	enabled: z.boolean(),
	priority: z.number().int(),
	createdByUserId: z.ulid().nullable(),
	updatedByUserId: z.ulid().nullable(),
	createdAt: apiTimestampSchema,
	updatedAt: apiTimestampSchema,
});

/**
 * AI Agent response schema
 */
export const aiAgentResponseSchema = z.object({
	id: z.ulid().openapi({
		description: "The AI agent's unique identifier.",
		example: "01JG000000000000000000000",
	}),
	name: z.string().openapi({
		description: "The AI agent's display name.",
		example: "Support Assistant",
	}),
	image: z.string().nullable().openapi({
		description: "The AI agent's profile image URL.",
		example: "https://cdn.example.com/agent-avatar.png",
	}),
	description: z.string().nullable().openapi({
		description: "A brief description of the AI agent's purpose.",
		example: "Helps users with common support questions.",
	}),
	basePrompt: z.string().openapi({
		description: "The system prompt that defines the AI agent's behavior.",
		example: "You are a helpful support assistant...",
	}),
	model: z.string().openapi({
		description: "The OpenRouter model identifier.",
		example: "moonshotai/kimi-k2-0905",
	}),
	temperature: z.number().nullable().openapi({
		description: "The temperature setting for response generation (0-2).",
		example: 0.7,
	}),
	maxOutputTokens: z.number().nullable().openapi({
		description: "Maximum tokens for response generation.",
		example: 1024,
	}),
	isActive: z.boolean().openapi({
		description: "Whether the AI agent is currently active.",
		example: true,
	}),
	lastUsedAt: nullableApiTimestampSchema.openapi({
		description: "When the AI agent was last used.",
		example: "2024-01-01T00:00:00.000Z",
	}),
	usageCount: z.number().openapi({
		description: "Total number of times the AI agent has been used.",
		example: 42,
	}),
	goals: z
		.array(z.string())
		.nullable()
		.openapi({
			description: "The goals/intents for this AI agent.",
			example: ["support", "product_qa"],
		}),
	createdAt: apiTimestampSchema.openapi({
		description: "When the AI agent was created.",
		example: "2024-01-01T00:00:00.000Z",
	}),
	updatedAt: apiTimestampSchema.openapi({
		description: "When the AI agent was last updated.",
		example: "2024-01-01T00:00:00.000Z",
	}),
	onboardingCompletedAt: nullableApiTimestampSchema.openapi({
		description:
			"When onboarding was completed. Null if still in onboarding flow.",
		example: "2024-01-01T00:00:00.000Z",
	}),
});

/**
 * Create AI Agent request schema
 */
export const createAiAgentRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug to create the AI agent for.",
			example: "my-website",
		}),
		name: z
			.string()
			.min(1, { message: "Name is required." })
			.max(100, { message: "Name must be 100 characters or fewer." })
			.openapi({
				description: "The AI agent's display name.",
				example: "Support Assistant",
			}),
		image: z.string().url().nullable().optional().openapi({
			description:
				"The AI agent's profile image URL. Set to null to use the default Cossistant logo.",
			example: "https://cdn.example.com/agent-avatar.png",
		}),
		description: z
			.string()
			.max(500, { message: "Description must be 500 characters or fewer." })
			.optional()
			.openapi({
				description: "A brief description of the AI agent's purpose.",
				example: "Helps users with common support questions.",
			}),
		basePrompt: z
			.string()
			.min(1, { message: "Base prompt is required." })
			.max(10_000, {
				message: "Base prompt must be 10,000 characters or fewer.",
			})
			.openapi({
				description: "The system prompt that defines the AI agent's behavior.",
				example: "You are a helpful support assistant...",
			}),
		model: z.string().min(1, { message: "Model is required." }).openapi({
			description: "The OpenRouter model identifier.",
			example: "moonshotai/kimi-k2-0905",
		}),
		temperature: z
			.number()
			.min(0, { message: "Temperature must be at least 0." })
			.max(2, { message: "Temperature must be at most 2." })
			.optional()
			.openapi({
				description: "The temperature setting for response generation (0-2).",
				example: 0.7,
			}),
		maxOutputTokens: z
			.number()
			.min(100, { message: "Max tokens must be at least 100." })
			.max(16_000, { message: "Max tokens must be at most 16,000." })
			.optional()
			.openapi({
				description: "Maximum tokens for response generation.",
				example: 1024,
			}),
		goals: z
			.array(z.string())
			.optional()
			.openapi({
				description: "The goals/intents for this AI agent.",
				example: ["support", "product_qa"],
			}),
	})
	.openapi({
		description: "Payload used to create a new AI agent.",
	});

/**
 * Update AI Agent request schema
 */
export const updateAiAgentRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug.",
			example: "my-website",
		}),
		aiAgentId: z.ulid().openapi({
			description: "The AI agent's unique identifier.",
			example: "01JG000000000000000000000",
		}),
		name: z
			.string()
			.min(1, { message: "Name is required." })
			.max(100, { message: "Name must be 100 characters or fewer." })
			.openapi({
				description: "The AI agent's display name.",
				example: "Support Assistant",
			}),
		image: z.string().url().nullable().optional().openapi({
			description:
				"The AI agent's profile image URL. Set to null to use the default Cossistant logo.",
			example: "https://cdn.example.com/agent-avatar.png",
		}),
		description: z
			.string()
			.max(500, { message: "Description must be 500 characters or fewer." })
			.nullable()
			.optional()
			.openapi({
				description: "A brief description of the AI agent's purpose.",
				example: "Helps users with common support questions.",
			}),
		basePrompt: z
			.string()
			.min(1, { message: "Base prompt is required." })
			.max(10_000, {
				message: "Base prompt must be 10,000 characters or fewer.",
			})
			.openapi({
				description: "The system prompt that defines the AI agent's behavior.",
				example: "You are a helpful support assistant...",
			}),
		model: z.string().min(1, { message: "Model is required." }).openapi({
			description: "The OpenRouter model identifier.",
			example: "moonshotai/kimi-k2-0905",
		}),
		temperature: z
			.number()
			.min(0, { message: "Temperature must be at least 0." })
			.max(2, { message: "Temperature must be at most 2." })
			.nullable()
			.optional()
			.openapi({
				description: "The temperature setting for response generation (0-2).",
				example: 0.7,
			}),
		maxOutputTokens: z
			.number()
			.min(100, { message: "Max tokens must be at least 100." })
			.max(16_000, { message: "Max tokens must be at most 16,000." })
			.nullable()
			.optional()
			.openapi({
				description: "Maximum tokens for response generation.",
				example: 1024,
			}),
		goals: z
			.array(z.string())
			.nullable()
			.optional()
			.openapi({
				description: "The goals/intents for this AI agent.",
				example: ["support", "product_qa"],
			}),
		onboardingCompletedAt: nullableApiTimestampSchema.optional().openapi({
			description:
				"Mark onboarding as complete by setting this timestamp. Set to current ISO timestamp to complete onboarding.",
			example: "2024-01-01T00:00:00.000Z",
		}),
	})
	.openapi({
		description: "Payload used to update an existing AI agent.",
	});

/**
 * Toggle AI Agent active status request schema
 */
export const toggleAiAgentActiveRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug.",
			example: "my-website",
		}),
		aiAgentId: z.ulid().openapi({
			description: "The AI agent's unique identifier.",
			example: "01JG000000000000000000000",
		}),
		isActive: z.boolean().openapi({
			description: "Whether the AI agent should be active.",
			example: true,
		}),
	})
	.openapi({
		description: "Payload used to toggle an AI agent's active status.",
	});

/**
 * Delete AI Agent request schema
 */
export const deleteAiAgentRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug.",
			example: "my-website",
		}),
		aiAgentId: z.ulid().openapi({
			description: "The AI agent's unique identifier.",
			example: "01JG000000000000000000000",
		}),
	})
	.openapi({
		description: "Payload used to permanently delete an AI agent.",
	});

/**
 * Get AI Agent request schema
 */
export const getAiAgentRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug.",
			example: "my-website",
		}),
	})
	.openapi({
		description: "Request to get the AI agent for a website.",
	});

/**
 * Generate Base Prompt request schema
 * Used to scrape a website and generate a tailored base prompt for the AI agent
 */
export const generateBasePromptRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug.",
			example: "my-website",
		}),
		sourceUrl: z
			.string()
			.url({ message: "Please enter a valid URL." })
			.optional()
			.openapi({
				description:
					"The URL to scrape for content and brand information. Optional - if not provided, manualDescription should be used.",
				example: "https://example.com",
			}),
		agentName: z
			.string()
			.min(1, { message: "Agent name is required." })
			.max(100, { message: "Agent name must be 100 characters or fewer." })
			.openapi({
				description: "The name for the AI agent.",
				example: "Support Assistant",
			}),
		goals: z.array(z.string()).openapi({
			description: "The goals/intents for this AI agent.",
			example: ["support", "product_qa"],
		}),
		manualDescription: z
			.string()
			.max(1000, {
				message: "Description must be 1000 characters or fewer.",
			})
			.optional()
			.openapi({
				description:
					"Manual description of the business, used when scraping returns no description or no URL is provided.",
				example: "We help small businesses manage their inventory efficiently.",
			}),
	})
	.openapi({
		description:
			"Request to generate a base prompt by scraping a website and using AI.",
	});

/**
 * Generate Base Prompt response schema
 */
export const generateBasePromptResponseSchema = z
	.object({
		basePrompt: z.string().openapi({
			description: "The generated base prompt for the AI agent.",
			example: "You are a helpful support assistant for Acme Corp...",
		}),
		isGenerated: z.boolean().openapi({
			description:
				"Whether the prompt was AI-generated (true) or fell back to default (false).",
			example: true,
		}),
		companyName: z.string().nullable().openapi({
			description: "The company name extracted from the website.",
			example: "Acme Corp",
		}),
		websiteDescription: z.string().nullable().openapi({
			description: "The description extracted from the website.",
			example: "Acme Corp helps businesses grow with innovative solutions.",
		}),
		logo: z.string().nullable().openapi({
			description: "The logo URL extracted from the website (og:image).",
			example: "https://example.com/logo.png",
		}),
		favicon: z.string().nullable().openapi({
			description: "The favicon URL extracted from the website.",
			example: "https://example.com/favicon.ico",
		}),
		discoveredLinksCount: z.number().openapi({
			description:
				"Number of pages discovered on the website for future knowledge base training.",
			example: 47,
		}),
	})
	.openapi({
		description:
			"Response containing the generated base prompt and brand info.",
	});

export const createSkillDocumentRequestSchema = z.object({
	websiteSlug: z.string().openapi({
		description: "The website slug.",
		example: "my-website",
	}),
	aiAgentId: z.ulid().openapi({
		description: "The AI agent ID.",
		example: "01JG000000000000000000000",
	}),
	name: aiAgentCustomSkillPromptDocumentNameSchema,
	content: z.string().max(50_000).openapi({
		description: "Markdown content for the skill document.",
		example: "## Workflow\\nWhen refund appears, collect order ID first.",
	}),
	enabled: z.boolean().optional(),
	priority: z.number().int().min(-100).max(100).optional(),
});

export const updateSkillDocumentRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug.",
			example: "my-website",
		}),
		aiAgentId: z.ulid().openapi({
			description: "The AI agent ID.",
			example: "01JG000000000000000000000",
		}),
		skillDocumentId: z.ulid().openapi({
			description: "The skill prompt document ID.",
			example: "01JG000000000000000000000",
		}),
		name: aiAgentCustomSkillPromptDocumentNameSchema.optional(),
		content: z.string().max(50_000).optional(),
		enabled: z.boolean().optional(),
		priority: z.number().int().min(-100).max(100).optional(),
	})
	.refine(
		(data) =>
			data.name !== undefined ||
			data.content !== undefined ||
			data.enabled !== undefined ||
			data.priority !== undefined,
		{
			message: "At least one field must be provided.",
		}
	);

export const deleteSkillDocumentRequestSchema = z.object({
	websiteSlug: z.string().openapi({
		description: "The website slug.",
		example: "my-website",
	}),
	aiAgentId: z.ulid().openapi({
		description: "The AI agent ID.",
		example: "01JG000000000000000000000",
	}),
	skillDocumentId: z.ulid().openapi({
		description: "The skill prompt document ID.",
		example: "01JG000000000000000000000",
	}),
});

export const toggleSkillDocumentRequestSchema = z.object({
	websiteSlug: z.string().openapi({
		description: "The website slug.",
		example: "my-website",
	}),
	aiAgentId: z.ulid().openapi({
		description: "The AI agent ID.",
		example: "01JG000000000000000000000",
	}),
	skillDocumentId: z.ulid().openapi({
		description: "The skill prompt document ID.",
		example: "01JG000000000000000000000",
	}),
	enabled: z.boolean().openapi({
		description: "Whether the skill is enabled for runtime selection.",
		example: true,
	}),
});

export const aiAgentToolCategorySchema = z.enum(AI_AGENT_TOOL_CATEGORIES);
export const aiAgentToolGroupSchema = z.enum(AI_AGENT_TOOL_GROUPS);
export const aiAgentToolIdSchema = z.enum(AI_AGENT_TOOL_IDS);
export const aiAgentBehaviorSettingKeySchema = z.enum(
	AI_AGENT_BEHAVIOR_SETTING_KEYS
);

export const aiAgentCapabilitiesToolStateSchema = z.object({
	id: aiAgentToolIdSchema,
	label: z.string(),
	description: z.string(),
	category: aiAgentToolCategorySchema,
	group: aiAgentToolGroupSchema,
	order: z.number().int(),
	isSystem: z.boolean(),
	isRequired: z.boolean(),
	isToggleable: z.boolean(),
	behaviorSettingKey: aiAgentBehaviorSettingKeySchema.nullable(),
	enabled: z.boolean(),
	skillName: aiAgentSkillPromptDocumentNameSchema,
	skillLabel: z.string(),
	skillDescription: z.string(),
	skillContent: z.string(),
	skillDocumentId: z.ulid().nullable(),
	skillHasOverride: z.boolean(),
	skillIsCustomized: z.boolean(),
});

export const getCapabilitiesStudioRequestSchema = z.object({
	websiteSlug: z.string().openapi({
		description: "The website slug.",
		example: "my-website",
	}),
	aiAgentId: z.ulid().openapi({
		description: "The AI agent ID.",
		example: "01JG000000000000000000000",
	}),
});

export const getCapabilitiesStudioResponseSchema = z.object({
	aiAgentId: z.ulid(),
	tools: z.array(aiAgentCapabilitiesToolStateSchema),
	customSkillDocuments: z.array(aiAgentPromptDocumentResponseSchema),
});

export const upsertToolSkillOverrideRequestSchema = z.object({
	websiteSlug: z.string().openapi({
		description: "The website slug.",
		example: "my-website",
	}),
	aiAgentId: z.ulid().openapi({
		description: "The AI agent ID.",
		example: "01JG000000000000000000000",
	}),
	toolId: aiAgentToolIdSchema,
	content: z.string().max(50_000).openapi({
		description: "Markdown content for the tool-attached skill override.",
		example: "## Rules\\nUse this tool only when confidence is high.",
	}),
});

export const resetToolSkillOverrideRequestSchema = z.object({
	websiteSlug: z.string().openapi({
		description: "The website slug.",
		example: "my-website",
	}),
	aiAgentId: z.ulid().openapi({
		description: "The AI agent ID.",
		example: "01JG000000000000000000000",
	}),
	toolId: aiAgentToolIdSchema,
});

export const aiAgentBehaviorPromptIdSchema = z.enum(
	AI_AGENT_BEHAVIOR_PROMPT_IDS
);
export const aiAgentBehaviorPromptDocumentNameSchema = z.enum(
	AI_AGENT_BEHAVIOR_PROMPT_DOCUMENT_NAMES
);
export const aiAgentCorePromptDocumentNameSchema = z.enum(
	AI_AGENT_CORE_PROMPT_DOCUMENT_NAMES
);
export const aiAgentEditableCorePromptDocumentNameSchema = z.enum(
	AI_AGENT_EDITABLE_CORE_PROMPT_DOCUMENT_NAMES
);

export const aiAgentBehaviorPromptPresetSchema = z.object({
	id: z.string(),
	label: z.string(),
	description: z.string(),
	content: z.string(),
});

export const aiAgentPromptStudioEntrySchema = z.object({
	documentName: aiAgentEditableCorePromptDocumentNameSchema,
	label: z.string(),
	description: z.string(),
	content: z.string(),
	defaultContent: z.string(),
	hasOverride: z.boolean(),
	documentId: z.ulid().nullable(),
	presets: z.array(aiAgentBehaviorPromptPresetSchema),
});

export const aiAgentBehaviorStudioEntrySchema = z.object({
	id: aiAgentBehaviorPromptIdSchema,
	label: z.string(),
	description: z.string(),
	documentName: aiAgentBehaviorPromptDocumentNameSchema,
	content: z.string(),
	defaultContent: z.string(),
	hasOverride: z.boolean(),
	documentId: z.ulid().nullable(),
	presets: z.array(aiAgentBehaviorPromptPresetSchema),
});

export const getBehaviorStudioRequestSchema = z.object({
	websiteSlug: z.string().openapi({
		description: "The website slug.",
		example: "my-website",
	}),
	aiAgentId: z.ulid().openapi({
		description: "The AI agent ID.",
		example: "01JG000000000000000000000",
	}),
});

export const getBehaviorStudioResponseSchema = z.object({
	aiAgentId: z.ulid(),
	behaviors: z.array(aiAgentBehaviorStudioEntrySchema),
});

export const getPromptStudioRequestSchema = z.object({
	websiteSlug: z.string().openapi({
		description: "The website slug.",
		example: "my-website",
	}),
	aiAgentId: z.ulid().openapi({
		description: "The AI agent ID.",
		example: "01JG000000000000000000000",
	}),
});

export const getPromptStudioResponseSchema = z.object({
	aiAgentId: z.ulid(),
	corePrompts: z.array(aiAgentPromptStudioEntrySchema),
});

export const upsertBehaviorPromptRequestSchema = z.object({
	websiteSlug: z.string().openapi({
		description: "The website slug.",
		example: "my-website",
	}),
	aiAgentId: z.ulid().openapi({
		description: "The AI agent ID.",
		example: "01JG000000000000000000000",
	}),
	behaviorId: aiAgentBehaviorPromptIdSchema,
	content: z.string().max(50_000).openapi({
		description: "Prompt content for the selected behavior.",
		example: "## Visitor Identification\\nAsk only if needed for account work.",
	}),
});

export const upsertCorePromptRequestSchema = z.object({
	websiteSlug: z.string().openapi({
		description: "The website slug.",
		example: "my-website",
	}),
	aiAgentId: z.ulid().openapi({
		description: "The AI agent ID.",
		example: "01JG000000000000000000000",
	}),
	documentName: aiAgentEditableCorePromptDocumentNameSchema,
	content: z.string().max(50_000).openapi({
		description: "Prompt content for the selected core policy document.",
		example: "## Participation Policy\\nSend one concise public reply per run.",
	}),
});

export const upsertBehaviorPromptResponseSchema = z.object({
	removed: z.boolean(),
	document: aiAgentPromptDocumentResponseSchema.nullable(),
});

export const upsertCorePromptResponseSchema =
	upsertBehaviorPromptResponseSchema;

export const resetBehaviorPromptRequestSchema = z.object({
	websiteSlug: z.string().openapi({
		description: "The website slug.",
		example: "my-website",
	}),
	aiAgentId: z.ulid().openapi({
		description: "The AI agent ID.",
		example: "01JG000000000000000000000",
	}),
	behaviorId: aiAgentBehaviorPromptIdSchema,
});

export const resetCorePromptRequestSchema = z.object({
	websiteSlug: z.string().openapi({
		description: "The website slug.",
		example: "my-website",
	}),
	aiAgentId: z.ulid().openapi({
		description: "The AI agent ID.",
		example: "01JG000000000000000000000",
	}),
	documentName: aiAgentEditableCorePromptDocumentNameSchema,
});

export const resetBehaviorPromptResponseSchema = z.object({
	removed: z.boolean(),
});

export const resetCorePromptResponseSchema = resetBehaviorPromptResponseSchema;

export type AiAgentResponse = z.infer<typeof aiAgentResponseSchema>;
export type CreateAiAgentRequest = z.infer<typeof createAiAgentRequestSchema>;
export type UpdateAiAgentRequest = z.infer<typeof updateAiAgentRequestSchema>;
export type ToggleAiAgentActiveRequest = z.infer<
	typeof toggleAiAgentActiveRequestSchema
>;
export type DeleteAiAgentRequest = z.infer<typeof deleteAiAgentRequestSchema>;
export type GetAiAgentRequest = z.infer<typeof getAiAgentRequestSchema>;
export type GenerateBasePromptRequest = z.infer<
	typeof generateBasePromptRequestSchema
>;
export type GenerateBasePromptResponse = z.infer<
	typeof generateBasePromptResponseSchema
>;
export type AiAgentPromptDocumentResponse = z.infer<
	typeof aiAgentPromptDocumentResponseSchema
>;
export type CreateSkillDocumentRequest = z.infer<
	typeof createSkillDocumentRequestSchema
>;
export type UpdateSkillDocumentRequest = z.infer<
	typeof updateSkillDocumentRequestSchema
>;
export type DeleteSkillDocumentRequest = z.infer<
	typeof deleteSkillDocumentRequestSchema
>;
export type ToggleSkillDocumentRequest = z.infer<
	typeof toggleSkillDocumentRequestSchema
>;
export type GetCapabilitiesStudioRequest = z.infer<
	typeof getCapabilitiesStudioRequestSchema
>;
export type GetCapabilitiesStudioResponse = z.infer<
	typeof getCapabilitiesStudioResponseSchema
>;
export type AiAgentCapabilitiesToolState = z.infer<
	typeof aiAgentCapabilitiesToolStateSchema
>;
export type UpsertToolSkillOverrideRequest = z.infer<
	typeof upsertToolSkillOverrideRequestSchema
>;
export type ResetToolSkillOverrideRequest = z.infer<
	typeof resetToolSkillOverrideRequestSchema
>;
export type AiAgentBehaviorPromptPreset = z.infer<
	typeof aiAgentBehaviorPromptPresetSchema
>;
export type AiAgentPromptStudioEntry = z.infer<
	typeof aiAgentPromptStudioEntrySchema
>;
export type AiAgentBehaviorStudioEntry = z.infer<
	typeof aiAgentBehaviorStudioEntrySchema
>;
export type GetBehaviorStudioRequest = z.infer<
	typeof getBehaviorStudioRequestSchema
>;
export type GetBehaviorStudioResponse = z.infer<
	typeof getBehaviorStudioResponseSchema
>;
export type GetPromptStudioRequest = z.infer<
	typeof getPromptStudioRequestSchema
>;
export type GetPromptStudioResponse = z.infer<
	typeof getPromptStudioResponseSchema
>;
export type UpsertBehaviorPromptRequest = z.infer<
	typeof upsertBehaviorPromptRequestSchema
>;
export type UpsertBehaviorPromptResponse = z.infer<
	typeof upsertBehaviorPromptResponseSchema
>;
export type UpsertCorePromptRequest = z.infer<
	typeof upsertCorePromptRequestSchema
>;
export type UpsertCorePromptResponse = z.infer<
	typeof upsertCorePromptResponseSchema
>;
export type ResetBehaviorPromptRequest = z.infer<
	typeof resetBehaviorPromptRequestSchema
>;
export type ResetBehaviorPromptResponse = z.infer<
	typeof resetBehaviorPromptResponseSchema
>;
export type ResetCorePromptRequest = z.infer<
	typeof resetCorePromptRequestSchema
>;
export type ResetCorePromptResponse = z.infer<
	typeof resetCorePromptResponseSchema
>;

/**
 * AI Agent Behavior Settings Schema
 *
 * Controls how the AI agent behaves in conversations.
 * Simplified for MVP - AI responds immediately and decides when to respond
 * based on context, not configuration.
 */
export const aiAgentBehaviorSettingsSchema = z
	.object({
		// Capability toggles
		canResolve: z.boolean().openapi({
			description: "Whether the AI can mark conversations as resolved.",
			example: true,
		}),
		canMarkSpam: z.boolean().openapi({
			description: "Whether the AI can mark conversations as spam.",
			example: true,
		}),
		canAssign: z.boolean().openapi({
			description: "Whether the AI can assign conversations to team members.",
			example: true,
		}),
		canSetPriority: z.boolean().openapi({
			description: "Whether the AI can change conversation priority.",
			example: true,
		}),
		canCategorize: z.boolean().openapi({
			description: "Whether the AI can add conversations to views.",
			example: true,
		}),
		canEscalate: z.boolean().openapi({
			description: "Whether the AI can escalate conversations to human agents.",
			example: true,
		}),
		canRequestKnowledgeClarification: z.boolean().openapi({
			description:
				"Whether the AI can open private knowledge clarification flows for teammates.",
			example: true,
		}),

		// Escalation config
		defaultEscalationUserId: z.string().nullable().openapi({
			description: "Default user ID to assign escalated conversations to.",
			example: null,
		}),
		maxToolInvocationsPerRun: z.number().int().min(10).max(50).openapi({
			description:
				"Maximum number of non-finish tool invocations allowed per run.",
			example: 15,
		}),

		// Background analysis
		autoAnalyzeSentiment: z.boolean().openapi({
			description: "Whether to automatically analyze conversation sentiment.",
			example: true,
		}),
		autoGenerateTitle: z.boolean().openapi({
			description: "Whether to automatically generate conversation titles.",
			example: true,
		}),
		autoCategorize: z.boolean().openapi({
			description:
				"Whether to automatically add conversations to matching views.",
			example: false,
		}),
	})
	.openapi({
		description: "AI agent behavior settings.",
	});

export type AiAgentBehaviorSettings = z.infer<
	typeof aiAgentBehaviorSettingsSchema
>;

/**
 * Get Behavior Settings request schema
 */
export const getBehaviorSettingsRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug.",
			example: "my-website",
		}),
	})
	.openapi({
		description: "Request to get behavior settings for an AI agent.",
	});

/**
 * Get Behavior Settings response schema
 */
export const getBehaviorSettingsResponseSchema = aiAgentBehaviorSettingsSchema
	.extend({
		aiAgentId: z.ulid().openapi({
			description: "The AI agent's unique identifier.",
			example: "01JG000000000000000000000",
		}),
	})
	.openapi({
		description: "Response containing the AI agent's behavior settings.",
	});

/**
 * Update Behavior Settings request schema
 */
export const updateBehaviorSettingsRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug.",
			example: "my-website",
		}),
		aiAgentId: z.ulid().openapi({
			description: "The AI agent's unique identifier.",
			example: "01JG000000000000000000000",
		}),
		settings: aiAgentBehaviorSettingsSchema.partial().openapi({
			description: "Partial behavior settings to update.",
		}),
	})
	.openapi({
		description: "Payload used to update an AI agent's behavior settings.",
	}); /**
 * Update Behavior Settings response schema
 */
export const updateBehaviorSettingsResponseSchema =
	aiAgentBehaviorSettingsSchema.openapi({
		description: "The updated behavior settings.",
	});

export type GetBehaviorSettingsRequest = z.infer<
	typeof getBehaviorSettingsRequestSchema
>;
export type GetBehaviorSettingsResponse = z.infer<
	typeof getBehaviorSettingsResponseSchema
>;
export type UpdateBehaviorSettingsRequest = z.infer<
	typeof updateBehaviorSettingsRequestSchema
>;
export type UpdateBehaviorSettingsResponse = z.infer<
	typeof updateBehaviorSettingsResponseSchema
>;
