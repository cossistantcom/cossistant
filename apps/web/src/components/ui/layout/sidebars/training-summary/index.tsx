"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { UpgradeModal } from "@/components/plan/upgrade-modal";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icons";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useWebsite } from "@/contexts/website";
import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { SidebarContainer } from "../container";
import { ResizableSidebar } from "../resizable-sidebar";

type TrainingSummarySidebarProps = {
	aiAgentId?: string | null;
};

function formatBytes(bytes: number): string {
	if (bytes === 0) {
		return "0 KB";
	}

	const kb = bytes / 1024;
	if (kb < 1024) {
		return `${Math.round(kb)} KB`;
	}

	const mb = kb / 1024;
	return `${mb.toFixed(1)} MB`;
}

function getHintDismissedKey(websiteSlug: string): string {
	return `cossistant:training-hint-dismissed:${websiteSlug}`;
}

function formatTrainingInterval(intervalMinutes: number): string {
	if (intervalMinutes % 60 === 0) {
		const hours = intervalMinutes / 60;
		return `${hours} ${hours === 1 ? "hour" : "hours"}`;
	}

	return `${intervalMinutes} ${intervalMinutes === 1 ? "minute" : "minutes"}`;
}

function getTrainingCooldownTitle(params: {
	intervalMinutes: number | boolean | null | undefined;
	planName: string | undefined;
}): string {
	if (
		typeof params.intervalMinutes !== "number" ||
		!Number.isFinite(params.intervalMinutes) ||
		params.intervalMinutes <= 0
	) {
		return "Training is temporarily on cooldown for your plan";
	}

	const interval = formatTrainingInterval(Math.round(params.intervalMinutes));
	const planLabel = params.planName === "free" ? "the free plan" : "your plan";

	return `Training available every ${interval} on ${planLabel}`;
}

