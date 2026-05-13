"use client";

import type { ContactListVisitorStatus } from "@cossistant/types";
import { useQuery } from "@tanstack/react-query";
import { Search, SortAsc, SortDesc } from "lucide-react";
import { SidebarUpgradeButton } from "@/components/plan/sidebar-upgrade-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidebarContainer } from "@/components/ui/layout/sidebars/container";
import { ResizableSidebar } from "@/components/ui/layout/sidebars/resizable-sidebar";
import { SidebarItem } from "@/components/ui/layout/sidebars/sidebar-item";
import { SidebarSupportItem } from "@/components/ui/layout/sidebars/sidebar-support-item";
import { Separator } from "@/components/ui/separator";
import {
	type ContactSortField,
	useContactsTableControls,
} from "@/contexts/contacts-table-controls";
import { useWebsite } from "@/contexts/website";
import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { NavigationDropdown } from "../../../../navigation-dropdown";

const VISITOR_FILTER_OPTIONS: ReadonlyArray<{
	value: ContactListVisitorStatus;
	title: string;
	description: string;
}> = [
	{
		value: "all",
		title: "All contacts",
		description: "Include every contact",
	},
	{
		value: "withVisitors",
		title: "Linked visitors",
		description: "Contacts with at least one visitor",
	},
	{
		value: "withoutVisitors",
		title: "No visitors",
		description: "Contacts without any visitor",
	},
];

const DEFAULT_VISITOR_STATUS: ContactListVisitorStatus = "all";

const SORT_FIELD_OPTIONS: Array<{ value: ContactSortField; label: string }> = [
	{ value: "updatedAt", label: "Last updated" },
	{ value: "createdAt", label: "Created" },
	{ value: "lastSeenAt", label: "Last seen" },
	{ value: "name", label: "Name" },
	{ value: "email", label: "Email" },
	{ value: "visitorCount", label: "Visitor count" },
];

type FilterOptionButtonProps = {
	title: string;
	description: string;
	isSelected: boolean;
	onClick: () => void;
};

function FilterOptionButton({
	title,
	description,
	isSelected,
	onClick,
}: FilterOptionButtonProps) {
	return (
		<button
			aria-pressed={isSelected}
			className={cn(
				"group flex w-full flex-col gap-1 rounded-md border border-input px-3 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40 focus-visible:outline-offset-2",
				isSelected ? "bg-background-200" : "hover:bg-background-200"
			)}
			onClick={onClick}
			type="button"
		>
			<div className="flex items-center gap-2 font-medium text-sm">
				{title}
				<span
					className={cn(
						"size-1.5 rounded-full bg-cossistant-orange text-primary transition-opacity",
						isSelected ? "opacity-100" : "opacity-0"
					)}
				/>
			</div>
			<span className="text-muted-foreground text-xs">{description}</span>
		</button>
	);
}

export function ContactsNavigationSidebar() {
	const website = useWebsite();
	const {
		sorting,
		setSorting,
		visitorStatus,
		setVisitorStatus,
		searchTerm,
		setSearchTerm,
	} = useContactsTableControls();

	const trpc = useTRPC();
	const { data: planInfo } = useQuery({
		...trpc.plan.getPlanInfo.queryOptions({
			websiteSlug: website.slug,
		}),
	});

	const activeSort = sorting[0] ?? { id: "updatedAt", desc: true };
	const sortField = (activeSort.id as ContactSortField) ?? "updatedAt";
	const sortOrder = activeSort.desc ? "desc" : "asc";

	const handleSortFieldChange = (value: string) => {
		if (!value) {
			return;
		}

		const nextField = value as ContactSortField;
		setSorting([{ id: nextField, desc: sortOrder === "desc" }]);
	};

	const handleSortOrderChange = (value: string) => {
		if (!value) {
			return;
		}

		setSorting([{ id: sortField, desc: value === "desc" }]);
	};

	return (
		<ResizableSidebar position="left" sidebarTitle="Contacts">
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
					<div className="flex h-10 items-center justify-between pl-2">
						<p className="flex items-center gap-2 text-sm">Filters</p>
						<Button
							className="h-auto px-2 py-1 text-xs opacity-50 hover:opacity-100"
							onClick={() => setVisitorStatus(DEFAULT_VISITOR_STATUS)}
							variant="ghost"
						>
							Reset
						</Button>
					</div>
					<div className="space-y-2">
						<Input
							containerClassName="max-w-xs pl-1"
							onChange={(event) => setSearchTerm(event.target.value)}
							placeholder="Search by name or email"
							prepend={
								<Search className="ml-1 h-4 w-4 text-muted-foreground" />
							}
							value={searchTerm}
						/>
						{/* {VISITOR_FILTER_OPTIONS.map((option) => (
              <FilterOptionButton
                description={option.description}
                isSelected={visitorStatus === option.value}
                key={option.value}
                onClick={() => setVisitorStatus(option.value)}
                title={option.title}
              />
            ))} */}
					</div>

					{/* <p className="mt-4 mb-2 px-2 text-primary text-sm">Ordering</p>
          <Select onValueChange={handleSortFieldChange} value={sortField}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_FIELD_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select> */}
					{/* <ToggleGroup
            className="mt-1 w-full"
            onValueChange={handleSortOrderChange}
            type="single"
            value={sortOrder}
            variant="outline"
          >
            <ToggleGroupItem className="flex-1" value="asc">
              <div className="flex items-center justify-center gap-1 text-xs">
                <SortAsc className="h-3.5 w-3.5" />
                <span>Asc</span>
              </div>
            </ToggleGroupItem>
            <ToggleGroupItem className="flex-1" value="desc">
              <div className="flex items-center justify-center gap-1 text-xs">
                <SortDesc className="h-3.5 w-3.5" />
                <span>Desc</span>
              </div>
            </ToggleGroupItem>
          </ToggleGroup> */}
				</div>
			</SidebarContainer>
		</ResizableSidebar>
	);
}
