import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import type { ConversationSelect } from "@api/db/schema/conversation";
import type {
	ConversationState,
	RoleAwareMessage,
	SegmentedConversationMessage,
} from "../../contracts";
import type { SmartDecisionResult } from "./smart/types";

export type ResponseMode =
	| "respond_to_visitor"
	| "respond_to_command"
	| "background_only";

export type DecisionResult = {
	shouldAct: boolean;
	reason: string;
	mode: ResponseMode;
	humanCommand: string | null;
	isEscalated: boolean;
	escalationReason: string | null;
	decisionOutcome?: "scope_boundary_redirect";
	scopeBoundaryRuleId?: string;
	smartDecision?: SmartDecisionResult;
};

export type DecisionStepInput = {
	aiAgent: AiAgentSelect;
	conversation: ConversationSelect;
	decisionMessages: SegmentedConversationMessage[];
	conversationState: ConversationState;
	triggerMessage: RoleAwareMessage | null;
	triggerMessageText: string | null;
	hasLaterHumanMessage: boolean;
	hasLaterAiMessage: boolean;
};
