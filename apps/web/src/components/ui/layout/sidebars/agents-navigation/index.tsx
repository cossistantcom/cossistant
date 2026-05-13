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

export function AgentsNavigationSidebar() {
	const website = useWebsite();
	const pathname = usePathname();
	const trpc = useTRPC();
	const basePath = `/${website.slug}/agent`;
	const trainingPath = `${basePath}/training`;

	// Fetch plan info for upgrade button
	const { data: planInfo } = useQuery({
		...trpc.plan.getPlanInfo.queryOptions({
			websiteSlug: website.slug,
		}),
	});

	// Check if current path matches
	const isGeneralActive = pathname === basePath;
	const isBehaviourActive = pathname.startsWith(`${basePath}/behavior`);
	const isToolsActive =
		pathname.startsWith(`${basePath}/tools`) ||
		pathname.startsWith(`${basePath}/skills`);
	const isWebSourcesActive = pathname.startsWith(`${trainingPath}/web`);
	const isFaqActive = pathname.startsWith(`${trainingPath}/faq`);
	const isFilesActive = pathname.startsWith(`${trainingPath}/files`);

	return (
		<ResizableSidebar position="left" sidebarTitle="AI Agent">
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
				<div className="flex flex-col gap-1">
					<SidebarItem
						active={isGeneralActive}
						href={basePath}
						iconName="settings-2"
					>
						General
					</SidebarItem>
					<SidebarItem
						active={isBehaviourActive}
						href={`${basePath}/behavior`}
						iconName="command"
					>
						Behaviour
					</SidebarItem>
					<SidebarItem
						active={isToolsActive}
						href={`${basePath}/tools`}
						iconName="agent"
					>
						Tools & Skills
					</SidebarItem>
				</div>

				{/* Knowledge Section - open by default */}
				<SidebarItem
					defaultOpen
					iconName="book-open"
					items={[
						{
							label: "Web Sources",
							href: `${trainingPath}/web`,
							active: isWebSourcesActive,
						},
						{
							label: "FAQ",
							href: `${trainingPath}/faq`,
							active: isFaqActive,
						},
						{
							label: "Files",
							href: `${trainingPath}/files`,
							active: isFilesActive,
						},
					]}
				>
					Knowledge
				</SidebarItem>
			</SidebarContainer>
		</ResizableSidebar>
	);
}
