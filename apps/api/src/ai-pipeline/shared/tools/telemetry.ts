import { generateULID } from "@api/utils/db/ids";
import { isWidgetVisibleTool } from "@plasma/types";
import type { ToolExecutionOptions, ToolSet } from "ai";
import {
	emitPipelineToolProgress,
	type PipelineToolProgressAudience,
} from "../events/progress";
import { isBackgroundOneShotToolName } from "./background-one-shot";
import type {
	PipelineToolContext,
	PipelineToolDefinition,
	PipelineToolResult,
	ToolTelemetrySpec,
	ToolTracePayloadMode,
} from "./contracts";
import {
	buildTracePayloadByMode,
	emitStructuredToolLog,
} from "./telemetry/logging";
import {
	isRecord,
	sanitizeToolDebugValue,
	sanitizeToolInputDefault,
	toErrorText,
} from "./telemetry/sanitize";
import { buildToolProgressText } from "./telemetry/text";
import {
	createToolTimelineItemId,
	safeCreatePartialToolTimelineItem,
	safeUpdateToolTimelineItem,
} from "./telemetry/timeline";

function resolveProgressAudience(params: {
	context: PipelineToolContext;
	telemetry: ToolTelemetrySpec;
	toolName: string;
}): PipelineToolProgressAudience {
	if (params.context.pipelineKind === "background") {
		return "dashboard";
	}

	const configuredAudience = params.telemetry.progress.audience ?? "auto";
	if (configuredAudience === "all" || configuredAudience === "dashboard") {
		return configuredAudience;
	}

	return isWidgetVisibleTool(params.toolName) ? "all" : "dashboard";
}

async function safeEmitToolProgress(params: {
	context: PipelineToolContext;
	toolName: string;
	toolCallId: string;
	telemetry: ToolTelemetrySpec;
	state: "partial" | "result" | "error";
	sanitizedInput: Record<string, unknown>;
	sanitizedOutput?: unknown;
	errorText?: string;
}): Promise<void> {
	const {
		context,
		toolName,
		toolCallId,
		telemetry,
		state,
		sanitizedInput,
		sanitizedOutput,
		errorText,
	} = params;

	const progressMessage = buildToolProgressText({
		telemetry,
		toolName,
		state,
		input: sanitizedInput,
		output: sanitizedOutput,
		errorText,
	});

	try {
		await emitPipelineToolProgress({
			conversation: context.conversation,
			aiAgentId: context.aiAgentId,
			workflowRunId: context.workflowRunId,
			toolCallId,
			toolName,
			state,
			progressMessage,
			audience: resolveProgressAudience({ context, telemetry, toolName }),
		});
	} catch (error) {
		emitStructuredToolLog(
			context,
			"warn",
			`[ai-pipeline:tool] conv=${context.conversationId} workflowRunId=${context.workflowRunId} tool=${toolName} evt=progress_emit_failed`,
			error
		);
	}
}

function getTelemetryForTool(params: {
	toolName: string;
	definitionsByToolName: Map<string, PipelineToolDefinition>;
}): ToolTelemetrySpec | null {
	return params.definitionsByToolName.get(params.toolName)?.telemetry ?? null;
}

function shouldTreatAsFailure(result: unknown): boolean {
	if (!isRecord(result)) {
		return false;
	}

	if ("success" in result && result.success === false) {
		return true;
	}

	return (
		"success" in result &&
		result.success !== true &&
		typeof result.error === "string" &&
		result.error.length > 0
	);
}

function didToolMutate(result: unknown): boolean {
	if (!isRecord(result)) {
		return false;
	}

	if (typeof result.changed === "boolean") {
		return result.changed;
	}

	const data = isRecord(result.data) ? result.data : null;
	if (typeof data?.changed === "boolean") {
		return data.changed;
	}

	return false;
}

function getFailureTextFromResult(result: unknown): string | null {
	if (!isRecord(result)) {
		return null;
	}

	if ("success" in result && result.success === false) {
		if (typeof result.error === "string" && result.error.length > 0) {
			return toErrorText(result.error);
		}
		return "Tool returned success=false";
	}

	if (
		"success" in result &&
		result.success !== true &&
		typeof result.error === "string" &&
		result.error.length > 0
	) {
		return toErrorText(result.error);
	}

	return null;
}

