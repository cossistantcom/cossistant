"use client";

import type { RouterOutputs } from "@cossistant/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
	Ban,
	KeyRound,
	MoreHorizontal,
	RotateCcw,
	Shield,
	UserRound,
	X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Page, PageHeader, PageHeaderTitle } from "@/components/ui/layout";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { TooltipOnHover } from "@/components/ui/tooltip";
import { WebsiteImage } from "@/components/ui/website-image";
import { authClient } from "@/lib/auth/client";
import { formatFullDateTime, formatLastSeenAt } from "@/lib/date";
import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { useAdminUsersControls } from "./use-admin-users-controls";

type AdminUser = RouterOutputs["admin"]["listUsers"]["users"][number];
type UserWebsites = RouterOutputs["admin"]["getUserWebsites"]["organizations"];

const TABLE_SKELETON_ROWS = [0, 1, 2, 3, 4] as const;
const TABLE_SKELETON_COLUMNS = [0, 1, 2, 3, 4, 5, 6] as const;

type AdminPageContentProps = {
	websiteSlug: string;
};

export function AdminPageContent({ websiteSlug }: AdminPageContentProps) {
	const trpc = useTRPC();
	const { debouncedSearchTerm } = useAdminUsersControls();
	const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

	const listQuery = useQuery({
		...trpc.admin.listUsers.queryOptions({
			search: debouncedSearchTerm || undefined,
		}),
	});

	const users = listQuery.data?.users ?? [];
	const selectedUser = useMemo(
		() => users.find((user) => user.id === selectedUserId) ?? null,
		[users, selectedUserId]
	);

	const websitesQuery = useQuery({
		...trpc.admin.getUserWebsites.queryOptions({
			userId: selectedUserId ?? "",
		}),
		enabled: selectedUserId !== null,
	});

	return (
		<Page className="relative flex flex-col gap-6">
			<PageHeader className="bg-transparent dark:bg-transparent">
				<PageHeaderTitle>Admin</PageHeaderTitle>
			</PageHeader>

			<div className="grid min-h-0 flex-1 grid-cols-1 pt-14 lg:grid-cols-[minmax(0,1fr)_360px]">
				<ScrollArea
					className="min-h-0 px-4 pb-20"
					maskHeight="150px"
					orientation="both"
					scrollMask
				>
					<AdminUsersTable
						data={users}
						isLoading={listQuery.isLoading}
						onSelectUser={setSelectedUserId}
						selectedUserId={selectedUserId}
						websiteSlug={websiteSlug}
					/>
				</ScrollArea>
				<AdminUserDetailPanel
					isLoading={websitesQuery.isLoading}
					onClose={() => setSelectedUserId(null)}
					organizations={websitesQuery.data?.organizations ?? []}
					selectedUser={selectedUser}
				/>
			</div>
			<div className="absolute right-0 bottom-0 left-0 flex h-14 w-full items-center px-4">
				<p className="text-muted-foreground text-sm">
					{users.length === 0
						? "No users to display"
						: `Showing ${users.length} users`}
				</p>
			</div>
		</Page>
	);
}

type AdminUsersTableProps = {
	data: AdminUser[];
	isLoading: boolean;
	selectedUserId: string | null;
	onSelectUser: (userId: string) => void;
	websiteSlug: string;
};

