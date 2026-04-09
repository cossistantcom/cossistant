"use client";

import type { KnowledgeClarificationDraftFaq } from "@plasma/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWebsite } from "@/contexts/website";
import {
	removeProposalRequestFromCache,
	setProposalResponseInCache,
} from "@/data/knowledge-clarification-cache";
import { useTRPC } from "@/lib/trpc/client";
import { TrainingEntryDetailLayout } from "../training-entries";
import { useKnowledgeClarificationDraftReviewState } from "./draft-review";
import { KnowledgeClarificationFlowContent } from "./flow-content";
import { getClarificationRequestStatusLabel } from "./helpers";
import { useKnowledgeClarificationFlow } from "./use-clarification-flow";

type KnowledgeClarificationProposalPageProps = {
	requestId: string;
};

export function KnowledgeClarificationProposalPage({
	requestId,
}: KnowledgeClarificationProposalPageProps) {
	const website = useWebsite();
	const trpc = useTRPC();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [isApprovalRedirecting, setIsApprovalRedirecting] = useState(false);
	const [pendingApprovalDraft, setPendingApprovalDraft] =
		useState<KnowledgeClarificationDraftFaq | null>(null);

	const { data, isLoading } = useQuery({
		...trpc.knowledgeClarification.getProposal.queryOptions({
			websiteSlug: website.slug,
			requestId,
		}),
		staleTime: 0,
		refetchOnMount: "always",
	});

	useEffect(() => {
		if (isLoading || data?.request !== null) {
			return;
		}

		const proposalsQueryKey =
			trpc.knowledgeClarification.listProposals.queryKey({
				websiteSlug: website.slug,
			});
		const proposalQueryKey = trpc.knowledgeClarification.getProposal.queryKey({
			websiteSlug: website.slug,
			requestId,
		});

		removeProposalRequestFromCache(queryClient, proposalsQueryKey, requestId);
		setProposalResponseInCache(queryClient, proposalQueryKey, null);
		router.replace(`/${website.slug}/agent/training/faq`);
	}, [
		data?.request,
		isLoading,
		queryClient,
		requestId,
		router,
		trpc,
		website.slug,
	]);

	const flow = useKnowledgeClarificationFlow({
		websiteSlug: website.slug,
		initialRequest: data?.request ?? null,
		onApproved: async (result) => {
			toast.success("FAQ draft approved");
			router.push(`/${website.slug}/agent/training/faq/${result.knowledge.id}`);
		},
		onDeferred: async () => {
			router.push(`/${website.slug}/agent/training/faq`);
		},
		onDismissed: async () => {
			router.push(`/${website.slug}/agent/training/faq`);
		},
	});

	useEffect(() => {
		if (!flow.approveMutation.isError) {
			return;
		}

		setIsApprovalRedirecting(false);
	}, [flow.approveMutation.isError]);

	const activeDraftStep = useMemo(() => {
		if (flow.currentStep?.kind === "draft_ready") {
			return flow.currentStep;
		}

		if (flow.fallbackStep?.kind === "draft_ready") {
			return flow.fallbackStep;
		}

		return null;
	}, [flow.currentStep, flow.fallbackStep]);

	const draftReviewPayload = useMemo(
		() => pendingApprovalDraft ?? activeDraftStep?.draftFaqPayload ?? null,
		[activeDraftStep?.draftFaqPayload, pendingApprovalDraft]
	);

	const draftReviewState =
		useKnowledgeClarificationDraftReviewState(draftReviewPayload);
	const isApprovalPendingUi =
		flow.approveMutation.isPending || isApprovalRedirecting;

	const closeProposal = () => {
		router.push(`/${website.slug}/agent/training/faq`);
	};

	const headerTitle = useMemo(() => {
		if (pendingApprovalDraft?.question) {
			return pendingApprovalDraft.question;
		}

		if (flow.currentRequest?.draftFaqPayload?.question) {
			return flow.currentRequest.draftFaqPayload.question;
		}

		return flow.currentRequest?.topicSummary ?? "AI suggestion";
	}, [flow.currentRequest, pendingApprovalDraft?.question]);

	if (!isLoading && data?.request === null) {
		return null;
	}

	return (
		<TrainingEntryDetailLayout
			backHref={`/${website.slug}/agent/training/faq`}
			headerActions={
				draftReviewPayload ? (
					<>
						<Button
							disabled={isApprovalPendingUi}
							onClick={closeProposal}
							type="button"
							variant="ghost"
						>
							Cancel
						</Button>
						<Button
							disabled={isApprovalPendingUi || !draftReviewState.canApprove}
							onClick={() => {
								setPendingApprovalDraft(draftReviewState.parsedDraft);
								setIsApprovalRedirecting(true);
								flow.approveDraft(requestId, draftReviewState.parsedDraft);
							}}
							type="button"
						>
							{isApprovalPendingUi ? "Approving..." : "Approve"}
						</Button>
					</>
				) : null
			}
			title={headerTitle}
		>
			<div className="flex flex-wrap items-center gap-2">
				<Badge variant="secondary">AI Suggestion</Badge>
				{flow.currentRequest ? (
					<Badge
						variant={
							flow.currentRequest.status === "draft_ready"
								? "success"
								: "secondary"
						}
					>
						{getClarificationRequestStatusLabel(flow.currentRequest)}
					</Badge>
				) : null}
				{flow.currentRequest?.linkedConversationCount &&
				flow.currentRequest.linkedConversationCount > 1 ? (
					<Badge variant="secondary">
						{flow.currentRequest.linkedConversationCount} conversations
					</Badge>
				) : null}
				{flow.currentRequest?.targetKnowledgeSummary ? (
					<Badge variant="secondary">
						Updating FAQ:{" "}
						{flow.currentRequest.targetKnowledgeSummary.question ??
							flow.currentRequest.targetKnowledgeSummary.sourceTitle ??
							flow.currentRequest.targetKnowledgeSummary.id}
					</Badge>
				) : null}
			</div>
			<KnowledgeClarificationFlowContent
				currentRequest={flow.currentRequest}
				currentStep={flow.currentStep}
				fallbackStep={flow.fallbackStep}
				isLoading={isLoading}
				isRetrying={flow.retryMutation.isPending}
				isSubmittingAnswer={flow.answerMutation.isPending}
				isSubmittingApproval={isApprovalPendingUi}
				onAnswer={flow.submitAnswer}
				onApprove={flow.approveDraft}
				onClose={closeProposal}
				onDefer={flow.deferRequest}
				onDismiss={flow.dismissRequest}
				onRetry={flow.retryRequest}
				pageDraftReviewState={draftReviewPayload ? draftReviewState : null}
				showPageApprovalPendingState={isApprovalPendingUi}
				variant="page"
				websiteSlug={website.slug}
			/>
		</TrainingEntryDetailLayout>
	);
}

export type { KnowledgeClarificationProposalPageProps };
