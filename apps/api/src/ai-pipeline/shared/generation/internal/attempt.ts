import {
	hasToolCall,
	type ModelMessage,
	OpenRouterByokFallbackRequiredError,
	runWithOpenRouterByokFallback,
	stepCountIs,
	ToolLoopAgent,
	type ToolSet,
} from "@api/lib/ai";
import {
	getAiThinkingCredits,
	getAiThinkingReasoningMaxTokens,
	isAiThinkingSupported,
} from "@api/lib/ai-credits/config";
import {
	type AiCreditGuardResult,
	guardAiCreditRun,
} from "@api/lib/ai-credits/guard";
import {
	type OpenRouterBillingSource,
	recordOpenRouterByokFailure,
} from "@api/lib/openrouter-byok/resolver";
import type { OpenRouterByokRetryState } from "@cossistant/jobs";
import type { PrepareStepFunction } from "ai";
import { logAiPipeline } from "../../../logger";
import { emitPipelineGenerationProgress } from "../../events";
import { getBehaviorSettings } from "../../settings";
import type { PipelineToolBuildResult } from "../../tools";
import { isBackgroundOneShotToolName } from "../../tools/background-one-shot";
import type { ToolRuntimeState } from "../../tools/contracts";
import type {
	GenerationRuntimeInput,
	GenerationRuntimeResult,
} from "../contracts";
import { emitGenerationDebugLog } from "./debug-log";
import {
	buildSafeSkipAction,
	countNonFinishToolCalls,
	countTotalToolCalls,
	type GenerationFailureCode,
	type RuntimeResultWithoutAttempts,
	recordAttempt,
	type ToolStepLike,
	toUsage,
} from "./runtime-utils";
import { logAiThinkingTraceTimeline } from "./thinking-trace";

const GENERATION_TIMEOUT_MS = 200_000;
const STOP_STEP_BUFFER = 6;
const DEFAULT_MAX_OUTPUT_TOKENS = 1024;
const MIN_MAX_OUTPUT_TOKENS = 100;
const MAX_MAX_OUTPUT_TOKENS = 16_000;

type ReasoningProviderOptions = {
	openrouter: {
		reasoning: {
			max_tokens: number;
			exclude: false;
		};
	};
};

function resolveMaxOutputTokens(value: number | null | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return DEFAULT_MAX_OUTPUT_TOKENS;
	}

	return Math.min(
		MAX_MAX_OUTPUT_TOKENS,
		Math.max(MIN_MAX_OUTPUT_TOKENS, Math.floor(value))
	);
}

function resolveThinkingConfig(params: {
	input: GenerationRuntimeInput;
	modelId: string;
	attempt: number;
}): {
	requested: boolean;
	enabled: boolean;
	supported: boolean;
	thinkingCredits: number;
	reasoningMaxTokens: number | null;
	providerOptions?: ReasoningProviderOptions;
} {
	const behaviorSettings = getBehaviorSettings(params.input.aiAgent);
	const savedPreferenceRequested =
		params.input.pipelineKind === "primary" &&
		behaviorSettings.aiThinkingEnabled === true;
	const requested = savedPreferenceRequested && params.attempt === 1;
	const supported = isAiThinkingSupported(params.modelId);
	const reasoningMaxTokens = requested
		? getAiThinkingReasoningMaxTokens(params.modelId)
		: null;
	const enabled = requested && supported && reasoningMaxTokens !== null;
	const thinkingCredits = getAiThinkingCredits({
		modelId: params.modelId,
		aiThinkingEnabled: requested,
	});

	return {
		requested,
		enabled,
		supported,
		thinkingCredits,
		reasoningMaxTokens,
		providerOptions: enabled
			? {
					openrouter: {
						reasoning: {
							max_tokens: reasoningMaxTokens,
							exclude: false,
						},
					},
				}
			: undefined,
	};
}

class AiCreditGuardBlockedError extends Error {
	readonly guardResult: AiCreditGuardResult;

	constructor(guardResult: AiCreditGuardResult) {
		super(guardResult.reason);
		this.name = "AiCreditGuardBlockedError";
		this.guardResult = guardResult;
	}
}

