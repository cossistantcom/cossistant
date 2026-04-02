import {
	AI_AGENT_TOOL_CATALOG,
	parseSkillFileContent,
} from "@plasma/types";
import { emitPipelineGenerationProgress } from "../events";
import { resolvePromptBundle } from "../prompt/resolver";
import { getBehaviorSettings } from "../settings";
import { buildPipelineToolset } from "../tools";
import type {
	CapturedFinalAction,
	GenerationMode,
	GenerationRuntimeInput,
	GenerationRuntimeResult,
	GenerationTokenUsage,
	PipelineKind,
} from "./contracts";
import { runGenerationAttempt } from "./internal/attempt";
import { emitGenerationDebugLog } from "./internal/debug-log";
import {
	buildSafeSkipAction,
	buildToolContext,
	countTotalToolCalls,
	createToolRuntimeState,
} from "./internal/runtime-utils";
import { writeGenerationSystemPromptDebugDump } from "./internal/system-prompt-debug-dump";
import { buildGenerationMessages } from "./messages/format-history";
import { buildGenerationSystemPrompt } from "./prompt/builder";

function getMessagingContractError(params: {
	input: GenerationRuntimeInput;
	action: CapturedFinalAction;
	publicMessagesSent: number;
}): string | null {
	const { input, action, publicMessagesSent } = params;
	const requiresPublicChatReply =
		action.action === "respond" ||
		action.action === "resolve" ||
		action.action === "mark_spam";

	if (
		input.mode !== "background_only" &&
		requiresPublicChatReply &&
		publicMessagesSent === 0
	) {
		return "Non-background completion requires sendMessage as the main public response";
	}

	return null;
}

