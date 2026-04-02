"use client";

import { useCallback, useMemo, useState } from "react";
import { TrainingEmptyState } from "@/components/agents/training-empty-state";
import { useTrainingPageState } from "@/components/training-entries";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icons";
import { PageContent } from "@/components/ui/layout";
import {
	SettingsHeader,
	SettingsPage,
} from "@/components/ui/layout/settings-layout";
import { TooltipOnHover } from "@/components/ui/tooltip";
import { AddWebsiteDialog } from "./add-website-dialog";
import { DomainTree } from "./domain-tree";
import { useLinkSourceMutations } from "./hooks/use-link-source-mutations";
import { UsageStatsCard } from "./usage-stats-card";

export function WebListPage() {
	const [showAddDialog, setShowAddDialog] = useState(false);
	const pageState = useTrainingPageState({
		highlightedFeatureKey: "ai-agent-training-pages-total",
	});

	const isAtLinkLimit =
		pageState.stats?.planLimitLinks !== null &&
		pageState.stats?.planLimitLinks !== undefined &&
		(pageState.stats?.linkSourcesCount ?? 0) >= pageState.stats.planLimitLinks;
	const isAtPagesLimit =
		pageState.stats?.totalPagesLimit !== null &&
		pageState.stats?.urlKnowledgeCount !== undefined &&
		pageState.stats.urlKnowledgeCount >= (pageState.stats.totalPagesLimit ?? 0);
	const isAtAnyLimit = isAtLinkLimit || isAtPagesLimit;

	const handleOpenCreate = useCallback(() => {
		if (isAtAnyLimit) {
			pageState.openUpgradeModal();
			return;
		}

		setShowAddDialog(true);
	}, [isAtAnyLimit, pageState]);

	const { handleCreate, isCreating } = useLinkSourceMutations({
		websiteSlug: pageState.websiteSlug,
		aiAgentId: pageState.aiAgentId,
		onCreateSuccess: () => {
			setShowAddDialog(false);
		},
	});

	const handleAddWebsite = useCallback(
		async (params: {
			url: string;
			includePaths?: string[];
			excludePaths?: string[];
		}) => {
			await handleCreate(params);
		},
		[handleCreate]
	);

	const showUpgradeCta = useMemo(
		() =>
			pageState.isFreePlan &&
			pageState.stats != null &&
			pageState.stats.totalPagesLimit !== null,
		[pageState.isFreePlan, pageState.stats]
	);

	return (
		<>
			<SettingsPage>
				<SettingsHeader>
					Web Sources
					<div className="flex items-center gap-2 pr-1">
						<TooltipOnHover content="Add website">
							<Button
								aria-label="Add website"
								onClick={handleOpenCreate}
								size="sm"
								type="button"
								variant="secondary"
							>
								<Icon filledOnHover name="plus" />
								Add website
							</Button>
						</TooltipOnHover>
					</div>
				</SettingsHeader>
				<PageContent className="py-6 pt-20">
					<div className="space-y-6">
						<UsageStatsCard stats={pageState.stats} />
						{showUpgradeCta ? (
							<div className="flex items-center justify-end text-plasma-orange text-sm">
								<button
									className="font-medium underline hover:no-underline"
									onClick={pageState.openUpgradeModal}
									type="button"
								>
									Upgrade for 1,000+ pages
								</button>
							</div>
						) : null}
						<DomainTree
							aiAgentId={pageState.aiAgentId}
							emptyState={
								<TrainingEmptyState
									actionLabel="Add website"
									description="Add a website and we'll crawl it for your agent."
									onAction={handleOpenCreate}
									title="No websites yet"
								/>
							}
							websiteSlug={pageState.websiteSlug}
						/>
					</div>
				</PageContent>
			</SettingsPage>

			<AddWebsiteDialog
				crawlPagesLimit={pageState.stats?.crawlPagesPerSourceLimit}
				isAtLinkLimit={isAtLinkLimit}
				isFreePlan={pageState.isFreePlan}
				isSubmitting={isCreating}
				linkLimit={pageState.stats?.planLimitLinks}
				onOpenChange={setShowAddDialog}
				onSubmit={handleAddWebsite}
				onUpgradeClick={pageState.openUpgradeModal}
				open={showAddDialog}
				websiteSlug={pageState.websiteSlug}
			/>

			{pageState.upgradeModal}
		</>
	);
}
