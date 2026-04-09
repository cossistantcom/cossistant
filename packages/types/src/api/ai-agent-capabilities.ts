import {
	serializeSkillFileContent,
	stripSkillMarkdownExtension,
} from "../skill-file-format";

export const AI_AGENT_TOOL_CATEGORIES = [
	"system",
	"messaging",
	"action",
	"context",
	"analysis",
] as const;

export type AiAgentToolCategory = (typeof AI_AGENT_TOOL_CATEGORIES)[number];

export const AI_AGENT_TOOL_GROUPS = ["behavior", "actions"] as const;
export type AiAgentToolGroup = (typeof AI_AGENT_TOOL_GROUPS)[number];

export const AI_AGENT_TOOL_IDS = [
	"searchKnowledgeBase",
	"requestKnowledgeClarification",
	"identifyVisitor",
	"updateConversationTitle",
	"updateSentiment",
	"setPriority",
	"categorizeConversation",
	"sendMessage",
	"sendPrivateMessage",
	"respond",
	"escalate",
	"resolve",
	"markSpam",
	"skip",
] as const;

export type AiAgentToolId = (typeof AI_AGENT_TOOL_IDS)[number];

export const AI_AGENT_BEHAVIOR_SETTING_KEYS = [
	"canResolve",
	"canMarkSpam",
	"canSetPriority",
	"canEscalate",
	"canRequestKnowledgeClarification",
	"autoCategorize",
	"autoGenerateTitle",
	"autoAnalyzeSentiment",
] as const;

export type AiAgentBehaviorSettingKey =
	(typeof AI_AGENT_BEHAVIOR_SETTING_KEYS)[number];

export type AiAgentToolDefaultSkill = {
	name: string;
	label: string;
	description: string;
	content: string;
};

export type AiAgentToolCatalogEntry = {
	id: AiAgentToolId;
	label: string;
	description: string;
	category: AiAgentToolCategory;
	group: AiAgentToolGroup;
	order: number;
	isSystem: boolean;
	isRequired: boolean;
	isToggleable: boolean;
	behaviorSettingKey: AiAgentBehaviorSettingKey | null;
	defaultSkill: AiAgentToolDefaultSkill;
};

type RawToolCatalogEntry = Omit<AiAgentToolCatalogEntry, "defaultSkill"> & {
	defaultSkill: Omit<AiAgentToolDefaultSkill, "content"> & {
		content: string;
	};
};

