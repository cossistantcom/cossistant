"use client";

import { useLocalStorageDraftValue } from "@cossistant/react/hooks";
import type {
	KnowledgeClarificationQuestionInputMode,
	KnowledgeClarificationRequest,
	KnowledgeClarificationStreamStepResponse,
} from "@cossistant/types";
import type { ReactNode, RefObject } from "react";
import { useEffect, useId, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Spinner } from "../../../../../packages/react/src/support/components/spinner";
import { Logo } from "../ui/logo";
import { Separator } from "../ui/separator";

export type KnowledgeClarificationAnswerPayload = {
	selectedAnswer?: string;
	freeAnswer?: string;
};

export type KnowledgeClarificationAnswerDraftState = {
	selectedAnswer: string | null;
	freeAnswer: string;
};

const EMPTY_ANSWER_DRAFT_STATE: KnowledgeClarificationAnswerDraftState = {
	selectedAnswer: null,
	freeAnswer: "",
};

export function buildKnowledgeClarificationAnswerDraftPersistenceId(params: {
	websiteSlug: string;
	requestId: string;
	stepIndex: number;
}): string {
	return `clarification-answer:${params.websiteSlug}:${params.requestId}:${Math.max(params.stepIndex, 1)}`;
}

function normalizeClarificationQuestion(
	value: string | null | undefined
): string {
	return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

export function shouldClearKnowledgeClarificationAnswerDraft(params: {
	currentQuestion: string | null | undefined;
	currentStepIndex: number;
	result:
		| Pick<
				KnowledgeClarificationRequest,
				"currentQuestion" | "status" | "stepIndex"
		  >
		| Pick<KnowledgeClarificationStreamStepResponse, "request" | "status">;
}): boolean {
	const request =
		"request" in params.result ? params.result.request : params.result;

	if (
		request.status === "draft_ready" ||
		request.status === "retry_required" ||
		request.status === "deferred" ||
		request.status === "dismissed" ||
		request.status === "applied"
	) {
		return true;
	}

	if (request.status === "analyzing") {
		return false;
	}

	if (request.stepIndex > params.currentStepIndex) {
		return true;
	}

	return (
		normalizeClarificationQuestion(request.currentQuestion) !==
		normalizeClarificationQuestion(params.currentQuestion)
	);
}

export function isKnowledgeClarificationOtherSelected(freeAnswer: string) {
	return freeAnswer.trim().length > 0;
}

export function getKnowledgeClarificationSubmitPayload(
	state: KnowledgeClarificationAnswerDraftState
): KnowledgeClarificationAnswerPayload | null {
	const trimmedFreeAnswer = state.freeAnswer.trim();

	if (trimmedFreeAnswer) {
		return { freeAnswer: trimmedFreeAnswer };
	}

	return state.selectedAnswer ? { selectedAnswer: state.selectedAnswer } : null;
}

export function selectKnowledgeClarificationAnswer(
	answer: string
): KnowledgeClarificationAnswerDraftState {
	return {
		selectedAnswer: answer,
		freeAnswer: "",
	};
}

export function changeKnowledgeClarificationFreeAnswer(
	currentState: KnowledgeClarificationAnswerDraftState,
	freeAnswer: string
): KnowledgeClarificationAnswerDraftState {
	return {
		selectedAnswer: freeAnswer.length > 0 ? null : currentState.selectedAnswer,
		freeAnswer,
	};
}

export type KnowledgeClarificationQuestionContentProps = {
	question: string;
	suggestedAnswers: [string, string, string] | string[];
	inputMode?: KnowledgeClarificationQuestionInputMode;
	autoFocus?: boolean;
	selectedAnswer: string | null;
	freeAnswer: string;
	isOtherSelected: boolean;
	isSubmitting?: boolean;
	isAnalyzing?: boolean;
	analyzingMessage?: string;
	className?: string;
	textareaOverlay?: ReactNode;
	getSuggestedAnswerButtonRef?: (
		answer: string,
		index: number
	) => RefObject<HTMLButtonElement | null> | undefined;
	onSelectAnswer: (answer: string) => void;
	onFreeAnswerChange: (value: string) => void;
};

export function useKnowledgeClarificationAnswerDraft(
	question: string | null | undefined,
	inputMode: KnowledgeClarificationQuestionInputMode = "suggested_answers",
	draftPersistenceId?: string | null
) {
	const freeAnswerDraft = useLocalStorageDraftValue({
		id: draftPersistenceId ?? null,
		initialValue: "",
	});
	const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
	const isOtherSelected = isKnowledgeClarificationOtherSelected(
		freeAnswerDraft.value
	);
	const resetKey = draftPersistenceId ?? `${inputMode}:${question ?? ""}`;

	useEffect(() => {
		setSelectedAnswer(null);

		if (!draftPersistenceId) {
			freeAnswerDraft.clearValue();
		}
	}, [draftPersistenceId, freeAnswerDraft.clearValue, resetKey]);

	const draftState: KnowledgeClarificationAnswerDraftState = {
		selectedAnswer,
		freeAnswer: freeAnswerDraft.value,
	};

	const submitPayload = getKnowledgeClarificationSubmitPayload(draftState);

	return {
		canSubmit: Boolean(submitPayload),
		clearPersistedDraft: () => {
			setSelectedAnswer(null);
			freeAnswerDraft.clearValue();
		},
		freeAnswer: draftState.freeAnswer,
		isOtherSelected,
		selectedAnswer: draftState.selectedAnswer,
		setFreeAnswer: (value: string) => {
			setSelectedAnswer((currentSelectedAnswer) =>
				value.length > 0 ? null : currentSelectedAnswer
			);
			freeAnswerDraft.setValue(value);
		},
		selectAnswer: (answer: string) => {
			setSelectedAnswer(
				selectKnowledgeClarificationAnswer(answer).selectedAnswer
			);
			freeAnswerDraft.clearValue();
		},
		submitPayload,
	};
}

export function KnowledgeClarificationQuestionContent({
	question,
	suggestedAnswers,
	inputMode = "suggested_answers",
	autoFocus = true,
	selectedAnswer,
	freeAnswer,
	isOtherSelected,
	isSubmitting = false,
	isAnalyzing = false,
	analyzingMessage = "Saving your answer...",
	className,
	textareaOverlay,
	getSuggestedAnswerButtonRef,
	onSelectAnswer,
	onFreeAnswerChange,
}: KnowledgeClarificationQuestionContentProps) {
	const otherAnswerId = useId();

	if (isAnalyzing) {
		return (
			<div className="flex items-center gap-2 px-1 py-1 text-muted-foreground text-sm">
				<Spinner size={14} />
				{analyzingMessage}
			</div>
		);
	}

	return (
		<div
			aria-busy={isAnalyzing}
			className={cn(
				"space-y-4 transition-opacity",
				isAnalyzing && "opacity-60",
				className
			)}
		>
			<div className="space-y-4">
				<h3 className="font-medium text-sm">
					<Logo className="mr-1 mb-1 inline size-3.5 text-primary" />:{" "}
					{question}
				</h3>
			</div>
			{inputMode === "textarea_first" ? (
				<div className="space-y-3">
					<div className="relative space-y-2">
						<label className="sr-only" htmlFor={otherAnswerId}>
							Describe how it works today
						</label>
						<Textarea
							aria-label="Describe how it works today"
							autoFocus={autoFocus}
							className={cn(
								"min-h-28 w-full resize-y border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent",
								textareaOverlay &&
									"text-transparent caret-transparent selection:bg-transparent placeholder:text-transparent"
							)}
							disabled={isSubmitting || isAnalyzing}
							id={otherAnswerId}
							maxLength={500}
							onChange={(event) => onFreeAnswerChange(event.target.value)}
							placeholder="Describe how this workflow or rule works today..."
							rows={5}
							value={freeAnswer}
						/>
						{textareaOverlay ? (
							<div
								className="pointer-events-none absolute inset-0 overflow-hidden"
								data-clarification-textarea-overlay="true"
							>
								{textareaOverlay}
							</div>
						) : null}
					</div>
				</div>
			) : (
				<div className="space-y-2">
					{suggestedAnswers.map((answer, index) => {
						const isSelected = selectedAnswer === answer;
						const suggestedAnswerButtonRef = getSuggestedAnswerButtonRef?.(
							answer,
							index
						);

						return (
							<button
								className={cn(
									"flex w-full items-start gap-3 py-2 text-left text-sm transition-colors hover:cursor-pointer",
									isSelected
										? "text-cossistant-orange"
										: "text-primary/70 hover:text-primary"
								)}
								data-clarification-answer-index={index + 1}
								data-clarification-answer-target={
									suggestedAnswerButtonRef ? "true" : undefined
								}
								disabled={isSubmitting || isAnalyzing}
								key={answer}
								onClick={() => onSelectAnswer(answer)}
								ref={suggestedAnswerButtonRef}
								type="button"
							>
								<div
									className={cn(
										"mt-1 flex size-3 shrink-0 items-center justify-center rounded font-bold text-xs",
										isSelected ? "text-cossistant-orange" : "text-primary/70"
									)}
								>
									{index + 1}.
								</div>
								<div>{answer}</div>
							</button>
						);
					})}

					<Separator className="opacity-80" />

					<div
						className={cn(
							"flex w-full items-start gap-3 py-2 text-sm transition-colors",
							isOtherSelected
								? "text-cossistant-orange"
								: "text-primary/70 focus-within:text-primary"
						)}
					>
						<div
							className={cn(
								"mt-1 flex size-3 shrink-0 items-center justify-center rounded font-bold text-xs",
								isOtherSelected ? "text-cossistant-orange" : "text-primary/70"
							)}
						>
							4.
						</div>
						<div className="min-w-0 flex-1">
							<label className="sr-only" htmlFor={otherAnswerId}>
								Custom answer
							</label>
							<Textarea
								aria-label="Custom answer"
								className={cn(
									"min-h-auto resize-none rounded-none border-0 bg-transparent px-0 py-0 text-inherit shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent",
									!isOtherSelected && "text-primary/70"
								)}
								disabled={isSubmitting || isAnalyzing}
								id={otherAnswerId}
								maxLength={500}
								onChange={(event) => onFreeAnswerChange(event.target.value)}
								placeholder="Type your answer here..."
								rows={2}
								value={freeAnswer}
							/>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
