import { describe, expect, it } from "bun:test";
import type {
	KnowledgeClarificationRequestSelect,
	KnowledgeClarificationTurnSelect,
} from "@api/db/schema/knowledge-clarification";
import {
	buildConversationClarificationSummary,
	getLatestAiQuestionTurn,
	getPendingClarificationQuestionTurn,
} from "./knowledge-clarification-summary";

type SummaryRequest = Pick<
	KnowledgeClarificationRequestSelect,
	| "id"
	| "conversationId"
	| "status"
	| "topicSummary"
	| "stepIndex"
	| "maxSteps"
	| "updatedAt"
	| "questionPlan"
>;

type SummaryTurn = Pick<
	KnowledgeClarificationTurnSelect,
	"role" | "question" | "suggestedAnswers"
>;

function createRequest(
	overrides: Partial<SummaryRequest> = {}
): SummaryRequest {
	return {
		id: "req_1",
		conversationId: "conv_1",
		status: "awaiting_answer",
		topicSummary: "Clarify billing timing",
		stepIndex: 2,
		maxSteps: 5,
		questionPlan: null,
		updatedAt: "2026-03-13T10:00:00.000Z",
		...overrides,
	};
}

function createTurn(overrides: Partial<SummaryTurn> = {}): SummaryTurn {
	return {
		role: "ai_question",
		question: "Does the billing change immediately?",
		suggestedAnswers: [
			"Immediately",
			"At the next billing cycle",
			"It depends on the plan",
		],
		...overrides,
	};
}

describe("getLatestAiQuestionTurn", () => {
	it("returns the latest AI question turn", () => {
		const latestTurn = getLatestAiQuestionTurn([
			createTurn({ question: "Old question" }),
			createTurn({ role: "human_answer", question: null }),
			createTurn({ role: "human_skip", question: null }),
			createTurn({ question: "Latest question" }),
		]);

		expect(latestTurn?.question).toBe("Latest question");
	});
});

describe("getPendingClarificationQuestionTurn", () => {
	it("returns the latest unanswered AI question turn", () => {
		const pendingTurn = getPendingClarificationQuestionTurn([
			createTurn({ question: "First question" }),
			createTurn({ role: "human_answer", question: null }),
			createTurn({ question: "Pending question" }),
		]);

		expect(pendingTurn?.question).toBe("Pending question");
	});

	it("returns null when the latest AI question was already resolved", () => {
		const pendingTurn = getPendingClarificationQuestionTurn([
			createTurn({ question: "First question" }),
			createTurn({ role: "human_skip", question: null }),
		]);

		expect(pendingTurn).toBeNull();
	});
});

describe("buildConversationClarificationSummary", () => {
	it("exposes the latest AI question while awaiting an answer", () => {
		expect(
			buildConversationClarificationSummary({
				request: createRequest(),
				turns: [
					createTurn({ question: "First question" }),
					createTurn({ role: "human_answer", question: null }),
					createTurn({ question: "Latest question" }),
				],
			})
		).toEqual({
			requestId: "req_1",
			status: "awaiting_answer",
			topicSummary: "Clarify billing timing",
			engagementMode: "owner",
			linkedConversationCount: 1,
			question: "Latest question",
			currentSuggestedAnswers: [
				"Immediately",
				"At the next billing cycle",
				"It depends on the plan",
			],
			currentQuestionInputMode: null,
			currentQuestionScope: null,
			stepIndex: 2,
			maxSteps: 5,
			progress: null,
			updatedAt: "2026-03-13T10:00:00.000Z",
		});
	});

	it("keeps the latest question metadata available while analyzing", () => {
		expect(
			buildConversationClarificationSummary({
				request: createRequest({ status: "analyzing" }),
				turns: [createTurn()],
			})
		).toMatchObject({
			status: "analyzing",
			question: "Does the billing change immediately?",
			currentSuggestedAnswers: [
				"Immediately",
				"At the next billing cycle",
				"It depends on the plan",
			],
		});
	});

	it("keeps retry-required clarifications active for conversation surfaces", () => {
		expect(
			buildConversationClarificationSummary({
				request: createRequest({ status: "retry_required" }),
				turns: [createTurn()],
			})
		).toEqual({
			requestId: "req_1",
			status: "retry_required",
			topicSummary: "Clarify billing timing",
			engagementMode: "owner",
			linkedConversationCount: 1,
			question: null,
			currentSuggestedAnswers: null,
			currentQuestionInputMode: null,
			currentQuestionScope: null,
			stepIndex: 2,
			maxSteps: 5,
			progress: null,
			updatedAt: "2026-03-13T10:00:00.000Z",
		});
	});

	it("returns null for non-active statuses or missing conversation ids", () => {
		expect(
			buildConversationClarificationSummary({
				request: createRequest({ status: "draft_ready" }),
				turns: [createTurn()],
			})
		).toEqual({
			requestId: "req_1",
			status: "draft_ready",
			topicSummary: "Clarify billing timing",
			engagementMode: "owner",
			linkedConversationCount: 1,
			question: null,
			currentSuggestedAnswers: null,
			currentQuestionInputMode: null,
			currentQuestionScope: null,
			stepIndex: 2,
			maxSteps: 5,
			progress: null,
			updatedAt: "2026-03-13T10:00:00.000Z",
		});

		expect(
			buildConversationClarificationSummary({
				request: createRequest({ conversationId: null }),
				turns: [createTurn()],
			})
		).toBeNull();
	});
});
