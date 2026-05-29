import type { runSmartDecision } from "./smart";
import type { DecisionResult, DecisionStepInput } from "./types";

function buildDecisionResult(params: {
	input: DecisionStepInput;
	shouldAct: boolean;
	reason: string;
	mode: DecisionResult["mode"];
	humanCommand: string | null;
	smartDecision?: DecisionResult["smartDecision"];
}): DecisionResult {
	return {
		shouldAct: params.shouldAct,
		reason: params.reason,
		mode: params.mode,
		humanCommand: params.humanCommand,
		isEscalated: params.input.conversationState.isEscalated,
		escalationReason: params.input.conversationState.escalationReason,
		smartDecision: params.smartDecision,
	};
}

export function mapSmartDecisionToDecisionResult(params: {
	input: DecisionStepInput;
	cleanedTriggerText: string;
	smartDecision: Awaited<ReturnType<typeof runSmartDecision>>;
}): DecisionResult {
	const { input, smartDecision, cleanedTriggerText } = params;
	const triggerMessage = input.triggerMessage;

	if (smartDecision.intent === "observe") {
		return buildDecisionResult({
			input,
			shouldAct: false,
			reason: `Smart decision: ${smartDecision.reasoning}`,
			mode: "background_only",
			humanCommand: null,
			smartDecision,
		});
	}

	if (smartDecision.intent === "assist_team") {
		return buildDecisionResult({
			input,
			shouldAct: true,
			reason: `Smart decision: ${smartDecision.reasoning}`,
			mode: "background_only",
			humanCommand:
				triggerMessage?.senderType === "human_agent"
					? cleanedTriggerText
					: null,
			smartDecision,
		});
	}

	if (smartDecision.intent === "scope_boundary_redirect") {
		return {
			...buildDecisionResult({
				input,
				shouldAct: true,
				reason: `Smart decision: ${smartDecision.reasoning}`,
				mode: "respond_to_visitor",
				humanCommand: null,
				smartDecision,
			}),
			decisionOutcome: "scope_boundary_redirect",
			scopeBoundaryRuleId: smartDecision.ruleId,
		};
	}

	if (triggerMessage?.senderType === "human_agent") {
		return buildDecisionResult({
			input,
			shouldAct: true,
			reason: `Smart decision: ${smartDecision.reasoning}`,
			mode: "respond_to_command",
			humanCommand: cleanedTriggerText,
			smartDecision,
		});
	}

	return buildDecisionResult({
		input,
		shouldAct: true,
		reason: `Smart decision: ${smartDecision.reasoning}`,
		mode: "respond_to_visitor",
		humanCommand: null,
		smartDecision,
	});
}
