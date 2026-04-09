"use client";

import { clearLocalStorageDraftValue } from "@cossistant/react";
import type {
	ApproveKnowledgeClarificationDraftResponse,
	KnowledgeClarificationDraftFaq,
	KnowledgeClarificationRequest,
	KnowledgeClarificationStepResponse,
} from "@plasma/types";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import {
	shouldPreferKnowledgeClarificationRequestState,
	stepFromKnowledgeClarificationRequest,
	stepFromKnowledgeClarificationStreamResponse,
} from "./helpers";
import {
	buildKnowledgeClarificationAnswerDraftPersistenceId,
	shouldClearKnowledgeClarificationAnswerDraft,
} from "./question-flow";
import { useKnowledgeClarificationStreamAction } from "./use-clarification-stream";
import { useKnowledgeClarificationQueryInvalidation } from "./use-query-invalidation";

type UseKnowledgeClarificationFlowOptions = {
	websiteSlug: string;
	initialStep?: KnowledgeClarificationStepResponse | null;
	initialRequest?: KnowledgeClarificationRequest | null;
	onApproved?: (
		result: ApproveKnowledgeClarificationDraftResponse
	) => void | Promise<void>;
	onDeferred?: (request: KnowledgeClarificationRequest) => void | Promise<void>;
	onDismissed?: (
		request: KnowledgeClarificationRequest
	) => void | Promise<void>;
};

export function useKnowledgeClarificationFlow({
	websiteSlug,
	initialStep = null,
	initialRequest = null,
	onApproved,
	onDeferred,
	onDismissed,
}: UseKnowledgeClarificationFlowOptions) {
	const trpc = useTRPC();
	const invalidateQueries =
		useKnowledgeClarificationQueryInvalidation(websiteSlug);
	const [step, setStep] = useState<KnowledgeClarificationStepResponse | null>(
		initialStep
	);
	const [requestFallback, setRequestFallback] =
		useState<KnowledgeClarificationRequest | null>(
			initialRequest ?? initialStep?.request ?? null
		);

	useEffect(() => {
		setStep(initialStep);
		setRequestFallback(initialRequest ?? initialStep?.request ?? null);
	}, [initialRequest, initialStep]);
	const clarificationStream = useKnowledgeClarificationStreamAction<
		"answer" | "retry"
	>({
		onError: async (error) => {
			await invalidateQueries({
				requestId: requestFallback?.id ?? initialRequest?.id ?? null,
				conversationId:
					requestFallback?.conversationId ?? initialRequest?.conversationId,
			});
			toast.error(
				error.message ||
					"The AI hit a temporary issue. You can retry from here."
			);
		},
		onFinish: async (result) => {
			const currentQuestion = step?.kind === "question" ? step.question : null;
			const currentStepIndex =
				requestFallback?.stepIndex ?? initialRequest?.stepIndex ?? 0;

			if (
				requestFallback?.id &&
				shouldClearKnowledgeClarificationAnswerDraft({
					currentQuestion,
					currentStepIndex,
					result,
				})
			) {
				clearLocalStorageDraftValue(
					buildKnowledgeClarificationAnswerDraftPersistenceId({
						websiteSlug,
						requestId: requestFallback.id,
						stepIndex: currentStepIndex,
					})
				);
			}

			setStep(stepFromKnowledgeClarificationRequest(result.request));
			setRequestFallback(result.request);
			await invalidateQueries({
				request: result.request,
			});
		},
	});
	const streamPreviewStep = useMemo(
		() =>
			stepFromKnowledgeClarificationStreamResponse({
				request: requestFallback,
				response: clarificationStream.object,
			}),
		[clarificationStream.object, requestFallback]
	);

	const deferMutation = useMutation(
		trpc.knowledgeClarification.defer.mutationOptions({
			retry: false,
			onSuccess: async (request) => {
				clearLocalStorageDraftValue(
					buildKnowledgeClarificationAnswerDraftPersistenceId({
						websiteSlug,
						requestId: request.id,
						stepIndex: request.stepIndex,
					})
				);
				await invalidateQueries({ request });
				await onDeferred?.(request);
			},
			onError: (error) => {
				toast.error(error.message || "Failed to save clarification for later");
			},
		})
	);

	const dismissMutation = useMutation(
		trpc.knowledgeClarification.dismiss.mutationOptions({
			retry: false,
			onSuccess: async (request) => {
				clearLocalStorageDraftValue(
					buildKnowledgeClarificationAnswerDraftPersistenceId({
						websiteSlug,
						requestId: request.id,
						stepIndex: request.stepIndex,
					})
				);
				await invalidateQueries({ request });
				await onDismissed?.(request);
			},
			onError: (error) => {
				toast.error(error.message || "Failed to remove clarification");
			},
		})
	);

	const approveMutation = useMutation(
		trpc.knowledgeClarification.approveDraft.mutationOptions({
			retry: false,
			onSuccess: async (result) => {
				await invalidateQueries({
					request: result.request,
					includeKnowledgeQueries: true,
				});
				await onApproved?.(result);
			},
			onError: (error) => {
				toast.error(error.message || "Failed to approve draft");
			},
		})
	);

	const requestStep = useMemo(
		() => stepFromKnowledgeClarificationRequest(requestFallback),
		[requestFallback]
	);
	const shouldPreferRequestState = useMemo(
		() =>
			!streamPreviewStep &&
			shouldPreferKnowledgeClarificationRequestState({
				request: requestFallback,
				step,
			}),
		[requestFallback, step, streamPreviewStep]
	);
	const currentStep =
		streamPreviewStep ??
		(shouldPreferRequestState ? requestStep : (step ?? requestStep));
	const currentRequest =
		streamPreviewStep?.request ??
		(shouldPreferRequestState
			? requestFallback
			: (currentStep?.request ?? requestFallback));
	const fallbackStep = currentRequest
		? stepFromKnowledgeClarificationRequest(currentRequest)
		: null;

	return {
		currentRequest,
		currentStep,
		fallbackStep,
		answerMutation: {
			isPending: clarificationStream.isPendingAction("answer"),
		},
		deferMutation,
		dismissMutation,
		retryMutation: {
			isPending: clarificationStream.isPendingAction("retry"),
		},
		approveMutation,
		submitAnswer: async (
			requestId: string,
			expectedStepIndex: number,
			payload: {
				selectedAnswer?: string;
				freeAnswer?: string;
			}
		) =>
			(() => {
				clarificationStream.submitAction("answer", {
					action: "answer",
					websiteSlug,
					requestId,
					expectedStepIndex,
					...payload,
				});
			})(),
		deferRequest: (requestId: string) =>
			deferMutation.mutate({
				websiteSlug,
				requestId,
			}),
		dismissRequest: (requestId: string) =>
			dismissMutation.mutate({
				websiteSlug,
				requestId,
			}),
		retryRequest: (requestId: string) =>
			(() => {
				clarificationStream.submitAction("retry", {
					action: "retry",
					websiteSlug,
					requestId,
				});
			})(),
		approveDraft: (requestId: string, draft: KnowledgeClarificationDraftFaq) =>
			approveMutation.mutate({
				websiteSlug,
				requestId,
				draft,
			}),
	};
}

export type { UseKnowledgeClarificationFlowOptions };
