/**
 * AI Agent Behavior Settings
 *
 * These settings control how the AI agent behaves in conversations.
 * They are stored in the behaviorSettings column of the ai_agent table.
 *
 * Simplified for MVP - the AI decides when to respond based on context,
 * not configuration. Removed: responseMode, responseDelayMs, pauseOnHumanReply,
 * pauseDurationMinutes.
 */

export const MIN_TOOL_INVOCATIONS_PER_RUN = 10;
export const MAX_TOOL_INVOCATIONS_PER_RUN = 50;
export const DEFAULT_TOOL_INVOCATIONS_PER_RUN = 15;

/**
 * Behavior settings for an AI agent
 */
export type AiAgentBehaviorSettings = {
	// Capability toggles
	/** Can the AI resolve conversations */
	canResolve: boolean;
	/** Can the AI mark conversations as spam */
	canMarkSpam: boolean;
	/** Can the AI assign conversations to team members */
	canAssign: boolean;
	/** Can the AI change conversation priority */
	canSetPriority: boolean;
	/** Can the AI add conversations to views/categories */
	canCategorize: boolean;
	/** Can the AI escalate to human agents */
	canEscalate: boolean;
	/** Can the AI start a private knowledge clarification flow for teammates */
	canRequestKnowledgeClarification: boolean;
	/** Can the AI request provider-side reasoning for primary answer generation */
	aiThinkingEnabled: boolean;

	// Escalation config
	/** Default user to assign when escalating (null = no default) */
	defaultEscalationUserId: string | null;

	/** Maximum tool calls allowed per pipeline run (excluding finish actions) */
	maxToolInvocationsPerRun: number;

	// Background analysis (runs silently, creates private events)
	/** Automatically analyze and set conversation sentiment */
	autoAnalyzeSentiment: boolean;
	/** Automatically generate conversation titles */
	autoGenerateTitle: boolean;
	/** Automatically categorize into views based on content */
	autoCategorize: boolean;
};
