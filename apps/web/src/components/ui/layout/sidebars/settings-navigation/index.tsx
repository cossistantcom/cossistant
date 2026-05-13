"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { SidebarUpgradeButton } from "@/components/plan/sidebar-upgrade-button";
import { Separator } from "@/components/ui/separator";
import { useWebsite } from "@/contexts/website";
import { useTRPC } from "@/lib/trpc/client";
import { NavigationDropdown } from "../../../../navigation-dropdown";
import { SidebarContainer } from "../container";
import { ResizableSidebar } from "../resizable-sidebar";
import { SidebarItem } from "../sidebar-item";
import { SidebarSupportItem } from "../sidebar-support-item";

export function SettingsNavigationSidebar() {
	const website = useWebsite();
	const pathname = usePathname();
	const trpc = useTRPC();

	const basePath = `/${website.slug}/settings`;

	// Fetch plan info for upgrade button
	const { data: planInfo } = useQuery({
		...trpc.plan.getPlanInfo.queryOptions({
			websiteSlug: website.slug,
		}),
	});

	return (
		<ResizableSidebar position="left" sidebarTitle="Settings">
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
						<Separator className="opacity-30" />
						<NavigationDropdown websiteSlug={website.slug} />
					</>
				}
			>
				<SidebarItem
					active={
						pathname.includes(basePath) && !pathname.includes(`${basePath}/`)
					}
					href={basePath}
					iconName="settings-2"
				>
					General
				</SidebarItem>
				<SidebarItem
					active={pathname.includes(`${basePath}/notifications`)}
					href={`${basePath}/notifications`}
					iconName="notifications"
				>
					Notifications
				</SidebarItem>
				<SidebarItem
					active={pathname.includes(`${basePath}/team`)}
					href={`${basePath}/team`}
					iconName="contacts"
				>
					Team
				</SidebarItem>
				<SidebarItem
					active={pathname.includes(`${basePath}/usage`)}
					href={`${basePath}/plan`}
					iconName="wallet"
				>
					Plan & Usage
				</SidebarItem>
				<SidebarItem
					active={pathname.includes(`${basePath}/developers`)}
					href={`${basePath}/developers`}
					iconName="cli"
				>
					Developers
				</SidebarItem>
			</SidebarContainer>
		</ResizableSidebar>
	);
}
