"use client";

import type { KnowledgeClarificationQuestionInputMode } from "@plasma/types";
import { LoaderCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatClarificationQuestionLabel } from "./helpers";
import {
	KnowledgeClarificationQuestionContent,
	useKnowledgeClarificationAnswerDraft,
} from "./question-flow";

type KnowledgeClarificationQuestionCardProps = {
	question: string;
	suggestedAnswers: [string, string, string] | string[];
	inputMode?: KnowledgeClarificationQuestionInputMode;
	stepIndex: number;
	draftPersistenceId?: string | null;
	onSubmit: (payload: {
		selectedAnswer?: string;
		freeAnswer?: string;
	}) => void | Promise<void>;
	onDismiss?: () => void | Promise<void>;
	onDefer?: () => void | Promise<void>;
	isSubmitting?: boolean;
	isAnalyzing?: boolean;
	className?: string;
	title?: string;
	description?: string;
	variant?: "dialog" | "page";
};

function runQuestionCardAction(action: () => void | Promise<void>) {
	const result = action();

	if (result && typeof result.catch === "function") {
		void result.catch(() => {});
	}
}

export function KnowledgeClarificationQuestionCard({
	question,
	suggestedAnswers,
	stepIndex,
	draftPersistenceId = null,
	onSubmit,
	onDismiss,
	onDefer,
	isSubmitting = false,
	isAnalyzing = false,
	inputMode = "suggested_answers",
	className,
	title = "Help sharpen this topic",
	description = "Answer one short question so the AI can turn this into a stronger FAQ draft.",
	variant = "dialog",
}: KnowledgeClarificationQuestionCardProps) {
	const draft = useKnowledgeClarificationAnswerDraft(
		question,
		inputMode,
		draftPersistenceId
	);

	const handleSubmit = () => {
		const submitPayload = draft.submitPayload;
		if (!submitPayload) {
			return;
		}

		runQuestionCardAction(() => onSubmit(submitPayload));
	};

	return (
		<div
			className={cn(
				"flex flex-col gap-5",
				variant === "dialog" &&
					"rounded-2xl border bg-background p-5 shadow-sm",
				className
			)}
		>
			<div className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<div className="font-medium text-base">{title}</div>
					<p className="text-muted-foreground text-sm">{description}</p>
				</div>
				<div className="shrink-0 font-medium text-muted-foreground text-xs">
					{formatClarificationQuestionLabel(stepIndex)}
				</div>
			</div>

			<KnowledgeClarificationQuestionContent
				freeAnswer={draft.freeAnswer}
				inputMode={inputMode}
				isAnalyzing={isAnalyzing}
				isOtherSelected={draft.isOtherSelected}
				isSubmitting={isSubmitting}
				onFreeAnswerChange={draft.setFreeAnswer}
				onSelectAnswer={draft.selectAnswer}
				question={question}
				selectedAnswer={draft.selectedAnswer}
				suggestedAnswers={suggestedAnswers}
			/>

			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex flex-wrap items-center gap-2">
					<Button
						disabled={isSubmitting || isAnalyzing}
						onClick={() => {
							if (onDismiss) {
								runQuestionCardAction(onDismiss);
							}
						}}
						type="button"
						variant="ghost"
					>
						Remove
					</Button>
					{onDefer ? (
						<Button
							disabled={isSubmitting || isAnalyzing}
							onClick={() => {
								runQuestionCardAction(onDefer);
							}}
							type="button"
							variant="outline"
						>
							Later
						</Button>
					) : null}
				</div>

				<Button
					disabled={!draft.canSubmit || isSubmitting || isAnalyzing}
					onClick={handleSubmit}
					type="button"
				>
					{isAnalyzing ? (
						<>
							<LoaderCircleIcon className="h-4 w-4 animate-spin" />
							Preparing
						</>
					) : isSubmitting ? (
						<>
							<LoaderCircleIcon className="h-4 w-4 animate-spin" />
							Submitting
						</>
					) : (
						"Submit"
					)}
				</Button>
			</div>
		</div>
	);
}
