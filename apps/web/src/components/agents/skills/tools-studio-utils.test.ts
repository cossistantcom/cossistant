import { describe, expect, it } from "bun:test";
import {
	AI_AGENT_TOOL_CATALOG,
	type GetCapabilitiesStudioResponse,
} from "@cossistant/types";
import {
	buildBehaviorSettingsPatch,
	buildToolStudioSections,
	normalizeSkillFileName,
	normalizeSkillFrontmatterName,
	normalizeStudioTools,
	parseSkillEditorContent,
	serializeSkillEditorContent,
	toCanonicalSkillFileNameFromFrontmatterName,
} from "./tools-studio-utils";

function createTool(
	overrides: Partial<GetCapabilitiesStudioResponse["tools"][number]> & {
		id: GetCapabilitiesStudioResponse["tools"][number]["id"];
		label: string;
		group: GetCapabilitiesStudioResponse["tools"][number]["group"];
		order: number;
	}
): GetCapabilitiesStudioResponse["tools"][number] {
	return {
		id: overrides.id,
		label: overrides.label,
		description: overrides.description ?? `${overrides.label} description`,
		category: overrides.category ?? "analysis",
		group: overrides.group,
		order: overrides.order,
		isSystem: overrides.isSystem ?? false,
		isRequired: overrides.isRequired ?? false,
		isToggleable: overrides.isToggleable ?? true,
		behaviorSettingKey: overrides.behaviorSettingKey ?? null,
		enabled: overrides.enabled ?? true,
		skillName: overrides.skillName ?? `${overrides.id}.md`,
		skillLabel: overrides.skillLabel ?? `${overrides.label} skill`,
		skillDescription: overrides.skillDescription ?? "skill description",
		skillContent: overrides.skillContent ?? "skill content",
		skillDocumentId: overrides.skillDocumentId ?? null,
		skillHasOverride: overrides.skillHasOverride ?? false,
		skillIsCustomized: overrides.skillIsCustomized ?? false,
	};
}

