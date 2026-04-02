import type {
	AiAgentBehaviorPromptDocumentName,
	AiAgentBehaviorPromptId,
	AiAgentBehaviorPromptPreset,
	AiAgentEditableCorePromptDocumentName,
} from "@plasma/types";
import { PROMPT_TEMPLATES } from "./templates";

export type BehaviorPromptDefinition = {
	id: AiAgentBehaviorPromptId;
	label: string;
	description: string;
	documentName: AiAgentBehaviorPromptDocumentName;
	defaultContent: string;
	presets: readonly AiAgentBehaviorPromptPreset[];
};

export type CorePromptStudioDefinition = {
	documentName: AiAgentEditableCorePromptDocumentName;
	label: string;
	description: string;
	presets: readonly AiAgentBehaviorPromptPreset[];
};

const VISITOR_CONTACT_PRESETS = [
	{
		id: "contact_only_if_needed",
		label: "Only if needed",
		description:
			"Ask for name and email only when account context is required to resolve the request.",
		content: PROMPT_TEMPLATES.VISITOR_IDENTIFICATION_SOFT,
	},
	{
		id: "contact_ask_early",
		label: "Ask early",
		description:
			"Collect name and email in the first helpful turn when the visitor is still unidentified.",
		content: PROMPT_TEMPLATES.VISITOR_IDENTIFICATION_EARLY,
	},
	{
		id: "contact_ask_after_context",
		label: "Ask after context",
		description:
			"Start by understanding the issue, then ask for identity once conversation context is established.",
		content: PROMPT_TEMPLATES.VISITOR_IDENTIFICATION_DELAYED,
	},
] as const satisfies readonly AiAgentBehaviorPromptPreset[];

const SMART_DECISION_PRESETS = [
	{
		id: "decision_human_first",
		label: "Human-first",
		description:
			"Prefer observing when a teammate is actively engaged unless the visitor has an unmet need.",
		content: `## Decision Policy

- Priority 1: protect human conversation continuity; if a teammate is actively handling and AI value is unclear, choose observe.
- Priority 2: resolve clear unmet visitor need; choose respond for unanswered questions or explicit help requests.
- Priority 3: honor teammate intent; choose respond for clear execution commands and assist_team for internal analysis/handoff.
- For greetings (hi, hello, hey): prefer respond when humanActive=false — the AI should engage and start the conversation. When humanActive=true, prefer observe.
- Prefer observe for short acknowledgements (ok, thanks, got it) or banter without a clear need.
- If uncertain, choose observe.`,
	},
	{
		id: "decision_proactive",
		label: "Proactive",
		description:
			"Bias toward responding when the visitor has open questions, even with light human activity.",
		content: PROMPT_TEMPLATES.DECISION_POLICY,
	},
	{
		id: "decision_guarded",
		label: "Guarded",
		description:
			"Bias toward observation to protect human conversation continuity and reduce interruptions.",
		content: `## Decision Policy

- Priority 1: protect human conversation continuity; if a teammate is active, prefer observe unless a clear gap remains.
- Priority 2: respond only when there is an explicit unmet visitor request or direct teammate command.
- Priority 3: use assist_team for internal synthesis when value is high but public response risk is non-trivial.
- For greetings: respond when no human is active; otherwise observe.
- Prefer observe for acknowledgements, banter, and low-information follow-ups.
- If uncertain, choose observe.`,
	},
] as const satisfies readonly AiAgentBehaviorPromptPreset[];

const BEHAVIOR_PROMPT_CATALOG = [
	{
		id: "visitor_contact",
		label: "How and when to get visitor's contact details",
		description:
			"Define when and how the agent asks for visitor identity details (name/email).",
		documentName: "visitor-contact.md",
		defaultContent: PROMPT_TEMPLATES.VISITOR_IDENTIFICATION_SOFT,
		presets: VISITOR_CONTACT_PRESETS,
	},
	{
		id: "smart_decision",
		label:
			"How the agent should decide when to respond or not in a conversation",
		description:
			"Control the decision gate policy that determines when the AI should respond, observe, or assist the team.",
		documentName: "decision.md",
		defaultContent: PROMPT_TEMPLATES.DECISION_POLICY,
		presets: SMART_DECISION_PRESETS,
	},
] as const satisfies readonly BehaviorPromptDefinition[];

const EDITABLE_CORE_PROMPT_CATALOG = [
	{
		documentName: "behaviour.md",
		label: "Response behavior",
		description:
			"Guidelines for escalation behavior and mode-aware response constraints.",
		presets: [],
	},
	{
		documentName: "participation.md",
		label: "Participation policy",
		description:
			"Rules for when the AI should reply versus stay silent in mixed human/AI conversations.",
		presets: [],
	},
	{
		documentName: "grounding.md",
		label: "Grounding policy",
		description:
			"Rules that require retrieval-first behavior for factual/product/policy responses.",
		presets: [],
	},
	{
		documentName: "capabilities.md",
		label: "Capabilities policy",
		description:
			"Defines what actions/tools the AI is allowed or disallowed to perform.",
		presets: [],
	},
	{
		documentName: "visitor-contact.md",
		label: "How and when to get visitor's contact details",
		description:
			"Define when and how the agent asks for visitor identity details (name/email).",
		presets: VISITOR_CONTACT_PRESETS,
	},
	{
		documentName: "decision.md",
		label:
			"How the agent should decide when to respond or not in a conversation",
		description:
			"Control the decision gate policy that determines when the AI should respond, observe, or assist the team.",
		presets: SMART_DECISION_PRESETS,
	},
] as const satisfies readonly CorePromptStudioDefinition[];

const BEHAVIOR_PROMPT_CATALOG_BY_ID = new Map(
	BEHAVIOR_PROMPT_CATALOG.map((behavior) => [behavior.id, behavior])
);

const BEHAVIOR_PROMPT_CATALOG_BY_DOCUMENT_NAME = new Map(
	BEHAVIOR_PROMPT_CATALOG.map((behavior) => [behavior.documentName, behavior])
);

const EDITABLE_CORE_PROMPT_CATALOG_BY_DOCUMENT_NAME = new Map(
	EDITABLE_CORE_PROMPT_CATALOG.map((entry) => [entry.documentName, entry])
);

export const EDITABLE_BEHAVIOR_CORE_DOCUMENT_NAMES = [
	...new Set(BEHAVIOR_PROMPT_CATALOG.map((behavior) => behavior.documentName)),
] as const;

export function getBehaviorPromptCatalog(): readonly BehaviorPromptDefinition[] {
	return BEHAVIOR_PROMPT_CATALOG;
}

export function getEditableCorePromptCatalog(): readonly CorePromptStudioDefinition[] {
	return EDITABLE_CORE_PROMPT_CATALOG;
}

export function getBehaviorPromptDefinition(
	behaviorId: AiAgentBehaviorPromptId
): BehaviorPromptDefinition | null {
	return BEHAVIOR_PROMPT_CATALOG_BY_ID.get(behaviorId) ?? null;
}

export function getBehaviorPromptDefinitionByDocumentName(
	documentName: AiAgentBehaviorPromptDocumentName
): BehaviorPromptDefinition | null {
	return BEHAVIOR_PROMPT_CATALOG_BY_DOCUMENT_NAME.get(documentName) ?? null;
}

export function getEditableCorePromptDefinitionByDocumentName(
	documentName: AiAgentEditableCorePromptDocumentName
): CorePromptStudioDefinition | null {
	return (
		EDITABLE_CORE_PROMPT_CATALOG_BY_DOCUMENT_NAME.get(documentName) ?? null
	);
}
