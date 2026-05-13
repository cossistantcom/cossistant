"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useTransition } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { switchWebsite } from "@/app/actions/switch-website";
import { Avatar } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Icon from "@/components/ui/icons";
import { WebsiteImage } from "@/components/ui/website-image";
import { useOrganizationWebsites, useWebsite } from "@/contexts/website";
import { useOrganizationRole } from "@/hooks/use-organization-role";
import { authClient, signOut } from "@/lib/auth/client";
import { resolveDashboardHumanAgentDisplay } from "@/lib/human-agent-display";
import { useTRPC } from "@/lib/trpc/client";

type NavigationDropdownProps = {
	websiteSlug: string;
};

export function NavigationDropdown({ websiteSlug }: NavigationDropdownProps) {
	const router = useRouter();
	const trpc = useTRPC();
	const { data: session } = authClient.useSession();
	const { setTheme, resolvedTheme } = useTheme();
	const website = useWebsite();
	const organizationWebsites = useOrganizationWebsites();
	const { canCreateWebsite } = useOrganizationRole();
	const [isPending, startTransition] = useTransition();

	const user = session?.user ?? null;
	const userEmail = user?.email ?? "";
	const userDisplay = resolveDashboardHumanAgentDisplay({
		id: user?.id ?? "current-user",
		name: user?.name ?? null,
	});
	const userAvatarUrl = user?.image ?? null;

	const websiteName = website?.name ?? "";
	const websiteLogoUrl = website?.logoUrl ?? null;
	const organizationSlug = website?.organizationSlug ?? "";

	// Fetch plans for all websites in the organization
	const { data: websitePlans } = useQuery({
		...trpc.plan.getPlansForOrganization.queryOptions({
			organizationId: website?.organizationId ?? "",
		}),
		enabled: !!website?.organizationId,
	});

	// Find the plan for the current website
	const currentWebsitePlan = websitePlans?.find(
		(plan) => plan.websiteId === website?.id
	);

	useHotkeys(
		["m"],
		(_, handler) => {
			switch (handler.keys?.join("")) {
				case "m":
					setTheme(resolvedTheme === "dark" ? "light" : "dark");
					break;
				default:
					break;
			}
		},
		{
			preventDefault: true,
			enableOnContentEditable: false,
			enableOnFormTags: false,
		}
	);

	const handleSwitchWebsite = async (targetWebsiteId: string) => {
		startTransition(async () => {
			try {
				const slug = await switchWebsite(targetWebsiteId);
				router.push(`/${slug}/inbox`);
			} catch (error) {
				console.error("Failed to switch website:", error);
			}
		});
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					className="group flex items-center gap-1 rounded px-3 py-2.5 text-left text-primary/80 text-sm hover:cursor-pointer hover:bg-background-200 hover:text-primary disabled:opacity-50 dark:hover:bg-background-300"
					disabled={!user || isPending}
					type="button"
				>
					<WebsiteImage
						className="size-5"
						logoUrl={websiteLogoUrl}
						name={websiteName}
					/>
					<div className="flex flex-1 items-center gap-2 pl-2 text-left text-sm leading-tight">
						<span className="truncate">{websiteName}</span>
						{currentWebsitePlan && (
							<span className="truncate rounded bg-background-500 px-1 text-muted-foreground text-xs">
								{currentWebsitePlan.displayName}
							</span>
						)}
					</div>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
				side="top"
				sideOffset={4}
			>
				<DropdownMenuLabel className="flex items-center gap-3 px-2 py-1.5">
					<Avatar
						className="size-6"
						facehashSeed={userDisplay.facehashSeed}
						fallbackName={userDisplay.displayName}
						url={userAvatarUrl}
					/>
					<div className="grid flex-1 text-left text-xs leading-tight">
						<span className="truncate font-medium">
							{userDisplay.displayName}
						</span>
						<span className="truncate text-muted-foreground text-xs">
							{userEmail}
						</span>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />

				<DropdownMenuGroup>
					<DropdownMenuLabel className="px-2 py-1.5 font-normal text-primary/50 text-xs">
						Websites
					</DropdownMenuLabel>
					{organizationWebsites.map((site) => (
						<DropdownMenuItem
							className="justify-between"
							disabled={isPending}
							key={site.id}
							onSelect={() => {
								if (site.id !== website?.id) {
									handleSwitchWebsite(site.id);
								}
							}}
						>
							<div className="relative flex w-full items-center gap-2">
								<WebsiteImage
									className="mx-1 size-4"
									logoUrl={site.logoUrl}
									name={site.name}
								/>
								<span className="w-full truncate">{site.name}</span>
								{site.id === website?.id && (
									<Icon
										className="absolute right-1 size-4 text-primary"
										name="check"
									/>
								)}
							</div>
						</DropdownMenuItem>
					))}
					{canCreateWebsite && (
						<DropdownMenuItem
							className="text-primary/70 hover:text-primary"
							onSelect={() => router.push(`/welcome/${organizationSlug}`)}
						>
							<Icon className="mx-1.5 size-4" name="plus" />
							Create website
						</DropdownMenuItem>
					)}
				</DropdownMenuGroup>

				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem onSelect={() => router.push("/docs")}>
						<Icon className="mx-1.5 size-4" filledOnHover name="docs" />
						Docs
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => router.push(`/${websiteSlug}/billing`)}
					>
						<Icon className="mx-1.5 size-4" filledOnHover name="card" />
						Billing
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => router.push(`/${websiteSlug}/settings`)}
					>
						<Icon className="mx-1.5 size-4" filledOnHover name="settings" />
						Settings
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onSelect={(e) => {
						e.preventDefault();
						e.stopPropagation();
						setTheme(resolvedTheme === "dark" ? "light" : "dark");
					}}
					shortcuts={["M"]}
				>
					<Icon
						className="mx-1.5 size-4"
						filledOnHover
						name={resolvedTheme === "dark" ? "sun" : "moon"}
					/>
					Toggle theme
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onSelect={async () => {
						await signOut();
						router.replace("/");
					}}
				>
					<Icon className="mx-1.5 size-4" filledOnHover name="logout" />
					Log out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export default NavigationDropdown;
