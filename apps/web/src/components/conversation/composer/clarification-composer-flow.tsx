"use client";

import { clearLocalStorageDraftValue } from "@cossistant/react/hooks";
import type {
	ConversationClarificationSummary,
	KnowledgeClarificationRequest,
} from "@cossistant/types";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
	KnowledgeClarificationDraftReviewBody,
	type KnowledgeClarificationDraftReviewState,
} from "@/components/knowledge-clarification/draft-review";
import { formatClarificationQuestionLabel } from "@/components/knowledge-clarification/helpers";
import {
	buildKnowledgeClarificationAnswerDraftPersistenceId,
	KnowledgeClarificationQuestionContent,
	useKnowledgeClarificationAnswerDraft,
} from "@/components/knowledge-clarification/question-flow";
import { useKnowledgeClarificationFlow } from "@/components/knowledge-clarification/use-clarification-flow";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Spinner } from "../../../../../../packages/react/src/support/components/spinner";
import Icon from "../../ui/icons";
import {
	DEFAULT_CLARIFICATION_PROGRESS_FALLBACK_LABEL,
	isClarificationTakingLongerThanUsual,
	resolveClarificationProgressView,
} from "./clarification-progress";
import { ComposerBottomBlock } from "./composer-bottom-block";
import { ComposerCentralBlock } from "./composer-central-block";

type ClarificationComposerFlowProps = {
	websiteSlug: string;
	conversationId: string;
	summary: ConversationClarificationSummary | null;
	request: KnowledgeClarificationRequest | null;
	onCancel: () => void;
};

type ClarificationComposerBlocks = {
	aboveBlock: React.ReactNode;
	centralBlock: React.ReactNode | null;
	bottomBlock: React.ReactNode | null;
};

export type ClarificationTopicBlockProps = {
	topicSummary: string;
	stepIndex: number;
	maxSteps?: number;
	className?: string;
};

export type ClarificationActionsBlockProps = {
	canSubmit: boolean;
	canSkip: boolean;
	isPending: boolean;
	isSkipping: boolean;
	isSubmitting: boolean;
	onCancel: () => void;
	onSkip: () => void;
	onSubmit: () => void;
	submitButtonRef?: React.RefObject<HTMLButtonElement | null>;
};

export type ClarificationRetryBlockProps = {
	request: KnowledgeClarificationRequest;
	isRetrying: boolean;
	onCancel: () => void;
	onRetry: () => void;
};

type HiddenReviewState = {
	requestId: string;
	reason: "approved" | "skipped";
};

export type ClarificationQuestionBlockProps = {
	question: string;
	suggestedAnswers: [string, string, string] | string[];
	inputMode: NonNullable<
		Parameters<typeof KnowledgeClarificationQuestionContent>[0]["inputMode"]
	>;
	autoFocus?: Parameters<
		typeof KnowledgeClarificationQuestionContent
	>[0]["autoFocus"];
	selectedAnswer: string | null;
	freeAnswer: string;
	isOtherSelected: boolean;
	isPending: boolean;
	textareaOverlay?: Parameters<
		typeof KnowledgeClarificationQuestionContent
	>[0]["textareaOverlay"];
	getSuggestedAnswerButtonRef?: Parameters<
		typeof KnowledgeClarificationQuestionContent
	>[0]["getSuggestedAnswerButtonRef"];
	onSelectAnswer: (answer: string) => void;
	onFreeAnswerChange: (value: string) => void;
};

export type ClarificationReviewBlockProps = {
	state: KnowledgeClarificationDraftReviewState;
	isSubmittingApproval: boolean;
};

function useClarificationProgressClock(enabled: boolean) {
	const [nowMs, setNowMs] = useState(() => Date.now());

	useEffect(() => {
		if (!enabled) {
			return;
		}

		setNowMs(Date.now());
		const intervalId = window.setInterval(() => {
			setNowMs(Date.now());
		}, 1000);

		return () => {
			window.clearInterval(intervalId);
		};
	}, [enabled]);

	return nowMs;
}

