"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { SidebarUpgradeButton } from "@/components/plan/sidebar-upgrade-button";
import { Separator } from "@/components/ui/separator";
import { useInboxes } from "@/contexts/inboxes";
import { useWebsite } from "@/contexts/website";
import { useTRPC } from "@/lib/trpc/client";
import { NavigationDropdown } from "../../../../navigation-dropdown";
import { SidebarContainer } from "../container";
import { ResizableSidebar } from "../resizable-sidebar";
import { SidebarItem } from "../sidebar-item";
import { SidebarSupportItem } from "../sidebar-support-item";

export function InboxNavigationSidebar() {
	const website = useWebsite();
	const pathname = usePathname();
	const { statusCounts } = useInboxes();
	const trpc = useTRPC();

	const basePath = `/${website.slug}/inbox`;

	// Fetch plan info for upgrade button
	const { data: planInfo } = useQuery({
		...trpc.plan.getPlanInfo.queryOptions({
			websiteSlug: website.slug,
		}),
	});

	// Helper to determine if a specific inbox section is active
	const isInboxActive = (section?: "resolved" | "spam" | "archived") => {
		const isInInboxPath = pathname.startsWith(basePath);

		if (!isInInboxPath) {
			return false;
		}

		if (section !== undefined) {
			return pathname.includes(`/${section}`);
		}

		// Main inbox is active when we're in the inbox path
		// but NOT in resolved, spam, or archived sections
		const excludedSections = ["/resolved", "/spam", "/archived"];
		return !excludedSections.some((excluded) => pathname.includes(excluded));
	};

	return (
		<ResizableSidebar position="left" sidebarTitle="Inbox navigation">
			<SidebarContainer
				footer={
					<>
						{planInfo && (
							<SidebarUpgradeButton
								planInfo={planInfo}
								websiteSlug={website.slug}
							/>
						)}
						<SidebarSupportItem />
						<SidebarItem href="/docs">Docs</SidebarItem>
						<SidebarItem href={`/${website.slug}/settings`}>
							Settings
						</SidebarItem>
						<Separator className="opacity-30" />
						<NavigationDropdown websiteSlug={website.slug} />
					</>
				}
			>
				<SidebarItem
					active={isInboxActive()}
					href={`${basePath}`}
					// iconName="conversation"
					rightItem={
						<span className="pr-1 text-primary/40 text-xs">
							{statusCounts.open}
						</span>
					}
				>
					Inbox
				</SidebarItem>
				<SidebarItem
					active={isInboxActive("resolved")}
					href={`${basePath}/resolved`}
					// iconName="conversation-resolved"
				>
					Resolved
				</SidebarItem>
				<SidebarItem
					active={isInboxActive("spam")}
					href={`${basePath}/spam`}
					// iconName="conversation-spam"
				>
					Spam
				</SidebarItem>
				<SidebarItem
					active={isInboxActive("archived")}
					href={`${basePath}/archived`}
					// iconName="archive"
				>
					Archived
				</SidebarItem>
			</SidebarContainer>
		</ResizableSidebar>
	);
}
