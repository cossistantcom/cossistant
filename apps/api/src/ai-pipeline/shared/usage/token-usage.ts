import type { GenerationTokenUsage } from "../generation/contracts";

export const TOKEN_USAGE_FALLBACK_TOTAL = 1200;
const FALLBACK_INPUT_RATIO = 0.7;

function toPositiveInt(value: number | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		return 0;
	}
	return Math.floor(value);
}

export function resolveGenerationTokenUsage(params: {
	providerUsage?:
		| {
				inputTokens?: number;
				outputTokens?: number;
				totalTokens?: number;
				reasoningTokens?: number;
		  }
		| undefined;
}): GenerationTokenUsage {
	const inputTokens = toPositiveInt(params.providerUsage?.inputTokens);
	const outputTokens = toPositiveInt(params.providerUsage?.outputTokens);
	const totalFromProvider = toPositiveInt(params.providerUsage?.totalTokens);
	const reasoningTokens = toPositiveInt(params.providerUsage?.reasoningTokens);
	const computedTotal = Math.max(totalFromProvider, inputTokens + outputTokens);

	if (computedTotal > 0) {
		const resolvedInput =
			inputTokens > 0 ? inputTokens : Math.max(0, computedTotal - outputTokens);
		const resolvedOutput =
			outputTokens > 0
				? outputTokens
				: Math.max(0, computedTotal - resolvedInput);

		return {
			inputTokens: resolvedInput,
			outputTokens: resolvedOutput,
			totalTokens: computedTotal,
			...(reasoningTokens > 0 ? { reasoningTokens } : {}),
			source: "provider",
		};
	}

	const fallbackInput = Math.floor(
		TOKEN_USAGE_FALLBACK_TOTAL * FALLBACK_INPUT_RATIO
	);
	const fallbackOutput = Math.max(
		0,
		TOKEN_USAGE_FALLBACK_TOTAL - fallbackInput
	);

	return {
		inputTokens: fallbackInput,
		outputTokens: fallbackOutput,
		totalTokens: TOKEN_USAGE_FALLBACK_TOTAL,
		source: "fallback_constant",
	};
}
