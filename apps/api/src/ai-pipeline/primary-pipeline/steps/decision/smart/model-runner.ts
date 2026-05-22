import { createModelRawForWebsite, generateText, Output } from "@api/lib/ai";
import {
	recordOpenRouterByokFailure,
	recordOpenRouterByokSuccess,
	type OpenRouterBillingSource,
} from "@api/lib/openrouter-byok/resolver";
import { z } from "zod";
import { logAiPipeline } from "../../../../logger";
import { observeDecision } from "./rules";
import type {
	SmartDecisionInput,
	SmartDecisionModelConfig,
	SmartDecisionResult,
} from "./types";

const DECISION_MODELS: readonly SmartDecisionModelConfig[] = [
	{ id: "google/gemini-2.5-flash", timeoutMs: 4000 },
	{ id: "openai/gpt-4o-mini", timeoutMs: 4000 },
];

const decisionOutputSchema = z.object({
	intent: z.enum(["respond", "observe", "assist_team"]),
	reasoning: z.string(),
	confidence: z.enum(["high", "medium", "low"]),
});

type ExhaustedFailureKind = "timeout" | "error" | "empty";

export async function runSmartDecisionModel(params: {
	input: SmartDecisionInput;
	prompt: string;
}): Promise<SmartDecisionResult> {
	const convId = params.input.conversation.id;
	let lastFailure: ExhaustedFailureKind = "empty";

	for (const [index, modelConfig] of DECISION_MODELS.entries()) {
		const isLastModel = index === DECISION_MODELS.length - 1;
		const abortController = new AbortController();
		const openRouterContext = {
			db: params.input.db,
			organizationId: params.input.conversation.organizationId,
			websiteId: params.input.conversation.websiteId,
		};
		let billingSource: OpenRouterBillingSource | undefined;
		const timeout = setTimeout(() => {
			abortController.abort();
		}, modelConfig.timeoutMs);

		try {
			const model = await createModelRawForWebsite(
				modelConfig.id,
				openRouterContext
			);
			billingSource = model.billingSource;
			const result = await generateText({
				model: model.model,
				output: Output.object({ schema: decisionOutputSchema }),
				prompt: params.prompt,
				temperature: 0,
				abortSignal: abortController.signal,
			});
			await recordOpenRouterByokSuccess({
				context: openRouterContext,
				billingSource,
			});

			if (!result.output) {
				lastFailure = "empty";
				if (!isLastModel) {
					logAiPipeline({
						area: "smart-decision",
						event: "fallback_next",
						conversationId: convId,
						fields: {
							model: modelConfig.id,
							failure: "empty",
						},
					});
					continue;
				}
				return observeDecision({
					reasoning: "Smart decision returned no output, defaulting to observe",
					confidence: "low",
					source: "fallback",
					ruleId: "empty_output_observe",
				});
			}

			if (index > 0) {
				logAiPipeline({
					area: "smart-decision",
					event: "fallback_success",
					conversationId: convId,
					fields: {
						model: modelConfig.id,
						attempt: index + 1,
					},
				});
			}

			if (result.usage) {
				logAiPipeline({
					area: "smart-decision",
					event: "usage",
					conversationId: convId,
					fields: {
						model: modelConfig.id,
						inTokens: result.usage.inputTokens,
						outTokens: result.usage.outputTokens,
					},
				});
			}

			return {
				intent: result.output.intent,
				reasoning: result.output.reasoning,
				confidence: result.output.confidence,
				source: "model",
			};
		} catch (error) {
			await recordOpenRouterByokFailure({
				context: openRouterContext,
				billingSource,
				error,
			});
			const isTimeout = error instanceof Error && error.name === "AbortError";
			lastFailure = isTimeout ? "timeout" : "error";

			if (!isLastModel) {
				logAiPipeline({
					area: "smart-decision",
					event: "fallback_next",
					conversationId: convId,
					fields: {
						model: modelConfig.id,
						failure: isTimeout ? "timeout" : "error",
					},
				});
			}
		} finally {
			clearTimeout(timeout);
		}
	}

	if (lastFailure === "timeout") {
		return observeDecision({
			reasoning: "All decision models timed out, defaulting to observe",
			confidence: "low",
			source: "fallback",
			ruleId: "timeout_observe",
		});
	}

	if (lastFailure === "error") {
		return observeDecision({
			reasoning: "All decision models failed, defaulting to observe",
			confidence: "low",
			source: "fallback",
			ruleId: "error_observe",
		});
	}

	return observeDecision({
		reasoning: "No decision model output available, defaulting to observe",
		confidence: "low",
		source: "fallback",
		ruleId: "no_model_output_observe",
	});
}