function getReasoningText(result: unknown): string | null {
	if (!(typeof result === "object" && result !== null)) {
		return null;
	}

	const reasoningText = (result as { reasoningText?: unknown }).reasoningText;
	if (typeof reasoningText === "string" && reasoningText.trim().length > 0) {
		return reasoningText;
	}

	const reasoning = (result as { reasoning?: unknown }).reasoning;
	if (!Array.isArray(reasoning)) {
		return null;
	}

	const text = reasoning
		.map((part) => {
			if (
				typeof part === "object" &&
				part !== null &&
				"text" in part &&
				typeof part.text === "string"
			) {
				return part.text;
			}

			return "";
		})
		.join("");

	return text.trim().length > 0 ? text : null;
}

function toThinkingResult(
	config: ReturnType<typeof resolveThinkingConfig>,
	captureStatus: NonNullable<
		GenerationRuntimeResult["thinking"]
	>["captureStatus"]
): NonNullable<GenerationRuntimeResult["thinking"]> {
	return {
		requested: config.requested,
		enabled: config.enabled,
		supported: config.supported,
		thinkingCredits: config.thinkingCredits,
		reasoningMaxTokens: config.reasoningMaxTokens,
		captureStatus,
	};
}

function resolveOpenRouterByokMode(
	state: GenerationRuntimeInput["openRouterByokRetry"]
): "auto" | "customer" | "cossistant_platform" {
	if (state?.mode === "customer") {
		return "customer";
	}

	if (state?.mode === "cossistant") {
		return "cossistant_platform";
	}

	return "auto";
}

function getNextOpenRouterByokRetryState(params: {
	currentState: GenerationRuntimeInput["openRouterByokRetry"];
	errorCode: string;
	now: string;
}): OpenRouterByokRetryState {
	const currentFailureCount =
		params.currentState?.mode === "customer"
			? params.currentState.customerFailureCount
			: (params.currentState?.customerFailureCount ?? 0);
	const deterministicFailure = params.errorCode === "decrypt_failed";
	const customerFailureCount = deterministicFailure
		? Math.max(1, currentFailureCount)
		: currentFailureCount + 1;

	return {
		mode:
			deterministicFailure || customerFailureCount >= 2
				? "cossistant"
				: "customer",
		customerFailureCount,
		lastErrorCode: params.errorCode,
		lastFailedAt: params.now,
	};
}

