import { describe, expect, it } from "bun:test";
import type { KnowledgeClarificationRequest } from "@plasma/types";
import {
	shouldPreferKnowledgeClarificationRequestState,
	stepFromKnowledgeClarificationRequest,
	stepFromKnowledgeClarificationStreamResponse,
} from "./helpers";

function createRequest(
	overrides: Partial<KnowledgeClarificationRequest> = {}
): KnowledgeClarificationRequest {
	return {
		id: "req_1",
		organizationId: "org_1",
		websiteId: "site_1",
		aiAgentId: "agent_1",
		conversationId: "conv_1",
		source: "conversation",
		status: "awaiting_answer",
		topicSummary: "Clarify billing timing",
		engagementMode: "owner",
		linkedConversationCount: 1,
		stepIndex: 1,
		maxSteps: 3,
		targetKnowledgeId: null,
		targetKnowledgeSummary: null,
		currentQuestion: "When does the billing change take effect?",
		currentSuggestedAnswers: [
			"Immediately",
			"At the next billing cycle",
			"It depends on the plan",
		],
		currentQuestionInputMode: "suggested_answers",
		currentQuestionScope: "narrow_detail",
		draftFaqPayload: null,
		lastError: null,
		createdAt: "2026-03-16T09:00:00.000Z",
		updatedAt: "2026-03-16T09:00:00.000Z",
		...overrides,
	};
}

describe("stepFromKnowledgeClarificationRequest", () => {
	it("reconstructs a deferred pending question as a question step", () => {
		const step = stepFromKnowledgeClarificationRequest(
			createRequest({
				status: "deferred",
			})
		);

		expect(step).toEqual({
			kind: "question",
			request: createRequest({
				status: "deferred",
			}),
			question: "When does the billing change take effect?",
			suggestedAnswers: [
				"Immediately",
				"At the next billing cycle",
				"It depends on the plan",
			],
			inputMode: "suggested_answers",
			questionScope: "narrow_detail",
		});
	});

	it("reconstructs retry-required requests as retry steps", () => {
		const step = stepFromKnowledgeClarificationRequest(
			createRequest({
				status: "retry_required",
				currentQuestion: null,
				currentSuggestedAnswers: null,
				currentQuestionInputMode: null,
				currentQuestionScope: null,
				lastError: "No output generated.",
			})
		);

		expect(step).toEqual({
			kind: "retry_required",
			request: createRequest({
				status: "retry_required",
				currentQuestion: null,
				currentSuggestedAnswers: null,
				currentQuestionInputMode: null,
				currentQuestionScope: null,
				lastError: "No output generated.",
			}),
		});
	});

	it("does not reconstruct terminal requests as editable steps", () => {
		expect(
			stepFromKnowledgeClarificationRequest(
				createRequest({
					status: "applied",
					draftFaqPayload: {
						title: "Billing timing",
						question: "When does billing change take effect?",
						answer: "At the next billing cycle.",
						categories: ["Billing"],
						relatedQuestions: [],
					},
					currentQuestion: null,
					currentSuggestedAnswers: null,
					currentQuestionInputMode: null,
					currentQuestionScope: null,
				})
			)
		).toBeNull();

		expect(
			stepFromKnowledgeClarificationRequest(
				createRequest({
					status: "dismissed",
					draftFaqPayload: {
						title: "Billing timing",
						question: "When does billing change take effect?",
						answer: "At the next billing cycle.",
						categories: ["Billing"],
						relatedQuestions: [],
					},
					currentQuestion: null,
					currentSuggestedAnswers: null,
					currentQuestionInputMode: null,
					currentQuestionScope: null,
				})
			)
		).toBeNull();
	});
});

describe("stepFromKnowledgeClarificationStreamResponse", () => {
	it("builds a preview step from a streamed question decision before the final request lands", () => {
		const step = stepFromKnowledgeClarificationStreamResponse({
			request: createRequest({
				status: "analyzing",
			}),
			response: {
				requestId: "req_1",
				decision: {
					kind: "question",
					topicSummary: "Clarify billing timing",
					questionPlan: null,
					question: "Which plan is involved?",
					suggestedAnswers: ["Free", "Pro", "Enterprise"],
					inputMode: "suggested_answers",
					questionScope: "narrow_detail",
					draftFaqPayload: null,
					lastError: null,
				},
			},
		});

		expect(step).toEqual({
			kind: "question",
			request: createRequest({
				status: "analyzing",
				currentQuestion: "Which plan is involved?",
				currentSuggestedAnswers: ["Free", "Pro", "Enterprise"],
				currentQuestionInputMode: "suggested_answers",
				currentQuestionScope: "narrow_detail",
			}),
			question: "Which plan is involved?",
			suggestedAnswers: ["Free", "Pro", "Enterprise"],
			inputMode: "suggested_answers",
			questionScope: "narrow_detail",
		});
	});
});

describe("shouldPreferKnowledgeClarificationRequestState", () => {
	it("prefers a newer retry-required request over a stale local question step", () => {
		const staleStep = stepFromKnowledgeClarificationRequest(createRequest());
		expect(staleStep?.kind).toBe("question");

		expect(
			shouldPreferKnowledgeClarificationRequestState({
				request: createRequest({
					status: "retry_required",
					currentQuestion: null,
					currentSuggestedAnswers: null,
					currentQuestionInputMode: null,
					currentQuestionScope: null,
					lastError: "No output generated.",
					updatedAt: "2026-03-16T09:05:00.000Z",
				}),
				step: staleStep,
			})
		).toBe(true);
	});

	it("keeps the local step when the request payload is not newer", () => {
		const step = stepFromKnowledgeClarificationRequest(createRequest());
		expect(step?.kind).toBe("question");

		expect(
			shouldPreferKnowledgeClarificationRequestState({
				request: createRequest(),
				step,
			})
		).toBe(false);
	});
});
