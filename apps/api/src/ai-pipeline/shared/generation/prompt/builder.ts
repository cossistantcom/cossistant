import type { ToolSet } from "@api/lib/ai";
import type { CorePromptDocumentName } from "../../prompt/documents";
import type { ResolvedPromptBundle } from "../../prompt/resolver";
import type { GenerationRuntimeInput } from "../contracts";
import {
	buildModeInstructions,
	REPLY_FLOW_CONTRACT,
	TOOL_PROTOCOL,
} from "./templates";

const CORE_GENERATION_DOC_ORDER: CorePromptDocumentName[] = [
	"security.md",
	"agent.md",
	"behaviour.md",
	"visitor-contact.md",
	"participation.md",
	"grounding.md",
	"capabilities.md",
];

const CORE_GENERATION_DOC_TITLES: Record<CorePromptDocumentName, string> = {
	"agent.md": "Agent",
	"security.md": "Security",
	"behaviour.md": "Behaviour",
	"visitor-contact.md": "Visitor Contact",
	"participation.md": "Participation",
	"decision.md": "Decision",
	"grounding.md": "Grounding",
	"capabilities.md": "Capabilities",
};

function buildCorePromptStages(promptBundle: ResolvedPromptBundle): string[] {
	return CORE_GENERATION_DOC_ORDER.map((name) => {
		const content = promptBundle.coreDocuments[name]?.content?.trim() ?? "";
		if (!content) {
			return "";
		}

		return `## ${CORE_GENERATION_DOC_TITLES[name]}\n${content}`;
	}).filter((section) => section.trim().length > 0);
}

function buildVisitorSummary(input: GenerationRuntimeInput): string {
	const visitor = input.visitorContext;
	if (!visitor) {
		return "Visitor context: unavailable";
	}

	return [
		`name=${visitor.name ?? "unknown"}`,
		`email=${visitor.email ?? "unknown"}`,
		`identified=${visitor.isIdentified ? "yes" : "no"}`,
		`location=${[visitor.city, visitor.country].filter(Boolean).join(", ") || "unknown"}`,
		`language=${visitor.language ?? "unknown"}`,
	].join(" | ");
}

function buildContextFactsStage(input: GenerationRuntimeInput): string {
	return `## Context Facts
conversationId=${input.conversation.id}
triggerMessageId=${input.triggerMessageId}
triggerSenderType=${input.triggerSenderType ?? "unknown"}
triggerVisibility=${input.triggerVisibility ?? "unknown"}
websiteDefaultLanguage=${input.websiteDefaultLanguage}
visitorLanguage=${input.visitorLanguage ?? "unknown"}
autoTranslateEnabled=${input.autoTranslateEnabled !== false ? "yes" : "no"}
conversationEscalated=${input.conversationState.isEscalated ? "yes" : "no"}
escalationReason=${input.conversationState.escalationReason ?? "none"}
hasHumanAssignee=${input.conversationState.hasHumanAssignee ? "yes" : "no"}
hasLaterHumanMessage=${input.hasLaterHumanMessage ? "yes" : "no"}
hasLaterAiMessage=${input.hasLaterAiMessage ? "yes" : "no"}
mode=${input.mode}
visitor=${buildVisitorSummary(input)}
humanCommand=${input.humanCommand?.trim() || "none"}`;
}

function buildCurrentTriggerStage(input: GenerationRuntimeInput): string {
	return `## Current Trigger
id=${input.triggerMessageId}
sender=${input.triggerSenderType ?? "unknown"}
visibility=${input.triggerVisibility ?? "unknown"}
text=${input.triggerMessageText?.trim() || "(empty)"}`;
}

function buildConversationTitleStage(input: GenerationRuntimeInput): string {
	return `## Conversation Title State
internalTitle=${input.conversation.title?.trim() || "none"}
internalTitleSource=${input.conversation.titleSource ?? "none"}
visitorTitle=${input.conversation.visitorTitle?.trim() || "none"}
visitorTitleLanguage=${input.conversation.visitorTitleLanguage ?? "none"}`;
}

function buildTimelineSemanticsStage(): string {
	return `## Timeline Semantics
Messages are labeled with [BEFORE], [TRIGGER], or [AFTER].

- [TRIGGER] is the queued message currently being processed in FIFO order.
- [AFTER] contains newer context for awareness only.
- Use [AFTER] context to avoid redundant replies, duplicate tool calls, or contradictions.
- Do not pretend [AFTER] context does not exist.
- Visitor messages may already be translated into the website default language for internal reasoning and knowledge retrieval.`;
}

