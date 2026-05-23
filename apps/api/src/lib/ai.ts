/**
 * Centralized AI SDK Setup
 *
 * This module provides a unified configuration for the Vercel AI SDK with:
 * - OpenRouter as the primary provider
 * - DevTools middleware for debugging (in development)
 * - Configurable model selection and parameters
 *
 * Usage:
 *   import { createModel, createEmbeddingModel, generateText, streamText } from "@api/lib/ai";
 *
 *   // Use with AI SDK functions
 *   const result = await generateText({
 *     model: createModel("openai/gpt-4o"),
 *     prompt: "Hello!",
 *   });
 */

import { devToolsMiddleware } from "@ai-sdk/devtools";
import { env } from "@api/env";
import {
	normalizeOpenRouterByokErrorCode,
	type OpenRouterBillingSource,
	OpenRouterByokError,
	recordOpenRouterByokFailure,
	recordOpenRouterByokSuccess,
	resolveOpenRouterCredentialsForWebsite,
	type WebsiteOpenRouterContext,
} from "@api/lib/openrouter-byok/resolver";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
	APICallError,
	embed,
	embedMany,
	type LanguageModel,
	wrapLanguageModel,
} from "ai";

// Re-export commonly used AI SDK functions for convenience
export {
	APICallError,
	EmptyResponseBodyError,
	generateObject,
	generateText,
	hasToolCall,
	type ModelMessage,
	NoContentGeneratedError,
	NoObjectGeneratedError,
	NoOutputGeneratedError,
	NoSuchModelError,
	Output,
	stepCountIs,
	streamObject,
	streamText,
	ToolLoopAgent,
	type ToolSet,
} from "ai";

/**
 * Check if DevTools should be enabled
 * Only enabled in development mode
 */
const isDevToolsEnabled = env.NODE_ENV === "development";

/**
 * Default OpenRouter provider instance
 */
let openRouterInstance: ReturnType<typeof createOpenRouter> | null = null;

/**
 * Get or create the OpenRouter provider instance
 */
function getOpenRouter() {
	if (!openRouterInstance) {
		if (!env.OPENROUTER_API_KEY) {
			throw new Error(
				"OPENROUTER_API_KEY is not configured. Please set it in your environment variables."
			);
		}

		openRouterInstance = createOpenRouter({
			apiKey: env.OPENROUTER_API_KEY,
		});
	}

	return openRouterInstance;
}

function createOpenRouterForApiKey(apiKey: string) {
	return createOpenRouter({ apiKey });
}

/**
 * Model configuration options
 */
export type ModelOptions = {
	/**
	 * Enable DevTools middleware for this model
	 * Defaults to true in development, false in production
	 */
	devTools?: boolean;
};

export type WebsiteModelOptions = ModelOptions & {
	context: WebsiteOpenRouterContext;
};

export type WebsiteLanguageModelResolution = {
	model: LanguageModel;
	billingSource: OpenRouterBillingSource;
	fallbackFromBillingSource?: "customer_openrouter";
	fallbackErrorCode?: string;
	usedOpenRouterByokFallback?: boolean;
};

export type WebsiteLanguageModelOperationResult<TResult> = Omit<
	WebsiteLanguageModelResolution,
	"model"
> & {
	result: TResult;
};

export type WebsiteModelKind = "chat" | "structured" | "raw";

type WrappableLanguageModel = Parameters<typeof wrapLanguageModel>[0]["model"];

function wrapWithOptionalDevTools(
	model: WrappableLanguageModel,
	devTools: boolean
): WrappableLanguageModel {
	if (!devTools) {
		return model;
	}

	return wrapLanguageModel({
		model,
		middleware: devToolsMiddleware(),
	});
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === "AbortError";
}

function isAppTimeoutError(error: unknown): boolean {
	return error instanceof Error && error.message === "translation_timeout";
}

function isLikelyTransportError(error: Error): boolean {
	const payload = `${error.name} ${error.message}`.toLowerCase();
	return [
		"fetch failed",
		"network",
		"connection",
		"connect",
		"econnreset",
		"econnrefused",
		"enotfound",
		"etimedout",
		"eai_again",
		"socket",
		"dns",
		"tls",
	].some((needle) => payload.includes(needle));
}

export function isOpenRouterByokFallbackEligibleError(error: unknown): boolean {
	if (error instanceof OpenRouterByokError) {
		return error.code === "decrypt_failed";
	}

	if (APICallError.isInstance(error)) {
		const statusCode = error.statusCode;
		if (statusCode === undefined) {
			return true;
		}
		return (
			statusCode === 401 ||
			statusCode === 402 ||
			statusCode === 403 ||
			statusCode === 408 ||
			statusCode === 409 ||
			statusCode === 429 ||
			statusCode >= 500
		);
	}

	if (!(error instanceof Error)) {
		return false;
	}

	if (isAbortError(error) || isAppTimeoutError(error)) {
		return false;
	}

	return isLikelyTransportError(error);
}