export function ClarificationTopicBlock({
	topicSummary,
	stepIndex,
	className,
}: ClarificationTopicBlockProps) {
	return (
		<div
			className={cn("mb-4 flex flex-col gap-6 px-2 py-2", className)}
			data-clarification-slot="topic"
		>
			<div className="flex items-center justify-between gap-3">
				<div className="space-y-1">
					<div className="font-medium text-sm">Clarification questions</div>
					<p className="text-muted-foreground text-sm">{topicSummary}</p>
				</div>
				<div className="shrink-0 self-start font-medium text-muted-foreground text-xs">
					{formatClarificationQuestionLabel(stepIndex)}
				</div>
			</div>
		</div>
	);
}

export function ClarificationLoadingBlock({
	label,
	submittedAnswer,
	showSlowWarning = false,
}: {
	label: string;
	submittedAnswer?: string | null;
	showSlowWarning?: boolean;
}) {
	return (
		<ComposerCentralBlock>
			<div className="space-y-3 p-4" data-clarification-slot="loading">
				<div className="flex items-center gap-2 text-muted-foreground text-sm">
					<Spinner size={14} />
					<span>{label}</span>
				</div>
				{submittedAnswer ? (
					<div className="py-2">
						<div className="font-medium text-[11px] text-muted-foreground">
							Last answer
						</div>
						<p className="mt-1 text-sm">{submittedAnswer}</p>
					</div>
				) : null}
				{showSlowWarning ? (
					<p className="text-muted-foreground text-sm">
						This is taking longer than usual. The AI should settle this step
						shortly.
					</p>
				) : null}
			</div>
		</ComposerCentralBlock>
	);
}

export function ClarificationRetryBlock({
	request,
	isRetrying,
	onCancel,
	onRetry,
}: ClarificationRetryBlockProps) {
	return (
		<ComposerCentralBlock>
			<div
				className="flex flex-col items-start gap-4 p-4"
				data-clarification-slot="retry"
			>
				<div className="space-y-1">
					<div className="font-medium text-sm">
						This clarification needs a retry
					</div>
					<p className="text-muted-foreground text-sm">
						{request.lastError ??
							"The AI did not finish the previous step cleanly."}
					</p>
				</div>

				<div className="flex items-center gap-2">
					<Button onClick={onRetry} size="xs" type="button">
						{isRetrying ? (
							<>
								<Spinner size={16} />
								Retry
							</>
						) : (
							"Retry AI"
						)}
					</Button>
					<Button
						onClick={onCancel}
						size="icon-small"
						type="button"
						variant="ghost"
					>
						<Icon className="size-3.5" name="x" variant="filled" />
					</Button>
				</div>
			</div>
		</ComposerCentralBlock>
	);
}

export function ClarificationReviewTeaser({
	topicSummary,
	onReview,
}: {
	topicSummary: string;
	onReview: () => void;
}) {
	return (
		<div
			className="mb-4 flex items-start justify-between gap-3 px-2 py-2"
			data-clarification-slot="review-teaser"
		>
			<div className="flex min-w-0 flex-col gap-1">
				<div className="font-medium text-sm">FAQ draft ready</div>
				<p className="truncate text-muted-foreground text-sm">{topicSummary}</p>
			</div>

			<div className="flex shrink-0 items-center gap-2">
				<Button onClick={onReview} size="xs" type="button">
					Review FAQ
				</Button>
			</div>
		</div>
	);
}

export function ClarificationReviewBlock({
	state,
	isSubmittingApproval,
}: ClarificationReviewBlockProps) {
	return (
		<ComposerCentralBlock>
			<div className="p-4" data-clarification-slot="review">
				<KnowledgeClarificationDraftReviewBody
					description="Review and edit this FAQ draft without leaving the conversation."
					disabled={isSubmittingApproval}
					state={state}
					title="Review FAQ draft"
				/>
			</div>
		</ComposerCentralBlock>
	);
}

export function ClarificationReviewActionsBlock({
	canApprove,
	isApproving,
	onApprove,
	onSkip,
	approveButtonRef,
}: {
	canApprove: boolean;
	isApproving: boolean;
	onApprove: () => void;
	onSkip: () => void;
	approveButtonRef?: React.RefObject<HTMLButtonElement | null>;
}) {
	return (
		<ComposerBottomBlock className="pl-0">
			<div
				className="flex w-full items-center justify-between gap-3 p-2"
				data-clarification-slot="review-actions"
			>
				<Button
					disabled={isApproving}
					onClick={onSkip}
					size="xs"
					type="button"
					variant="ghost"
				>
					Skip
				</Button>
				<Button
					disabled={isApproving || !canApprove}
					onClick={onApprove}
					ref={approveButtonRef}
					size="xs"
					type="button"
				>
					{isApproving ? (
						<>
							<Spinner size={16} />
							Approve
						</>
					) : (
						"Approve"
					)}
				</Button>
			</div>
		</ComposerBottomBlock>
	);
}