export async function runGenerationRuntime(
	input: GenerationRuntimeInput
): Promise<GenerationRuntimeResult> {
	const runtimeState = createToolRuntimeState();
	const toolContext = buildToolContext({
		input,
		runtimeState,
	});

	await emitPipelineGenerationProgress({
		conversation: input.conversation,
		aiAgentId: input.aiAgent.id,
		workflowRunId: input.workflowRunId,
		phase: "thinking",
		message: "Analyzing conversation context...",
		audience: "dashboard",
	}).catch((error) => {
		emitGenerationDebugLog(
			input,
			"warn",
			`[ai-pipeline:generation] conv=${input.conversation.id} workflowRunId=${input.workflowRunId} evt=progress_thinking_failed`,
			error
		);
	});

	const baseToolsetResolution = buildPipelineToolset({
		aiAgent: input.aiAgent,
		context: toolContext,
		allowedToolNames: input.toolAllowlist,
	});

	if (baseToolsetResolution.toolNames.length === 0) {
		return {
			status: "completed",
			action: buildSafeSkipAction("No tools available after policy gating"),
			publicMessagesSent: runtimeState.publicMessagesSent,
			toolCallsByName: runtimeState.toolCallCounts,
			mutationToolCallsByName: runtimeState.mutationToolCallCounts,
			chargeableToolCallsByName: runtimeState.chargeableToolCallCounts,
			totalToolCalls: 0,
			attempts: [],
		};
	}

	if (baseToolsetResolution.finishToolNames.length === 0) {
		return {
			status: "completed",
			action: buildSafeSkipAction("No finish tools available"),
			publicMessagesSent: runtimeState.publicMessagesSent,
			toolCallsByName: runtimeState.toolCallCounts,
			mutationToolCallsByName: runtimeState.mutationToolCallCounts,
			chargeableToolCallsByName: runtimeState.chargeableToolCallCounts,
			totalToolCalls: 0,
			attempts: [],
		};
	}

	let runtimeToolSkills: Array<{ label: string; content: string }> = [];
	let promptBundle: Awaited<ReturnType<typeof resolvePromptBundle>>;
	try {
		promptBundle = await resolvePromptBundle({
			db: input.db,
			aiAgent: input.aiAgent,
			mode: input.mode,
		});
		const runtimeToolNameSet = new Set(baseToolsetResolution.toolNames);
		const enabledToolSkillByName = new Map(
			promptBundle.enabledSkills
				.filter((skill) => skill.source === "tool")
				.map((skill) => [skill.name, skill])
		);

		runtimeToolSkills = AI_AGENT_TOOL_CATALOG.filter((tool) =>
			runtimeToolNameSet.has(tool.id)
		).map((tool) => {
			const candidate =
				enabledToolSkillByName.get(tool.defaultSkill.name)?.content ??
				tool.defaultSkill.content;
			try {
				const parsed = parseSkillFileContent({
					content: candidate,
					canonicalFileName: tool.defaultSkill.name,
				});
				return {
					label: tool.defaultSkill.label,
					content: parsed.body,
				};
			} catch {
				return {
					label: tool.defaultSkill.label,
					content: candidate,
				};
			}
		});
	} catch (error) {
		emitGenerationDebugLog(
			input,
			"warn",
			`[ai-pipeline:generation] conv=${input.conversation.id} workflowRunId=${input.workflowRunId} evt=prompt_bundle_resolve_failed`,
			error
		);

		return {
			status: "error",
			action: buildSafeSkipAction("Failed to resolve prompt bundle"),
			error: "Failed to resolve prompt bundle",
			failureCode: "runtime_error",
			publicMessagesSent: runtimeState.publicMessagesSent,
			toolCallsByName: runtimeState.toolCallCounts,
			mutationToolCallsByName: runtimeState.mutationToolCallCounts,
			chargeableToolCallsByName: runtimeState.chargeableToolCallCounts,
			totalToolCalls: countTotalToolCalls(runtimeState.toolCallCounts),
			attempts: [],
		};
	}

	const systemPrompt = buildGenerationSystemPrompt({
		input,
		promptBundle,
		toolset: baseToolsetResolution.tools,
		toolNames: baseToolsetResolution.toolNames,
		toolSkills: runtimeToolSkills,
	});

	const messages = buildGenerationMessages(input.generationEntries);

	await writeGenerationSystemPromptDebugDump({
		input,
		messages,
		systemPrompt,
	});

	const behaviorSettings = getBehaviorSettings(input.aiAgent);

	const nonFinishToolBudget = Math.max(
		1,
		Math.floor(behaviorSettings.maxToolInvocationsPerRun)
	);

	const attempts: NonNullable<GenerationRuntimeResult["attempts"]> = [];

	runtimeState.finalAction = null;
	runtimeState.lastToolError = null;

	const primaryResult = await runGenerationAttempt({
		input,
		attempt: 1,
		modelId: input.aiAgent.model,
		systemPrompt,
		messages,
		nonFinishToolBudget,
		toolsetResolution: baseToolsetResolution,
		runtimeState,
		attempts,
	});

	if (primaryResult.status === "completed") {
		const contractError = getMessagingContractError({
			input,
			action: primaryResult.action,
			publicMessagesSent: runtimeState.publicMessagesSent,
		});
		if (contractError) {
			return {
				status: "error",
				action: buildSafeSkipAction("Invalid public messaging contract"),
				error: contractError,
				failureCode: "runtime_error",
				publicMessagesSent: runtimeState.publicMessagesSent,
				toolCallsByName: runtimeState.toolCallCounts,
				mutationToolCallsByName: runtimeState.mutationToolCallCounts,
				chargeableToolCallsByName: runtimeState.chargeableToolCallCounts,
				totalToolCalls: countTotalToolCalls(runtimeState.toolCallCounts),
				attempts,
			};
		}

		return {
			...primaryResult,
			attempts,
		};
	}

	return {
		...primaryResult,
		attempts,
	};
}

export type {
	CapturedFinalAction,
	GenerationMode,
	GenerationRuntimeInput,
	GenerationRuntimeResult,
	GenerationTokenUsage,
	PipelineKind,
} from "./contracts";
