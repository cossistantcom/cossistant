"use client";

import { Support } from "@plasma/next/support";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useHotkeys } from "react-hotkeys-hook";
import { ChangelogNotification } from "@/components/changelog-notification";
import { DashboardTriggerContent } from "@/components/support/custom-trigger";
import { Button } from "@/components/ui/button";
import { useWebsite } from "@/contexts/website";
import { useContactVisitorDetailState } from "@/hooks/use-contact-visitor-detail-state";
import { useLiveVisitorsOverlayState } from "@/hooks/use-live-visitors-overlay-state";
import type { LatestRelease } from "@/lib/latest-release";
import { useTRPC } from "@/lib/trpc/client";
import Icon from "../../icons";
import { Logo } from "../../logo";
import { TooltipOnHover } from "../../tooltip";
import { TopbarItem } from "./topbar-item";
import { useChangelogOverlayState } from "./use-changelog-overlay-state";

type NavigationTopbarProps = {
	latestRelease?: LatestRelease | null;
	changelogContent?: React.ReactNode;
};

export function NavigationTopbar({
	latestRelease,
	changelogContent,
}: NavigationTopbarProps) {
	const pathname = usePathname();
	const router = useRouter();
	const website = useWebsite();
	const trpc = useTRPC();
	const { activeDetail, closeDetailPage } = useContactVisitorDetailState();
	const { closeLiveVisitorsOverlay, isOpen: isLiveVisitorsOverlayOpen } =
		useLiveVisitorsOverlayState();
	const { isChangelogOpen, setIsChangelogOpen } = useChangelogOverlayState();

	// Data is pre-fetched in the layout, so it will be available immediately
	const { data: aiAgent } = useQuery(
		trpc.aiAgent.get.queryOptions({
			websiteSlug: website?.slug ?? "",
		})
	);

	// Check if agent exists and onboarding is complete
	const hasAgent = !!aiAgent?.onboardingCompletedAt;

	const baseInboxPath = `/${website?.slug}/inbox`;
	const isOnInboxView = pathname.startsWith(baseInboxPath);
	const isDetailPageOpen = activeDetail !== null;
	const isChangelogVisible = Boolean(latestRelease) && isChangelogOpen;

	useHotkeys(
		"escape",
		(event) => {
			if (
				!(
					isChangelogVisible ||
					isDetailPageOpen ||
					isLiveVisitorsOverlayOpen ||
					!isOnInboxView
				)
			) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();

			if (isChangelogVisible) {
				setIsChangelogOpen(false);
				return;
			}

			if (isDetailPageOpen) {
				void closeDetailPage();
				return;
			}

			if (isLiveVisitorsOverlayOpen) {
				void closeLiveVisitorsOverlay();
				return;
			}

			router.push(baseInboxPath);
		},
		{
			enabled:
				isChangelogVisible ||
				isDetailPageOpen ||
				isLiveVisitorsOverlayOpen ||
				!isOnInboxView,
			preventDefault: true,
			enableOnContentEditable: false,
			enableOnFormTags: false,
		},
		[
			baseInboxPath,
			closeDetailPage,
			closeLiveVisitorsOverlay,
			isChangelogVisible,
			isDetailPageOpen,
			isLiveVisitorsOverlayOpen,
			isOnInboxView,
			router,
			setIsChangelogOpen,
		]
	);

	const leadingControl = isChangelogVisible ? (
		<TooltipOnHover content="Back" shortcuts={["Esc"]} side="right">
			<motion.div
				animate={{ opacity: 1, scale: 1 }}
				exit={{ opacity: 0, scale: 0.8 }}
				initial={{ opacity: 0, scale: 0.8 }}
				key="changelog-back"
				transition={{ duration: 0.1 }}
			>
				<Button
					className="mr-2 size-5.5 rounded-md hover:bg-background-200"
					onClick={() => {
						setIsChangelogOpen(false);
					}}
					size="icon-small"
					type="button"
					variant="ghost"
				>
					<Icon className="size-4 text-primary" name="arrow-left" />
					<span className="sr-only">Back</span>
				</Button>
			</motion.div>
		</TooltipOnHover>
	) : isDetailPageOpen ? (
		<TooltipOnHover content="Back" shortcuts={["Esc"]} side="right">
			<motion.div
				animate={{ opacity: 1, scale: 1 }}
				exit={{ opacity: 0, scale: 0.8 }}
				initial={{ opacity: 0, scale: 0.8 }}
				key="detail-back"
				transition={{ duration: 0.1 }}
			>
				<Button
					className="mr-2 size-5.5 rounded-md hover:bg-background-200"
					onClick={() => {
						void closeDetailPage();
					}}
					size="icon-small"
					type="button"
					variant="ghost"
				>
					<Icon className="size-4 text-primary" name="arrow-left" />
					<span className="sr-only">Back</span>
				</Button>
			</motion.div>
		</TooltipOnHover>
	) : isLiveVisitorsOverlayOpen ? (
		<TooltipOnHover content="Back" shortcuts={["Esc"]} side="right">
			<motion.div
				animate={{ opacity: 1, scale: 1 }}
				exit={{ opacity: 0, scale: 0.8 }}
				initial={{ opacity: 0, scale: 0.8 }}
				key="live-visitors-back"
				transition={{ duration: 0.1 }}
			>
				<Button
					className="mr-2 size-5.5 rounded-md hover:bg-background-200"
					onClick={() => {
						void closeLiveVisitorsOverlay();
					}}
					size="icon-small"
					type="button"
					variant="ghost"
				>
					<Icon className="size-4 text-primary" name="arrow-left" />
					<span className="sr-only">Back</span>
				</Button>
			</motion.div>
		</TooltipOnHover>
	) : isOnInboxView ? (
		<motion.div
			animate={{ opacity: 1, scale: 1 }}
			exit={{ opacity: 0, scale: 0.8 }}
			initial={{ opacity: 0, scale: 0.8 }}
			key="logo"
			transition={{ duration: 0.1 }}
		>
			<Link className="mr-2 block" href={baseInboxPath}>
				<Logo className="size-5.5 text-primary" />
			</Link>
		</motion.div>
	) : (
		<TooltipOnHover content="Back to Inbox" shortcuts={["Esc"]} side="right">
			<motion.div
				animate={{ opacity: 1, scale: 1 }}
				exit={{ opacity: 0, scale: 0.8 }}
				initial={{ opacity: 0, scale: 0.8 }}
				key="inbox-back"
				transition={{ duration: 0.1 }}
			>
				<Link
					className="mr-2 flex size-5.5 items-center justify-center rounded-md hover:bg-background-200"
					href={baseInboxPath}
				>
					<Icon className="size-4 text-primary" name="arrow-left" />
				</Link>
			</motion.div>
		</TooltipOnHover>
	);

	return (
		<header className="flex h-16 min-h-16 w-full items-center justify-between gap-4 pr-5 pl-6.5">
			<div className="flex flex-1 items-center gap-3">
				<AnimatePresence mode="wait">{leadingControl}</AnimatePresence>
				{latestRelease && (
					<ChangelogNotification
						date={latestRelease.date}
						description={latestRelease.description}
						onOpenChange={setIsChangelogOpen}
						open={isChangelogOpen}
						tinyExcerpt={latestRelease.tinyExcerpt}
						version={latestRelease.version}
					>
						{changelogContent}
					</ChangelogNotification>
				)}
			</div>
			<div className="flex items-center gap-2">
				<TopbarItem
					active={pathname.startsWith(`/${website?.slug}/agent`)}
					className="pr-1"
					hideLabelOnMobile
					href={
						hasAgent
							? `/${website?.slug}/agent`
							: `/${website?.slug}/agent/create`
					}
				>
					{hasAgent ? (
						<span className="flex items-center gap-1.5">Agent</span>
					) : (
						<span className="flex items-center gap-1.5">
							New agent
							<span className="rounded-sm bg-plasma-orange px-1.5 py-0.5 font-medium text-[10px] text-white leading-none">
								AI
							</span>
						</span>
					)}
				</TopbarItem>
				<TopbarItem
					active={pathname.startsWith(`/${website?.slug}/contacts`)}
					hideLabelOnMobile
					href={`/${website?.slug}/contacts`}
				>
					Contacts
				</TopbarItem>
				<Support side="bottom" sideOffset={8}>
					<Support.Trigger className="group/btn relative flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-primary/80 text-sm transition-colors hover:bg-background-300 hover:text-primary">
						{(props) => <DashboardTriggerContent {...props} />}
					</Support.Trigger>
				</Support>
			</div>
		</header>
	);
}