export function TrainingSummarySidebar({
	aiAgentId,
}: TrainingSummarySidebarProps) {
	const website = useWebsite();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
	const [isHintDismissed, setIsHintDismissed] = useState(true);

	// Load hint dismissed state from localStorage
	useEffect(() => {
		const key = getHintDismissedKey(website.slug);
		setIsHintDismissed(localStorage.getItem(key) === "true");
	}, [website.slug]);

	const dismissHint = useCallback(() => {
		const key = getHintDismissedKey(website.slug);
		localStorage.setItem(key, "true");
		setIsHintDismissed(true);
	}, [website.slug]);

	// Fetch training stats
	const { data: stats, isLoading: isLoadingStats } = useQuery(
		trpc.linkSource.getTrainingStats.queryOptions({
			websiteSlug: website.slug,
			aiAgentId: aiAgentId ?? null,
		})
	);

	// Fetch training status
	const { data: trainingStatus, isLoading: isLoadingTrainingStatus } = useQuery(
		trpc.aiAgent.getTrainingStatus.queryOptions({
			websiteSlug: website.slug,
		})
	);

	// Fetch training readiness
	const { data: readiness } = useQuery(
		trpc.aiAgent.getTrainingReadiness.queryOptions({
			websiteSlug: website.slug,
		})
	);

	// Fetch plan info for upgrade modal
	const { data: planInfo } = useQuery(
		trpc.plan.getPlanInfo.queryOptions({
			websiteSlug: website.slug,
		})
	);

	// Start training mutation
	const startTrainingMutation = useMutation(
		trpc.aiAgent.startTraining.mutationOptions({
			onSuccess: () => {
				// Invalidate training status and readiness to trigger refetch
				queryClient.invalidateQueries({
					queryKey: trpc.aiAgent.getTrainingStatus.queryKey({
						websiteSlug: website.slug,
					}),
				});
				queryClient.invalidateQueries({
					queryKey: trpc.aiAgent.getTrainingReadiness.queryKey({
						websiteSlug: website.slug,
					}),
				});
				// Reset hint dismissed so it can show again next time
				const key = getHintDismissedKey(website.slug);
				localStorage.removeItem(key);
				setIsHintDismissed(false);
			},
		})
	);

	const totalSizeFormatted = stats ? formatBytes(stats.totalSizeBytes) : "0 KB";
	const limitFormatted = stats?.planLimitBytes
		? formatBytes(stats.planLimitBytes)
		: "Unlimited";

	const usagePercentage = stats?.planLimitBytes
		? Math.min(
				100,
				Math.round((stats.totalSizeBytes / stats.planLimitBytes) * 100)
			)
		: 0;

	const isNearLimit = usagePercentage >= 80;
	const isAtLimit = usagePercentage >= 100;

	// Calculate total sources count
	const totalSources =
		(stats?.urlKnowledgeCount ?? 0) +
		(stats?.faqKnowledgeCount ?? 0) +
		(stats?.articleKnowledgeCount ?? 0);

	// Determine training state
	const isTraining =
		trainingStatus?.trainingStatus === "training" ||
		trainingStatus?.trainingStatus === "pending";
	const hasFailedTraining = trainingStatus?.trainingStatus === "failed";
	const hasCompletedTraining = trainingStatus?.trainingStatus === "completed";

	// Smart gating: only allow training if sources changed
	const needsTraining = readiness?.needsTraining ?? false;
	const isOnCooldown = readiness?.canTrainAt != null;
	const canTrain =
		totalSources > 0 &&
		aiAgentId &&
		!isTraining &&
		needsTraining &&
		!isOnCooldown;

	// Format last trained date
	const lastTrainedText = trainingStatus?.lastTrainedAt
		? formatDistanceToNow(new Date(trainingStatus.lastTrainedAt), {
				addSuffix: true,
			})
		: null;

	const handleStartTraining = () => {
		if (!aiAgentId) {
			return;
		}

		// If on cooldown, show upgrade modal
		if (isOnCooldown) {
			setIsUpgradeModalOpen(true);
			return;
		}

		startTrainingMutation.mutate({
			websiteSlug: website.slug,
			aiAgentId,
		});
	};

	// Determine button disabled state
	// Disabled when: no agent, already training, mutation pending, or nothing new to train
	// Enabled when on cooldown (clicking opens upgrade modal)
	const isButtonDisabled =
		!aiAgentId ||
		isTraining ||
		startTrainingMutation.isPending ||
		!needsTraining;
	const trainingCooldownTitle = getTrainingCooldownTitle({
		intervalMinutes: planInfo?.plan.features["ai-agent-training-interval"],
		planName: planInfo?.plan.name,
	});

	return (
		<>
			<ResizableSidebar
				className="hidden lg:flex"
				position="right"
				sidebarTitle="Sources"
			>
				<SidebarContainer>
					<div className="flex flex-col gap-6">
						<div className="px-1 pt-2">
							<h3 className="mb-4 font-medium text-sm">Sources</h3>
							{isLoadingStats ? (
								<div className="flex flex-col gap-3">
									<Skeleton className="h-5 w-full" />
									<Skeleton className="h-5 w-full" />
									<Skeleton className="h-5 w-full" />
								</div>
							) : (
								<div className="flex flex-col gap-2">
									<SourceRow
										count={stats?.urlKnowledgeCount ?? 0}
										icon="dashboard"
										label="Pages"
										limit={stats?.totalPagesLimit}
									/>
									<SourceRow
										count={stats?.faqKnowledgeCount ?? 0}
										icon="help"
										label="FAQs"
									/>
									<SourceRow
										count={stats?.articleKnowledgeCount ?? 0}
										icon="file"
										label="Files"
									/>
								</div>
							)}
						</div>

						<div className="border-t px-1 pt-4">
							<div className="mb-2 flex items-center justify-between">
								<span className="text-muted-foreground text-xs">
									Total size
								</span>
								<span className="font-medium text-xs">
									{totalSizeFormatted} / {limitFormatted}
								</span>
							</div>
							{stats?.planLimitBytes ? (
								<Progress
									className={cn(
										"h-2",
										isAtLimit && "bg-destructive/20",
										isNearLimit && !isAtLimit && "bg-warning/20"
									)}
									indicatorClassName={cn(
										isAtLimit && "text-destructive",
										isNearLimit && !isAtLimit && "text-warning"
									)}
									value={usagePercentage}
								/>
							) : (
								<Progress className="h-2" value={0} />
							)}
							{isAtLimit && (
								<p className="mt-2 text-destructive text-xs">
									You've reached your plan's storage limit.{" "}
									<a
										className="underline hover:text-destructive/80"
										href={`/${website.slug}/settings/plan`}
									>
										Upgrade your plan
									</a>{" "}
									to add more sources.
								</p>
							)}
						</div>

						{/* Training progress bar (shown during training) */}
						{isTraining && (
							<div className="px-1">
								<div className="mb-2 flex items-center justify-between">
									<span className="text-muted-foreground text-xs">
										Training progress
									</span>
									<span className="font-medium text-xs">
										{trainingStatus?.trainingProgress ?? 0}%
									</span>
								</div>
								<Progress
									className="h-2"
									value={trainingStatus?.trainingProgress ?? 0}
								/>
							</div>
						)}

						<Button
							className="w-full"
							disabled={isButtonDisabled}
							onClick={handleStartTraining}
							size="sm"
							title={
								!needsTraining && hasCompletedTraining
									? "No sources have been updated since last training"
									: isOnCooldown
										? trainingCooldownTitle
										: undefined
							}
							variant="secondary"
						>
							{isTraining ? (
								<>
									<div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
									Training...
								</>
							) : !needsTraining && hasCompletedTraining ? (
								"Nothing new to train"
							) : (
								<>
									<Icon className="mr-2 size-4" name="play" />
									{hasCompletedTraining ? "Retrain Agent" : "Train Agent"}
								</>
							)}
						</Button>

						{/* Dismissible training hint */}
						{needsTraining && !isTraining && !isHintDismissed && (
							<div className="relative rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5 dark:border-blue-900 dark:bg-blue-950/50">
								<button
									className="absolute top-1.5 right-1.5 rounded p-0.5 text-muted-foreground hover:text-foreground"
									onClick={dismissHint}
									type="button"
								>
									<X className="size-3.5" />
								</button>
								<p className="pr-5 text-xs leading-relaxed">
									Your knowledge base has been updated. Train your agent to
									apply the latest changes.
									{readiness?.updatedSourcesCount
										? ` ${readiness.updatedSourcesCount} source${readiness.updatedSourcesCount > 1 ? "s" : ""} changed.`
										: ""}
								</p>
							</div>
						)}

						{/* Status message */}
						{!isLoadingTrainingStatus && (
							<p className="text-center text-muted-foreground text-xs">
								{totalSources === 0 ? (
									"Add sources to train your AI agent."
								) : isTraining ? (
									"Processing your knowledge base..."
								) : hasFailedTraining ? (
									<span className="text-destructive">
										Training failed. Please try again.
									</span>
								) : lastTrainedText ? (
									`Last trained ${lastTrainedText}`
								) : (
									"Click to train your AI agent."
								)}
							</p>
						)}
					</div>
				</SidebarContainer>
			</ResizableSidebar>

			{planInfo && (
				<UpgradeModal
					currentPlan={planInfo.plan}
					highlightedFeatureKey="ai-agent-training-interval"
					initialPlanName="hobby"
					onOpenChange={setIsUpgradeModalOpen}
					open={isUpgradeModalOpen}
					websiteSlug={website.slug}
				/>
			)}
		</>
	);
}

