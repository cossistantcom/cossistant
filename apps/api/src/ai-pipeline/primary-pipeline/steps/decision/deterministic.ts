import type { ConversationSelect } from "@api/db/schema/conversation";
import type { ConversationState, RoleAwareMessage } from "../../contracts";
import { detectScopeBoundaryRequest } from "./scope-boundary";
import { detectAiTag, stripLeadingTag } from "./tag-detection";
import type { DecisionResult, DecisionStepInput, ResponseMode } from "./types";

export type DeterministicDecisionResult =
	| {
			type: "final";
			result: DecisionResult;
	  }
	| {
			type: "continue";
			cleanedTriggerText: string;
	  };

function withConversationState(
	conversationState: ConversationState,
	input: {
		shouldAct: boolean;
		reason: string;
		mode: ResponseMode;
		humanCommand: string | null;
		decisionOutcome?: DecisionResult["decisionOutcome"];
		scopeBoundaryRuleId?: string;
	}
): DecisionResult {
	return {
		...input,
		isEscalated: conversationState.isEscalated,
		escalationReason: conversationState.escalationReason,
	};
}

function isAiPaused(conversation: ConversationSelect): boolean {
	if (!conversation.aiPausedUntil) {
		return false;
	}
	return new Date(conversation.aiPausedUntil) > new Date();
}

function modeForTaggedMessage(message: RoleAwareMessage): ResponseMode {
	if (message.senderType === "human_agent") {
		return "respond_to_command";
	}
	return "respond_to_visitor";
}

export function runDeterministicDecision(
	input: DecisionStepInput
): DeterministicDecisionResult {
	const { triggerMessage, triggerMessageText, conversationState } = input;

	if (!triggerMessage) {
		if (!triggerMessageText?.trim()) {
			return {
				type: "final",
				result: withConversationState(conversationState, {
					shouldAct: false,
					reason: "Attachment-only message skipped",
					mode: "background_only",
					humanCommand: null,
				}),
			};
		}

		return {
			type: "final",
			result: withConversationState(conversationState, {
				shouldAct: false,
				reason: "No trigger message",
				mode: "background_only",
				humanCommand: null,
			}),
		};
	}

	if (triggerMessage.senderType === "ai_agent") {
		return {
			type: "final",
			result: withConversationState(conversationState, {
				shouldAct: false,
				reason: "AI-authored message cannot trigger AI response",
				mode: "background_only",
				humanCommand: null,
			}),
		};
	}

	if (isAiPaused(input.conversation)) {
		return {
			type: "final",
			result: withConversationState(conversationState, {
				shouldAct: false,
				reason: "AI is paused for this conversation",
				mode: "background_only",
				humanCommand: null,
			}),
		};
	}

	const scopeBoundaryDecision = detectScopeBoundaryRequest(triggerMessage);
	if (scopeBoundaryDecision) {
		return {
			type: "final",
			result: withConversationState(conversationState, {
				shouldAct: true,
				reason: scopeBoundaryDecision.reason,
				mode: "respond_to_visitor",
				humanCommand: null,
				decisionOutcome: "scope_boundary_redirect",
				scopeBoundaryRuleId: scopeBoundaryDecision.ruleId,
			}),
		};
	}

	const tagResult = detectAiTag({
		message: triggerMessage,
		aiAgent: input.aiAgent,
	});

	if (tagResult.tagged) {
		const humanCommand =
			triggerMessage.senderType === "human_agent"
				? stripLeadingTag(tagResult.cleanedText, input.aiAgent.name)
				: null;

		return {
			type: "final",
			result: withConversationState(conversationState, {
				shouldAct: true,
				reason: "AI was explicitly tagged",
				mode: modeForTaggedMessage(triggerMessage),
				humanCommand,
			}),
		};
	}

	return {
		type: "continue",
		cleanedTriggerText: tagResult.cleanedText.trim(),
	};
}
