"use client";

import type {
	KnowledgeClarificationRequest,
	KnowledgeClarificationStepResponse,
} from "@plasma/types";

export function formatClarificationQuestionLabel(stepIndex: number): string {
	return `Question ${Math.max(stepIndex, 1)}`;
}

export function getClarificationRequestStatusLabel(
	request: Pick<
		KnowledgeClarificationRequest,
		"status" | "stepIndex" | "draftFaqPayload"
	>
): string {
	if (request.status === "draft_ready") {
		return "Ready for review";
	}

	if (request.status === "retry_required") {
		return "Needs retry";
	}

	if (request.status === "deferred") {
		return "Saved for later";
	}

	if (request.status === "applied") {
		return "Applied";
	}

	if (request.status === "dismissed") {
		return "Dismissed";
	}

	if (request.status === "analyzing") {
		return "AI working";
	}

	return formatClarificationQuestionLabel(request.stepIndex);
}

export function stepFromKnowledgeClarificationRequest(
	request: KnowledgeClarificationRequest | null | undefined
): KnowledgeClarificationStepResponse | null {
	if (!request) {
		return null;
	}

	if (request.status === "draft_ready" && request.draftFaqPayload) {
		return {
			kind: "draft_ready",
			request,
			draftFaqPayload: request.draftFaqPayload,
		};
	}

	if (request.status === "retry_required") {
		return {
			kind: "retry_required",
			request,
		};
	}

	if (
		(request.status === "awaiting_answer" ||
			request.status === "deferred" ||
			request.status === "analyzing") &&
		request.currentQuestion &&
		request.currentSuggestedAnswers
	) {
		return {
			kind: "question",
			request,
			question: request.currentQuestion,
			suggestedAnswers: request.currentSuggestedAnswers,
			inputMode: request.currentQuestionInputMode ?? "suggested_answers",
			questionScope: request.currentQuestionScope ?? "narrow_detail",
		};
	}

	return null;
}

export function stepFromKnowledgeClarificationStreamResponse(params: {
	request: KnowledgeClarificationRequest | null | undefined;
	response:
		| {
				request?: Record<string, unknown> | null;
				requestId?: string;
				status?: KnowledgeClarificationRequest["status"];
				updatedAt?: string;
				decision?: Record<string, unknown> | null;
		  }
		| null
		| undefined;
}): KnowledgeClarificationStepResponse | null {
	if (
		params.response?.request &&
		typeof params.response.request.id === "string" &&
		typeof params.response.request.status === "string" &&
		typeof params.response.request.topicSummary === "string"
	) {
		return stepFromKnowledgeClarificationRequest(
			params.response.request as unknown as KnowledgeClarificationRequest
		);
	}

	if (!(params.request && params.response?.decision?.kind)) {
		return null;
	}

	const decision = params.response.decision;
	const decisionKind =
		decision.kind === "question" ||
		decision.kind === "draft_ready" ||
		decision.kind === "retry_required"
			? decision.kind
			: null;
	if (!decisionKind) {
		return null;
	}
	const decisionTopicSummary =
		typeof decision.topicSummary === "string"
			? decision.topicSummary
			: params.request.topicSummary;
	const decisionQuestion =
		typeof decision.question === "string" ? decision.question : null;
	const decisionSuggestedAnswers =
		Array.isArray(decision.suggestedAnswers) &&
		decision.suggestedAnswers.every((value) => typeof value === "string")
			? decision.suggestedAnswers
			: null;
	const decisionQuestionPlan =
		Array.isArray(decision.questionPlan) &&
		decision.questionPlan.every(
			(item) =>
				item &&
				typeof item === "object" &&
				typeof (item as Record<string, unknown>).id === "string" &&
				typeof (item as Record<string, unknown>).question === "string"
		)
			? (decision.questionPlan as KnowledgeClarificationRequest["questionPlan"])
			: params.request.questionPlan;
	const decisionInputMode =
		decision.inputMode === "textarea_first" ||
		decision.inputMode === "suggested_answers"
			? decision.inputMode
			: null;
	const decisionQuestionScope =
		decision.questionScope === "broad_discovery" ||
		decision.questionScope === "narrow_detail"
			? decision.questionScope
			: null;
	const decisionDraftFaqPayload =
		decision.draftFaqPayload &&
		typeof decision.draftFaqPayload === "object" &&
		typeof (decision.draftFaqPayload as Record<string, unknown>).question ===
			"string" &&
		typeof (decision.draftFaqPayload as Record<string, unknown>).answer ===
			"string"
			? (decision.draftFaqPayload as KnowledgeClarificationRequest["draftFaqPayload"])
			: null;
	const decisionLastError =
		typeof decision.lastError === "string" ? decision.lastError : null;
	const previewRequest: KnowledgeClarificationRequest = {
		...params.request,
		id: params.response.requestId ?? params.request.id,
		status:
			params.response.status ??
			(decisionKind === "draft_ready"
				? "draft_ready"
				: decisionKind === "retry_required"
					? "retry_required"
					: "analyzing"),
		topicSummary: decisionTopicSummary,
		questionPlan: decisionQuestionPlan,
		currentQuestion:
			decisionKind === "question"
				? (decisionQuestion ?? params.request.currentQuestion)
				: null,
		currentSuggestedAnswers:
			decisionKind === "question"
				? (decisionSuggestedAnswers ?? params.request.currentSuggestedAnswers)
				: null,
		currentQuestionInputMode:
			decisionKind === "question"
				? (decisionInputMode ?? params.request.currentQuestionInputMode)
				: null,
		currentQuestionScope:
			decisionKind === "question"
				? (decisionQuestionScope ?? params.request.currentQuestionScope)
				: null,
		draftFaqPayload:
			decisionKind === "draft_ready"
				? (decisionDraftFaqPayload ?? params.request.draftFaqPayload)
				: null,
		lastError: decisionLastError ?? params.request.lastError,
		updatedAt: params.response.updatedAt ?? params.request.updatedAt,
	};

	return stepFromKnowledgeClarificationRequest(previewRequest);
}

export function shouldPreferKnowledgeClarificationRequestState(params: {
	request: KnowledgeClarificationRequest | null | undefined;
	step: KnowledgeClarificationStepResponse | null | undefined;
}): boolean {
	if (!params.request) {
		return false;
	}

	if (!params.step) {
		return true;
	}

	if (params.step.request.id !== params.request.id) {
		return true;
	}

	const requestUpdatedAtMs = Date.parse(params.request.updatedAt);
	const stepUpdatedAtMs = Date.parse(params.step.request.updatedAt);

	if (Number.isFinite(requestUpdatedAtMs) && Number.isFinite(stepUpdatedAtMs)) {
		return requestUpdatedAtMs > stepUpdatedAtMs;
	}

	return params.request.updatedAt !== params.step.request.updatedAt;
}