function createModelFromOpenRouter(params: {
	openrouter: ReturnType<typeof createOpenRouter>;
	modelId: string;
	kind: WebsiteModelKind;
	devTools: boolean;
}): LanguageModel {
	if (params.kind === "raw") {
		return params.openrouter.chat(params.modelId);
	}

	const model =
		params.kind === "structured"
			? params.openrouter.chat(params.modelId, {
					provider: {
						require_parameters: true,
					},
				})
			: params.openrouter.chat(params.modelId);

	return wrapWithOptionalDevTools(model, params.devTools);
}

function createCossistantModelResolution(params: {
	modelId: string;
	kind: WebsiteModelKind;
	devTools: boolean;
	fallbackErrorCode?: string;
}): WebsiteLanguageModelResolution {
	return {
		model: createModelFromOpenRouter({
			openrouter: getOpenRouter(),
			modelId: params.modelId,
			kind: params.kind,
			devTools: params.devTools,
		}),
		billingSource: "cossistant",
		fallbackFromBillingSource: params.fallbackErrorCode
			? "customer_openrouter"
			: undefined,
		fallbackErrorCode: params.fallbackErrorCode,
		usedOpenRouterByokFallback: Boolean(params.fallbackErrorCode),
	};
}

async function createWebsiteModelResolution(params: {
	modelId: string;
	context: WebsiteOpenRouterContext;
	kind: WebsiteModelKind;
	devTools: boolean;
}): Promise<WebsiteLanguageModelResolution> {
	const credentials = await resolveOpenRouterCredentialsForWebsite(
		params.context
	);
	const openrouter = createOpenRouterForApiKey(credentials.apiKey);

	return {
		model: createModelFromOpenRouter({
			openrouter,
			modelId: params.modelId,
			kind: params.kind,
			devTools: params.devTools,
		}),
		billingSource: credentials.billingSource,
	};
}

export async function runWithOpenRouterByokFallback<TResult>(params: {
	modelId: string;
	options: WebsiteModelOptions;
	kind?: WebsiteModelKind;
	operation: (
		resolution: WebsiteLanguageModelResolution
	) => Promise<TResult> | TResult;
	canFallback?: (error: unknown) => boolean | Promise<boolean>;
	onResolution?: (resolution: WebsiteLanguageModelResolution) => void;
}): Promise<WebsiteLanguageModelOperationResult<TResult>> {
	const { devTools = isDevToolsEnabled, context } = params.options;
	const kind = params.kind ?? "chat";
	let initialResolution: WebsiteLanguageModelResolution;

	try {
		initialResolution = await createWebsiteModelResolution({
			modelId: params.modelId,
			context,
			kind,
			devTools,
		});
		params.onResolution?.(initialResolution);
	} catch (error) {
		if (
			!(error instanceof OpenRouterByokError && error.code === "decrypt_failed")
		) {
			throw error;
		}

		const fallbackErrorCode = normalizeOpenRouterByokErrorCode(error);
		const fallbackResolution = createCossistantModelResolution({
			modelId: params.modelId,
			kind,
			devTools,
			fallbackErrorCode,
		});
		params.onResolution?.(fallbackResolution);
		return {
			result: await params.operation(fallbackResolution),
			billingSource: fallbackResolution.billingSource,
			fallbackFromBillingSource: fallbackResolution.fallbackFromBillingSource,
			fallbackErrorCode: fallbackResolution.fallbackErrorCode,
			usedOpenRouterByokFallback: fallbackResolution.usedOpenRouterByokFallback,
		};
	}

	try {
		const result = await params.operation(initialResolution);
		await recordOpenRouterByokSuccess({
			context,
			billingSource: initialResolution.billingSource,
		});

		return {
			result,
			billingSource: initialResolution.billingSource,
		};
	} catch (error) {
		const canFallback =
			initialResolution.billingSource === "customer_openrouter" &&
			isOpenRouterByokFallbackEligibleError(error) &&
			(await (params.canFallback?.(error) ?? true));

		if (!canFallback) {
			throw error;
		}

		const fallbackErrorCode = normalizeOpenRouterByokErrorCode(error);
		await recordOpenRouterByokFailure({
			context,
			billingSource: initialResolution.billingSource,
			error,
		});

		const fallbackResolution = createCossistantModelResolution({
			modelId: params.modelId,
			kind,
			devTools,
			fallbackErrorCode,
		});
		params.onResolution?.(fallbackResolution);

		return {
			result: await params.operation(fallbackResolution),
			billingSource: fallbackResolution.billingSource,
			fallbackFromBillingSource: fallbackResolution.fallbackFromBillingSource,
			fallbackErrorCode: fallbackResolution.fallbackErrorCode,
			usedOpenRouterByokFallback: fallbackResolution.usedOpenRouterByokFallback,
		};
	}
}

/**
 * Create a language model with OpenRouter and optional DevTools integration
 *
 * @param modelId - The model ID (e.g., "openai/gpt-4o", "anthropic/claude-3-opus")
 * @param options - Optional configuration
 * @returns A language model ready for use with AI SDK functions
 *
 * @example
 * ```ts
 * import { createModel, generateText } from "@api/lib/ai";
 *
 * const result = await generateText({
 *   model: createModel("openai/gpt-4o"),
 *   prompt: "Hello!",
 * });
 * ```
 */
