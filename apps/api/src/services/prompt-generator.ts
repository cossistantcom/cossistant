import { env } from "@api/env";
import {
	createModel,
	DefaultModels,
	generateText,
	runWithOpenRouterByokFallback,
} from "@api/lib/ai";
import type { WebsiteOpenRouterContext } from "@api/lib/openrouter-byok/resolver";
import {
	AGENT_BASE_PROMPT_GENERATION_TEMPLATE,
	createDefaultPromptWithCompany,
	DEFAULT_AGENT_BASE_PROMPT,
} from "../constants/prompt-templates";
import type { BrandInfo } from "./firecrawl";

/**
 * Maximum content length to include in the prompt (to avoid token limits)
 */
const MAX_CONTENT_LENGTH = 4000;

/**
 * Model to use for prompt generation (fast and capable)
 */
const PROMPT_GENERATION_MODEL = DefaultModels.promptGeneration;

/**
 * Options for generating an AI agent base prompt
 */
export type GenerateAgentPromptOptions = {
	/** Brand information extracted from the website */
	brandInfo: BrandInfo;
	/** Full markdown content from the homepage (will be truncated) */
	content?: string;
	/** User-selected goals for the agent */
	goals: string[];
	/** Name for the AI agent */
	agentName: string;
	/** Website domain */
	domain: string;
	/** Website context for resolving a customer OpenRouter key when configured */
	aiContext?: WebsiteOpenRouterContext;
};

/**
 * Result of prompt generation
 */
export type GenerateAgentPromptResult = {
	success: boolean;
	prompt: string;
	/** Whether the prompt was AI-generated or fell back to default */
	isGenerated: boolean;
	error?: string;
};

/**
 * Format goals as a readable list
 */
function formatGoals(goals: string[]): string {
	if (goals.length === 0) {
		return "General customer support and assistance";
	}

	const goalLabels: Record<string, string> = {
		sales: "Increase sales conversions",
		support: "Provide customer support",
		product_qa: "Answer product questions",
		lead_qualification: "Qualify leads",
		scheduling: "Schedule appointments",
		feedback: "Collect customer feedback",
	};

	return goals.map((goal) => `- ${goalLabels[goal] ?? goal}`).join("\n");
}

/**
 * Truncate content to avoid token limits while keeping meaningful content
 */
function truncateContent(content: string): string {
	if (!content || content.length <= MAX_CONTENT_LENGTH) {
		return content || "No content available";
	}

	// Truncate and add indicator
	return `${content.slice(0, MAX_CONTENT_LENGTH)}...\n\n[Content truncated for brevity]`;
}

/**
 * Build the prompt from the template
 */
function buildPrompt(options: GenerateAgentPromptOptions): string {
	const { brandInfo, content, goals, agentName, domain } = options;

	return AGENT_BASE_PROMPT_GENERATION_TEMPLATE.replace(
		/{companyName}/g,
		brandInfo.companyName ?? domain
	)
		.replace(/{domain}/g, domain)
		.replace(/{description}/g, brandInfo.description ?? "Not available")
		.replace(/{keywords}/g, brandInfo.keywords ?? "Not available")
		.replace(/{contentSummary}/g, truncateContent(content ?? ""))
		.replace(/{goals}/g, formatGoals(goals))
		.replace(/{agentName}/g, agentName);
}

/**
 * Generate an AI agent base prompt using website content and user preferences.
 *
 * This function:
 * 1. Builds a meta-prompt from the template with brand info and goals
 * 2. Calls OpenRouter to generate a tailored system prompt
 * 3. Falls back to a default prompt if generation fails
 */
export async function generateAgentBasePrompt(
	options: GenerateAgentPromptOptions
): Promise<GenerateAgentPromptResult> {
	const { brandInfo, agentName, domain } = options;

	// If OpenRouter is not configured, return default prompt
	if (!(env.OPENROUTER_API_KEY || options.aiContext)) {
		console.warn("OpenRouter API key not configured, using default prompt");
		return {
			success: true,
			prompt: brandInfo.companyName
				? createDefaultPromptWithCompany(brandInfo.companyName)
				: DEFAULT_AGENT_BASE_PROMPT,
			isGenerated: false,
		};
	}

	try {
		const metaPrompt = buildPrompt(options);

		// Log what we're sending to OpenRouter
		console.log(
			"[prompt-generator] Meta-prompt preview (first 500 chars):",
			metaPrompt.substring(0, 500)
		);
		console.log(
			"[prompt-generator] Description in prompt:",
			options.brandInfo.description?.substring(0, 150) ?? "NOT SET"
		);

		const result = options.aiContext
			? (
					await runWithOpenRouterByokFallback({
						modelId: PROMPT_GENERATION_MODEL,
						options: { context: options.aiContext },
						operation: ({ model }) =>
							generateText({
								model,
								prompt: metaPrompt,
								temperature: 0.7,
								maxOutputTokens: 800,
							}),
					})
				).result
			: await generateText({
					model: createModel(PROMPT_GENERATION_MODEL),
					prompt: metaPrompt,
					temperature: 0.7,
					maxOutputTokens: 800,
				});

		const generatedPrompt = result.text.trim();
		console.log(
			"[prompt-generator] Generated prompt length:",
			generatedPrompt.length
		);

		// Validate that we got a reasonable response
		if (!generatedPrompt || generatedPrompt.length < 50) {
			console.warn(
				"[prompt-generator] Generated prompt too short, using default"
			);
			return {
				success: true,
				prompt: brandInfo.companyName
					? createDefaultPromptWithCompany(brandInfo.companyName)
					: DEFAULT_AGENT_BASE_PROMPT,
				isGenerated: false,
			};
		}

		return {
			success: true,
			prompt: generatedPrompt,
			isGenerated: true,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		console.error("Failed to generate agent prompt:", message);

		// Fall back to default prompt with company name if available
		return {
			success: true,
			prompt: brandInfo.companyName
				? createDefaultPromptWithCompany(brandInfo.companyName)
				: DEFAULT_AGENT_BASE_PROMPT,
			isGenerated: false,
			error: `AI generation failed: ${message}. Using default prompt.`,
		};
	}
}
