import type { Database } from "@api/db";
import { listAiAgentPromptDocuments } from "@api/db/queries/ai-agent-prompt-document";
import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import {
	AI_AGENT_DROPPED_SKILL_TEMPLATE_NAMES,
	AI_AGENT_RESERVED_TOOL_SKILL_TEMPLATE_NAMES,
	AI_AGENT_TOOL_CATALOG,
	type AiAgentBehaviorSettingKey,
} from "@plasma/types";
import { getBehaviorPromptDefinition } from "./behavior-catalog";
import {
	CORE_PROMPT_DOCUMENT_NAMES,
	type CorePromptDocumentName,
	EDITABLE_CORE_PROMPT_DOCUMENT_NAME_SET,
} from "./documents";
import {
	buildBehaviorInstructions,
	buildCapabilitiesInstructions,
} from "./instructions";

type ResponseMode =
	| "respond_to_visitor"
	| "respond_to_command"
	| "background_only";

import { getBehaviorSettings } from "../settings";
import { CORE_SECURITY_PROMPT } from "./security";
import { PROMPT_TEMPLATES } from "./templates";

export type ResolvedCorePromptDocument = {
	name: CorePromptDocumentName;
	content: string;
	source: "fallback" | "override";
	priority: number;
};

export type ResolvedSkillPromptDocument = {
	id: string;
	name: string;
	content: string;
	priority: number;
	source: "tool" | "custom";
};

export type ResolvedPromptBundle = {
	coreDocuments: Record<CorePromptDocumentName, ResolvedCorePromptDocument>;
	enabledSkills: ResolvedSkillPromptDocument[];
};

type ResolvePromptBundleInput = {
	db: Database;
	aiAgent: AiAgentSelect;
	mode: ResponseMode;
};

export function buildFallbackCoreDocuments(
	aiAgent: AiAgentSelect,
	mode: ResponseMode
): Record<CorePromptDocumentName, string> {
	const settings = getBehaviorSettings(aiAgent);
	const behaviorInstructions = buildBehaviorInstructions(settings, mode);
	const capabilities = buildCapabilitiesInstructions(settings);
	const visitorContactBehavior = getBehaviorPromptDefinition("visitor_contact");
	const smartDecisionBehavior = getBehaviorPromptDefinition("smart_decision");

	return {
		"agent.md": aiAgent.basePrompt,
		"security.md": CORE_SECURITY_PROMPT,
		"behaviour.md": behaviorInstructions,
		"visitor-contact.md":
			visitorContactBehavior?.defaultContent ??
			PROMPT_TEMPLATES.VISITOR_IDENTIFICATION_SOFT,
		"participation.md": PROMPT_TEMPLATES.PARTICIPATION_POLICY,
		"decision.md":
			smartDecisionBehavior?.defaultContent ?? PROMPT_TEMPLATES.DECISION_POLICY,
		"grounding.md":
			mode === "respond_to_visitor"
				? PROMPT_TEMPLATES.GROUNDING_INSTRUCTIONS
				: "",
		"capabilities.md": capabilities || PROMPT_TEMPLATES.CAPABILITIES,
	};
}

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

function isToolEnabledAtRuntime(
	settings: ReturnType<typeof getBehaviorSettings>,
	tool: (typeof AI_AGENT_TOOL_CATALOG)[number]
): boolean {
	if (!(tool.isToggleable && tool.behaviorSettingKey)) {
		return true;
	}

	return getBehaviorSettingValue(settings, tool.behaviorSettingKey);
}

export async function resolvePromptBundle(
	input: ResolvePromptBundleInput
): Promise<ResolvedPromptBundle> {
	const { db, aiAgent, mode } = input;
	const fallbackDocuments = buildFallbackCoreDocuments(aiAgent, mode);
	const behaviorSettings = getBehaviorSettings(aiAgent);
	const droppedSkillNames = new Set<string>(
		AI_AGENT_DROPPED_SKILL_TEMPLATE_NAMES
	);
	const reservedToolSkillNames = new Set<string>(
		AI_AGENT_RESERVED_TOOL_SKILL_TEMPLATE_NAMES
	);

	const coreDocuments = CORE_PROMPT_DOCUMENT_NAMES.reduce(
		(accumulator, name) => {
			accumulator[name] = {
				name,
				content: fallbackDocuments[name],
				source: "fallback",
				priority: 0,
			};
			return accumulator;
		},
		{} as Record<CorePromptDocumentName, ResolvedCorePromptDocument>
	);

	const promptDocuments = await listAiAgentPromptDocuments(db, {
		organizationId: aiAgent.organizationId,
		websiteId: aiAgent.websiteId,
		aiAgentId: aiAgent.id,
	});

	for (const document of promptDocuments) {
		if (document.kind !== "core" || !document.enabled) {
			continue;
		}

		if (!EDITABLE_CORE_PROMPT_DOCUMENT_NAME_SET.has(document.name)) {
			continue;
		}

		const coreName = document.name as CorePromptDocumentName;
		if (!coreDocuments[coreName]) {
			continue;
		}

		coreDocuments[coreName] = {
			name: coreName,
			content: document.content,
			source: "override",
			priority: document.priority,
		};
	}

	const skillDocuments = promptDocuments.filter(
		(document) => document.kind === "skill"
	);
	const skillDocumentsByName = new Map(
		skillDocuments.map((document) => [document.name, document])
	);

	const enabledToolSkills: ResolvedSkillPromptDocument[] =
		AI_AGENT_TOOL_CATALOG.filter((tool) =>
			isToolEnabledAtRuntime(behaviorSettings, tool)
		)
			.filter((tool) => !droppedSkillNames.has(tool.defaultSkill.name))
			.map((tool) => {
				const overrideDocument = skillDocumentsByName.get(
					tool.defaultSkill.name
				);
				return {
					id: overrideDocument?.id ?? `default:${tool.defaultSkill.name}`,
					name: tool.defaultSkill.name,
					content: overrideDocument?.content ?? tool.defaultSkill.content,
					priority: tool.order,
					source: "tool" as const,
				};
			})
			.sort((a, b) => {
				if (a.priority !== b.priority) {
					return a.priority - b.priority;
				}
				return a.name.localeCompare(b.name);
			});

	const enabledCustomSkills: ResolvedSkillPromptDocument[] = skillDocuments
		.filter((document) => document.enabled)
		.filter((document) => !reservedToolSkillNames.has(document.name))
		.filter((document) => !droppedSkillNames.has(document.name))
		.map((document) => ({
			id: document.id,
			name: document.name,
			content: document.content,
			priority: document.priority,
			source: "custom" as const,
		}))
		.sort((a, b) => {
			if (b.priority !== a.priority) {
				return b.priority - a.priority;
			}
			return a.name.localeCompare(b.name);
		});

	return {
		coreDocuments,
		enabledSkills: [...enabledToolSkills, ...enabledCustomSkills],
	};
}