export function AdminUsersTable({
	data,
	isLoading,
	selectedUserId,
	onSelectUser,
	websiteSlug,
}: AdminUsersTableProps) {
	if (isLoading) {
		return (
			<Table className="min-w-[980px]">
				<TableHeader>
					<AdminUsersHeader />
				</TableHeader>
				<TableBody>
					{TABLE_SKELETON_ROWS.map((row) => (
						<TableRow className="border-transparent border-b-0" key={row}>
							{TABLE_SKELETON_COLUMNS.map((column) => (
								<TableCell key={column}>
									<div className="h-4 w-full max-w-[160px] animate-pulse rounded bg-background-300" />
								</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</Table>
		);
	}

	if (data.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-3 px-10 py-16 text-center">
				<div className="space-y-1">
					<h3 className="font-semibold text-base">No users found</h3>
					<p className="text-muted-foreground text-sm">
						Try searching by another name or email address.
					</p>
				</div>
			</div>
		);
	}

	return (
		<Table className="min-w-[980px]">
			<TableHeader className="border-transparent border-b-0">
				<AdminUsersHeader />
			</TableHeader>
			<TableBody>
				{data.map((user) => {
					const isSelected = user.id === selectedUserId;

					return (
						<TableRow
							className="cursor-pointer border-transparent border-b-0 transition-colors focus-visible:outline-none focus-visible:ring-0"
							key={user.id}
							onClick={() => onSelectUser(user.id)}
							tabIndex={0}
						>
							<TableCell
								className={cn(
									"rounded-l-lg py-2",
									isSelected && "bg-background-300 dark:bg-background-400"
								)}
							>
								<div className="flex items-center gap-3">
									<Avatar
										className="size-8"
										fallbackName={user.name ?? user.email}
										lastOnlineAt={user.lastSeenAt}
										url={user.image}
									/>
									<span className="min-w-[120px] max-w-[200px] truncate font-medium text-sm">
										{user.name ?? "Unnamed user"}
									</span>
								</div>
							</TableCell>
							<TableCell
								className={cn(
									"py-2",
									isSelected && "bg-background-300 dark:bg-background-400"
								)}
							>
								<span className="max-w-[240px] truncate text-sm">
									{user.email}
								</span>
							</TableCell>
							<TableCell
								className={cn(
									"py-2",
									isSelected && "bg-background-300 dark:bg-background-400"
								)}
							>
								<Badge className="w-fit" variant="secondary">
									{user.role ?? "user"}
								</Badge>
							</TableCell>
							<TableCell
								className={cn(
									"py-2",
									isSelected && "bg-background-300 dark:bg-background-400"
								)}
							>
								{user.banned ? (
									<Badge className="w-fit" variant="destructive">
										Banned
									</Badge>
								) : (
									<span className="text-muted-foreground text-sm">Active</span>
								)}
							</TableCell>
							<TableCell
								className={cn(
									"py-2",
									isSelected && "bg-background-300 dark:bg-background-400"
								)}
							>
								<TooltipOnHover
									content={formatFullDateTime(new Date(user.createdAt))}
									delay={300}
								>
									<span className="cursor-default text-muted-foreground text-sm">
										{format(new Date(user.createdAt), "MMM d, yyyy")}
									</span>
								</TooltipOnHover>
							</TableCell>
							<TableCell
								className={cn(
									"py-2",
									isSelected && "bg-background-300 dark:bg-background-400"
								)}
							>
								{user.lastSeenAt ? (
									<TooltipOnHover
										content={formatFullDateTime(new Date(user.lastSeenAt))}
										delay={300}
									>
										<span className="cursor-default text-muted-foreground text-sm">
											{formatLastSeenAt(new Date(user.lastSeenAt))}
										</span>
									</TooltipOnHover>
								) : (
									<span className="text-muted-foreground/50 text-sm">
										Never
									</span>
								)}
							</TableCell>
							<TableCell
								className={cn(
									"rounded-r-lg py-2 text-right",
									isSelected && "bg-background-300 dark:bg-background-400"
								)}
								onClick={(event) => event.stopPropagation()}
							>
								<AdminUserActions user={user} websiteSlug={websiteSlug} />
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}

function AdminUsersHeader() {
	return (
		<TableRow className="border-transparent border-b-0">
			<TableHead className="w-[260px]">Name</TableHead>
			<TableHead className="w-[260px]">Email</TableHead>
			<TableHead className="w-[110px]">Role</TableHead>
			<TableHead className="w-[110px]">Status</TableHead>
			<TableHead className="w-[150px]">Signed up</TableHead>
			<TableHead className="w-[150px]">Last seen</TableHead>
			<TableHead className="w-[70px] text-right">Actions</TableHead>
		</TableRow>
	);
}

type AdminUserActionsProps = {
	user: AdminUser;
	websiteSlug: string;
};

function confirmAdminAction(message: string) {
	// biome-ignore lint/suspicious/noAlert: v1 keeps admin confirmations minimal while custom dialogs are still being designed.
	return window.confirm(message);
}

function AdminUserActions({ user, websiteSlug }: AdminUserActionsProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const router = useRouter();

	const invalidateUsers = () =>
		queryClient.invalidateQueries({
			queryKey: trpc.admin.listUsers.queryKey(),
		});

	const banMutation = useMutation(
		trpc.admin.banUser.mutationOptions({
			onSuccess: async () => {
				await invalidateUsers();
				toast.success("User banned");
			},
			onError: (error) => toast.error(error.message || "Failed to ban user"),
		})
	);

	const unbanMutation = useMutation(
		trpc.admin.unbanUser.mutationOptions({
			onSuccess: async () => {
				await invalidateUsers();
				toast.success("User unbanned");
			},
			onError: (error) => toast.error(error.message || "Failed to unban user"),
		})
	);

	const revokeMutation = useMutation(
		trpc.admin.revokeUserSessions.mutationOptions({
			onSuccess: () => toast.success("User sessions revoked"),
			onError: (error) =>
				toast.error(error.message || "Failed to revoke user sessions"),
		})
	);

	const impersonateMutation = useMutation(
		trpc.admin.impersonateUser.mutationOptions({
			onSuccess: async () => {
				authClient.$store.notify("$sessionSignal");
				toast.success("Impersonation started");
				router.push(`/${websiteSlug}`);
				router.refresh();
			},
			onError: (error) =>
				toast.error(error.message || "Failed to impersonate user"),
		})
	);

	const isPending =
		banMutation.isPending ||
		unbanMutation.isPending ||
		revokeMutation.isPending ||
		impersonateMutation.isPending;

	const handleBanToggle = () => {
		if (user.banned) {
			if (!confirmAdminAction(`Unban ${user.email}?`)) {
				return;
			}

			unbanMutation.mutate({ userId: user.id });
			return;
		}

		if (!confirmAdminAction(`Ban ${user.email}?`)) {
			return;
		}

		banMutation.mutate({ userId: user.id });
	};

	const handleRevokeSessions = () => {
		if (!confirmAdminAction(`Revoke all sessions for ${user.email}?`)) {
			return;
		}

		revokeMutation.mutate({ userId: user.id });
	};

	const handleImpersonate = () => {
		if (!confirmAdminAction(`Impersonate ${user.email}?`)) {
			return;
		}

		impersonateMutation.mutate({ userId: user.id });
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button disabled={isPending} size="icon-small" variant="ghost">
					<MoreHorizontal className="size-4" />
					<span className="sr-only">Open user actions</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={handleBanToggle}>
					{user.banned ? (
						<RotateCcw className="size-4" />
					) : (
						<Ban className="size-4" />
					)}
					{user.banned ? "Unban user" : "Ban user"}
				</DropdownMenuItem>
				<DropdownMenuItem onClick={handleRevokeSessions}>
					<KeyRound className="size-4" />
					Revoke sessions
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={handleImpersonate}>
					<UserRound className="size-4" />
					Impersonate
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

type AdminUserDetailPanelProps = {
	selectedUser: AdminUser | null;
	organizations: UserWebsites;
	isLoading: boolean;
	onClose: () => void;
};

export function AdminUserDetailPanel({
	selectedUser,
	organizations,
	isLoading,
	onClose,
}: AdminUserDetailPanelProps) {
	if (!selectedUser) {
		return (
			<aside className="hidden min-h-0 border-l bg-background-50 p-5 lg:block">
				<div className="flex h-full items-center justify-center text-center text-muted-foreground text-sm">
					Select a user to view their websites.
				</div>
			</aside>
		);
	}

	return (
		<aside className="min-h-0 border-l bg-background-50">
			<div className="flex h-14 items-center justify-between border-b px-4">
				<div className="flex min-w-0 items-center gap-2">
					<Shield className="size-4 shrink-0 text-muted-foreground" />
					<h2 className="truncate font-medium text-sm">{selectedUser.email}</h2>
				</div>
				<Button onClick={onClose} size="icon-small" variant="ghost">
					<X className="size-4" />
					<span className="sr-only">Close user detail</span>
				</Button>
			</div>
			<ScrollArea className="h-[calc(100%-3.5rem)] px-4 py-4" scrollMask>
				<div className="mb-5 flex items-center gap-3">
					<Avatar
						className="size-10"
						fallbackName={selectedUser.name ?? selectedUser.email}
						lastOnlineAt={selectedUser.lastSeenAt}
						url={selectedUser.image}
					/>
					<div className="min-w-0">
						<p className="truncate font-medium text-sm">
							{selectedUser.name ?? "Unnamed user"}
						</p>
						<p className="truncate text-muted-foreground text-xs">
							Joined{" "}
							{formatDistanceToNow(new Date(selectedUser.createdAt), {
								addSuffix: true,
							})}
						</p>
					</div>
				</div>

				{isLoading ? (
					<div className="space-y-3">
						{Array.from({ length: 3 }, (_, index) => (
							<div
								className="h-12 animate-pulse rounded bg-background-200"
								key={index}
							/>
						))}
					</div>
				) : organizations.length === 0 ? (
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
		</aside>
	);
}

export default AdminPageContent;
