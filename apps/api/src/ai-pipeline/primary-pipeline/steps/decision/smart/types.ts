import type { Database } from "@api/db";
import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import type { ConversationSelect } from "@api/db/schema/conversation";
import type {
	ConversationState,
	RoleAwareMessage,
	SegmentedConversationMessage,
} from "../../../contracts";

export type DecisionIntent =
	| "respond"
	| "observe"
	| "assist_team"
	| "scope_boundary_redirect";

export type DecisionConfidence = "high" | "medium" | "low";

export type DecisionSource = "rule" | "model" | "fallback";

export type SmartDecisionResult = {
	intent: DecisionIntent;
	reasoning: string;
	confidence: DecisionConfidence;
	source?: DecisionSource;
	ruleId?: string;
};

export type SmartDecisionInput = {
	db: Database;
	aiAgent: AiAgentSelect;
	conversation: ConversationSelect;
	decisionMessages: SegmentedConversationMessage[];
	conversationState: ConversationState;
	triggerMessage: RoleAwareMessage;
	decisionPolicy: string;
};

export type DecisionSignals = {
	humanActive: boolean;
	lastHumanSecondsAgo: number | null;
	messagesSinceHuman: number;
	visitorBurstCount: number;
	recentTurnPattern: string;
	triggerIsShortAckOrGreeting: boolean;
	triggerIsQuestionOrRequest: boolean;
	triggerIsSingleNonQuestion: boolean;
	triggerLooksLikeHumanCommand: boolean;
	hasLaterHumanMessage: boolean;
	hasLaterAiMessage: boolean;
};

export type SmartDecisionModelConfig = {
	id: string;
	timeoutMs: number;
};
