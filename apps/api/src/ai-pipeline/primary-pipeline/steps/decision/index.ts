import type { Database } from "@api/db";
import { logAiPipeline } from "../../../logger";
import { resolveDecisionPolicy } from "./decision-policy";
import { runDeterministicDecision } from "./deterministic";
import { mapSmartDecisionToDecisionResult } from "./result-mapping";
import { runSmartDecision } from "./smart";
import type { DecisionResult, DecisionStepInput } from "./types";

export async function runDecisionStep(params: {
	db: Database;
	input: DecisionStepInput;
}): Promise<DecisionResult> {
	const deterministicDecision = runDeterministicDecision(params.input);

	if (deterministicDecision.type === "final") {
		return deterministicDecision.result;
	}

	const decisionPolicyResolution = await resolveDecisionPolicy({
		db: params.db,
		aiAgent: params.input.aiAgent,
	});

	if (decisionPolicyResolution.fallback === "error") {
		logAiPipeline({
			area: "decision",
			event: "policy_resolve_failed",
			level: "warn",
			conversationId: params.input.conversation.id,
			fields: {
				policy: "decision.md",
				fallback: decisionPolicyResolution.fallback,
			},
			error: decisionPolicyResolution.error,
		});
	}

	if (!params.input.triggerMessage) {
		throw new Error("triggerMessage is required for smart decision");
	}

	const smartDecision = await runSmartDecision({
		db: params.db,
		aiAgent: params.input.aiAgent,
		conversation: params.input.conversation,
		decisionMessages: params.input.decisionMessages,
		conversationState: params.input.conversationState,
		triggerMessage: params.input.triggerMessage,
		decisionPolicy: decisionPolicyResolution.policy,
	});

	return mapSmartDecisionToDecisionResult({
		input: params.input,
		cleanedTriggerText: deterministicDecision.cleanedTriggerText,
		smartDecision,
	});
}

export type { SmartDecisionResult } from "./smart";
export type { DecisionResult, DecisionStepInput, ResponseMode } from "./types";