const AI_AGENT_TOOL_CATALOG_RAW: readonly RawToolCatalogEntry[] = [
	{
		id: "searchKnowledgeBase",
		label: "Search Knowledge Base",
		description: "Retrieve relevant knowledge snippets by keyword query.",
		category: "context",
		group: "behavior",
		order: 1,
		isSystem: true,
		isRequired: true,
		isToggleable: false,
		behaviorSettingKey: null,
		defaultSkill: {
			name: "search-knowledge-base.md",
			label: "Search Knowledge Base",
			description: "Keyword query patterns and result interpretation.",
			content: `## Query Tactics

- Use short keyword queries (2-6 words).
- Retry with synonyms when results are weak.
- Prefer specific product/feature terms over full sentences.

## Result Use

- Prioritize high-similarity results that directly answer the request.
- Give the best grounded answer or partial answer before asking any follow-up.
- If you still need clarification, ask only one narrow question after sharing what you already know.
- Use title/source metadata when it clarifies confidence.`,
		},
	},
	{
		id: "requestKnowledgeClarification",
		label: "Request Knowledge Clarification",
		description:
			"Start a private teammate clarification flow to deepen the knowledge base without escalating the conversation.",
		category: "context",
		group: "behavior",
		order: 3,
		isSystem: false,
		isRequired: false,
		isToggleable: true,
		behaviorSettingKey: "canRequestKnowledgeClarification",
		defaultSkill: {
			name: "request-knowledge-clarification.md",
			label: "Request Knowledge Clarification",
			description: "When and how to deepen unclear knowledge with teammates.",
			content: `## Clarification Semantics

- Use this when the conversation reveals a knowledge gap or evolving policy.
- Do not use this for live human takeover; that remains escalate.
- Prefer concise topic summaries that tell the next teammate question generator what still needs precision.`,
		},
	},
	{
		id: "identifyVisitor",
		label: "Identify Visitor",
		description: "Attach visitor name/email to the conversation record.",
		category: "context",
		group: "behavior",
		order: 2,
		isSystem: true,
		isRequired: true,
		isToggleable: false,
		behaviorSettingKey: null,
		defaultSkill: {
			name: "identify-visitor.md",
			label: "Identify Visitor",
			description: "Input hygiene for profile linking.",
			content: `## Input Hygiene

- Pass clean name/email values without extra text.
- Use the latest visitor-provided values if they correct earlier info.
- Avoid duplicate calls when identity is already up to date.`,
		},
	},
	{
		id: "updateConversationTitle",
		label: "Update Conversation Title",
		description: "Set a concise title for the conversation topic.",
		category: "analysis",
		group: "behavior",
		order: 4,
		isSystem: false,
		isRequired: false,
		isToggleable: true,
		behaviorSettingKey: "autoGenerateTitle",
		defaultSkill: {
			name: "update-conversation-title.md",
			label: "Update Conversation Title",
			description: "Title formatting conventions.",
			content: `## Title Formatting

- Keep titles short and issue-focused.
- Use concrete nouns (feature, error, account area).
- Update only when the conversation topic is clear and stable across recent messages.
- Skip vague, transitional, or generic titles.
- Do not replace a title unless the newer title is meaningfully better.`,
		},
	},
	{
		id: "updateSentiment",
		label: "Update Sentiment",
		description:
			"Record meaningful sentiment changes for conversation analytics.",
		category: "analysis",
		group: "behavior",
		order: 5,
		isSystem: false,
		isRequired: false,
		isToggleable: true,
		behaviorSettingKey: "autoAnalyzeSentiment",
		defaultSkill: {
			name: "update-sentiment.md",
			label: "Update Sentiment",
			description: "When sentiment updates add signal.",
			content: `## Sentiment Updates

- Update only for clear tone shifts.
- Keep rationale short and evidence-based.
- Skip minor wording changes with no practical impact.`,
		},
	},
	{
		id: "setPriority",
		label: "Set Priority",
		description: "Set operational urgency for the conversation.",
		category: "analysis",
		group: "behavior",
		order: 6,
		isSystem: false,
		isRequired: false,
		isToggleable: true,
		behaviorSettingKey: "canSetPriority",
		defaultSkill: {
			name: "set-priority.md",
			label: "Set Priority",
			description: "Priority mapping by impact and urgency.",
			content: `## Priority Mapping

- Urgent: outage, security, or severe business impact.
- High: blocked workflow with no practical workaround.
- Normal: standard support work.
- Low: informational, non-blocking requests.`,
		},
	},
	{
		id: "categorizeConversation",
		label: "Categorize Conversation",
		description: "Add the conversation to one matching saved view.",
		category: "analysis",
		group: "behavior",
		order: 7,
		isSystem: false,
		isRequired: false,
		isToggleable: true,
		behaviorSettingKey: "autoCategorize",
		defaultSkill: {
			name: "categorize-conversation.md",
			label: "Categorize Conversation",
			description: "How to choose the best matching saved view.",
			content: `## Categorization Rules

- Use only one saved view when the match is clear.
- Match the conversation to the closest existing view prompt and description.
- Skip when no view clearly fits.
- Prefer stable themes over one-off phrases from a single message.`,
		},
	},
	{
		id: "sendMessage",
		label: "Send Chat Message",
		description:
			"Send one short customer-visible chat message. Use up to 3 when shorter bubbles read better.",
		category: "messaging",
		group: "behavior",
		order: 8,
		isSystem: true,
		isRequired: true,
		isToggleable: false,
		behaviorSettingKey: null,
		defaultSkill: {
			name: "send-message.md",
			label: "Send Chat Message",
			description: "Short chat-bubble reply rules.",
			content: `## Role

- Use this for every visitor-facing reply.
- Prefer short chat bubbles over one dense block of text.
- Use 2 or 3 separate calls when splitting improves readability.
- Do not exceed 3 public chat messages in one run.`,
		},
	},
	{
		id: "sendPrivateMessage",
		label: "Send Private Note",
		description: "Send internal notes to teammates that visitors cannot see.",
		category: "messaging",
		group: "behavior",
		order: 9,
		isSystem: true,
		isRequired: true,
		isToggleable: false,
		behaviorSettingKey: null,
		defaultSkill: {
			name: "send-private-message.md",
			label: "Send Private Note",
			description: "Internal-note structure for handoff quality.",
			content: `## Internal Note Structure

- Include issue summary, key facts, and actions already attempted.
- Keep notes scannable for fast teammate handoff.
- Use internal operational tone (not customer-facing copy).`,
		},
	},
	{
		id: "respond",
		label: "Finish: Respond",
		description: "Finish the run after sending a complete public response.",
		category: "action",
		group: "actions",
		order: 1,
		isSystem: true,
		isRequired: true,
		isToggleable: false,
		behaviorSettingKey: null,
		defaultSkill: {
			name: "respond.md",
			label: "Finish Respond",
			description: "When to select the respond finish action.",
			content: `## Finish Semantics

- Choose this when the turn is complete and no escalation/closure state change is required.
- Use this as the terminal action for normal reply flows.`,
		},
	},
	{
		id: "escalate",
		label: "Finish: Escalate",
		description: "Escalate to a human when AI should not complete the request.",
		category: "action",
		group: "actions",
		order: 2,
		isSystem: false,
		isRequired: false,
		isToggleable: true,
		behaviorSettingKey: "canEscalate",
		defaultSkill: {
			name: "escalate.md",
			label: "Finish Escalate",
			description: "When to select the escalate finish action.",
			content: `## Finish Semantics

- Choose this when human intervention is required.
- Include a clear escalation reason payload for teammate routing.
- This tool already reassures the visitor and creates the public handoff event.
- Do not send a duplicate confirmation unless the visitor still needs extra context.`,
		},
	},
	{
		id: "resolve",
		label: "Finish: Resolve",
		description: "Mark conversation resolved once the issue is fully handled.",
		category: "action",
		group: "actions",
		order: 3,
		isSystem: false,
		isRequired: false,
		isToggleable: true,
		behaviorSettingKey: "canResolve",
		defaultSkill: {
			name: "resolve.md",
			label: "Finish Resolve",
			description: "When to select the resolve finish action.",
			content: `## Finish Semantics

- Choose this when the issue is closed and the conversation can be marked resolved.
- Use resolution-oriented reasoning in the payload.`,
		},
	},
	{
		id: "markSpam",
		label: "Finish: Mark Spam",
		description: "Mark obvious abuse/spam and close quickly.",
		category: "action",
		group: "actions",
		order: 4,
		isSystem: false,
		isRequired: false,
		isToggleable: true,
		behaviorSettingKey: "canMarkSpam",
		defaultSkill: {
			name: "mark-spam.md",
			label: "Finish Mark Spam",
			description: "When to select the spam finish action.",
			content: `## Finish Semantics

- Choose this for clear spam/abuse/bot traffic.
- Capture concise evidence in reasoning for auditability.`,
		},
	},
	{
		id: "skip",
		label: "Finish: Skip",
		description: "Finish without a public response when silence is better.",
		category: "action",
		group: "actions",
		order: 5,
		isSystem: true,
		isRequired: true,
		isToggleable: false,
		behaviorSettingKey: null,
		defaultSkill: {
			name: "skip.md",
			label: "Finish Skip",
			description: "When to select the skip finish action.",
			content: `## Finish Semantics

- Choose this when no additional assistant output is needed for this run.
- Use reasoning that explains why silence is intentional.`,
		},
	},
] as const;

export const AI_AGENT_TOOL_CATALOG: readonly AiAgentToolCatalogEntry[] =
	AI_AGENT_TOOL_CATALOG_RAW.map((tool) => ({
		...tool,
		defaultSkill: {
			...tool.defaultSkill,
			content: serializeSkillFileContent({
				name: stripSkillMarkdownExtension(tool.defaultSkill.name),
				description: tool.defaultSkill.description,
				body: tool.defaultSkill.content,
			}),
		},
	}));

export const AI_AGENT_RESERVED_TOOL_SKILL_TEMPLATE_NAMES = [
	...new Set(AI_AGENT_TOOL_CATALOG.map((tool) => tool.defaultSkill.name)),
] as const;

export const AI_AGENT_DROPPED_SKILL_TEMPLATE_NAMES = [
	"reply-or-stay-silent.md",
	"send-message-behavior.md",
	"deep-research.md",
	"grounded-answers.md",
	"visitor-identification.md",
	"escalation-playbook.md",
	"resolution-checklist.md",
	"spam-detection.md",
	"priority-triage.md",
	"sentiment-tracking.md",
	"title-hygiene.md",
	"handoff-notes.md",
	"tone-and-voice.md",
	"short-clear-replies.md",
	"wait.md",
] as const;
