import type {
	KnowledgeClarificationRequestSelect,
	KnowledgeClarificationTurnSelect,
} from "@api/db/schema/knowledge-clarification";
import type {
	ActiveConversationKnowledgeClarificationStatus,
	ConversationClarificationProgress,
	ConversationClarificationSummary,
	KnowledgeClarificationQuestionInputMode,
	KnowledgeClarificationQuestionPlan,
	KnowledgeClarificationQuestionScope,
	KnowledgeClarificationRequest,
	KnowledgeClarificationTurnRole,
} from "@plasma/types";

type ActiveConversationClarificationRequest =
	| Pick<
			KnowledgeClarificationRequestSelect,
			| "id"
			| "conversationId"
			| "status"
			| "topicSummary"
			| "stepIndex"
			| "maxSteps"
			| "updatedAt"
			| "questionPlan"
	  >
	| (Pick<
			KnowledgeClarificationRequest,
			| "id"
			| "conversationId"
			| "status"
			| "topicSummary"
			| "stepIndex"
			| "maxSteps"
			| "updatedAt"
			| "questionPlan"
	  > &
			Partial<
				Pick<
					KnowledgeClarificationRequest,
					| "currentSuggestedAnswers"
					| "currentQuestionInputMode"
					| "currentQuestionScope"
				>
			>);

type ClarificationTurnLike = Pick<
	KnowledgeClarificationTurnSelect,
	"role" | "question"
> & {
	suggestedAnswers?: [string, string, string] | string[] | null;
};

function normalizeQuestionText(value: string | null | undefined): string {
	return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

function normalizeSuggestedAnswersTuple(
	value: string[] | [string, string, string] | null | undefined
): [string, string, string] | null {
	if (!(Array.isArray(value) && value.length === 3)) {
		return null;
	}

	return [value[0], value[1], value[2]];
}

function resolveQuestionPlan(
	request: ActiveConversationClarificationRequest
): KnowledgeClarificationQuestionPlan | null {
	if (!("questionPlan" in request)) {
		return null;
	}

	return request.questionPlan ?? null;
}

function resolveQuestionStrategyFromPlan(params: {
	request: ActiveConversationClarificationRequest;
	questionText: string | null | undefined;
}): {
	inputMode: KnowledgeClarificationQuestionInputMode | null;
	questionScope: KnowledgeClarificationQuestionScope | null;
} {
	const questionPlan = resolveQuestionPlan(params.request);
	if (!(questionPlan && params.questionText)) {
		return {
			inputMode: null,
			questionScope: null,
		};
	}

	const matchingQuestion =
		questionPlan.find(
			(question) =>
				normalizeQuestionText(question.question) ===
				normalizeQuestionText(params.questionText)
		) ?? null;

	return {
		inputMode: matchingQuestion?.inputMode ?? null,
		questionScope: matchingQuestion?.questionScope ?? null,
	};
}

function resolveStoredSummaryQuestionMetadata(params: {
	request: ActiveConversationClarificationRequest;
	questionText: string | null | undefined;
}): {
	currentQuestionInputMode: KnowledgeClarificationQuestionInputMode | null;
	currentQuestionScope: KnowledgeClarificationQuestionScope | null;
	currentSuggestedAnswers: [string, string, string] | null;
} {
	const currentSuggestedAnswers =
		"currentSuggestedAnswers" in params.request
			? normalizeSuggestedAnswersTuple(params.request.currentSuggestedAnswers)
			: null;
	const currentQuestionInputMode =
		"currentQuestionInputMode" in params.request
			? (params.request.currentQuestionInputMode ?? null)
			: null;
	const currentQuestionScope =
		"currentQuestionScope" in params.request
			? (params.request.currentQuestionScope ?? null)
			: null;

	if (
		currentSuggestedAnswers &&
		currentQuestionInputMode &&
		currentQuestionScope
	) {
		return {
			currentSuggestedAnswers,
			currentQuestionInputMode,
			currentQuestionScope,
		};
	}

	const plannedStrategy = resolveQuestionStrategyFromPlan({
		request: params.request,
		questionText: params.questionText,
	});

	return {
		currentSuggestedAnswers,
		currentQuestionInputMode:
			currentQuestionInputMode ?? plannedStrategy.inputMode,
		currentQuestionScope: currentQuestionScope ?? plannedStrategy.questionScope,
	};
}

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
	conversationId?: string | null;
	engagementMode?: ConversationClarificationSummary["engagementMode"];
	linkedConversationCount?: number;
}): ConversationClarificationSummary | null {
	const conversationId = params.conversationId ?? params.request.conversationId;
	if (!conversationId) {
		return null;
	}

	if (!isActiveConversationClarificationStatus(params.request.status)) {
		return null;
	}

	const pendingQuestionTurn = getPendingClarificationQuestionTurn(params.turns);
	const displayQuestionTurn = getDisplayClarificationQuestionTurn({
		status: params.request.status,
		turns: params.turns,
	});
	const currentQuestionTurn =
		params.request.status === "awaiting_answer"
			? pendingQuestionTurn
			: displayQuestionTurn;
	const currentQuestion = currentQuestionTurn?.question ?? null;
	const questionMetadata = resolveStoredSummaryQuestionMetadata({
		request: params.request,
		questionText: currentQuestion,
	});

	return {
		requestId: params.request.id,
		status: params.request.status,
		topicSummary: params.request.topicSummary,
		engagementMode: params.engagementMode ?? "owner",
		linkedConversationCount: params.linkedConversationCount ?? 1,
		question: currentQuestion,
		currentSuggestedAnswers:
			normalizeSuggestedAnswersTuple(currentQuestionTurn?.suggestedAnswers) ??
			questionMetadata.currentSuggestedAnswers,
		currentQuestionInputMode: questionMetadata.currentQuestionInputMode,
		currentQuestionScope: questionMetadata.currentQuestionScope,
		stepIndex: params.request.stepIndex,
		maxSteps: params.request.maxSteps,
		updatedAt: params.request.updatedAt,
		progress: params.progress ?? null,
	};
}
