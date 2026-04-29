"use client";

import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { NavigationDropdown } from "@/components/navigation-dropdown";
import { SidebarUpgradeButton } from "@/components/plan/sidebar-upgrade-button";
import { Input } from "@/components/ui/input";
import { SidebarContainer } from "@/components/ui/layout/sidebars/container";
import { ResizableSidebar } from "@/components/ui/layout/sidebars/resizable-sidebar";
import { SidebarItem } from "@/components/ui/layout/sidebars/sidebar-item";
import { Separator } from "@/components/ui/separator";
import { useWebsite } from "@/contexts/website";
import { useTRPC } from "@/lib/trpc/client";
import { useAdminUsersControls } from "./use-admin-users-controls";

export function AdminNavigationSidebar() {
	const website = useWebsite();
	const trpc = useTRPC();
	const { searchTerm, setSearchTerm } = useAdminUsersControls();

	const { data: planInfo } = useQuery({
		...trpc.plan.getPlanInfo.queryOptions({
			websiteSlug: website.slug,
		}),
	});

	return (
		<ResizableSidebar position="left" sidebarTitle="Admin">
			<SidebarContainer
				footer={
					<>
						{planInfo && (
							<SidebarUpgradeButton
								planInfo={planInfo}
								websiteSlug={website.slug}
							/>
						)}
						<SidebarItem href="/docs">Docs</SidebarItem>
						<SidebarItem href={`/${website.slug}/settings`}>
							Settings
						</SidebarItem>
						<Separator className="opacity-30" />
						<NavigationDropdown websiteSlug={website.slug} />
					</>
				}
			>
				<div className="flex flex-col gap-2">
					<div className="flex h-10 items-center pl-2">
						<p className="text-sm">User search</p>
					</div>
					<Input
						containerClassName="max-w-xs pl-1"
						onChange={(event) => setSearchTerm(event.target.value)}
						placeholder="Search by name or email"
						prepend={<Search className="ml-1 h-4 w-4 text-muted-foreground" />}
						value={searchTerm}
					/>
				</div>
			</SidebarContainer>
		</ResizableSidebar>
	);
}
