import type {
	KnowledgeClarificationRequestSelect,
	KnowledgeClarificationTurnSelect,
} from "@api/db/schema/knowledge-clarification";
import type {
	ActiveConversationKnowledgeClarificationStatus,
	ConversationClarificationProgress,
	ConversationClarificationSummary,
	KnowledgeClarificationTurnRole,
} from "@plasma/types";

type ActiveConversationClarificationRequest = Pick<
	KnowledgeClarificationRequestSelect,
	| "id"
	| "conversationId"
	| "status"
	| "topicSummary"
	| "stepIndex"
	| "maxSteps"
	| "updatedAt"
>;

type ClarificationTurnLike = Pick<
	KnowledgeClarificationTurnSelect,
	"role" | "question"
>;

function isAiQuestionTurnRole(
	role: KnowledgeClarificationTurnRole
): role is "ai_question" {
	return role === "ai_question";
}

function isHumanResolutionTurnRole(
	role: KnowledgeClarificationTurnRole
): role is "human_answer" | "human_skip" {
	return role === "human_answer" || role === "human_skip";
}

function isActiveConversationClarificationStatus(
	status: ActiveConversationClarificationRequest["status"]
): status is ActiveConversationKnowledgeClarificationStatus {
	return (
		status === "analyzing" ||
		status === "awaiting_answer" ||
		status === "retry_required" ||
		status === "draft_ready"
	);
}

export function getLatestAiQuestionTurn<T extends ClarificationTurnLike>(
	turns: T[]
): T | null {
	for (let index = turns.length - 1; index >= 0; index -= 1) {
		const turn = turns[index];
		if (turn && isAiQuestionTurnRole(turn.role)) {
			return turn;
		}
	}

	return null;
}

export function getPendingClarificationQuestionTurn<
	T extends ClarificationTurnLike,
>(turns: T[]): T | null {
	let pendingQuestionTurn: T | null = null;

	for (const turn of turns) {
		if (turn && isAiQuestionTurnRole(turn.role)) {
			pendingQuestionTurn = turn;
			continue;
		}

		if (turn && isHumanResolutionTurnRole(turn.role)) {
			pendingQuestionTurn = null;
		}
	}

	return pendingQuestionTurn;
}

export function getDisplayClarificationQuestionTurn<
	T extends ClarificationTurnLike,
>(params: {
	status: ActiveConversationClarificationRequest["status"];
	turns: T[];
}): T | null {
	if (params.status === "awaiting_answer") {
		return getPendingClarificationQuestionTurn(params.turns);
	}

	if (params.status === "analyzing") {
		return getLatestAiQuestionTurn(params.turns);
	}

	return null;
}

export function buildConversationClarificationSummary(params: {
	request: ActiveConversationClarificationRequest;
	turns: ClarificationTurnLike[];
	progress?: ConversationClarificationProgress | null;
}): ConversationClarificationSummary | null {
	if (!params.request.conversationId) {
		return null;
	}

	if (!isActiveConversationClarificationStatus(params.request.status)) {
		return null;
	}

	const pendingQuestionTurn = getPendingClarificationQuestionTurn(params.turns);

	return {
		requestId: params.request.id,
		status: params.request.status,
		topicSummary: params.request.topicSummary,
		question:
			params.request.status === "awaiting_answer"
				? (pendingQuestionTurn?.question ?? null)
				: null,
		stepIndex: params.request.stepIndex,
		maxSteps: params.request.maxSteps,
		updatedAt: params.request.updatedAt,
		progress: params.progress ?? null,
	};
}
