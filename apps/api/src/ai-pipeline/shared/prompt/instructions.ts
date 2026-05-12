/**
 * Behavior Instructions
 *
 * Builds dynamic instructions based on behavior settings.
 */

import type { AiAgentBehaviorSettings } from "../settings/types";
import { PROMPT_TEMPLATES } from "./templates";

type ResponseMode =
	| "respond_to_visitor"
	| "respond_to_command"
	| "background_only";

/**
 * Build behavior instructions based on settings
 */
export function buildBehaviorInstructions(
	settings: AiAgentBehaviorSettings,
	mode: ResponseMode
): string {
	const instructions: string[] = [];

	const escalationInstructions = buildEscalationInstructions(settings);
	if (escalationInstructions) {
		instructions.push(escalationInstructions);
	}

	instructions.push(PROMPT_TEMPLATES.ESCALATED_CONTEXT);

	const clarificationInstructions =
		buildKnowledgeClarificationInstructions(settings);
	if (clarificationInstructions) {
		instructions.push(clarificationInstructions);
	}

	// Add mode-specific behavior
	const modeInstructions = buildModeBehaviorInstructions(mode);
	if (modeInstructions) {
		instructions.push(modeInstructions);
	}

	return instructions.join("\n\n");
}

export function buildEscalationInstructions(
	settings: AiAgentBehaviorSettings
): string {
	return settings.canEscalate ? PROMPT_TEMPLATES.ESCALATION_GUIDELINES : "";
}

export function buildKnowledgeClarificationInstructions(
	settings: AiAgentBehaviorSettings
): string {
	return settings.canRequestKnowledgeClarification
		? PROMPT_TEMPLATES.KNOWLEDGE_CLARIFICATION_GUIDELINES
		: "";
}

export function buildModeBehaviorInstructions(mode: ResponseMode): string {
	if (mode === "background_only") {
		return `## Current Mode: Background Only

You are in background mode. Do NOT send visible messages to the visitor.
Use private/context actions if needed, then finish with skip.`;
	}

	return "";
}

/**
 * Build a list of enabled capabilities
 */
export function buildCapabilitiesInstructions(
	_settings: AiAgentBehaviorSettings
): string {
	return `## Capabilities Policy

Runtime tool availability and behavior settings define what actions are allowed.
Do not assume unavailable tools or capabilities.`;
}
