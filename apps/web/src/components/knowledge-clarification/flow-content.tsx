"use client";

import { clearLocalStorageDraftValue } from "@cossistant/react/hooks";
import type {
	KnowledgeClarificationDraftFaq,
	KnowledgeClarificationRequest,
	KnowledgeClarificationStepResponse,
} from "@cossistant/types";
import { LoaderCircleIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { KnowledgeClarificationDraftReviewState } from "./draft-review";
import {
	KnowledgeClarificationDraftReview,
	KnowledgeClarificationDraftReviewBody,
} from "./draft-review";
import { KnowledgeClarificationQuestionCard } from "./question-card";
import { buildKnowledgeClarificationAnswerDraftPersistenceId } from "./question-flow";

type KnowledgeClarificationFlowContentProps = {
	websiteSlug: string;
	variant: "dialog" | "page";
	isLoading?: boolean;
	currentStep: KnowledgeClarificationStepResponse | null;
	fallbackStep: KnowledgeClarificationStepResponse | null;
	currentRequest: KnowledgeClarificationRequest | null;
	isSubmittingAnswer?: boolean;
	isSubmittingApproval?: boolean;
	showPageApprovalPendingState?: boolean;
	isRetrying?: boolean;
	onAnswer: (
		requestId: string,
		expectedStepIndex: number,
		payload: {
			selectedAnswer?: string;
			freeAnswer?: string;
		}
	) => unknown | Promise<unknown>;
	onDefer: (requestId: string) => unknown | Promise<unknown>;
	onDismiss: (requestId: string) => unknown | Promise<unknown>;
	onApprove: (
		requestId: string,
		draft: KnowledgeClarificationDraftFaq
	) => unknown | Promise<unknown>;
	onRetry: (requestId: string) => unknown | Promise<unknown>;
	onClose: () => unknown | Promise<unknown>;
	pageDraftReviewState?: KnowledgeClarificationDraftReviewState | null;
};

function runFlowAction(action: () => unknown | Promise<unknown>) {
	const result = action();

	if (result && typeof (result as Promise<unknown>).catch === "function") {
		void (result as Promise<unknown>).catch(() => {});
	}
}

function PageMessageRow({
	title,
	description,
	children,
	footer,
}: {
	title: string;
	description?: string;
	children: ReactNode;
	footer?: ReactNode;
}) {
	return (
		<div className="space-y-4">
			<div className="space-y-1">
				<div className="font-medium text-base">{title}</div>
				{description ? (
					<p className="text-muted-foreground text-sm">{description}</p>
				) : null}
			</div>
			{children}
			{footer ? (
				<div className="flex items-center justify-end gap-2">{footer}</div>
			) : null}
		</div>
	);
}

function RetryState({
	currentRequest,
	isRetrying = false,
	onClose,
	onRetry,
	variant,
}: Pick<
	KnowledgeClarificationFlowContentProps,
	"currentRequest" | "isRetrying" | "onClose" | "onRetry" | "variant"
>) {
	if (!currentRequest) {
		return null;
	}

	if (variant === "page") {
		return (
			<PageMessageRow
				description="Retry the flow if the AI did not complete the previous step cleanly."
				footer={
					<Button
						onClick={() => {
							runFlowAction(() => onRetry(currentRequest.id));
						}}
						type="button"
						variant="outline"
					>
						<LoaderCircleIcon
							className={`size-4 ${isRetrying ? "animate-spin" : ""}`}
						/>
						Retry
					</Button>
				}
				title="Needs retry"
			>
				<p className="text-muted-foreground text-sm">
					{currentRequest.lastError ??
						"The AI did not finish the previous step cleanly."}
				</p>
			</PageMessageRow>
		);
	}

	return (
		<div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed px-6 py-10 text-center">
			<LoaderCircleIcon
				className={`h-6 w-6 ${isRetrying ? "animate-spin" : ""}`}
			/>
			<div className="space-y-1">
				<div className="font-medium">This clarification needs a retry</div>
				<p className="text-muted-foreground text-sm">
					{currentRequest.lastError ??
						"The AI did not finish the previous step cleanly."}
				</p>
			</div>
			<div className="flex items-center gap-2">
				<button
					className="inline-flex h-9 items-center justify-center rounded-[2px] border px-4 text-sm"
					onClick={() => {
						runFlowAction(() => onRetry(currentRequest.id));
					}}
					type="button"
				>
					Retry AI
				</button>
				<button
					className="inline-flex h-9 items-center justify-center rounded-[2px] px-4 text-sm"
					onClick={() => {
						runFlowAction(onClose);
					}}
					type="button"
				>
					Close
				</button>
			</div>
		</div>
	);
}

function PageApprovalPendingState({
	pageDraftReviewState,
}: Pick<KnowledgeClarificationFlowContentProps, "pageDraftReviewState">) {
	if (!pageDraftReviewState) {
		return (
			<PageMessageRow
				description="Adding this FAQ to the knowledge base and opening it now."
				title="Approving FAQ..."
			>
				<div className="flex items-center gap-3 text-muted-foreground text-sm">
					<LoaderCircleIcon className="size-4 animate-spin" />
					Saving your approved FAQ...
				</div>
			</PageMessageRow>
		);
	}

	return (
		<KnowledgeClarificationDraftReviewBody
			description="Your edits are locked while we add this FAQ to the knowledge base."
			disabled
			notice={
				<div className="flex items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-muted-foreground text-sm">
					<LoaderCircleIcon className="size-4 animate-spin" />
					<div className="space-y-0.5">
						<div className="font-medium text-foreground">Approving FAQ...</div>
						<p>Adding this FAQ to the knowledge base and opening it now.</p>
					</div>
				</div>
			}
			state={pageDraftReviewState}
		/>
	);
}

function TerminalState({
	currentRequest,
	variant,
}: Pick<KnowledgeClarificationFlowContentProps, "currentRequest" | "variant">) {
	if (!currentRequest) {
		return null;
	}

	const title =
		currentRequest.status === "applied" ? "Already applied" : "Dismissed";
	const description =
		currentRequest.status === "applied"
			? "This clarification was already approved and added to the knowledge base."
			: "This clarification was removed and is no longer active.";

	return variant === "page" ? (
		<PageMessageRow description={description} title={title}>
			<div className="text-muted-foreground text-sm">{description}</div>
		</PageMessageRow>
	) : (
		<div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center">
			<div className="font-medium">{title}</div>
			<p className="text-muted-foreground text-sm">{description}</p>
		</div>
	);
}

export function KnowledgeClarificationFlowContent({
	websiteSlug,
	variant,
	isLoading = false,
	currentStep,
	fallbackStep,
	currentRequest,
	isSubmittingAnswer = false,
	isSubmittingApproval = false,
	showPageApprovalPendingState = false,
	isRetrying = false,
	onAnswer,
	onDefer,
	onDismiss,
	onApprove,
	onRetry,
	onClose,
	pageDraftReviewState = null,
}: KnowledgeClarificationFlowContentProps) {
	const activeQuestionStep = useMemo(() => {
		if (currentStep?.kind === "question") {
			return currentStep;
		}

		if (fallbackStep?.kind === "question") {
			return fallbackStep;
		}

		return null;
	}, [currentStep, fallbackStep]);
	const activeQuestionDraftPersistenceId = activeQuestionStep
		? buildKnowledgeClarificationAnswerDraftPersistenceId({
				websiteSlug,
				requestId: activeQuestionStep.request.id,
				stepIndex: activeQuestionStep.request.stepIndex,
			})
		: null;
	const previousQuestionDraftPersistenceIdRef = useRef<string | null>(null);

	useEffect(() => {
		const previousDraftPersistenceId =
			previousQuestionDraftPersistenceIdRef.current;
		if (
			previousDraftPersistenceId &&
			previousDraftPersistenceId !== activeQuestionDraftPersistenceId
		) {
			clearLocalStorageDraftValue(previousDraftPersistenceId);
		}

		previousQuestionDraftPersistenceIdRef.current =
			activeQuestionDraftPersistenceId;
	}, [activeQuestionDraftPersistenceId]);

	if (isLoading) {
		return variant === "page" ? (
			<PageMessageRow
				description="Loading this clarification flow."
				title="Loading"
			>
				<div className="flex items-center gap-3 text-muted-foreground text-sm">
					<LoaderCircleIcon className="size-4 animate-spin" />
					Preparing AI suggestion...
				</div>
			</PageMessageRow>
		) : (
			<div className="flex items-center gap-3 rounded-2xl border border-dashed px-6 py-8 text-muted-foreground text-sm">
				<LoaderCircleIcon className="size-4 animate-spin" />
				Preparing AI suggestion...
			</div>
		);
	}

	if (variant === "page" && showPageApprovalPendingState) {
		return (
			<PageApprovalPendingState pageDraftReviewState={pageDraftReviewState} />
		);
	}

	if (currentStep?.kind === "question") {
		return (
			<KnowledgeClarificationQuestionCard
				description={
					variant === "page"
						? "Answer one short question so the AI can complete the draft."
						: "Answer the current question now, save it for later, or remove it entirely."
				}
				draftPersistenceId={activeQuestionDraftPersistenceId}
				inputMode={currentStep.inputMode}
				isAnalyzing={isSubmittingAnswer}
				isSubmitting={isSubmittingAnswer}
				onDefer={() => {
					runFlowAction(() => onDefer(currentStep.request.id));
				}}
				onDismiss={() => {
					runFlowAction(() => onDismiss(currentStep.request.id));
				}}
				onSubmit={(payload) => {
					runFlowAction(() =>
						onAnswer(
							currentStep.request.id,
							currentStep.request.stepIndex,
							payload
						)
					);
				}}
				question={currentStep.question}
				stepIndex={currentStep.request.stepIndex}
				suggestedAnswers={currentStep.suggestedAnswers}
				variant={variant}
			/>
		);
	}

	if (currentStep?.kind === "draft_ready") {
		if (variant === "page" && pageDraftReviewState) {
			return (
				<KnowledgeClarificationDraftReviewBody
					disabled={isSubmittingApproval}
					state={pageDraftReviewState}
				/>
			);
		}

		return (
			<KnowledgeClarificationDraftReview
				draft={currentStep.draftFaqPayload}
				isSubmitting={isSubmittingApproval}
				onApprove={(draft) => {
					runFlowAction(() => onApprove(currentStep.request.id, draft));
				}}
				onDismiss={() => {
					runFlowAction(onClose);
				}}
				variant={variant}
			/>
		);
	}

	if (currentStep?.kind === "retry_required") {
		return (
			<RetryState
				currentRequest={currentStep.request}
				isRetrying={isRetrying}
				onClose={onClose}
				onRetry={onRetry}
				variant={variant}
			/>
		);
	}

	if (fallbackStep?.kind === "question") {
		return (
			<KnowledgeClarificationQuestionCard
				description={
					variant === "page"
						? "This suggestion is waiting for another answer."
						: "This proposal is waiting for another answer."
				}
				draftPersistenceId={activeQuestionDraftPersistenceId}
				inputMode={fallbackStep.inputMode}
				isSubmitting={isSubmittingAnswer}
				onDefer={() => {
					runFlowAction(() => onDefer(fallbackStep.request.id));
				}}
				onDismiss={() => {
					runFlowAction(() => onDismiss(fallbackStep.request.id));
				}}
				onSubmit={(payload) => {
					runFlowAction(() =>
						onAnswer(
							fallbackStep.request.id,
							fallbackStep.request.stepIndex,
							payload
						)
					);
				}}
				question={fallbackStep.question}
				stepIndex={fallbackStep.request.stepIndex}
				suggestedAnswers={fallbackStep.suggestedAnswers}
				variant={variant}
			/>
		);
	}

	if (fallbackStep?.kind === "draft_ready") {
		if (variant === "page" && pageDraftReviewState) {
			return (
				<KnowledgeClarificationDraftReviewBody
					disabled={isSubmittingApproval}
					state={pageDraftReviewState}
				/>
			);
		}

		return (
			<KnowledgeClarificationDraftReview
				draft={fallbackStep.draftFaqPayload}
				isSubmitting={isSubmittingApproval}
				onApprove={(draft) => {
					runFlowAction(() => onApprove(fallbackStep.request.id, draft));
				}}
				onDismiss={() => {
					runFlowAction(onClose);
				}}
				variant={variant}
			/>
		);
	}

	if (fallbackStep?.kind === "retry_required") {
		return (
			<RetryState
				currentRequest={fallbackStep.request}
				isRetrying={isRetrying}
				onClose={onClose}
				onRetry={onRetry}
				variant={variant}
			/>
		);
	}

	if (currentRequest?.status === "retry_required") {
		return (
			<RetryState
				currentRequest={currentRequest}
				isRetrying={isRetrying}
				onClose={onClose}
				onRetry={onRetry}
				variant={variant}
			/>
		);
	}

	if (
		currentRequest?.status === "applied" ||
		currentRequest?.status === "dismissed"
	) {
		return <TerminalState currentRequest={currentRequest} variant={variant} />;
	}

	return variant === "page" ? (
		<PageMessageRow
			description="This AI suggestion no longer exists."
			title="Unavailable"
		>
			<div className="text-muted-foreground text-sm">
				This AI suggestion is no longer available.
			</div>
		</PageMessageRow>
	) : null;
}

export type { KnowledgeClarificationFlowContentProps };
