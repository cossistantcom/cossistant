"use client";

import type { ArticleKnowledgePayload } from "@plasma/types";
import { useQuery } from "@tanstack/react-query";
import { EyeIcon, EyeOffIcon, FileTextIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { TrainingEmptyState } from "@/components/agents/training-empty-state";
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
import { useFileMutations } from "./hooks/use-file-mutations";

export function FileListPage() {
	const router = useRouter();
	const trpc = useTRPC();
	const pageState = useTrainingPageState({
		highlightedFeatureKey: "ai-agent-training-files",
	});
	const { prefetchKnowledgeEntry } = useTrainingEntryPrefetch(
		pageState.websiteSlug
	);
	const { data: fileData, isLoading: isLoadingFiles } = useQuery(
		trpc.knowledge.list.queryOptions({
			websiteSlug: pageState.websiteSlug,
			type: "article",
			aiAgentId: pageState.aiAgentId,
			limit: 100,
		})
	);

	const { handleDelete, handleToggleIncluded, isDeleting, isToggling } =
		useFileMutations({
			websiteSlug: pageState.websiteSlug,
			aiAgentId: pageState.aiAgentId,
			trainingControls: pageState.trainingControls,
		});

	const isAtFileLimit =
		pageState.stats?.planLimitFiles !== null &&
		pageState.stats?.articleKnowledgeCount !== undefined &&
		pageState.stats.articleKnowledgeCount >=
			(pageState.stats.planLimitFiles ?? 0);
	const files = fileData?.items ?? [];
	const newFileHref = `/${pageState.websiteSlug}/agent/training/files/new`;

	const rows = useMemo(
		() =>
			files.map((file) => {
				const payload = file.payload as ArticleKnowledgePayload;
				const href = `/${pageState.websiteSlug}/agent/training/files/${file.id}`;

				return (
					<TrainingEntryRow
						actions={[
							{
								label: file.isIncluded
									? "Exclude from training"
									: "Include in training",
								onSelect: () => {
									void handleToggleIncluded(file.id, !file.isIncluded);
								},
								Icon: file.isIncluded ? EyeOffIcon : EyeIcon,
								disabled: isToggling,
							},
							{
								label: "Delete",
								onSelect: () => {
									void handleDelete(file.id);
								},
								Icon: Trash2Icon,
								disabled: isDeleting,
								destructive: true,
								separatorBefore: true,
							},
						]}
						href={href}
						icon={<FileTextIcon className="size-4" />}
						key={file.id}
						onHoverPrefetch={() => prefetchKnowledgeEntry(file.id, href)}
						primary={payload.title}
						rightMeta={
							file.isIncluded ? null : (
								<span className="font-medium text-plasma-orange text-xs">
									Excluded
								</span>
							)
						}
					/>
				);
			}),
		[
			files,
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
					Files
					<div className="flex items-center gap-2 pr-1">
						<TooltipOnHover content="Add file">
							<Button
								aria-label="Add file"
								onClick={() => {
									if (isAtFileLimit) {
										pageState.openUpgradeModal();
										return;
									}

									router.push(newFileHref);
								}}
								size="sm"
								variant="secondary"
							>
								<Icon filledOnHover name="plus" />
								Add file
							</Button>
						</TooltipOnHover>
					</div>
				</SettingsHeader>
				<PageContent className="py-6 pt-20">
					<div className="space-y-6">
						{pageState.stats && pageState.stats.planLimitFiles !== null ? (
							<div className="flex items-center justify-between text-sm">
								<p className="text-muted-foreground">
									<span className="font-medium">
										{pageState.stats.articleKnowledgeCount}
									</span>{" "}
									/ {pageState.stats.planLimitFiles} Files
								</p>
								{pageState.isFreePlan ? (
									<button
										className="font-medium text-plasma-orange hover:cursor-pointer hover:underline"
										onClick={pageState.openUpgradeModal}
										type="button"
									>
										Upgrade for unlimited files
									</button>
								) : null}
							</div>
						) : null}

						<TrainingEntryListSection description="Saved files your agent can search during training.">
							<TrainingEntryList
								emptyState={
									<TrainingEmptyState
										actionLabel="Add file"
										description="Add a file to give your agent more context."
										onAction={() => {
											router.push(newFileHref);
										}}
										title="No files yet"
									/>
								}
								isLoading={isLoadingFiles}
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