export function createModel(
	modelId: string,
	options: ModelOptions = {}
): LanguageModel {
	const { devTools = isDevToolsEnabled } = options;

	const openrouter = getOpenRouter();
	return wrapWithOptionalDevTools(openrouter.chat(modelId), devTools);
}

export async function createModelForWebsite(
	modelId: string,
	options: WebsiteModelOptions
): Promise<WebsiteLanguageModelResolution> {
	const { devTools = isDevToolsEnabled, context } = options;
	return createWebsiteModelResolution({
		modelId,
		context,
		kind: "chat",
		devTools,
	});
}

/**
 * Create a language model for structured-output calls that require a provider
 * supporting the full request parameter set.
 */
export function createStructuredOutputModel(
	modelId: string,
	options: ModelOptions = {}
): LanguageModel {
	const { devTools = isDevToolsEnabled } = options;

	const openrouter = getOpenRouter();
	return wrapWithOptionalDevTools(
		openrouter.chat(modelId, {
			provider: {
				require_parameters: true,
			},
		}),
		devTools
	);
}

export async function createStructuredOutputModelForWebsite(
	modelId: string,
	options: WebsiteModelOptions
): Promise<WebsiteLanguageModelResolution> {
	const { devTools = isDevToolsEnabled, context } = options;
	return createWebsiteModelResolution({
		modelId,
		context,
		kind: "structured",
		devTools,
	});
}

/**
 * Create a language model WITHOUT DevTools middleware
 * Useful for high-frequency or background operations where DevTools overhead is unwanted
 *
 * @param modelId - The model ID (e.g., "openai/gpt-4o")
 * @returns A language model without DevTools wrapping
 */
export function createModelRaw(modelId: string): LanguageModel {
	const openrouter = getOpenRouter();
	return openrouter.chat(modelId);
}

export async function createModelRawForWebsite(
	modelId: string,
	context: WebsiteOpenRouterContext
): Promise<WebsiteLanguageModelResolution> {
	return createWebsiteModelResolution({
		modelId,
		context,
		kind: "raw",
		devTools: false,
	});
}

/**
 * Create an embedding model using the OpenRouter provider.
 */
function createEmbeddingModel(modelId?: string) {
	const openrouter = getOpenRouter();
	return openrouter.textEmbeddingModel(
		modelId ?? env.OPENROUTER_EMBEDDING_MODEL ?? "openai/text-embedding-3-small"
	);
}

/**
 * Generate an embedding for a single text using AI SDK with OpenRouter.
 *
 * @param text - The text to embed
 * @param model - Optional model override (defaults to OPENROUTER_EMBEDDING_MODEL env var)
 * @returns A 1536-dimensional embedding vector (for text-embedding-3-small)
 */
export async function generateEmbedding(
	text: string,
	model?: string
): Promise<number[]> {
	const { embedding } = await embed({
		model: createEmbeddingModel(model),
		value: text,
	});
	return embedding;
}

/**
 * Generate embeddings for multiple texts using AI SDK with OpenRouter.
 * The AI SDK automatically handles chunking for large requests.
 *
 * @param texts - Array of texts to embed
 * @param model - Optional model override (defaults to OPENROUTER_EMBEDDING_MODEL env var)
 * @returns Array of 1536-dimensional embedding vectors
 */
export async function generateEmbeddings(
	texts: string[],
	model?: string
): Promise<number[][]> {
	if (texts.length === 0) {
		return [];
	}

	const { embeddings } = await embedMany({
		model: createEmbeddingModel(model),
		values: texts,
	});
	return embeddings;
}

/**
 * Commonly used model IDs for convenience
 */
export const Models = {
	// OpenAI models
	GPT4O: "openai/gpt-4o",
	GPT4OMini: "openai/gpt-4o-mini",
	GPT4: "openai/gpt-4",
	GPT35Turbo: "openai/gpt-3.5-turbo",

	// Anthropic models
	Claude3Opus: "anthropic/claude-3-opus",
	Claude3Sonnet: "anthropic/claude-3-sonnet",
	Claude35Sonnet: "anthropic/claude-3.5-sonnet",
	Claude3Haiku: "anthropic/claude-3-haiku",

	// Fast/cheap models for background tasks
	Fast: "openai/gpt-4o-mini",
	Cheap: "openai/gpt-4o-mini",

	// Embedding models
	TextEmbedding3Small: "openai/text-embedding-3-small",
	TextEmbedding3Large: "openai/text-embedding-3-large",
} as const;

/**
 * Default models for specific use cases
 */
export const DefaultModels = {
	/** Fast model for non-critical tasks like summaries */
	summary: Models.GPT4OMini,
	/** Model for prompt generation */
	promptGeneration: "openai/gpt-5.2",
	/** Default embedding model */
	embedding: Models.TextEmbedding3Small,
} as const;