type SourceRowProps = {
	icon: "dashboard" | "help" | "file";
	label: string;
	count: number;
	size?: number;
	limit?: number | null;
};

function SourceRow({ icon, label, count, size, limit }: SourceRowProps) {
	const sizeFormatted = size !== undefined ? formatBytes(size) : null;
	const limitText = limit !== null && limit !== undefined ? `/ ${limit}` : null;

	return (
		<div className="flex items-center justify-between">
			<div className="flex items-center gap-2">
				<Icon className="size-4 text-muted-foreground" name={icon} />
				<span className="text-sm">{label}</span>
			</div>
			<div className="flex items-center gap-1.5 text-right">
				<span className="font-medium text-sm">
					{count}
					{limitText && (
						<span className="text-muted-foreground"> {limitText}</span>
					)}
				</span>
				{sizeFormatted && (
					<span className="text-muted-foreground text-xs">
						({sizeFormatted})
					</span>
				)}
			</div>
		</div>
	);
}

export function TrainingSummarySidebarPlaceholder() {
	return (
		<ResizableSidebar
			className="hidden lg:flex"
			position="right"
			sidebarTitle="Sources"
		>
			<SidebarContainer>
				<div className="flex flex-col gap-6">
					<div>
						<h3 className="mb-4 font-medium text-sm">Sources</h3>
						<div className="flex flex-col gap-3">
							<Skeleton className="h-5 w-full" />
							<Skeleton className="h-5 w-full" />
							<Skeleton className="h-5 w-full" />
						</div>
					</div>
					<div className="border-t pt-4">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="mt-2 h-2 w-full" />
					</div>
					<Skeleton className="h-9 w-full" />
				</div>
			</SidebarContainer>
		</ResizableSidebar>
	);
}
