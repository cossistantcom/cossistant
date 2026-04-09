import { describe, expect, it } from "bun:test";
import type { KnowledgeClarificationRequest } from "@plasma/types";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { KnowledgeClarificationDraftReviewState } from "./draft-review";
import { KnowledgeClarificationFlowContent } from "./flow-content";

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
		currentQuestion: null,
		currentSuggestedAnswers: null,
		currentQuestionInputMode: null,
		currentQuestionScope: null,
		draftFaqPayload: null,
		lastError: null,
		createdAt: "2026-03-17T10:00:00.000Z",
		updatedAt: "2026-03-17T10:00:00.000Z",
		...overrides,
	};
}

function createDraftReviewState(): KnowledgeClarificationDraftReviewState {
	const parsedDraft = {
		title: "Billing timing",
		question: "When does billing change take effect?",
		answer: "At the next billing cycle.",
		categories: ["Billing"],
		relatedQuestions: [],
	};
	const noopSetter = (
		_value: string | ((previousValue: string) => string)
	) => {};

	return {
		answer: parsedDraft.answer,
		categories: parsedDraft.categories.join(", "),
		canApprove: true,
		draftTitle: parsedDraft.title ?? "",
		parsedDraft,
		question: parsedDraft.question,
		relatedQuestions: "",
		setAnswer: noopSetter,
		setCategories: noopSetter,
		setDraftTitle: noopSetter,
		setQuestion: noopSetter,
		setRelatedQuestions: noopSetter,
	};
}

describe("KnowledgeClarificationFlowContent terminal states", () => {
	it("renders a disabled approving state instead of the applied terminal message", () => {
		const html = renderToStaticMarkup(
			<KnowledgeClarificationFlowContent
				currentRequest={createRequest({
					status: "applied",
					draftFaqPayload: {
						title: "Billing timing",
						question: "When does billing change take effect?",
						answer: "At the next billing cycle.",
						categories: ["Billing"],
						relatedQuestions: [],
					},
				})}
				currentStep={null}
				fallbackStep={null}
				isSubmittingApproval
				onAnswer={() => {}}
				onApprove={() => {}}
				onClose={() => {}}
				onDefer={() => {}}
				onDismiss={() => {}}
				onRetry={() => {}}
				pageDraftReviewState={createDraftReviewState()}
				showPageApprovalPendingState
				variant="page"
				websiteSlug="acme"
			/>
		);

		expect(html).toContain("Approving FAQ...");
		expect(html).toContain(
			"Adding this FAQ to the knowledge base and opening it now."
		);
		expect(html).not.toContain(
			"This clarification was already approved and added to the knowledge base."
		);
		expect(html.match(/disabled=""/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
	});

	it("renders a read-only applied state for already-approved clarifications", () => {
		const html = renderToStaticMarkup(
			<KnowledgeClarificationFlowContent
				currentRequest={createRequest({
					status: "applied",
					draftFaqPayload: {
						title: "Billing timing",
						question: "When does billing change take effect?",
						answer: "At the next billing cycle.",
						categories: ["Billing"],
						relatedQuestions: [],
					},
				})}
				currentStep={null}
				fallbackStep={null}
				onAnswer={() => {}}
				onApprove={() => {}}
				onClose={() => {}}
				onDefer={() => {}}
				onDismiss={() => {}}
				onRetry={() => {}}
				variant="page"
				websiteSlug="acme"
			/>
		);

		expect(html).toContain("Already applied");
		expect(html).not.toContain("Approve");
		expect(html).not.toContain("Retry");
	});

	it("renders a read-only dismissed state for removed clarifications", () => {
		const html = renderToStaticMarkup(
			<KnowledgeClarificationFlowContent
				currentRequest={createRequest({
					status: "dismissed",
				})}
				currentStep={null}
				fallbackStep={null}
				onAnswer={() => {}}
				onApprove={() => {}}
				onClose={() => {}}
				onDefer={() => {}}
				onDismiss={() => {}}
				onRetry={() => {}}
				variant="page"
				websiteSlug="acme"
			/>
		);

		expect(html).toContain("Dismissed");
		expect(html).not.toContain("Approve");
		expect(html).not.toContain("Retry");
	});
});
