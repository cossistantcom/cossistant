"use client";

import type { ConversationStatus } from "@plasma/types";
import { useQuery } from "@tanstack/react-query";
import { Facehash } from "facehash";
import Link from "next/link";
import { useCallback, useState } from "react";
import {
	InboxAnalyticsDesktopHeaderActions,
	InboxAnalyticsDisplay,
	useInboxAnalyticsController,
} from "@/components/inbox-analytics";
import { UpgradeModal } from "@/components/plan/upgrade-modal";
import { type ConversationHeader, useInboxes } from "@/contexts/inboxes";
import { useLiveVisitorsOverlayState } from "@/hooks/use-live-visitors-overlay-state";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "../ui/button";
import Icon from "../ui/icons";
import { Page, PageContent, PageHeader, PageHeaderTitle } from "../ui/layout";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "../ui/sheet";
import { TooltipOnHover } from "../ui/tooltip";
import { AIAgentOnboarding } from "./ai-agent-onboarding";
import type { VirtualListItem } from "./types";
import { VirtualizedConversations } from "./virtualized-conversations";

type Props = {
	basePath: string;
	selectedConversationStatus: ConversationStatus | "archived" | null;
	conversations: ConversationHeader[];
	websiteSlug: string;
	isLeftSidebarOpen: boolean;
	onToggleLeftSidebar: () => void;
	smartItems?: VirtualListItem[] | null;
};

