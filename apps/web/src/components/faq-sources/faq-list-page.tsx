"use client";

import type { FaqKnowledgePayload } from "@plasma/types";
import { useQuery } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { TrainingEmptyState } from "@/components/agents/training-empty-state";
import { KnowledgeClarificationProposalsSection } from "@/components/knowledge-clarification/proposals-section";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icons";
import { PageContent } from "@/components/ui/layout";
import {
	SettingsHeader,
	SettingsPage,
} from "@/components/ui/layout/settings-layout";
import { TooltipOnHover } from "@/components/ui/tooltip";
import { useTRPC } from "@/lib/trpc/client";
import {
	TrainingEntryList,
	TrainingEntryListSection,
	TrainingEntryRow,
	useTrainingEntryPrefetch,
	useTrainingPageState,
} from "../training-entries";
import { useFaqMutations } from "./hooks/use-faq-mutations";

export function FaqListPage() {
	const router = useRouter();
	const trpc = useTRPC();
	const pageState = useTrainingPageState({
		highlightedFeatureKey: "ai-agent-training-faqs",
	});
	const { prefetchKnowledgeEntry } = useTrainingEntryPrefetch(
		pageState.websiteSlug
	);
	const { data: faqData, isLoading: isLoadingFaqs } = useQuery(
		trpc.knowledge.list.queryOptions({
			websiteSlug: pageState.websiteSlug,
			type: "faq",
			aiAgentId: pageState.aiAgentId,
			limit: 100,
		})
	);
	const { data: proposalsData } = useQuery({
		...trpc.knowledgeClarification.listProposals.queryOptions({
			websiteSlug: pageState.websiteSlug,
		}),
		staleTime: 0,
		refetchOnMount: "always",
	});

	const { handleDelete, handleToggleIncluded, isDeleting, isToggling } =
		useFaqMutations({
			websiteSlug: pageState.websiteSlug,
			aiAgentId: pageState.aiAgentId,
			trainingControls: pageState.trainingControls,
		});

	const isAtFaqLimit =
		pageState.stats?.planLimitFaqs !== null &&
		pageState.stats?.faqKnowledgeCount !== undefined &&
		pageState.stats.faqKnowledgeCount >= (pageState.stats.planLimitFaqs ?? 0);
	const faqs = faqData?.items ?? [];
	const proposals = proposalsData?.items ?? [];
	const newFaqHref = `/${pageState.websiteSlug}/agent/training/faq/new`;

	const rows = useMemo(
		() =>
			faqs.map((faq) => {
				const payload = faq.payload as FaqKnowledgePayload;
				const href = `/${pageState.websiteSlug}/agent/training/faq/${faq.id}`;

				return (
					<TrainingEntryRow
						href={href}
						icon={<span className="font-medium">?</span>}
						inlineActions={[
							{
								label: faq.isIncluded
									? "Exclude from training"
									: "Include in training",
								onSelect: () => {
									void handleToggleIncluded(faq.id, !faq.isIncluded);
								},
								icon: (
									<Icon
										filledOnHover
										name={faq.isIncluded ? "eye-off" : "eye"}
									/>
								),
								disabled: isToggling,
							},
							{
								label: "Delete FAQ",
								onSelect: () => {
									void handleDelete(faq.id);
								},
								icon: <Trash2Icon className="size-4" />,
								disabled: isDeleting,
								destructive: true,
							},
						]}
						key={faq.id}
						onHoverPrefetch={() => prefetchKnowledgeEntry(faq.id, href)}
						primary={payload.question}
						rightMeta={
							faq.isIncluded ? null : (
								<span className="font-medium text-plasma-orange text-xs">
									Excluded
								</span>
							)
						}
					/>
				);
			}),
		[
			faqs,
			handleDelete,
			handleToggleIncluded,
			isDeleting,
			isToggling,
			prefetchKnowledgeEntry,
			pageState.websiteSlug,
		]
	);

	return (
		<>
			<SettingsPage>
				<SettingsHeader>
					FAQ
					<div className="flex items-center gap-2 pr-1">
						<TooltipOnHover content="Add FAQ">
							<Button
								aria-label="Add FAQ"
								onClick={() => {
									if (isAtFaqLimit) {
										pageState.openUpgradeModal();
										return;
									}

									router.push(newFaqHref);
								}}
								size="sm"
								type="button"
								variant="secondary"
							>
								<Icon filledOnHover name="plus" />
								Add FAQ
							</Button>
						</TooltipOnHover>
					</div>
				</SettingsHeader>
				<PageContent className="py-6 pt-20">
					<div className="space-y-6">
						{pageState.stats && pageState.stats.planLimitFaqs !== null ? (
							<div className="flex items-center justify-between text-sm">
								<p className="text-muted-foreground">
									<span className="font-medium">
										{pageState.stats.faqKnowledgeCount}
									</span>{" "}
									/ {pageState.stats.planLimitFaqs} FAQs
								</p>
								{pageState.isFreePlan ? (
									<button
										className="font-medium text-plasma-orange hover:cursor-pointer hover:underline"
										onClick={pageState.openUpgradeModal}
										type="button"
									>
										Upgrade for unlimited FAQs
									</button>
								) : null}
							</div>
						) : null}

						<KnowledgeClarificationProposalsSection
							proposals={proposals}
							websiteSlug={pageState.websiteSlug}
						/>

						<TrainingEntryListSection
							description="Saved questions your agent can use during training."
							title="Saved FAQs"
						>
							<TrainingEntryList
								emptyState={
									<TrainingEmptyState
										actionLabel="Add FAQ"
										description="Add a FAQ so your agent can answer common questions."
										onAction={() => {
											router.push(newFaqHref);
										}}
										title="No FAQs yet"
									/>
								}
								isLoading={isLoadingFaqs}
							>
								{rows}
							</TrainingEntryList>
						</TrainingEntryListSection>
					</div>
				</PageContent>
			</SettingsPage>

			{pageState.upgradeModal}
		</>
	);
}