describe("tools-studio-utils", () => {
	it("maps each toggle key to the expected behavior setting patch", () => {
		expect(buildBehaviorSettingsPatch("canResolve", true)).toEqual({
			canResolve: true,
		});
		expect(buildBehaviorSettingsPatch("canMarkSpam", false)).toEqual({
			canMarkSpam: false,
		});
		expect(buildBehaviorSettingsPatch("canSetPriority", true)).toEqual({
			canSetPriority: true,
		});
		expect(buildBehaviorSettingsPatch("canEscalate", false)).toEqual({
			canEscalate: false,
		});
		expect(buildBehaviorSettingsPatch("autoGenerateTitle", true)).toEqual({
			autoGenerateTitle: true,
		});
		expect(buildBehaviorSettingsPatch("autoAnalyzeSentiment", false)).toEqual({
			autoAnalyzeSentiment: false,
		});
	});

	it("normalizes skill names to kebab-case markdown filenames", () => {
		expect(normalizeSkillFileName("Refund Playbook")).toBe(
			"refund-playbook.md"
		);
		expect(normalizeSkillFileName("custom-skill.md")).toBe("custom-skill.md");
		expect(normalizeSkillFileName("  ")).toBe("");
	});

	it("normalizes frontmatter names without markdown extension", () => {
		expect(normalizeSkillFrontmatterName("refund-playbook.md")).toBe(
			"refund-playbook"
		);
		expect(normalizeSkillFrontmatterName("  refund-playbook  ")).toBe(
			"refund-playbook"
		);
	});

	it("maps frontmatter names to canonical skill document names", () => {
		expect(toCanonicalSkillFileNameFromFrontmatterName("refund-playbook")).toBe(
			"refund-playbook.md"
		);
		expect(
			toCanonicalSkillFileNameFromFrontmatterName("Refund Playbook.md")
		).toBe("refund-playbook.md");
	});

	it("round-trips frontmatter editor fields into markdown content", () => {
		const content = serializeSkillEditorContent({
			name: "refund-playbook",
			description: "Handle refund policy questions.",
			body: "## Refunds\n\nAsk for the order id first.",
		});

		const parsed = parseSkillEditorContent({
			content,
			canonicalFileName: "refund-playbook.md",
		});

		expect(parsed.hasFrontmatter).toBe(true);
		expect(parsed.name).toBe("refund-playbook");
		expect(parsed.description).toBe("Handle refund policy questions.");
		expect(parsed.body).toContain("## Refunds");
	});

	it("auto-backfills legacy skill content without frontmatter", () => {
		const parsed = parseSkillEditorContent({
			content: "## Escalation Playbook\n\nEscalate when policy is unclear.",
			canonicalFileName: "escalation-playbook.md",
		});

		expect(parsed.hasFrontmatter).toBe(false);
		expect(parsed.name).toBe("escalation-playbook");
		expect(parsed.description).toBe("Escalation Playbook");
		expect(parsed.body).toContain("Escalate when policy is unclear.");
	});

	it("splits tools into toggleable and always-on sections with deterministic order", () => {
		const tools: GetCapabilitiesStudioResponse["tools"] = [
			createTool({
				id: "resolve",
				label: "Finish: Resolve",
				group: "actions",
				order: 3,
			}),
			createTool({
				id: "searchKnowledgeBase",
				label: "Search Knowledge Base",
				group: "behavior",
				order: 1,
				isRequired: true,
				isToggleable: false,
			}),
			createTool({
				id: "updateConversationTitle",
				label: "Update Conversation Title",
				group: "behavior",
				order: 3,
			}),
			createTool({
				id: "sendMessage",
				label: "Send Public Message",
				group: "behavior",
				order: 6,
				isRequired: true,
				isToggleable: false,
			}),
			createTool({
				id: "escalate",
				label: "Finish: Escalate",
				group: "actions",
				order: 2,
			}),
			createTool({
				id: "respond",
				label: "Finish: Respond",
				group: "actions",
				order: 1,
				isRequired: true,
				isToggleable: false,
			}),
		];

		const sections = buildToolStudioSections(tools);

		expect(sections.toggleableBehaviorTools.map((tool) => tool.id)).toEqual([
			"updateConversationTitle",
		]);
		expect(sections.toggleableActionTools.map((tool) => tool.id)).toEqual([
			"escalate",
			"resolve",
		]);
		expect(sections.alwaysOnTools.map((tool) => tool.id)).toEqual([
			"searchKnowledgeBase",
			"sendMessage",
			"respond",
		]);
	});

	it("normalizes malformed studio tools against catalog defaults", () => {
		const normalizedTools = normalizeStudioTools([
			{
				id: "sendMessage",
				enabled: false,
				skillContent: "custom send content",
				skillDocumentId: "01JTESTSKILLDOC0000000000",
			},
			{
				id: "resolve",
			},
			{
				id: "unknown-tool-id",
				label: "ignore me",
			},
		]);

		expect(normalizedTools).toHaveLength(AI_AGENT_TOOL_CATALOG.length);

		const sendMessageTool = normalizedTools.find(
			(tool) => tool.id === "sendMessage"
		);
		expect(sendMessageTool).toBeDefined();
		expect(sendMessageTool?.group).toBe("behavior");
		// Read the order from the catalog so adding tools does not break this test.
		expect(sendMessageTool?.order).toBe(
			AI_AGENT_TOOL_CATALOG.find((tool) => tool.id === "sendMessage")?.order
		);
		expect(sendMessageTool?.enabled).toBe(false);
		expect(sendMessageTool?.skillContent).toBe("custom send content");
		expect(sendMessageTool?.skillHasOverride).toBe(true);

		const resolveTool = normalizedTools.find((tool) => tool.id === "resolve");
		expect(resolveTool).toBeDefined();
		expect(resolveTool?.group).toBe("actions");
		expect(resolveTool?.order).toBe(3);
		expect(resolveTool?.enabled).toBe(true);
	});

	it("still produces expected section buckets from malformed input", () => {
		const normalizedTools = normalizeStudioTools([
			{
				id: "sendMessage",
				label: "Public reply",
			},
			{
				id: "respond",
			},
		]);

		const sections = buildToolStudioSections(normalizedTools);
		// Counts come from the catalog so new tools do not break this test.
		const toggleableIn = (group: string) =>
			AI_AGENT_TOOL_CATALOG.filter(
				(tool) => tool.group === group && tool.isToggleable
			).length;
		expect(sections.toggleableBehaviorTools).toHaveLength(
			toggleableIn("behavior")
		);
		expect(sections.toggleableActionTools).toHaveLength(
			toggleableIn("actions")
		);
		expect(sections.alwaysOnTools.map((tool) => tool.id)).toEqual([
			"searchKnowledgeBase",
			"identifyVisitor",
			"sendMessage",
			"sendPrivateMessage",
			"respond",
			"skip",
		]);
	});
});