export function ConversationsList({
	basePath,
	selectedConversationStatus,
	conversations,
	websiteSlug,
	isLeftSidebarOpen,
	onToggleLeftSidebar,
	smartItems,
}: Props) {
	const trpc = useTRPC();
	const { data: aiAgent } = useQuery(
		trpc.aiAgent.get.queryOptions({ websiteSlug })
	);
	const { data: planInfo } = useQuery(
		trpc.plan.getPlanInfo.queryOptions({ websiteSlug })
	);
	const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
	const { statusCounts } = useInboxes();
	const { openLiveVisitorsOverlay } = useLiveVisitorsOverlayState();
	const openLockedConversationUpgradeModal = useCallback(
		(_conversationId: string) => {
			setIsUpgradeModalOpen(true);
		},
		[]
	);

	const totalConversations =
		statusCounts.open +
		statusCounts.resolved +
		statusCounts.spam +
		statusCounts.archived;
	const isOnboarding = totalConversations === 0;

	const showWaitingForReplyPill = selectedConversationStatus === null;
	const showAnalytics = selectedConversationStatus === null;
	const analytics = useInboxAnalyticsController({
		websiteSlug,
		enabled: showAnalytics,
	});
	const analyticsItems =
		showAnalytics && smartItems
			? [{ type: "analytics" as const }, ...smartItems]
			: smartItems;

	const renderDesktopAnalytics = () => (
		<div
			className="hidden px-1 pt-2 lg:block"
			data-slot="inbox-desktop-analytics-slot"
		>
			<InboxAnalyticsDisplay
				controlSize="sm"
				data={analytics.data}
				isError={analytics.isError}
				isLoading={analytics.isLoading}
				livePresence={analytics.livePresence}
				onRangeChange={analytics.setRangeDays}
				rangeDays={analytics.rangeDays}
				showControl={false}
			/>
		</div>
	);

	return (
		<Page className="px-0">
			<PageHeader className="flex items-center justify-between bg-transparent pr-3 pl-5 dark:bg-transparent">
				<div className="flex items-center gap-2">
					{!isLeftSidebarOpen && (
						<TooltipOnHover
							align="end"
							content="Click to open sidebar"
							shortcuts={["["]}
						>
							<Button
								className="-ml-1"
								onClick={onToggleLeftSidebar}
								size="icon-small"
								variant="ghost"
							>
								<Icon filledOnHover name="sidebar-collapse" />
							</Button>
						</TooltipOnHover>
					)}
					<PageHeaderTitle className="capitalize">
						{selectedConversationStatus || "Inbox"}
					</PageHeaderTitle>
				</div>
				{showAnalytics ? (
					<div className="flex items-center justify-end gap-2">
						<InboxAnalyticsDesktopHeaderActions
							actionIconName="globe"
							actionLabel="Open live visitors overlay"
							actionTooltip="Open live visitors overlay"
							onActionClick={() => {
								void openLiveVisitorsOverlay();
							}}
							onRangeChange={analytics.setRangeDays}
							rangeDays={analytics.rangeDays}
						/>
						<Sheet
							onOpenChange={analytics.setIsSheetOpen}
							open={analytics.isSheetOpen}
						>
							<div className="flex items-center gap-2 lg:hidden">
								<Button
									onClick={() => {
										void openLiveVisitorsOverlay();
									}}
									size="icon-small"
									variant="ghost"
								>
									<Icon name="globe" />
									<span className="sr-only">Open live visitors overlay</span>
								</Button>
								<SheetTrigger asChild>
									<Button size="sm" variant="ghost">
										Analytics
									</Button>
								</SheetTrigger>
							</div>
							<SheetContent
								className="max-h-[85vh] overflow-y-auto bg-background p-0 lg:hidden"
								side="bottom"
							>
								<SheetHeader className="pr-12">
									<SheetTitle>Analytics</SheetTitle>
									<SheetDescription>
										View inbox performance and adjust the date range.
									</SheetDescription>
								</SheetHeader>
								<div className="px-4 pb-4">
									<InboxAnalyticsDisplay
										controlSize="default"
										data={analytics.data}
										isError={analytics.isError}
										isLoading={analytics.isLoading}
										layout="sheet"
										livePresence={analytics.livePresence}
										onRangeChange={analytics.setRangeDays}
										rangeDays={analytics.rangeDays}
									/>
								</div>
							</SheetContent>
						</Sheet>
					</div>
				) : null}
			</PageHeader>
			{conversations.length === 0 ? (
				<PageContent className={showAnalytics ? "gap-6" : undefined}>
					{showAnalytics ? renderDesktopAnalytics() : null}
					{isOnboarding ? (
						<div className="mx-1 mt-4 flex h-2/3 flex-col items-center justify-center gap-6">
							<Facehash
								className="rounded-lg border border-primary/60 border-dashed font-bold font-mono text-primary"
								colorClasses={["bg-background-100"]}
								enableBlink
								name={selectedConversationStatus ?? "I"}
								size={80}
								variant="solid"
							/>
							<p className="mt-10 text-primary text-xl">
								Welcome to your inbox
							</p>
							{aiAgent === null && (
								<AIAgentOnboarding websiteSlug={websiteSlug} />
							)}
							<div className="flex items-center justify-center gap-2">
								<Button asChild size="xs" variant="ghost">
									<Link href="/docs/quickstart">Read our setup guide</Link>
								</Button>
								<Button asChild size="xs" variant="ghost">
									<Link href="/docs/concepts">What are visitors?</Link>
								</Button>
								<Button asChild size="xs" variant="ghost">
									<Link href="/docs/concepts/conversations">
										Learn about conversations
									</Link>
								</Button>
							</div>
						</div>
					) : (
						<div className="mx-1 mt-4 flex h-2/3 flex-col items-center justify-center gap-6">
							<Facehash
								className="rounded-lg border border-primary/20 border-dashed font-bold font-mono text-primary/60"
								colorClasses={["bg-background-100"]}
								enableBlink
								name={selectedConversationStatus ?? "I"}
								size={80}
								variant="solid"
							/>
							<p className="text-base text-primary/60">
								No {selectedConversationStatus || ""} conversations
							</p>
						</div>
					)}
				</PageContent>
			) : (
				<VirtualizedConversations
					analyticsSlot={showAnalytics ? renderDesktopAnalytics() : null}
					basePath={basePath}
					conversations={conversations}
					onLockedConversationActivate={openLockedConversationUpgradeModal}
					showWaitingForReplyPill={showWaitingForReplyPill}
					smartItems={analyticsItems}
					websiteSlug={websiteSlug}
				/>
			)}
			{planInfo ? (
				<UpgradeModal
					currentPlan={planInfo.plan}
					highlightedFeatureKey="conversations"
					initialPlanName="pro"
					onOpenChange={setIsUpgradeModalOpen}
					open={isUpgradeModalOpen}
					websiteSlug={websiteSlug}
				/>
			) : null}
		</Page>
	);
}
