"use client";

import type { RouterOutputs } from "@plasma/api/types";
import { useState } from "react";
import { UpgradeModal } from "@/components/plan/upgrade-modal";
import Icon from "@/components/ui/icons";
import { cn } from "@/lib/utils";

type CrawlLimitInfoProps = {
	/** The crawl page limit (null = unlimited) */
	limit: number | null;
	/** Number of pages discovered on the website */
	discoveredCount?: number;
	/** Whether the user is on the free plan */
	isFreePlan: boolean;
	/** Website slug for upgrade modal */
	websiteSlug: string;
	/** Plan info for upgrade modal */
	planInfo: RouterOutputs["plan"]["getPlanInfo"] | undefined;
	/** Optional className for styling */
	className?: string;
};

export function CrawlLimitInfo({
	limit,
	discoveredCount,
	isFreePlan,
	websiteSlug,
	planInfo,
	className,
}: CrawlLimitInfoProps) {
	const [showUpgradeModal, setShowUpgradeModal] = useState(false);

	// Calculate how many pages will actually be crawled
	const pagesToCrawl =
		limit === null
			? (discoveredCount ?? 0)
			: Math.min(limit, discoveredCount ?? limit);

	const hasDiscoveredPages =
		discoveredCount !== undefined && discoveredCount > 0;
	// Only show upgrade prompt for free plan users when limit is exceeded
	const showUpgradePrompt =
		isFreePlan &&
		limit !== null &&
		discoveredCount !== undefined &&
		discoveredCount > limit;

	return (
		<>
			<div className={className}>
				{hasDiscoveredPages ? (
					<div className="space-y-1">
						<div className="flex items-center gap-2">
							<Icon className="size-4 text-muted-foreground" name="globe" />
							<p className="text-sm">
								<span className="font-medium text-foreground">
									{discoveredCount.toLocaleString()}
								</span>{" "}
								<span className="text-muted-foreground">
									{discoveredCount === 1 ? "page" : "pages"} discovered
								</span>
							</p>
						</div>
						{showUpgradePrompt ? (
							<p className="pl-6 text-plasma-orange text-sm">
								Only{" "}
								<span className="font-medium">
									{pagesToCrawl.toLocaleString()}
								</span>{" "}
								will be added (free plan limit: {limit} pages total).{" "}
								<button
									className="font-medium underline hover:no-underline"
									onClick={() => setShowUpgradeModal(true)}
									type="button"
								>
									Upgrade for all {discoveredCount.toLocaleString()} pages
								</button>
							</p>
						) : (
							<p className="pl-6 text-muted-foreground text-sm">
								All pages will be added to your knowledge base
							</p>
						)}
					</div>
				) : (
					<p
						className={cn(
							"flex items-center justify-between text-muted-foreground text-sm",
							isFreePlan && "text-plasma-orange"
						)}
					>
						<span className="text-primary/80">
							Up to {limit === null ? "1000+" : limit.toLocaleString()} pages
							total will be crawled
						</span>
						{isFreePlan && limit !== null && (
							<button
								className="ml-1 font-medium text-plasma-orange hover:underline"
								onClick={() => setShowUpgradeModal(true)}
								type="button"
							>
								Upgrade for 1,000+
							</button>
						)}
					</p>
				)}
			</div>
			{/* Upgrade Modal */}
			{planInfo && (
				<UpgradeModal
					currentPlan={planInfo.plan}
					highlightedFeatureKey="ai-agent-training-pages-total"
					initialPlanName="hobby"
					onOpenChange={setShowUpgradeModal}
					open={showUpgradeModal}
					websiteSlug={websiteSlug}
				/>
			)}
		</>
	);
}