export function ClarificationQuestionBlock({
	question,
	suggestedAnswers,
	inputMode,
	autoFocus,
	selectedAnswer,
	freeAnswer,
	isOtherSelected,
	isPending,
	textareaOverlay,
	getSuggestedAnswerButtonRef,
	onSelectAnswer,
	onFreeAnswerChange,
}: ClarificationQuestionBlockProps) {
	return (
		<ComposerCentralBlock key="question">
			<div className="p-3" data-clarification-slot="question-flow">
				<KnowledgeClarificationQuestionContent
					autoFocus={autoFocus}
					freeAnswer={freeAnswer}
					getSuggestedAnswerButtonRef={getSuggestedAnswerButtonRef}
					inputMode={inputMode}
					isAnalyzing={isPending}
					isOtherSelected={isOtherSelected}
					isSubmitting={isPending}
					onFreeAnswerChange={onFreeAnswerChange}
					onSelectAnswer={onSelectAnswer}
					question={question}
					selectedAnswer={selectedAnswer}
					suggestedAnswers={suggestedAnswers}
					textareaOverlay={textareaOverlay}
				/>
			</div>
		</ComposerCentralBlock>
	);
}

export function ClarificationActionsBlock({
	canSubmit,
	canSkip,
	isPending,
	isSkipping,
	isSubmitting,
	onCancel,
	onSkip,
	onSubmit,
	submitButtonRef,
}: ClarificationActionsBlockProps) {
	return (
		<ComposerBottomBlock className="pl-0">
			<div
				className="flex w-full items-center justify-between gap-3 p-2"
				data-clarification-slot="actions"
			>
				<Button
					disabled={isPending}
					onClick={onCancel}
					size="xs"
					type="button"
					variant="ghost"
				>
					Cancel
				</Button>

				<div className="flex items-center gap-2">
					<Button
						disabled={!canSkip || isPending}
						onClick={onSkip}
						size="xs"
						type="button"
						variant="ghost"
					>
						{isSkipping ? (
							<>
								<Spinner size={16} />
								Skipping
							</>
						) : (
							"Skip"
						)}
					</Button>
					<Button
						data-clarification-submit-target={
							submitButtonRef ? "true" : undefined
						}
						disabled={!canSubmit || isPending}
						onClick={onSubmit}
						ref={submitButtonRef}
						size="xs"
						type="button"
					>
						{isSubmitting ? (
							<>
								<Spinner size={16} />
								Next
							</>
						) : (
							"Next"
						)}
					</Button>
				</div>
			</div>
		</ComposerBottomBlock>
	);
}

