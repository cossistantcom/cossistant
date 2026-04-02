"use client";

import type {
	ConversationClarificationSummary,
	KnowledgeClarificationRequest,
} from "@plasma/types";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	formatClarificationQuestionLabel,
	shouldPreferKnowledgeClarificationRequestState,
	stepFromKnowledgeClarificationRequest,
} from "@/components/knowledge-clarification/helpers";
import {
	KnowledgeClarificationQuestionContent,
	useKnowledgeClarificationAnswerDraft,
} from "@/components/knowledge-clarification/question-flow";
import { useKnowledgeClarificationQueryInvalidation } from "@/components/knowledge-clarification/use-query-invalidation";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Spinner } from "../../../../../../packages/react/src/support/components/spinner";
import Icon from "../../ui/icons";
import {
	DEFAULT_CLARIFICATION_PROGRESS_FALLBACK_LABEL,
	resolveClarificationProgressView,
} from "./clarification-progress";
import { ComposerBottomBlock } from "./composer-bottom-block";
import { ComposerCentralBlock } from "./composer-central-block";

type ClarificationComposerFlowProps = {
	websiteSlug: string;
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

export function ClarificationLoadingBlock({ label }: { label: string }) {
	return (
		<ComposerCentralBlock>
			<div
				className="flex items-center gap-2 p-4 text-muted-foreground text-sm"
				data-clarification-slot="loading"
			>
				<Spinner size={16} />
				<span>{label}</span>
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

export function ClarificationDraftReadyBanner({
	request,
	topicSummary,
	isApproving,
	onApprove,
	onClose,
	onView,
	canApprove,
	canView,
	approveButtonRef,
}: {
	request: KnowledgeClarificationRequest | null;
	topicSummary: string;
	isApproving: boolean;
	onApprove: () => void;
	onClose: () => void;
	onView: () => void;
	canApprove?: boolean;
	canView?: boolean;
	approveButtonRef?: React.RefObject<HTMLButtonElement | null>;
}) {
	return (
		<div
			className="mb-4 flex items-start justify-between gap-3 px-2 py-2"
			data-clarification-slot="draft-ready-banner"
		>
			<div className="flex min-w-0 flex-col gap-1">
				<div className="font-medium text-sm">FAQ draft ready</div>
				<p className="truncate text-muted-foreground text-sm">{topicSummary}</p>
			</div>

			<div className="flex shrink-0 items-center gap-2">
				<Button
					disabled={canView ?? !request}
					onClick={onView}
					size="xs"
					type="button"
					variant="ghost"
				>
					View
				</Button>
				<Button
					disabled={isApproving || !(canApprove ?? !!request?.draftFaqPayload)}
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
				<Button
					onClick={onClose}
					size="icon-small"
					type="button"
					variant="ghost"
				>
					<Icon className="size-3.5" name="x" variant="filled" />
				</Button>
			</div>
		</div>
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
	summary,
	request,
	onCancel,
}: ClarificationComposerFlowProps): ClarificationComposerBlocks | null {
	const router = useRouter();
	const trpc = useTRPC();
	const invalidateClarificationQueries =
		useKnowledgeClarificationQueryInvalidation(websiteSlug);
	const [localStep, setLocalStep] = useState(
		stepFromKnowledgeClarificationRequest(request)
	);
	const [closedDraftRequestId, setClosedDraftRequestId] = useState<
		string | null
	>(null);

	useEffect(() => {
		setLocalStep(stepFromKnowledgeClarificationRequest(request));
	}, [request]);

	useEffect(() => {
		if (!(request && request.status === "draft_ready")) {
			setClosedDraftRequestId(null);
			return;
		}

		setClosedDraftRequestId((current) =>
			current === request.id ? current : null
		);
	}, [request]);

	const requestStep = useMemo(
		() => stepFromKnowledgeClarificationRequest(request),
		[request]
	);
	const shouldPreferRequestState = useMemo(
		() =>
			shouldPreferKnowledgeClarificationRequestState({
				request,
				step: localStep,
			}),
		[localStep, request]
	);
	const step = useMemo(
		() => (shouldPreferRequestState ? requestStep : (localStep ?? requestStep)),
		[localStep, requestStep, shouldPreferRequestState]
	);

	const answerDraft = useKnowledgeClarificationAnswerDraft(
		step?.kind === "question" ? step.question : null,
		step?.kind === "question" ? step.inputMode : "suggested_answers"
	);
	const [optimisticProgressStartedAt, setOptimisticProgressStartedAt] =
		useState<string | null>(null);

	const handleMutationSuccess = async (result: {
		step: NonNullable<typeof step>;
	}) => {
		setLocalStep(result.step);
		await invalidateClarificationQueries({
			request: result.step.request,
		});
	};

	const answerMutation = useMutation(
		trpc.knowledgeClarification.answer.mutationOptions({
			retry: false,
			onSuccess: handleMutationSuccess,
			onError: async (_error, variables) => {
				await invalidateClarificationQueries({
					requestId: variables.requestId,
					conversationId: request?.conversationId ?? null,
				});
				toast.error("The AI hit a temporary issue. You can retry from here.");
			},
		})
	);

	const skipMutation = useMutation(
		trpc.knowledgeClarification.skip.mutationOptions({
			retry: false,
			onSuccess: handleMutationSuccess,
			onError: async (_error, variables) => {
				await invalidateClarificationQueries({
					requestId: variables.requestId,
					conversationId: request?.conversationId ?? null,
				});
				toast.error("The AI hit a temporary issue. You can retry from here.");
			},
		})
	);

	const retryMutation = useMutation(
		trpc.knowledgeClarification.retry.mutationOptions({
			retry: false,
			onSuccess: handleMutationSuccess,
			onError: async (_error, variables) => {
				await invalidateClarificationQueries({
					requestId: variables.requestId,
					conversationId: request?.conversationId ?? null,
				});
				toast.error("The AI hit a temporary issue. You can retry from here.");
			},
		})
	);

	const approveMutation = useMutation(
		trpc.knowledgeClarification.approveDraft.mutationOptions({
			retry: false,
			onSuccess: async (result) => {
				await invalidateClarificationQueries({
					request: result.request,
					includeKnowledgeQueries: true,
				});
				toast.success("FAQ draft approved");
			},
			onError: async (_error, variables) => {
				await invalidateClarificationQueries({
					requestId: variables.requestId,
					conversationId: request?.conversationId ?? null,
				});
				toast.error("Failed to approve draft");
			},
		})
	);

	const currentRequest = shouldPreferRequestState
		? request
		: (step?.request ?? request);
	const isSubmitting = answerMutation.isPending;
	const isSkipping = skipMutation.isPending;
	const isRetrying = retryMutation.isPending;
	const isAnalyzing = Boolean(
		summary &&
			(isSubmitting ||
				isSkipping ||
				isRetrying ||
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

	useEffect(() => {
		if (isAnalyzing) {
			return;
		}

		setOptimisticProgressStartedAt(null);
	}, [isAnalyzing]);

	useEffect(() => {
		setOptimisticProgressStartedAt(null);
	}, [summary?.requestId]);

	if (!summary) {
		return null;
	}

	const isDraftReady =
		currentRequest?.status === "draft_ready" &&
		Boolean(currentRequest.draftFaqPayload);

	if (summary.status === "draft_ready" && !currentRequest) {
		return {
			aboveBlock: (
				<ClarificationDraftReadyBanner
					isApproving={false}
					onApprove={() => {}}
					onClose={() => {
						setClosedDraftRequestId(summary.requestId);
					}}
					onView={() => {}}
					request={null}
					topicSummary={summary.topicSummary}
				/>
			),
			centralBlock: null,
			bottomBlock: null,
		};
	}

	if (
		isDraftReady &&
		currentRequest &&
		closedDraftRequestId !== currentRequest.id
	) {
		return {
			aboveBlock: (
				<ClarificationDraftReadyBanner
					isApproving={approveMutation.isPending}
					onApprove={() => {
						if (!currentRequest.draftFaqPayload) {
							return;
						}

						approveMutation.mutate({
							websiteSlug,
							requestId: currentRequest.id,
							draft: currentRequest.draftFaqPayload,
						});
					}}
					onClose={() => {
						setClosedDraftRequestId(currentRequest.id);
					}}
					onView={() => {
						router.push(
							`/${websiteSlug}/agent/training/faq/proposals/${currentRequest.id}`
						);
					}}
					request={currentRequest}
					topicSummary={currentRequest.topicSummary ?? summary.topicSummary}
				/>
			),
			centralBlock: null,
			bottomBlock: null,
		};
	}

	if (isDraftReady) {
		return null;
	}

	const topicSummary = currentRequest?.topicSummary ?? summary.topicSummary;
	const stepIndex = currentRequest?.stepIndex ?? summary.stepIndex;
	const canSkip = Boolean(step?.kind === "question");
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
		if (!(step?.kind === "question" && answerDraft.submitPayload)) {
			return;
		}

		setOptimisticProgressStartedAt(new Date().toISOString());
		answerMutation.mutate({
			websiteSlug,
			requestId: step.request.id,
			...answerDraft.submitPayload,
		});
	};

	const handleSkip = () => {
		if (step?.kind !== "question") {
			return;
		}

		setOptimisticProgressStartedAt(new Date().toISOString());
		skipMutation.mutate({
			websiteSlug,
			requestId: step.request.id,
		});
	};

	const handleRetry = () => {
		if (!currentRequest) {
			return;
		}

		setOptimisticProgressStartedAt(new Date().toISOString());
		retryMutation.mutate({
			websiteSlug,
			requestId: currentRequest.id,
		});
	};

	return {
		aboveBlock: (
			<ClarificationTopicBlock
				stepIndex={stepIndex}
				topicSummary={topicSummary}
			/>
		),
		centralBlock: isAnalyzing ? (
			<ClarificationLoadingBlock key="loading" label={loadingLabel} />
		) : retryRequest ? (
			<ClarificationRetryBlock
				isRetrying={isRetrying}
				onCancel={onCancel}
				onRetry={handleRetry}
				request={retryRequest}
			/>
		) : step?.kind === "question" ? (
			<ClarificationQuestionBlock
				freeAnswer={answerDraft.freeAnswer}
				inputMode={step.inputMode}
				isOtherSelected={answerDraft.isOtherSelected}
				isPending={false}
				onFreeAnswerChange={answerDraft.setFreeAnswer}
				onSelectAnswer={answerDraft.selectAnswer}
				question={step.question}
				selectedAnswer={answerDraft.selectedAnswer}
				suggestedAnswers={step.suggestedAnswers}
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