export async function runGenerationAttempt(params: {
	input: GenerationRuntimeInput;
	attempt: number;
	modelId: string;
	systemPrompt: string;
	messages: ModelMessage[];
	nonFinishToolBudget: number;
	toolsetResolution: PipelineToolBuildResult;
	runtimeState: ToolRuntimeState;
	attempts: NonNullable<GenerationRuntimeResult["attempts"]>;
}): Promise<RuntimeResultWithoutAttempts> {
	const finishToolNameSet = new Set<string>(
		params.toolsetResolution.finishToolNames
	);
	const isBackgroundPipeline = params.input.pipelineKind === "background";
	const thinkingConfig = resolveThinkingConfig({
		input: params.input,
		modelId: params.modelId,
		attempt: params.attempt,
	});
	const maxOutputTokens = resolveMaxOutputTokens(
		params.input.aiAgent.maxOutputTokens
	);

	const prepareStep: PrepareStepFunction<ToolSet> = ({ steps }) => {
		const usedNonFinishCalls = countNonFinishToolCalls({
			steps: steps as readonly ToolStepLike[] | undefined,
			finishToolNames: finishToolNameSet,
		});
		const usedToolNames = new Set<string>();

		for (const step of (steps as readonly ToolStepLike[] | undefined) ?? []) {
			for (const call of step.toolCalls ?? []) {
				const toolName = call?.toolName;
				if (!(toolName && typeof toolName === "string")) {
					continue;
				}
				usedToolNames.add(toolName);
			}
		}

		if (isBackgroundPipeline) {
			const remainingNonFinishToolNames =
				params.toolsetResolution.toolNames.filter((toolName) => {
					if (finishToolNameSet.has(toolName)) {
						return false;
					}

					if (!isBackgroundOneShotToolName(toolName)) {
						return true;
					}

					return !usedToolNames.has(toolName);
				});

			if (
				usedNonFinishCalls >= params.nonFinishToolBudget ||
				remainingNonFinishToolNames.length === 0
			) {
				return {
					system: params.systemPrompt,
					activeTools: params.toolsetResolution.finishToolNames,
				};
			}

			return {
				system: params.systemPrompt,
				activeTools: [
					...remainingNonFinishToolNames,
					...params.toolsetResolution.finishToolNames,
				],
			};
		}

		if (usedNonFinishCalls >= params.nonFinishToolBudget) {
			return {
				system: params.systemPrompt,
				activeTools: params.toolsetResolution.finishToolNames,
			};
		}

		return {
			system: params.systemPrompt,
		};
	};

	const stopWhen = [
		...params.toolsetResolution.finishToolNames.map((toolName) =>
			hasToolCall(toolName)
		),
		(input: { steps: readonly ToolStepLike[] }) =>
			countNonFinishToolCalls({
				steps: input.steps,
				finishToolNames: finishToolNameSet,
			}) >= params.nonFinishToolBudget,
		stepCountIs(params.nonFinishToolBudget + STOP_STEP_BUFFER),
	];

	const generationAbortController = new AbortController();
	let abortReason: "timeout" | "signal" | null = null;

	const onExternalAbort = () => {
		abortReason = "signal";
		generationAbortController.abort();
	};

	if (params.input.abortSignal) {
		if (params.input.abortSignal.aborted) {
			abortReason = "signal";
			generationAbortController.abort();
		} else {
			params.input.abortSignal.addEventListener("abort", onExternalAbort);
		}
	}

	const timeout = setTimeout(() => {
		abortReason = "timeout";
		generationAbortController.abort();
	}, GENERATION_TIMEOUT_MS);

	const startedAt = Date.now();

	logAiPipeline({
		area: "generation",
		event: "generation_start",
		conversationId: params.input.conversation.id,
		fields: {
			attempt: params.attempt,
			model: params.modelId,
			mode: params.input.mode,
			tools: params.toolsetResolution.toolNames.length,
			finishTools: params.toolsetResolution.finishToolNames.length,
			budget: params.nonFinishToolBudget,
		},
	});

	const deepTraceEnabled = params.input.deepTraceEnabled === true;
	let billingSource: OpenRouterBillingSource | undefined;
	let creditGuardMode: AiCreditGuardResult["mode"] | undefined;
	const openRouterContext = {
		db: params.input.db,
		organizationId: params.input.conversation.organizationId,
		websiteId: params.input.conversation.websiteId,
	};

	if (deepTraceEnabled) {
		emitGenerationDebugLog(
			params.input,
			"log",
			`[ai-pipeline:generation] conv=${params.input.conversation.id} workflowRunId=${params.input.workflowRunId} evt=attempt_start attempt=${params.attempt} model=${params.modelId}`
		);
	}

	try {
		await emitPipelineGenerationProgress({
			conversation: params.input.conversation,
			aiAgentId: params.input.aiAgent.id,
			workflowRunId: params.input.workflowRunId,
			phase: "generating",
			message:
				params.attempt === 1
					? "Generating response..."
					: "Retrying response generation...",
			audience: "dashboard",
		}).catch((error) => {
			emitGenerationDebugLog(
				params.input,
				"warn",
				`[ai-pipeline:generation] conv=${params.input.conversation.id} workflowRunId=${params.input.workflowRunId} evt=progress_generating_failed`,
				error
			);
		});

		const generationResult = await runWithOpenRouterByokFallback({
			modelId: params.modelId,
			options: {
				context: openRouterContext,
				openRouterByokMode: resolveOpenRouterByokMode(
					params.input.openRouterByokRetry
				),
			},
			fallbackStrategy:
				params.input.pipelineKind === "primary" ? "throw" : "inline",
			onResolution: (resolution) => {
				billingSource = resolution.billingSource;
			},
			beforeOperation: async (resolution) => {
				if (
					params.input.pipelineKind !== "primary" ||
					resolution.billingSource !== "cossistant"
				) {
					return;
				}

				const guardResult = await guardAiCreditRun({
					organizationId: params.input.conversation.organizationId,
					modelId: params.modelId,
					aiThinkingEnabled: thinkingConfig.enabled,
				});

				if (!guardResult.allowed) {
					throw new AiCreditGuardBlockedError(guardResult);
				}

				creditGuardMode = guardResult.mode;
			},
			canFallback: () =>
				!generationAbortController.signal.aborted &&
				params.runtimeState.publicMessagesSent === 0 &&
				countTotalToolCalls(params.runtimeState.toolCallCounts) === 0,
			isLocalAbort: () => generationAbortController.signal.aborted,
			operation: ({ model }) => {
				const agent = new ToolLoopAgent({
					model,
					instructions: params.systemPrompt,
					tools: params.toolsetResolution.tools,
					prepareStep,
					toolChoice: "required",
					stopWhen,
					temperature: 0,
					maxOutputTokens,
					providerOptions: thinkingConfig.providerOptions,
				});

				return agent.generate({
					messages: params.messages,
					abortSignal: generationAbortController.signal,
				});
			},
		});
		billingSource = generationResult.billingSource;
		const result = generationResult.result;
		const usage = toUsage(result.usage);
		const reasoningText = getReasoningText(result);
		const thinkingCaptureStatus = thinkingConfig.enabled
			? reasoningText
				? "captured"
				: "not_returned"
			: "not_requested";
		if (thinkingConfig.enabled) {
			await logAiThinkingTraceTimeline({
				db: params.input.db,
				input: params.input,
				modelId: params.modelId,
				attempt: params.attempt,
				thinkingCredits: thinkingConfig.thinkingCredits,
				reasoningMaxTokens: thinkingConfig.reasoningMaxTokens,
				reasoningText,
				usage,
			}).catch((error) => {
				logAiPipeline({
					area: "generation",
					event: "thinking_trace_failed",
					level: "warn",
					conversationId: params.input.conversation.id,
					fields: {
						attempt: params.attempt,
						model: params.modelId,
					},
					error,
				});
			});
		}

		await emitPipelineGenerationProgress({
			conversation: params.input.conversation,
			aiAgentId: params.input.aiAgent.id,
			workflowRunId: params.input.workflowRunId,
			phase: "finalizing",
			message: "Finalizing response...",
			audience: "dashboard",
		}).catch((error) => {
			emitGenerationDebugLog(
				params.input,
				"warn",
				`[ai-pipeline:generation] conv=${params.input.conversation.id} workflowRunId=${params.input.workflowRunId} evt=progress_finalizing_failed`,
				error
			);
		});

		const durationMs = Date.now() - startedAt;
		const toolCallsByName = { ...params.runtimeState.toolCallCounts };
		const mutationToolCallsByName = {
			...params.runtimeState.mutationToolCallCounts,
		};
		const chargeableToolCallsByName = {
			...params.runtimeState.chargeableToolCallCounts,
		};
		const toolExecutions = [...params.runtimeState.toolExecutions];
		const totalToolCalls = countTotalToolCalls(toolCallsByName);

		if (params.runtimeState.lastToolError?.fatal) {
			recordAttempt({
				attempts: params.attempts,
				modelId: params.modelId,
				attempt: params.attempt,
				outcome: "error",
				durationMs,
			});

			return {
				status: "error",
				action: buildSafeSkipAction("Generation runtime error"),
				error: params.runtimeState.lastToolError.error,
				failureCode: "runtime_error",
				publicMessagesSent: params.runtimeState.publicMessagesSent,
				toolCallsByName,
				mutationToolCallsByName,
				chargeableToolCallsByName,
				toolExecutions,
				totalToolCalls,
				usage,
				thinking: toThinkingResult(thinkingConfig, thinkingCaptureStatus),
				billingSource,
				creditGuardMode,
			};
		}

		if (!params.runtimeState.finalAction) {
			recordAttempt({
				attempts: params.attempts,
				modelId: params.modelId,
				attempt: params.attempt,
				outcome: "error",
				durationMs,
			});

			logAiPipeline({
				area: "generation",
				event: "generation_missing_finish",
				level: "error",
				conversationId: params.input.conversation.id,
				fields: {
					attempt: params.attempt,
					model: params.modelId,
					totalToolCalls,
					publicMessages: params.runtimeState.publicMessagesSent,
				},
			});

			return {
				status: "error",
				action: buildSafeSkipAction("Generation missing finish action"),
				error: "No finish action was captured after generation completed",
				failureCode: "missing_finish_action",
				publicMessagesSent: params.runtimeState.publicMessagesSent,
				toolCallsByName,
				mutationToolCallsByName,
				chargeableToolCallsByName,
				toolExecutions,
				totalToolCalls,
				usage,
				thinking: toThinkingResult(thinkingConfig, thinkingCaptureStatus),
				billingSource,
				creditGuardMode,
			};
		}

		recordAttempt({
			attempts: params.attempts,
			modelId: params.modelId,
			attempt: params.attempt,
			outcome: "completed",
			durationMs,
		});

		return {
			status: "completed",
			action: params.runtimeState.finalAction,
			publicMessagesSent: params.runtimeState.publicMessagesSent,
			toolCallsByName,
			mutationToolCallsByName,
			chargeableToolCallsByName,
			toolExecutions,
			totalToolCalls,
			usage,
			thinking: toThinkingResult(thinkingConfig, thinkingCaptureStatus),
			billingSource,
			creditGuardMode,
		};
	} catch (error) {
		const durationMs = Date.now() - startedAt;
		const toolCallsByName = { ...params.runtimeState.toolCallCounts };
		const mutationToolCallsByName = {
			...params.runtimeState.mutationToolCallCounts,
		};
		const chargeableToolCallsByName = {
			...params.runtimeState.chargeableToolCallCounts,
		};
		const toolExecutions = [...params.runtimeState.toolExecutions];
		const totalToolCalls = countTotalToolCalls(toolCallsByName);

		if (error instanceof AiCreditGuardBlockedError) {
			recordAttempt({
				attempts: params.attempts,
				modelId: params.modelId,
				attempt: params.attempt,
				outcome: "error",
				durationMs,
			});

			return {
				status: "blocked",
				action: buildSafeSkipAction(error.guardResult.reason),
				publicMessagesSent: params.runtimeState.publicMessagesSent,
				toolCallsByName,
				mutationToolCallsByName,
				chargeableToolCallsByName,
				toolExecutions,
				totalToolCalls,
				billingSource: "cossistant",
				creditGuard: error.guardResult,
				creditGuardMode: error.guardResult.mode,
			};
		}

		if (error instanceof OpenRouterByokFallbackRequiredError) {
			const failedAt = new Date().toISOString();
			const nextRetryState = getNextOpenRouterByokRetryState({
				currentState: params.input.openRouterByokRetry,
				errorCode: error.errorCode,
				now: failedAt,
			});
			const canRetryWithoutDuplicates =
				params.runtimeState.publicMessagesSent === 0 && totalToolCalls === 0;

			recordAttempt({
				attempts: params.attempts,
				modelId: params.modelId,
				attempt: params.attempt,
				outcome: "error",
				durationMs,
			});

			if (!canRetryWithoutDuplicates) {
				return {
					status: "error",
					action: buildSafeSkipAction("Customer OpenRouter key failed"),
					error:
						"Customer OpenRouter key failed after generation side effects; not retrying automatically",
					failureCode: "runtime_error",
					publicMessagesSent: params.runtimeState.publicMessagesSent,
					toolCallsByName,
					mutationToolCallsByName,
					chargeableToolCallsByName,
					toolExecutions,
					totalToolCalls,
					billingSource: "customer_openrouter",
					creditGuardMode,
				};
			}

			if (
				nextRetryState.mode === "cossistant" &&
				error.alreadyRecorded !== true
			) {
				await recordOpenRouterByokFailure({
					context: openRouterContext,
					billingSource: error.billingSource,
					errorCode: error.errorCode,
					sendAlert: true,
					pauseFallback: true,
				}).catch((recordError) => {
					logAiPipeline({
						area: "generation",
						event: "byok_failure_record_failed",
						level: "warn",
						conversationId: params.input.conversation.id,
						fields: {
							attempt: params.attempt,
							model: params.modelId,
							errorCode: error.errorCode,
						},
						error: recordError,
					});
				});
			}

			return {
				status: "error",
				action: buildSafeSkipAction(
					nextRetryState.mode === "cossistant"
						? "Customer OpenRouter key failed; retrying with Cossistant fallback"
						: "Customer OpenRouter key failed; retrying customer key"
				),
				error:
					nextRetryState.mode === "cossistant"
						? "Customer OpenRouter key failed; retrying with Cossistant fallback"
						: "Customer OpenRouter key failed; retrying customer key",
				failureCode: "openrouter_byok_retry_required",
				publicMessagesSent: params.runtimeState.publicMessagesSent,
				toolCallsByName,
				mutationToolCallsByName,
				chargeableToolCallsByName,
				toolExecutions,
				totalToolCalls,
				billingSource: "customer_openrouter",
				creditGuardMode,
				openRouterByokRetry: nextRetryState,
				openRouterByokFailure: {
					errorCode: error.errorCode,
					billingSource: error.billingSource,
					fallbackEligible: true,
					localAbort: generationAbortController.signal.aborted,
				},
			};
		}

		if (generationAbortController.signal.aborted) {
			const failureCode: GenerationFailureCode =
				abortReason === "signal" ? "abort_signal" : "timeout";
			recordAttempt({
				attempts: params.attempts,
				modelId: params.modelId,
				attempt: params.attempt,
				outcome: failureCode === "timeout" ? "timeout" : "error",
				durationMs,
			});

			if (failureCode === "timeout") {
				logAiPipeline({
					area: "generation",
					event: "generation_timeout",
					level: "warn",
					conversationId: params.input.conversation.id,
					fields: {
						attempt: params.attempt,
						model: params.modelId,
						durationMs,
						totalToolCalls,
						publicMessages: params.runtimeState.publicMessagesSent,
					},
				});
			}

			if (params.runtimeState.publicMessagesSent > 0) {
				const reason =
					failureCode === "abort_signal"
						? "Generation aborted by cancellation signal after public response"
						: "Generation timed out after public response";

				return {
					status: "completed",
					action: buildSafeSkipAction(reason),
					aborted: true,
					failureCode,
					publicMessagesSent: params.runtimeState.publicMessagesSent,
					toolCallsByName,
					mutationToolCallsByName,
					chargeableToolCallsByName,
					toolExecutions,
					totalToolCalls,
					billingSource,
					creditGuardMode,
				};
			}

			const errorMessage =
				failureCode === "abort_signal"
					? "Generation aborted by cancellation signal"
					: "Generation timed out";

			return {
				status: "error",
				action: buildSafeSkipAction(`${errorMessage}; retryable failure`),
				error: errorMessage,
				aborted: true,
				failureCode,
				publicMessagesSent: params.runtimeState.publicMessagesSent,
				toolCallsByName,
				mutationToolCallsByName,
				chargeableToolCallsByName,
				toolExecutions,
				totalToolCalls,
				billingSource,
				creditGuardMode,
			};
		}

		recordAttempt({
			attempts: params.attempts,
			modelId: params.modelId,
			attempt: params.attempt,
			outcome: "error",
			durationMs,
		});

		const message =
			error instanceof Error ? error.message : "Generation runtime failed";

		return {
			status: "error",
			action: buildSafeSkipAction("Generation runtime error"),
			error: message,
			failureCode: "runtime_error",
			publicMessagesSent: params.runtimeState.publicMessagesSent,
			toolCallsByName,
			mutationToolCallsByName,
			chargeableToolCallsByName,
			toolExecutions,
			totalToolCalls,
			billingSource,
			creditGuardMode,
		};
	} finally {
		clearTimeout(timeout);
		if (params.input.abortSignal) {
			params.input.abortSignal.removeEventListener("abort", onExternalAbort);
		}
		if (deepTraceEnabled) {
			emitGenerationDebugLog(
				params.input,
				"log",
				`[ai-pipeline:generation] conv=${params.input.conversation.id} workflowRunId=${params.input.workflowRunId} evt=attempt_end attempt=${params.attempt} model=${params.modelId}`
			);
		}
	}
}