export function useClarificationComposerFlow({
	websiteSlug,
	conversationId: _conversationId,
	summary,
	request,
	onCancel,
}: ClarificationComposerFlowProps): ClarificationComposerBlocks | null {
	const [hiddenReviewState, setHiddenReviewState] =
		useState<HiddenReviewState | null>(null);
	const flow = useKnowledgeClarificationFlow({
		initialRequest: request,
		onApproved: async (result) => {
			setHiddenReviewState({
				requestId: result.request.id,
				reason: "approved",
			});
			toast.success("FAQ draft approved");
		},
		websiteSlug,
	});
	const [optimisticProgressStartedAt, setOptimisticProgressStartedAt] =
		useState<string | null>(null);
	const [lastSubmittedAnswer, setLastSubmittedAnswer] = useState<string | null>(
		null
	);
	const currentRequest = flow.currentRequest;
	const step = flow.currentStep;
	const summaryQuestionState =
		summary?.question &&
		summary.currentSuggestedAnswers &&
		summary.currentQuestionInputMode &&
		summary.currentQuestionScope
			? {
					inputMode: summary.currentQuestionInputMode,
					question: summary.question,
					questionScope: summary.currentQuestionScope,
					requestId: summary.requestId,
					stepIndex: summary.stepIndex,
					suggestedAnswers: summary.currentSuggestedAnswers,
				}
			: null;
	const displayedQuestion =
		step?.kind === "question"
			? {
					inputMode: step.inputMode,
					question: step.question,
					questionScope: step.questionScope,
					requestId: step.request.id,
					stepIndex: step.request.stepIndex,
					suggestedAnswers: step.suggestedAnswers,
				}
			: summaryQuestionState;
	const displayedQuestionDraftPersistenceId = displayedQuestion
		? buildKnowledgeClarificationAnswerDraftPersistenceId({
				websiteSlug,
				requestId: displayedQuestion.requestId,
				stepIndex: displayedQuestion.stepIndex,
			})
		: null;
	const answerDraft = useKnowledgeClarificationAnswerDraft(
		step?.kind === "question" ? step.question : (summary?.question ?? null),
		step?.kind === "question"
			? step.inputMode
			: (summary?.currentQuestionInputMode ?? "suggested_answers"),
		displayedQuestionDraftPersistenceId
	);
	const activeReviewRequestId =
		currentRequest?.status === "draft_ready"
			? currentRequest.id
			: summary?.status === "draft_ready"
				? summary.requestId
				: null;
	const hiddenActiveReview =
		activeReviewRequestId &&
		hiddenReviewState?.requestId === activeReviewRequestId
			? hiddenReviewState
			: null;
	const isSubmitting = flow.answerMutation.isPending;
	const isSkipping = flow.skipMutation.isPending;
	const isRetrying = flow.retryMutation.isPending;
	const isAnalyzing = Boolean(
		summary &&
			(flow.isStreamLoading ||
				currentRequest?.status === "analyzing" ||
				summary.status === "analyzing")
	);
	const nowMs = useClarificationProgressClock(isAnalyzing);
	const activeProgress = useMemo(
		() =>
			resolveClarificationProgressView({
				nowMs,
				serverProgress: summary?.progress,
				localStartedAt: optimisticProgressStartedAt,
			}),
		[nowMs, optimisticProgressStartedAt, summary?.progress]
	);
	const isTakingLongerThanUsual = useMemo(
		() =>
			isClarificationTakingLongerThanUsual({
				nowMs,
				serverProgress: summary?.progress,
				localStartedAt: optimisticProgressStartedAt,
			}),
		[nowMs, optimisticProgressStartedAt, summary?.progress]
	);

	useEffect(() => {
		if (isAnalyzing) {
			return;
		}

		setOptimisticProgressStartedAt(null);
		setLastSubmittedAnswer(null);
	}, [isAnalyzing]);

	useEffect(() => {
		setOptimisticProgressStartedAt(null);
	}, [summary?.requestId]);

	useEffect(() => {
		if (!activeReviewRequestId) {
			setHiddenReviewState(null);
			return;
		}

		setHiddenReviewState((current) =>
			current?.requestId === activeReviewRequestId ? current : null
		);
	}, [activeReviewRequestId]);

	const previousQuestionDraftPersistenceIdRef = useRef<string | null>(
		displayedQuestionDraftPersistenceId
	);

	useEffect(() => {
		const previousQuestionDraftPersistenceId =
			previousQuestionDraftPersistenceIdRef.current;
		if (
			previousQuestionDraftPersistenceId &&
			previousQuestionDraftPersistenceId !== displayedQuestionDraftPersistenceId
		) {
			clearLocalStorageDraftValue(previousQuestionDraftPersistenceId);
		}

		previousQuestionDraftPersistenceIdRef.current =
			displayedQuestionDraftPersistenceId;
	}, [displayedQuestionDraftPersistenceId]);

	if (!summary) {
		return null;
	}

	if (summary.status === "draft_ready") {
		if (hiddenActiveReview?.reason === "approved") {
			return null;
		}

		if (hiddenActiveReview?.reason === "skipped") {
			return {
				aboveBlock: (
					<ClarificationReviewTeaser
						onReview={() => {
							setHiddenReviewState(null);
						}}
						topicSummary={currentRequest?.topicSummary ?? summary.topicSummary}
					/>
				),
				centralBlock: null,
				bottomBlock: null,
			};
		}

		return {
			aboveBlock: null,
			centralBlock: flow.activeReviewStep ? (
				<ClarificationReviewBlock
					isSubmittingApproval={flow.approveMutation.isPending}
					state={flow.reviewDraftState}
				/>
			) : (
				<ClarificationLoadingBlock
					key="review-loading"
					label="Preparing FAQ draft..."
				/>
			),
			bottomBlock: flow.activeReviewStep ? (
				<ClarificationReviewActionsBlock
					canApprove={flow.reviewDraftState.canApprove}
					isApproving={flow.approveMutation.isPending}
					onApprove={() => {
						flow.approveActiveDraft();
					}}
					onSkip={() => {
						if (!activeReviewRequestId) {
							return;
						}

						setHiddenReviewState({
							requestId: activeReviewRequestId,
							reason: "skipped",
						});
					}}
				/>
			) : null,
		};
	}

	const topicSummary = currentRequest?.topicSummary ?? summary.topicSummary;
	const stepIndex = currentRequest?.stepIndex ?? summary.stepIndex;
	const canSkip = Boolean(displayedQuestion);
	const retryRequest =
		step?.kind === "retry_required"
			? step.request
			: currentRequest?.status === "retry_required"
				? currentRequest
				: null;
	const loadingLabel =
		activeProgress?.label ??
		summary.progress?.label ??
		DEFAULT_CLARIFICATION_PROGRESS_FALLBACK_LABEL;

	const handleSubmit = () => {
		if (!(displayedQuestion && answerDraft.submitPayload)) {
			return;
		}

		setOptimisticProgressStartedAt(new Date().toISOString());
		setLastSubmittedAnswer(
			answerDraft.submitPayload.freeAnswer ??
				answerDraft.submitPayload.selectedAnswer ??
				null
		);
		flow.submitAnswer(
			displayedQuestion.requestId,
			displayedQuestion.stepIndex,
			answerDraft.submitPayload
		);
	};

	const handleSkip = () => {
		if (!displayedQuestion) {
			return;
		}

		setOptimisticProgressStartedAt(new Date().toISOString());
		setLastSubmittedAnswer("Skipped this question");
		flow.skipQuestion(displayedQuestion.requestId, displayedQuestion.stepIndex);
	};

	const handleRetry = () => {
		const requestId = currentRequest?.id ?? summary.requestId;
		if (!requestId) {
			return;
		}

		setOptimisticProgressStartedAt(new Date().toISOString());
		setLastSubmittedAnswer(null);
		flow.retryRequest(requestId);
	};

	return {
		aboveBlock: (
			<ClarificationTopicBlock
				stepIndex={stepIndex}
				topicSummary={topicSummary}
			/>
		),
		centralBlock: isAnalyzing ? (
			<ClarificationLoadingBlock
				key="loading"
				label={loadingLabel}
				showSlowWarning={isTakingLongerThanUsual}
				submittedAnswer={lastSubmittedAnswer}
			/>
		) : retryRequest ? (
			<ClarificationRetryBlock
				isRetrying={isRetrying}
				onCancel={onCancel}
				onRetry={handleRetry}
				request={retryRequest}
			/>
		) : displayedQuestion ? (
			<ClarificationQuestionBlock
				freeAnswer={answerDraft.freeAnswer}
				inputMode={displayedQuestion.inputMode}
				isOtherSelected={answerDraft.isOtherSelected}
				isPending={false}
				onFreeAnswerChange={answerDraft.setFreeAnswer}
				onSelectAnswer={answerDraft.selectAnswer}
				question={displayedQuestion.question}
				selectedAnswer={answerDraft.selectedAnswer}
				suggestedAnswers={displayedQuestion.suggestedAnswers}
			/>
		) : (
			<ClarificationLoadingBlock key="loading" label={loadingLabel} />
		),
		bottomBlock:
			isAnalyzing || retryRequest ? null : (
				<ClarificationActionsBlock
					canSkip={canSkip}
					canSubmit={answerDraft.canSubmit}
					isPending={false}
					isSkipping={isSkipping}
					isSubmitting={isSubmitting}
					onCancel={onCancel}
					onSkip={handleSkip}
					onSubmit={handleSubmit}
				/>
			),
	};
}
