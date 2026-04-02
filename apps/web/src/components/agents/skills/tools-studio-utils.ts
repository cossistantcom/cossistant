import type {
	GetCapabilitiesStudioResponse,
	UpdateBehaviorSettingsRequest,
} from "@plasma/types";
import {
	AI_AGENT_TOOL_CATALOG,
	parseSkillFileContent,
	serializeSkillFileContent,
	stripSkillMarkdownExtension,
} from "@plasma/types";

type BehaviorSettingKey = NonNullable<
	GetCapabilitiesStudioResponse["tools"][number]["behaviorSettingKey"]
>;
type StudioTool = GetCapabilitiesStudioResponse["tools"][number];
type StudioToolInput = Partial<StudioTool> & {
	id?: unknown;
};

const TOOL_CATALOG_BY_ID = new Map(
	AI_AGENT_TOOL_CATALOG.map((tool) => [tool.id, tool])
);

function getToolId(value: unknown): StudioTool["id"] | null {
	if (typeof value !== "string") {
		return null;
	}
	return TOOL_CATALOG_BY_ID.has(value as StudioTool["id"])
		? (value as StudioTool["id"])
		: null;
}

function getStringOrFallback(value: unknown, fallback: string): string {
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (trimmed.length > 0) {
			return value;
		}
	}
	return fallback;
}

function getOptionalStringOrNull(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function getBooleanOrFallback(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

export function normalizeStudioTools(tools: unknown): StudioTool[] {
	const rawTools = Array.isArray(tools) ? tools : [];
	const rawByToolId = new Map<StudioTool["id"], StudioToolInput>();

	for (const rawTool of rawTools) {
		if (!(rawTool && typeof rawTool === "object")) {
			continue;
		}
		const toolId = getToolId((rawTool as StudioToolInput).id);
		if (!(toolId && !rawByToolId.has(toolId))) {
			continue;
		}
		rawByToolId.set(toolId, rawTool as StudioToolInput);
	}

	return AI_AGENT_TOOL_CATALOG.map((catalogTool) => {
		const rawTool = rawByToolId.get(catalogTool.id);
		const skillContent = getStringOrFallback(
			rawTool?.skillContent,
			catalogTool.defaultSkill.content
		);
		const skillDocumentId = getOptionalStringOrNull(rawTool?.skillDocumentId);
		const skillHasOverride = getBooleanOrFallback(
			rawTool?.skillHasOverride,
			Boolean(skillDocumentId)
		);
		const skillIsCustomized = getBooleanOrFallback(
			rawTool?.skillIsCustomized,
			skillHasOverride &&
				skillContent.trim() !== catalogTool.defaultSkill.content.trim()
		);

		return {
			id: catalogTool.id,
			label: getStringOrFallback(rawTool?.label, catalogTool.label),
			description: getStringOrFallback(
				rawTool?.description,
				catalogTool.description
			),
			category: catalogTool.category,
			group: catalogTool.group,
			order: catalogTool.order,
			isSystem: catalogTool.isSystem,
			isRequired: catalogTool.isRequired,
			isToggleable: catalogTool.isToggleable,
			behaviorSettingKey: catalogTool.behaviorSettingKey,
			enabled: getBooleanOrFallback(rawTool?.enabled, true),
			skillName: catalogTool.defaultSkill.name,
			skillLabel: getStringOrFallback(
				rawTool?.skillLabel,
				catalogTool.defaultSkill.label
			),
			skillDescription: getStringOrFallback(
				rawTool?.skillDescription,
				catalogTool.defaultSkill.description
			),
			skillContent,
			skillDocumentId,
			skillHasOverride,
			skillIsCustomized,
		};
	});
}

function sortTools(tools: StudioTool[]): StudioTool[] {
	return [...tools].sort((a, b) => {
		if (a.order !== b.order) {
			return a.order - b.order;
		}
		return a.label.localeCompare(b.label);
	});
}

export function buildToolStudioSections(tools: StudioTool[]) {
	const behaviorTools = sortTools(
		tools.filter((tool) => tool.group === "behavior")
	);
	const actionTools = sortTools(
		tools.filter((tool) => tool.group === "actions")
	);

	return {
		toggleableBehaviorTools: behaviorTools.filter((tool) => tool.isToggleable),
		toggleableActionTools: actionTools.filter((tool) => tool.isToggleable),
		alwaysOnTools: [
			...behaviorTools.filter((tool) => !tool.isToggleable),
			...actionTools.filter((tool) => !tool.isToggleable),
		],
	};
}

export function buildBehaviorSettingsPatch(
	key: BehaviorSettingKey,
	value: boolean
): UpdateBehaviorSettingsRequest["settings"] {
	switch (key) {
		case "canResolve":
			return { canResolve: value };
		case "canMarkSpam":
			return { canMarkSpam: value };
		case "canSetPriority":
			return { canSetPriority: value };
		case "canEscalate":
			return { canEscalate: value };
		case "canRequestKnowledgeClarification":
			return { canRequestKnowledgeClarification: value };
		case "autoGenerateTitle":
			return { autoGenerateTitle: value };
		case "autoAnalyzeSentiment":
			return { autoAnalyzeSentiment: value };
		default:
			return {};
	}
}

export function normalizeSkillFileName(input: string): string {
	const value = input.trim().toLowerCase().replace(/\s+/g, "-");
	if (!value) {
		return "";
	}
	return value.endsWith(".md") ? value : `${value}.md`;
}

export function normalizeSkillFrontmatterName(input: string): string {
	return stripSkillMarkdownExtension(input).trim();
}

export function toCanonicalSkillFileNameFromFrontmatterName(
	input: string
): string {
	return normalizeSkillFileName(normalizeSkillFrontmatterName(input));
}

export function parseSkillEditorContent(input: {
	content: string;
	canonicalFileName: string;
	fallbackDescription?: string;
}) {
	return parseSkillFileContent(input);
}

export function serializeSkillEditorContent(input: {
	name: string;
	description: string;
	body: string;
}) {
	return serializeSkillFileContent({
		name: normalizeSkillFrontmatterName(input.name),
		description: input.description,
		body: input.body,
	});
}
