import {
	createModelForWebsite,
	hasToolCall,
	type ModelMessage,
	stepCountIs,
	ToolLoopAgent,
	type ToolSet,
} from "@api/lib/ai";
import {
	recordOpenRouterByokFailure,
	recordOpenRouterByokSuccess,
	type OpenRouterBillingSource,
} from "@api/lib/openrouter-byok/resolver";
import type { PrepareStepFunction } from "ai";
import { logAiPipeline } from "../../../logger";
import { emitPipelineGenerationProgress } from "../../events";
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

const GENERATION_TIMEOUT_MS = 200_000;
const STOP_STEP_BUFFER = 6;

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

		const modelResolution = await createModelForWebsite(params.modelId, {
			context: openRouterContext,
		});
		billingSource = modelResolution.billingSource;

		const agent = new ToolLoopAgent({
			model: modelResolution.model,
			instructions: params.systemPrompt,
			tools: params.toolsetResolution.tools,
			prepareStep,
			toolChoice: "required",
			stopWhen,
			temperature: 0,
		});

		const result = await agent.generate({
			messages: params.messages,
			abortSignal: generationAbortController.signal,
		});
		await recordOpenRouterByokSuccess({
			context: openRouterContext,
			billingSource,
		});

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
				usage: toUsage(result.usage),
				billingSource,
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
				usage: toUsage(result.usage),
				billingSource,
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
			usage: toUsage(result.usage),
			billingSource,
		};
	} catch (error) {
		await recordOpenRouterByokFailure({
			context: openRouterContext,
			billingSource,
			error,
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

		if (
			generationAbortController.signal.aborted ||
			(error instanceof Error && error.name === "AbortError")
		) {
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
