/**
 * Default Behavior Settings
 *
 * Provides sensible defaults for AI agent behavior.
 */

import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import {
	type AiAgentBehaviorSettings,
	DEFAULT_TOOL_INVOCATIONS_PER_RUN,
	MAX_TOOL_INVOCATIONS_PER_RUN,
	MIN_TOOL_INVOCATIONS_PER_RUN,
} from "./types";

function clampToolInvocationBudget(
	rawValue: number | null | undefined
): number {
	if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
		return DEFAULT_TOOL_INVOCATIONS_PER_RUN;
	}

	return Math.min(
		MAX_TOOL_INVOCATIONS_PER_RUN,
		Math.max(MIN_TOOL_INVOCATIONS_PER_RUN, Math.floor(rawValue))
	);
}

/**
 * Default behavior settings for new AI agents
 *
 * Simplified for MVP - AI responds as fast as possible and decides
 * when to respond based on context, not configuration.
 */
export function getDefaultBehaviorSettings(): AiAgentBehaviorSettings {
	return {
		// Capability toggles
		canResolve: true,
		canMarkSpam: true,
		canAssign: true,
		canSetPriority: true,
		canCategorize: true,
		canEscalate: true,
		canRequestKnowledgeClarification: true,
		aiThinkingEnabled: false,

		// Escalation config
		defaultEscalationUserId: null,
		maxToolInvocationsPerRun: DEFAULT_TOOL_INVOCATIONS_PER_RUN,

		// Background analysis - all enabled by default
		autoAnalyzeSentiment: true,
		autoGenerateTitle: true,
		autoCategorize: false, // Disabled by default - needs view setup first
	};
}

/**
 * Get behavior settings for an AI agent
 *
 * Merges stored settings with defaults for any missing values.
 */
export function getBehaviorSettings(
	aiAgent: AiAgentSelect
): AiAgentBehaviorSettings {
	const defaults = getDefaultBehaviorSettings();
	const stored = aiAgent.behaviorSettings;

	if (!stored) {
		return defaults;
	}

	// Merge stored with defaults
	const merged = {
		...defaults,
		...stored,
	};

	return {
		canResolve: merged.canResolve,
		canMarkSpam: merged.canMarkSpam,
		canAssign: merged.canAssign,
		canSetPriority: merged.canSetPriority,
		canCategorize: merged.canCategorize,
		canEscalate: merged.canEscalate,
		canRequestKnowledgeClarification: merged.canRequestKnowledgeClarification,
		aiThinkingEnabled: merged.aiThinkingEnabled === true,
		defaultEscalationUserId: merged.defaultEscalationUserId,
		maxToolInvocationsPerRun: clampToolInvocationBudget(
			merged.maxToolInvocationsPerRun
		),
		autoAnalyzeSentiment: merged.autoAnalyzeSentiment,
		autoGenerateTitle: merged.autoGenerateTitle,
		autoCategorize: merged.autoCategorize,
	};
}
