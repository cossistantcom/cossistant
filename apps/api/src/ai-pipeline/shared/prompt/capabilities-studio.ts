import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import type { AiAgentPromptDocumentSelect } from "@api/db/schema/ai-agent-prompt-document";
import {
	AI_AGENT_DROPPED_SKILL_TEMPLATE_NAMES,
	AI_AGENT_RESERVED_TOOL_SKILL_TEMPLATE_NAMES,
	AI_AGENT_TOOL_CATALOG,
	type AiAgentBehaviorSettingKey,
	type GetCapabilitiesStudioResponse,
} from "@plasma/types";
import { getBehaviorSettings } from "../settings";

function getBehaviorSettingValue(
	settings: ReturnType<typeof getBehaviorSettings>,
	key: AiAgentBehaviorSettingKey
): boolean {
	switch (key) {
		case "canResolve":
			return settings.canResolve;
		case "canMarkSpam":
			return settings.canMarkSpam;
		case "canSetPriority":
			return settings.canSetPriority;
		case "canEscalate":
			return settings.canEscalate;
		case "canRequestKnowledgeClarification":
			return settings.canRequestKnowledgeClarification;
		case "autoCategorize":
			return settings.autoCategorize;
		case "autoGenerateTitle":
			return settings.autoGenerateTitle;
		case "autoAnalyzeSentiment":
			return settings.autoAnalyzeSentiment;
		default:
			return false;
	}
}

export function resolveToolEnabledState(
	settings: ReturnType<typeof getBehaviorSettings>,
	tool: (typeof AI_AGENT_TOOL_CATALOG)[number]
): boolean {
	if (!(tool.isToggleable && tool.behaviorSettingKey)) {
		return true;
	}

	return getBehaviorSettingValue(settings, tool.behaviorSettingKey);
}

function toPromptDocumentResponse(
	document: AiAgentPromptDocumentSelect
): GetCapabilitiesStudioResponse["customSkillDocuments"][number] {
	return {
		id: document.id,
		organizationId: document.organizationId,
		websiteId: document.websiteId,
		aiAgentId: document.aiAgentId,
		kind: document.kind,
		name: document.name,
		content: document.content,
		enabled: document.enabled,
		priority: document.priority,
		createdByUserId: document.createdByUserId,
		updatedByUserId: document.updatedByUserId,
		createdAt: document.createdAt,
		updatedAt: document.updatedAt,
	};
}

export function buildCapabilitiesStudioResponse(input: {
	aiAgent: AiAgentSelect;
	documents: AiAgentPromptDocumentSelect[];
}): GetCapabilitiesStudioResponse {
	const { aiAgent, documents } = input;
	const behaviorSettings = getBehaviorSettings(aiAgent);
	const droppedSkillNames = new Set<string>(
		AI_AGENT_DROPPED_SKILL_TEMPLATE_NAMES
	);
	const reservedToolSkillNames = new Set<string>(
		AI_AGENT_RESERVED_TOOL_SKILL_TEMPLATE_NAMES
	);

	const allSkillDocuments = documents.filter(
		(document) =>
			document.kind === "skill" && !droppedSkillNames.has(document.name)
	);
	const skillDocumentsByName = new Map(
		allSkillDocuments.map((document) => [document.name, document])
	);

	const tools = AI_AGENT_TOOL_CATALOG.map((tool) => {
		const overrideSkillDocument = skillDocumentsByName.get(
			tool.defaultSkill.name
		);
		const effectiveSkillContent =
			overrideSkillDocument?.content ?? tool.defaultSkill.content;

		return {
			id: tool.id,
			label: tool.label,
			description: tool.description,
			category: tool.category,
			group: tool.group,
			order: tool.order,
			isSystem: tool.isSystem,
			isRequired: tool.isRequired,
			isToggleable: tool.isToggleable,
			behaviorSettingKey: tool.behaviorSettingKey,
			enabled: resolveToolEnabledState(behaviorSettings, tool),
			skillName: tool.defaultSkill.name,
			skillLabel: tool.defaultSkill.label,
			skillDescription: tool.defaultSkill.description,
			skillContent: effectiveSkillContent,
			skillDocumentId: overrideSkillDocument?.id ?? null,
			skillHasOverride: Boolean(overrideSkillDocument),
			skillIsCustomized: overrideSkillDocument
				? overrideSkillDocument.content.trim() !==
					tool.defaultSkill.content.trim()
				: false,
		};
	});

	const customSkillDocuments = allSkillDocuments
		.filter((document) => !reservedToolSkillNames.has(document.name))
		.map(toPromptDocumentResponse);

	return {
		aiAgentId: aiAgent.id,
		tools,
		customSkillDocuments,
	};
}
