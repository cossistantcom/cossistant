import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
	buildKnowledgeClarificationAnswerDraftPersistenceId,
	changeKnowledgeClarificationFreeAnswer,
	getKnowledgeClarificationSubmitPayload,
	isKnowledgeClarificationOtherSelected,
	type KnowledgeClarificationAnswerDraftState,
	KnowledgeClarificationQuestionContent,
	selectKnowledgeClarificationAnswer,
	shouldClearKnowledgeClarificationAnswerDraft,
} from "./question-flow";

const EMPTY_ANSWER_DRAFT_STATE: KnowledgeClarificationAnswerDraftState = {
	selectedAnswer: null,
	freeAnswer: "",
};

describe("knowledge clarification answer draft", () => {
	it("treats typed custom content as the fourth selected option", () => {
		const state = changeKnowledgeClarificationFreeAnswer(
			EMPTY_ANSWER_DRAFT_STATE,
			"  I need a custom answer  "
		);

		expect(state).toEqual({
			selectedAnswer: null,
			freeAnswer: "  I need a custom answer  ",
		});
		expect(isKnowledgeClarificationOtherSelected(state.freeAnswer)).toBe(true);
		expect(getKnowledgeClarificationSubmitPayload(state)).toEqual({
			freeAnswer: "I need a custom answer",
		});
	});

	it("does not enable submission for whitespace-only custom input", () => {
		const state = changeKnowledgeClarificationFreeAnswer(
			EMPTY_ANSWER_DRAFT_STATE,
			"   "
		);

		expect(isKnowledgeClarificationOtherSelected(state.freeAnswer)).toBe(false);
		expect(getKnowledgeClarificationSubmitPayload(state)).toBeNull();
	});

	it("clears any custom text when a preset answer is chosen", () => {
		const state = selectKnowledgeClarificationAnswer(
			"At the next billing cycle"
		);

		expect(state).toEqual({
			selectedAnswer: "At the next billing cycle",
			freeAnswer: "",
		});
		expect(getKnowledgeClarificationSubmitPayload(state)).toEqual({
			selectedAnswer: "At the next billing cycle",
		});
	});

	it("clears the preset selection once the user starts typing a custom answer", () => {
		const selectedState = selectKnowledgeClarificationAnswer("Immediately");
		const state = changeKnowledgeClarificationFreeAnswer(
			selectedState,
			"It depends on the plan"
		);

		expect(state.selectedAnswer).toBeNull();
		expect(isKnowledgeClarificationOtherSelected(state.freeAnswer)).toBe(true);
		expect(getKnowledgeClarificationSubmitPayload(state)).toEqual({
			freeAnswer: "It depends on the plan",
		});
	});

	it("builds a stable persistence id from website, request, and step", () => {
		expect(
			buildKnowledgeClarificationAnswerDraftPersistenceId({
				websiteSlug: "acme",
				requestId: "req_1",
				stepIndex: 2,
			})
		).toBe("clarification-answer:acme:req_1:2");
	});

	it("keeps the draft when the server recovers into analyzing for the same step", () => {
		expect(
			shouldClearKnowledgeClarificationAnswerDraft({
				currentQuestion: "Does billing change immediately?",
				currentStepIndex: 2,
				result: {
					currentQuestion: "Does billing change immediately?",
					status: "analyzing",
					stepIndex: 2,
				},
			})
		).toBe(false);
	});

	it("clears the draft once the clarification advances to the next question", () => {
		expect(
			shouldClearKnowledgeClarificationAnswerDraft({
				currentQuestion: "Does billing change immediately?",
				currentStepIndex: 2,
				result: {
					currentQuestion: "Which plan is affected?",
					status: "awaiting_answer",
					stepIndex: 3,
				},
			})
		).toBe(true);
	});
});