function incrementCount(
	counts: Record<string, number>,
	toolName: string
): void {
	counts[toolName] = (counts[toolName] ?? 0) + 1;
}

function isDuplicateBackgroundOneShotToolCall(params: {
	context: PipelineToolContext;
	toolName: string;
}): boolean {
	return (
		params.context.pipelineKind === "background" &&
		isBackgroundOneShotToolName(params.toolName) &&
		(params.context.runtimeState.toolCallCounts[params.toolName] ?? 0) > 0
	);
}

function buildSuppressedDuplicateToolResult(): PipelineToolResult<{
	changed: false;
	reason: "duplicate_in_run";
}> {
	return {
		success: true,
		changed: false,
		data: {
			changed: false,
			reason: "duplicate_in_run",
		},
	};
}

export function wrapPipelineToolsWithTelemetry(params: {
	tools: ToolSet;
	context: PipelineToolContext;
	definitions: readonly PipelineToolDefinition[];
}): ToolSet {
	const wrappedTools: ToolSet = {};
	const definitionsByToolName = new Map(
		params.definitions.map((definition) => [definition.id, definition])
	);

	for (const [toolName, toolDefinition] of Object.entries(params.tools)) {
		if (!toolDefinition.execute) {
			wrappedTools[toolName] = toolDefinition;
			continue;
		}

		const telemetry = getTelemetryForTool({
			toolName,
			definitionsByToolName,
		});
		if (!telemetry) {
			wrappedTools[toolName] = toolDefinition;
			continue;
		}

		const originalExecute = toolDefinition.execute;

		wrappedTools[toolName] = {
			...toolDefinition,
			execute: async (input: unknown, options?: ToolExecutionOptions) => {
				const startedAt = Date.now();
				const toolCallId =
					typeof options?.toolCallId === "string" &&
					options.toolCallId.length > 0
						? options.toolCallId
						: generateULID();
				const timelineItemId = createToolTimelineItemId({
					workflowRunId: params.context.workflowRunId,
					toolCallId,
				});

				const sanitizedInput = telemetry.sanitizeInput
					? telemetry.sanitizeInput(input)
					: sanitizeToolInputDefault(input);
				const deepTraceEnabled = params.context.deepTraceEnabled === true;
				const tracePayloadMode: ToolTracePayloadMode =
					params.context.tracePayloadMode ?? "sanitized";
				const baseLogMessage = `[ai-pipeline:tool] conv=${params.context.conversationId} workflowRunId=${params.context.workflowRunId} tool=${toolName} toolCallId=${toolCallId}`;

				if (
					isDuplicateBackgroundOneShotToolCall({
						context: params.context,
						toolName,
					})
				) {
					emitStructuredToolLog(
						params.context,
						"warn",
						`${baseLogMessage} evt=duplicate_background_one_shot_suppressed`
					);
					return buildSuppressedDuplicateToolResult();
				}

				incrementCount(params.context.runtimeState.toolCallCounts, toolName);

				if (deepTraceEnabled) {
					emitStructuredToolLog(
						params.context,
						"log",
						`${baseLogMessage} evt=start payloadMode=${tracePayloadMode}`,
						{
							input: buildTracePayloadByMode({
								mode: tracePayloadMode,
								rawPayload: input,
								sanitizedPayload: sanitizedInput,
							}),
						}
					);
				} else {
					emitStructuredToolLog(
						params.context,
						"log",
						`${baseLogMessage} evt=start`
					);
				}

				await safeCreatePartialToolTimelineItem({
					context: params.context,
					toolName,
					telemetry,
					toolCallId,
					timelineItemId,
					sanitizedInput,
					onUniqueViolation: async () => {
						await safeUpdateToolTimelineItem({
							context: params.context,
							toolName,
							telemetry,
							toolCallId,
							timelineItemId,
							state: "partial",
							sanitizedInput,
						});
					},
				});

				await safeEmitToolProgress({
					context: params.context,
					toolName,
					toolCallId,
					telemetry,
					state: "partial",
					sanitizedInput,
				});

				try {
					const result = await originalExecute(
						input as never,
						options as never
					);
					const durationMs = Date.now() - startedAt;
					const failureText = getFailureTextFromResult(result);
					const state = failureText ? "error" : "result";
					const sanitizedOutput = telemetry.sanitizeOutput
						? telemetry.sanitizeOutput(result)
						: sanitizeToolDebugValue(result);

					if (state === "error") {
						incrementCount(
							params.context.runtimeState.failedToolCallCounts,
							toolName
						);
					} else {
						incrementCount(
							params.context.runtimeState.successfulToolCallCounts,
							toolName
						);
						if (didToolMutate(result)) {
							incrementCount(
								params.context.runtimeState.mutationToolCallCounts,
								toolName
							);
						}
						if (!shouldTreatAsFailure(result)) {
							incrementCount(
								params.context.runtimeState.chargeableToolCallCounts,
								toolName
							);
						}
					}

					params.context.runtimeState.toolExecutions.push({
						toolName,
						state,
						input: sanitizedInput,
						...(sanitizedOutput === undefined
							? {}
							: { output: sanitizedOutput }),
						...(failureText ? { errorText: failureText } : {}),
					});

					await safeUpdateToolTimelineItem({
						context: params.context,
						toolName,
						telemetry,
						toolCallId,
						timelineItemId,
						state,
						sanitizedInput,
						sanitizedOutput,
						errorText: failureText ?? undefined,
					});

					await safeEmitToolProgress({
						context: params.context,
						toolName,
						toolCallId,
						telemetry,
						state,
						sanitizedInput,
						sanitizedOutput,
						errorText: failureText ?? undefined,
					});

					if (deepTraceEnabled) {
						emitStructuredToolLog(
							params.context,
							state === "error" ? "warn" : "log",
							`${baseLogMessage} evt=end state=${state} durationMs=${durationMs} payloadMode=${tracePayloadMode}`,
							{
								output: buildTracePayloadByMode({
									mode: tracePayloadMode,
									rawPayload: result,
									sanitizedPayload: sanitizedOutput,
								}),
								...(failureText ? { error: failureText } : {}),
							}
						);
					} else {
						emitStructuredToolLog(
							params.context,
							state === "error" ? "warn" : "log",
							`${baseLogMessage} evt=end state=${state} durationMs=${durationMs}`
						);
					}

					return result;
				} catch (error) {
					const durationMs = Date.now() - startedAt;
					const errorText = toErrorText(error);
					incrementCount(
						params.context.runtimeState.failedToolCallCounts,
						toolName
					);
					params.context.runtimeState.toolExecutions.push({
						toolName,
						state: "error",
						input: sanitizedInput,
						errorText,
					});

					await safeUpdateToolTimelineItem({
						context: params.context,
						toolName,
						telemetry,
						toolCallId,
						timelineItemId,
						state: "error",
						sanitizedInput,
						errorText,
					});

					await safeEmitToolProgress({
						context: params.context,
						toolName,
						toolCallId,
						telemetry,
						state: "error",
						sanitizedInput,
						errorText,
					});

					if (deepTraceEnabled) {
						emitStructuredToolLog(
							params.context,
							"error",
							`${baseLogMessage} evt=end state=threw durationMs=${durationMs} payloadMode=${tracePayloadMode}`,
							{
								error: errorText,
								output: buildTracePayloadByMode({
									mode: tracePayloadMode,
									rawPayload: error,
								}),
							}
						);
					} else {
						emitStructuredToolLog(
							params.context,
							"error",
							`${baseLogMessage} evt=end state=threw durationMs=${durationMs}`,
							error
						);
					}
					throw error;
				}
			},
		};
	}

	return wrappedTools;
}

export { sanitizeToolDebugValue } from "./telemetry/sanitize";
export { createToolTimelineItemId } from "./telemetry/timeline";
