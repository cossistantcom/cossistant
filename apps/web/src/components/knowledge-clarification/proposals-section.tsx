"use client";

import type { KnowledgeClarificationRequest } from "@plasma/types";
import { useMutation } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
	TrainingEntryList,
	TrainingEntryListSection,
	TrainingEntryRow,
	useTrainingEntryPrefetch,
} from "@/components/training-entries";
import { Badge } from "@/components/ui/badge";
import Icon from "@/components/ui/icons";
import { Logo } from "@/components/ui/logo";
import { useTRPC } from "@/lib/trpc/client";
import { getClarificationRequestStatusLabel } from "./helpers";
import { useKnowledgeClarificationQueryInvalidation } from "./use-query-invalidation";

type KnowledgeClarificationProposalsSectionProps = {
	websiteSlug: string;
	proposals: KnowledgeClarificationRequest[];
	className?: string;
};

type ProposalAppearance = {
	statusLabel: string;
	statusVariant: "secondary" | "success";
};

function getProposalPrimaryLabel(
	proposal: KnowledgeClarificationRequest
): string {
	return (
		proposal.topicSummary ||
		proposal.draftFaqPayload?.question ||
		proposal.currentQuestion ||
		"AI Suggestion"
	);
}

function getProposalAppearance(
	proposal: KnowledgeClarificationRequest
): ProposalAppearance {
	return {
		statusLabel: getClarificationRequestStatusLabel(proposal),
		statusVariant:
			proposal.status === "draft_ready" && proposal.draftFaqPayload
				? "success"
				: "secondary",
	};
}

function getProposalRightMeta(
	proposal: KnowledgeClarificationRequest,
	appearance: ProposalAppearance
) {
	const targetFaqLabel =
		proposal.targetKnowledgeSummary?.question ??
		proposal.targetKnowledgeSummary?.sourceTitle ??
		null;

	return (
		<div className="flex flex-wrap items-center justify-end gap-2">
			{proposal.targetKnowledgeId ? (
				<Badge variant="secondary">
					{targetFaqLabel ? `Updating: ${targetFaqLabel}` : "Updating FAQ"}
				</Badge>
			) : null}
			{proposal.linkedConversationCount > 1 ? (
				<Badge variant="secondary">
					{proposal.linkedConversationCount} conversations
				</Badge>
			) : null}
			<Badge variant={appearance.statusVariant}>{appearance.statusLabel}</Badge>
		</div>
	);
}

export function KnowledgeClarificationProposalsSection({
	websiteSlug,
	proposals,
	className,
}: KnowledgeClarificationProposalsSectionProps) {
	const { prefetchProposal } = useTrainingEntryPrefetch(websiteSlug);
	const trpc = useTRPC();
	const invalidateQueries =
		useKnowledgeClarificationQueryInvalidation(websiteSlug);
	const dismissMutation = useMutation(
		trpc.knowledgeClarification.dismiss.mutationOptions({
			retry: false,
			onSuccess: async (request) => {
				await invalidateQueries({ request });
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
			},
			onError: (error) => {
				toast.error(error.message || "Failed to approve draft");
			},
		})
	);
	const actionsDisabled =
		dismissMutation.isPending || approveMutation.isPending;

	if (proposals.length === 0) {
		return null;
	}

	return (
		<TrainingEntryListSection
			className={className}
			description="Draft FAQs and clarification threads the AI wants you to review."
			title={`AI Suggestions (${proposals.length})`}
		>
			<TrainingEntryList>
				{proposals.map((proposal) => {
					const appearance = getProposalAppearance(proposal);
					const href = `/${websiteSlug}/agent/training/faq/proposals/${proposal.id}`;
					const canApprove =
						proposal.status === "draft_ready" && !!proposal.draftFaqPayload;

					return (
						<TrainingEntryRow
							href={href}
							icon={<Logo className="size-4.5 text-primary" />}
							inlineActions={[
								...(canApprove
									? [
											{
												label: "Approve",
												onSelect: () => {
													if (!proposal.draftFaqPayload) {
														return;
													}

													approveMutation.mutate({
														websiteSlug,
														requestId: proposal.id,
														draft: proposal.draftFaqPayload,
													});
												},
												icon: <Icon filledOnHover name="check" />,
												disabled: actionsDisabled,
											},
										]
									: []),
								{
									label: "Delete suggestion",
									onSelect: () => {
										dismissMutation.mutate({
											websiteSlug,
											requestId: proposal.id,
										});
									},
									icon: <Trash2Icon className="size-4" />,
									disabled: actionsDisabled,
									destructive: true,
								},
							]}
							key={proposal.id}
							onHoverPrefetch={() => prefetchProposal(proposal.id, href)}
							primary={getProposalPrimaryLabel(proposal)}
							rightMeta={getProposalRightMeta(proposal, appearance)}
						/>
					);
				})}
			</TrainingEntryList>
		</TrainingEntryListSection>
	);
}

export type { KnowledgeClarificationProposalsSectionProps };
