"use client";

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
} from "./helpers";
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

	const answerMutation = useMutation(
		trpc.knowledgeClarification.answer.mutationOptions({
			retry: false,
			onSuccess: async (result) => {
				setStep(result.step);
				setRequestFallback(result.step.request);
				await invalidateQueries({
					request: result.step.request,
				});
			},
			onError: async (_error, variables) => {
				await invalidateQueries({
					requestId: variables.requestId,
					conversationId:
						requestFallback?.conversationId ?? initialRequest?.conversationId,
				});
				toast.error("The AI hit a temporary issue. You can retry from here.");
			},
		})
	);

	const deferMutation = useMutation(
		trpc.knowledgeClarification.defer.mutationOptions({
			retry: false,
			onSuccess: async (request) => {
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
				await invalidateQueries({ request });
				await onDismissed?.(request);
			},
			onError: (error) => {
				toast.error(error.message || "Failed to remove clarification");
			},
		})
	);

	const retryMutation = useMutation(
		trpc.knowledgeClarification.retry.mutationOptions({
			retry: false,
			onSuccess: async (result) => {
				setStep(result.step);
				setRequestFallback(result.step.request);
				await invalidateQueries({
					request: result.step.request,
				});
			},
			onError: async (_error, variables) => {
				await invalidateQueries({
					requestId: variables.requestId,
					conversationId:
						requestFallback?.conversationId ?? initialRequest?.conversationId,
				});
				toast.error("The AI hit a temporary issue. You can retry from here.");
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
			shouldPreferKnowledgeClarificationRequestState({
				request: requestFallback,
				step,
			}),
		[requestFallback, step]
	);
	const currentStep = shouldPreferRequestState
		? requestStep
		: (step ?? requestStep);
	const currentRequest = shouldPreferRequestState
		? requestFallback
		: (currentStep?.request ?? requestFallback);
	const fallbackStep = currentRequest
		? stepFromKnowledgeClarificationRequest(currentRequest)
		: null;

	return {
		currentRequest,
		currentStep,
		fallbackStep,
		answerMutation,
		deferMutation,
		dismissMutation,
		retryMutation,
		approveMutation,
		submitAnswer: async (
			requestId: string,
			payload: {
				selectedAnswer?: string;
				freeAnswer?: string;
			}
		) =>
			answerMutation.mutate({
				websiteSlug,
				requestId,
				...payload,
			}),
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
			retryMutation.mutate({
				websiteSlug,
				requestId,
			}),
		approveDraft: (requestId: string, draft: KnowledgeClarificationDraftFaq) =>
			approveMutation.mutate({
				websiteSlug,
				requestId,
				draft,
			}),
	};
}

export type { UseKnowledgeClarificationFlowOptions };