function buildLanguagePolicyStage(input: GenerationRuntimeInput): string {
	const visitorLanguage = input.visitorLanguage ?? "unknown";
	const autoTranslateEnabled = input.autoTranslateEnabled !== false;

	return autoTranslateEnabled
		? `## Language Policy
- The website default language is ${input.websiteDefaultLanguage}. Use it for internal reasoning, knowledge-base searches, query rewriting, and public sendMessage text.
- The visitor's detected conversation language is ${visitorLanguage}.
- Write public messages in ${input.websiteDefaultLanguage}. The system translates public AI and human messages for the visitor when needed.
- If you call updateConversationTitle, write the saved internal conversation.title in ${input.websiteDefaultLanguage} only.
- Never localize the internal title yourself. The system derives visitorTitle separately for the visitor-facing language.
- Never switch knowledge-base search to the visitor language unless the website language search fails and you explicitly need a rewrite.`
		: `## Language Policy
- Auto-translate is disabled for this website.
- The website default language is ${input.websiteDefaultLanguage}. Use it for internal reasoning, knowledge-base searches, and visitor-facing replies.
- The visitor's language is ${visitorLanguage}.
- If you call updateConversationTitle, write the saved internal conversation.title in ${input.websiteDefaultLanguage} only.
- Do not try to create a separate localized title. Leave visitorTitle derivation to the system.
- Do not switch the reply language just because the visitor speaks another language unless a human explicitly instructs you to do so.
- Keep knowledge-base search in the website default language.`;
}

function buildAvailableViewsStage(input: GenerationRuntimeInput): string {
	if (!(input.availableViews && input.availableViews.length > 0)) {
		return "";
	}

	const entries = input.availableViews
		.map(
			(view) => `- id=${view.id}
  name=${view.name}
  description=${view.description?.trim() || "none"}
  prompt=${view.prompt?.trim() || "none"}`
		)
		.join("\n");

	return `## Available Views
Use only these saved views when categorizing. Match by intent, not by exact wording.
If none fit clearly, skip categorization.

${entries}`;
}

function buildToolInventorySection(params: {
	toolset: ToolSet;
	toolNames: string[];
}): string {
	if (params.toolNames.length === 0) {
		return "No tools available.";
	}

	return params.toolNames
		.map((toolName) => {
			const tool = params.toolset[toolName];
			const description =
				tool && typeof tool === "object" && "description" in tool
					? typeof tool.description === "string"
						? tool.description
						: "No description"
					: "No description";
			return `- ${toolName}: ${description}`;
		})
		.join("\n");
}

function buildToolStage(params: {
	toolset: ToolSet;
	toolNames: string[];
}): string {
	return `## Tool Inventory
${buildToolInventorySection(params)}

${TOOL_PROTOCOL}`;
}

function buildToolSkillStage(params: {
	toolSkills: Array<{ label: string; content: string }>;
}): string {
	if (params.toolSkills.length === 0) {
		return "";
	}

	const entries = params.toolSkills
		.map(
			(skill) =>
				`### ${skill.label}\n${skill.content.trim() || "No additional instructions."}`
		)
		.join("\n\n");

	return `## Active Tool Skills\nApply these tool-specific instructions when relevant.\n\n${entries}`;
}

export function buildGenerationSystemPrompt(params: {
	input: GenerationRuntimeInput;
	promptBundle: ResolvedPromptBundle;
	toolset: ToolSet;
	toolNames: string[];
	toolSkills?: Array<{ label: string; content: string }>;
}): string {
	const sections = [
		...buildCorePromptStages(params.promptBundle),
		buildContextFactsStage(params.input),
		buildCurrentTriggerStage(params.input),
		buildConversationTitleStage(params.input),
		buildTimelineSemanticsStage(),
		buildLanguagePolicyStage(params.input),
		buildAvailableViewsStage(params.input),
		buildToolStage({
			toolset: params.toolset,
			toolNames: params.toolNames,
		}),
		buildToolSkillStage({
			toolSkills: params.toolSkills ?? [],
		}),
		buildModeInstructions({
			mode: params.input.mode,
			humanCommand: params.input.humanCommand,
		}),
		REPLY_FLOW_CONTRACT,
	].filter((section) => section.trim().length > 0);

	return sections.join("\n\n");
}
