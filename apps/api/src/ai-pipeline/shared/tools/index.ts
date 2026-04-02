import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import type { ToolSet } from "@api/lib/ai";
import type { AiAgentToolId } from "@plasma/types";
import { getBehaviorSettings } from "../settings";
import { FINISH_TOOL_IDS, SHARED_PIPELINE_TOOL_CATALOG } from "./catalog";
import type {
	PipelineToolContext,
	PipelineToolDefinition,
	ToolAvailability,
} from "./contracts";
import { wrapPipelineToolsWithTelemetry } from "./telemetry";

export {
	createConversationMemoryTools,
	createVisitorMemoryTools,
	createWebsiteMemoryTools,
} from "./memory";

const FINISH_TOOL_NAME_SET = new Set<string>(FINISH_TOOL_IDS);

type BehaviorSettingKey = NonNullable<
	(typeof SHARED_PIPELINE_TOOL_CATALOG)[number]["behaviorSettingKey"]
>;

function getBehaviorSettingValue(
	aiAgent: AiAgentSelect,
	settingKey: BehaviorSettingKey
): boolean {
	const settings = getBehaviorSettings(aiAgent);

	switch (settingKey) {
		case "autoAnalyzeSentiment":
			return settings.autoAnalyzeSentiment;
		case "autoCategorize":
			return settings.autoCategorize;
		case "autoGenerateTitle":
			return settings.autoGenerateTitle;
		case "canEscalate":
			return settings.canEscalate;
		case "canRequestKnowledgeClarification":
			return settings.canRequestKnowledgeClarification;
		case "canMarkSpam":
			return settings.canMarkSpam;
		case "canResolve":
			return settings.canResolve;
		case "canSetPriority":
			return settings.canSetPriority;
		default:
			return false;
	}
}

function isToolAvailableInContext(params: {
	availability: ToolAvailability;
	context: PipelineToolContext;
}): boolean {
	const { availability, context } = params;
	const enabledForPipeline =
		context.pipelineKind === "primary"
			? availability.primary
			: availability.background;

	if (!enabledForPipeline) {
		return false;
	}

	// Public-facing tools are never available when public messages are disabled.
	if (availability.publicOnly && !context.allowPublicMessages) {
		return false;
	}

	return true;
}

export type PipelineToolBuildResult = {
	tools: ToolSet;
	toolNames: string[];
	finishToolNames: string[];
};

export function isFinishToolName(toolName: string): boolean {
	return FINISH_TOOL_NAME_SET.has(toolName);
}

export function buildPipelineToolset(params: {
	aiAgent: AiAgentSelect;
	context: PipelineToolContext;
	allowedToolNames?: readonly AiAgentToolId[];
}): PipelineToolBuildResult {
	const tools: ToolSet = {};
	const activeDefinitions: PipelineToolDefinition[] = [];
	const toolNames: string[] = [];
	const finishToolNames: string[] = [];
	const allowedToolNameSet = params.allowedToolNames
		? new Set<string>(params.allowedToolNames)
		: null;

	for (const entry of SHARED_PIPELINE_TOOL_CATALOG) {
		if (allowedToolNameSet && !allowedToolNameSet.has(entry.id)) {
			continue;
		}

		if (
			!isToolAvailableInContext({
				availability: entry.availability,
				context: params.context,
			})
		) {
			continue;
		}

		if (
			entry.behaviorSettingKey &&
			!getBehaviorSettingValue(params.aiAgent, entry.behaviorSettingKey)
		) {
			continue;
		}

		const instance = entry.factory(params.context);
		if (!instance) {
			continue;
		}

		tools[entry.id] = instance;
		activeDefinitions.push(entry);
		toolNames.push(entry.id);

		if (isFinishToolName(entry.id)) {
			finishToolNames.push(entry.id);
		}
	}

	return {
		tools: wrapPipelineToolsWithTelemetry({
			tools,
			context: params.context,
			definitions: activeDefinitions,
		}),
		toolNames,
		finishToolNames,
	};
}
