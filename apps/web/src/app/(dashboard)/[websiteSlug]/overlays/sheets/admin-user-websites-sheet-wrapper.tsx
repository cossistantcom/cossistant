"use client";

import type { RouterOutputs } from "@cossistant/api/types";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { WebsiteImage } from "@/components/ui/website-image";
import { useTRPC } from "@/lib/trpc/client";

type AdminUserWebsites =
	RouterOutputs["admin"]["getUserWebsites"]["organizations"];
type AdminUser = RouterOutputs["admin"]["getUserWebsites"]["user"];

type AdminUserWebsitesSheetWrapperProps = {
	userId: string;
	onClose: () => void;
};

type AdminUserWebsitesSheetProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	user: AdminUser | null;
	organizations: AdminUserWebsites;
	isLoading: boolean;
	isError: boolean;
};

export function AdminUserWebsitesSheetWrapper({
	userId,
	onClose,
}: AdminUserWebsitesSheetWrapperProps) {
	const trpc = useTRPC();
	const userWebsitesQuery = useQuery({
		...trpc.admin.getUserWebsites.queryOptions({
			userId,
		}),
	});

	return (
		<AdminUserWebsitesSheet
			isError={userWebsitesQuery.isError}
			isLoading={userWebsitesQuery.isLoading}
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
			open
			organizations={userWebsitesQuery.data?.organizations ?? []}
			user={userWebsitesQuery.data?.user ?? null}
		/>
	);
}

export function AdminUserWebsitesSheet({
	open,
	onOpenChange,
	user,
	organizations,
	isLoading,
	isError,
}: AdminUserWebsitesSheetProps) {
	return (
		<Sheet onOpenChange={onOpenChange} open={open}>
			<SheetContent className="w-full bg-background sm:max-w-md">
				<SheetHeader>
					<SheetTitle>User websites</SheetTitle>
					<SheetDescription>
						Organizations and active websites available to this user.
					</SheetDescription>
				</SheetHeader>
				<AdminUserWebsitesSheetContent
					isError={isError}
					isLoading={isLoading}
					organizations={organizations}
					user={user}
				/>
			</SheetContent>
		</Sheet>
	);
}

function AdminUserWebsitesSheetContent({
	user,
	organizations,
	isLoading,
	isError,
}: {
	user: AdminUser | null;
	organizations: AdminUserWebsites;
	isLoading: boolean;
	isError: boolean;
}) {
	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<Spinner className="size-6" />
			</div>
		);
	}

	if (isError) {
		return (
			<Alert className="m-4" variant="destructive">
				<AlertTitle>Unable to load user websites</AlertTitle>
				<AlertDescription>
					An unexpected error occurred while retrieving this user.
				</AlertDescription>
			</Alert>
		);
	}

	if (!user) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground text-sm">
				User not found.
			</div>
		);
	}

	return (
		<ScrollArea className="h-full px-4 pb-8" scrollMask>
			<div className="mb-5 flex items-center gap-3">
				<Avatar
					className="size-10"
					fallbackName={user.name ?? user.email}
					lastOnlineAt={user.lastSeenAt}
					url={user.image}
				/>
				<div className="min-w-0">
					<p className="truncate font-medium text-sm">
						{user.name ?? "Unnamed user"}
					</p>
					<p className="truncate text-muted-foreground text-xs">{user.email}</p>
					<p className="truncate text-muted-foreground text-xs">
						Joined{" "}
						{formatDistanceToNow(new Date(user.createdAt), {
							addSuffix: true,
						})}
					</p>
				</div>
			</div>

			{organizations.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					This user does not have access to any active websites.
				</p>
			) : (
				<div className="space-y-5">
					{organizations.map((org) => (
						<section key={org.id}>
							<div className="mb-2 flex items-center justify-between gap-2">
								<h3 className="truncate font-medium text-sm">{org.name}</h3>
								<Badge className="shrink-0" variant="secondary">
									{org.role ?? "team"}
								</Badge>
							</div>
							<div className="space-y-1">
								{org.websites.length === 0 ? (
									<p className="text-muted-foreground text-xs">
										No active websites.
									</p>
								) : (
									org.websites.map((site) => (
										<Link
											className="flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-background-200"
											href={`/${site.slug}`}
											key={site.id}
										>
											<WebsiteImage
												className="size-8"
												logoUrl={site.logoUrl}
												name={site.name}
											/>
											<span className="min-w-0 flex-1">
												<span className="block truncate font-medium">
													{site.name}
												</span>
												<span className="block truncate text-muted-foreground text-xs">
													{site.domain}
												</span>
											</span>
										</Link>
									))
								)}
							</div>
						</section>
					))}
				</div>
			)}
		</ScrollArea>
	);
}
