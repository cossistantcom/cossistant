"use client";

import { useQuery } from "@tanstack/react-query";
import { Globe2, Search, Users } from "lucide-react";
import { NavigationDropdown } from "@/components/navigation-dropdown";
import { SidebarUpgradeButton } from "@/components/plan/sidebar-upgrade-button";
import { Input } from "@/components/ui/input";
import { SidebarContainer } from "@/components/ui/layout/sidebars/container";
import { ResizableSidebar } from "@/components/ui/layout/sidebars/resizable-sidebar";
import { SidebarItem } from "@/components/ui/layout/sidebars/sidebar-item";
import { SidebarSupportItem } from "@/components/ui/layout/sidebars/sidebar-support-item";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Separator } from "@/components/ui/separator";
import { useWebsite } from "@/contexts/website";
import { useTRPC } from "@/lib/trpc/client";
import { useAdminUsersControls } from "./use-admin-users-controls";

export function AdminNavigationSidebar() {
	const website = useWebsite();
	const trpc = useTRPC();
	const { adminView, searchTerm, setAdminView, setSearchTerm } =
		useAdminUsersControls();

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
				<div className="flex flex-col gap-2">
					<div className="flex h-10 items-center pl-2">
						<p className="text-sm">Manage</p>
					</div>
					<SegmentedControl
						aria-label="Admin view"
						className="mx-1 w-[calc(100%-0.5rem)]"
						onValueChange={setAdminView}
						options={[
							{
								value: "users",
								label: (
									<span className="flex items-center gap-1.5">
										<Users className="size-3.5" />
										Users
									</span>
								),
							},
							{
								value: "websites",
								label: (
									<span className="flex items-center gap-1.5">
										<Globe2 className="size-3.5" />
										Websites
									</span>
								),
							},
						]}
						size="sm"
						value={adminView}
					/>
					<Input
						containerClassName="max-w-xs pl-1"
						onChange={(event) => setSearchTerm(event.target.value)}
						placeholder={
							adminView === "users"
								? "Search by name or email"
								: "Search by site, slug, domain"
						}
						prepend={<Search className="ml-1 h-4 w-4 text-muted-foreground" />}
						value={searchTerm}
					/>
				</div>
			</SidebarContainer>
		</ResizableSidebar>
	);
}