describe("KnowledgeClarificationQuestionContent", () => {
	it("renders the fourth option as an inline textarea with the new placeholder", () => {
		const html = renderToStaticMarkup(
			<KnowledgeClarificationQuestionContent
				freeAnswer=""
				isOtherSelected={false}
				onFreeAnswerChange={() => {}}
				onSelectAnswer={() => {}}
				question="Does the billing change immediately?"
				selectedAnswer={null}
				suggestedAnswers={[
					"Immediately",
					"At the next billing cycle",
					"It depends on the plan",
				]}
			/>
		);

		expect(html).toContain('placeholder="Type your answer here..."');
		expect(html).not.toContain(">Other<");
	});

	it("keeps numbering on the answer options instead of the question text", () => {
		const html = renderToStaticMarkup(
			<KnowledgeClarificationQuestionContent
				freeAnswer=""
				isOtherSelected={false}
				onFreeAnswerChange={() => {}}
				onSelectAnswer={() => {}}
				question="How does a user delete their account?"
				selectedAnswer={null}
				suggestedAnswers={[
					"Click Delete Account in settings",
					"Email support",
					"Use a CLI command",
				]}
			/>
		);

		expect(html).toContain("How does a user delete their account?");
		expect(html).not.toContain("1. How does a user delete their account?");
		expect(html).toContain(">1.<");
		expect(html).toContain(">2.<");
		expect(html).toContain(">3.<");
		expect(html).toContain(">4.<");
	});

	it("renders textarea-first discovery questions with starter chips instead of numbered options", () => {
		const html = renderToStaticMarkup(
			<KnowledgeClarificationQuestionContent
				freeAnswer=""
				inputMode="textarea_first"
				isOtherSelected={false}
				onFreeAnswerChange={() => {}}
				onSelectAnswer={() => {}}
				question="How does account deletion work today?"
				selectedAnswer={null}
				suggestedAnswers={[
					"Users delete it in settings",
					"Support handles it manually",
					"It depends on the account type",
				]}
			/>
		);

		expect(html).toContain(
			'placeholder="Describe how this workflow or rule works today..."'
		);
		expect(html).toContain("autofocus");
		expect(html).not.toContain(">4.<");
	});

	it("renders an optional overlay for landing-style typed textarea demos", () => {
		const html = renderToStaticMarkup(
			<KnowledgeClarificationQuestionContent
				freeAnswer="Delete it in Settings -> Account."
				inputMode="textarea_first"
				isOtherSelected={true}
				onFreeAnswerChange={() => {}}
				onSelectAnswer={() => {}}
				question="How does account deletion work today?"
				selectedAnswer={null}
				suggestedAnswers={[
					"Users delete it in settings",
					"Support handles it manually",
					"It depends on the account type",
				]}
				textareaOverlay={<div>Typed answer overlay</div>}
			/>
		);

		expect(html).toContain('data-clarification-textarea-overlay="true"');
		expect(html).toContain("Typed answer overlay");
	});

	it("marks targeted suggested answers so the landing cursor can click them", () => {
		const targetRef = React.createRef<HTMLButtonElement>();
		const html = renderToStaticMarkup(
			<KnowledgeClarificationQuestionContent
				freeAnswer=""
				getSuggestedAnswerButtonRef={(answer) =>
					answer === "Settings -> Account" ? targetRef : undefined
				}
				isOtherSelected={false}
				onFreeAnswerChange={() => {}}
				onSelectAnswer={() => {}}
				question="Where should the visitor go to start the deletion flow?"
				selectedAnswer={null}
				suggestedAnswers={[
					"Settings -> Account",
					"Email support",
					"Use a CLI command",
				]}
			/>
		);

		expect(html).toContain('data-clarification-answer-target="true"');
	});

	it("renders a minimal loading row while analyzing", () => {
		const html = renderToStaticMarkup(
			<KnowledgeClarificationQuestionContent
				freeAnswer=""
				isAnalyzing={true}
				isOtherSelected={false}
				onFreeAnswerChange={() => {}}
				onSelectAnswer={() => {}}
				question="How does account deletion work today?"
				selectedAnswer={null}
				suggestedAnswers={[
					"Users delete it in settings",
					"Support handles it manually",
					"It depends on the account type",
				]}
			/>
		);

		expect(html).toContain("Saving your answer...");
		expect(html).not.toContain("How does account deletion work today?");
		expect(html).not.toContain("rounded-xl");
	});
});
