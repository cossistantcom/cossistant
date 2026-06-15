"use client";

import type { RouterOutputs } from "@cossistant/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
	Ban,
	Gift,
	KeyRound,
	MoreHorizontal,
	RotateCcw,
	Trash2,
	UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
import {
	formatAiCreditAmount,
	getAiCreditUsageView,
} from "../settings/plan/ai-credit-usage";
import { NumericConfirmationSheet } from "./numeric-confirmation-sheet";
import { useAdminUsersControls } from "./use-admin-users-controls";

type AdminUser = RouterOutputs["admin"]["listUsers"]["users"][number];
type AdminWebsite = RouterOutputs["admin"]["listWebsites"]["websites"][number];
type AdminWebsiteAiUsage = RouterOutputs["admin"]["getWebsiteAiUsage"];

const TABLE_SKELETON_ROWS = [0, 1, 2, 3, 4] as const;
const TABLE_SKELETON_COLUMNS = [0, 1, 2, 3, 4, 5, 6] as const;

type AdminPageContentProps = {
	websiteSlug: string;
};

export function AdminPageContent({ websiteSlug }: AdminPageContentProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { adminView, debouncedSearchTerm } = useAdminUsersControls();
	const [adminUserId, setAdminUserId] = useQueryState(
		"adminUserId",
		parseAsString
	);
	const [grantTarget, setGrantTarget] = useState<AdminWebsite | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<AdminWebsite | null>(null);

	const listQuery = useQuery({
		...trpc.admin.listUsers.queryOptions({
			search: debouncedSearchTerm || undefined,
		}),
		enabled: adminView === "users",
	});

	const websitesQuery = useQuery({
		...trpc.admin.listWebsites.queryOptions({
			search: debouncedSearchTerm || undefined,
		}),
		enabled: adminView === "websites",
	});

	const grantMutation = useMutation(
		trpc.admin.grantWebsiteAiUsage.mutationOptions({
			onSuccess: async () => {
				const target = grantTarget;
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: trpc.admin.listWebsites.queryKey(),
					}),
					target
						? queryClient.invalidateQueries({
								queryKey: trpc.plan.getPlanInfo.queryKey({
									websiteSlug: target.slug,
								}),
							})
						: Promise.resolve(),
					target
						? queryClient.invalidateQueries({
								queryKey: trpc.admin.getWebsiteAiUsage.queryKey({
									websiteId: target.id,
								}),
							})
						: Promise.resolve(),
				]);
				toast.success("AI usage granted");
				setGrantTarget(null);
			},
			onError: (error) =>
				toast.error(error.message || "Failed to grant AI usage"),
		})
	);

	const deleteMutation = useMutation(
		trpc.admin.deleteWebsiteForever.mutationOptions({
			onSuccess: async (result) => {
				await queryClient.invalidateQueries({
					queryKey: trpc.admin.listWebsites.queryKey(),
				});
				toast.success(
					result.organizationDeleted
						? "Website and organization deleted forever."
						: "Website deleted forever."
				);
				setDeleteTarget(null);
			},
			onError: (error) =>
				toast.error(error.message || "Failed to delete website."),
		})
	);

	const users = listQuery.data?.users ?? [];
	const websites = websitesQuery.data?.websites ?? [];
	const visibleCount = adminView === "users" ? users.length : websites.length;

	return (
		<Page className="relative flex flex-col gap-6">
			<PageHeader className="bg-transparent dark:bg-transparent">
				<PageHeaderTitle>Admin</PageHeaderTitle>
			</PageHeader>

			<div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-14">
				<ScrollArea
					className="min-h-0 flex-1 px-4 pb-20"
					maskHeight="150px"
					orientation="both"
					scrollMask
				>
					{adminView === "users" ? (
						<AdminUsersTable
							data={users}
							isLoading={listQuery.isLoading}
							onSelectUser={(userId) => {
								void setAdminUserId(userId);
							}}
							selectedUserId={adminUserId ?? null}
							websiteSlug={websiteSlug}
						/>
					) : (
						<AdminWebsitesTable
							data={websites}
							isLoading={websitesQuery.isLoading}
							onDeleteForever={setDeleteTarget}
							onGrantAiUsage={setGrantTarget}
						/>
					)}
				</ScrollArea>
			</div>
			<AdminGrantAiUsageSheet
				isPending={grantMutation.isPending}
				onConfirm={(amount) => {
					if (!grantTarget) {
						return;
					}

					grantMutation.mutate({
						websiteId: grantTarget.id,
						amount,
					});
				}}
				onOpenChange={(open) => {
					if (!open) {
						setGrantTarget(null);
					}
				}}
				open={grantTarget !== null}
				website={grantTarget}
			/>
			<AdminDeleteWebsiteDialog
				isPending={deleteMutation.isPending}
				onConfirm={(input) => {
					deleteMutation.mutate(input);
				}}
				onOpenChange={(open) => {
					if (!open) {
						setDeleteTarget(null);
					}
				}}
				open={deleteTarget !== null}
				website={deleteTarget}
			/>
			<div className="absolute right-0 bottom-0 left-0 flex h-14 w-full items-center px-4">
				<p className="text-muted-foreground text-sm">
					{visibleCount === 0
						? `No ${adminView} to display`
						: `Showing ${visibleCount} ${adminView}`}
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

type AdminWebsitesTableProps = {
	data: AdminWebsite[];
	isLoading: boolean;
	onDeleteForever: (website: AdminWebsite) => void;
	onGrantAiUsage: (website: AdminWebsite) => void;
};

export function AdminWebsitesTable({
	data,
	isLoading,
	onDeleteForever,
	onGrantAiUsage,
}: AdminWebsitesTableProps) {
	if (isLoading) {
		return (
			<Table className="min-w-[980px]">
				<TableHeader>
					<AdminWebsitesHeader />
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
					<h3 className="font-semibold text-base">No websites found</h3>
					<p className="text-muted-foreground text-sm">
						Try searching by another site, slug, domain, or organization.
					</p>
				</div>
			</div>
		);
	}

	return (
		<Table className="min-w-[980px]">
			<TableHeader className="border-transparent border-b-0">
				<AdminWebsitesHeader />
			</TableHeader>
			<TableBody>
				{data.map((site) => (
					<TableRow
						className="border-transparent border-b-0 transition-colors"
						key={site.id}
					>
						<TableCell className="rounded-l-lg py-2">
							<Link
								className="flex min-w-0 items-center gap-3 hover:text-primary"
								href={`/${site.slug}`}
							>
								<WebsiteImage
									className="size-8"
									logoUrl={site.logoUrl}
									name={site.name}
								/>
								<span className="min-w-0">
									<span className="block truncate font-medium text-sm">
										{site.name}
									</span>
									<span className="block truncate text-muted-foreground text-xs">
										/{site.slug}
									</span>
								</span>
							</Link>
						</TableCell>
						<TableCell className="py-2">
							<span className="max-w-[220px] truncate text-sm">
								{site.domain}
							</span>
						</TableCell>
						<TableCell className="py-2">
							<span className="max-w-[220px] truncate text-sm">
								{site.organizationName}
							</span>
						</TableCell>
						<TableCell className="py-2">
							<Badge className="w-fit" variant="secondary">
								{site.status}
							</Badge>
						</TableCell>
						<TableCell className="py-2">
							<TooltipOnHover
								content={formatFullDateTime(new Date(site.createdAt))}
								delay={300}
							>
								<span className="cursor-default text-muted-foreground text-sm">
									{format(new Date(site.createdAt), "MMM d, yyyy")}
								</span>
							</TooltipOnHover>
						</TableCell>
						<TableCell className="rounded-r-lg py-2 text-right">
							<AdminWebsiteActions
								onDeleteForever={() => onDeleteForever(site)}
								onGrantAiUsage={() => onGrantAiUsage(site)}
							/>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

function AdminWebsitesHeader() {
	return (
		<TableRow className="border-transparent border-b-0">
			<TableHead className="w-[280px]">Website</TableHead>
			<TableHead className="w-[230px]">Domain</TableHead>
			<TableHead className="w-[230px]">Organization</TableHead>
			<TableHead className="w-[110px]">Status</TableHead>
			<TableHead className="w-[150px]">Created</TableHead>
			<TableHead className="w-[70px] text-right">Actions</TableHead>
		</TableRow>
	);
}

function AdminWebsiteActions({
	onDeleteForever,
	onGrantAiUsage,
}: {
	onDeleteForever: () => void;
	onGrantAiUsage: () => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button size="icon-small" variant="ghost">
					<MoreHorizontal className="size-4" />
					<span className="sr-only">Open website actions</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={onGrantAiUsage}>
					<Gift className="size-4" />
					Grant AI usage
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={onDeleteForever} variant="destructive">
					<Trash2 className="size-4" />
					Delete forever
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function AdminDeleteWebsiteDialog({
	website,
	open,
	isPending,
	onOpenChange,
	onConfirm,
}: {
	website: AdminWebsite | null;
	open: boolean;
	isPending: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (input: {
		websiteId: string;
		confirmationSlug: string;
		deleteOrganization: boolean;
	}) => void;
}) {
	const trpc = useTRPC();
	const [confirmationInput, setConfirmationInput] = useState("");
	const [deleteOrganization, setDeleteOrganization] = useState(false);
	const previewQuery = useQuery({
		...trpc.admin.getWebsiteDeletionPreview.queryOptions({
			websiteId: website?.id ?? "",
		}),
		enabled: open && Boolean(website?.id),
	});

	const preview = previewQuery.data ?? null;
	const activeWebsiteCount = preview?.organization.activeWebsiteCount ?? null;
	const hasOtherActiveWebsites =
		typeof activeWebsiteCount === "number" && activeWebsiteCount > 1;
	const canDeleteOrganization =
		Boolean(preview) && !previewQuery.isError && !hasOtherActiveWebsites;
	const shouldDeleteOrganization = deleteOrganization && canDeleteOrganization;
	const isConfirmed = Boolean(
		website && confirmationInput.trim() === website.slug
	);

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			setConfirmationInput("");
			setDeleteOrganization(false);
		}
		onOpenChange(nextOpen);
	};

	const handleDelete = () => {
		if (!(website && isConfirmed)) {
			return;
		}

		onConfirm({
			websiteId: website.id,
			confirmationSlug: confirmationInput.trim(),
			deleteOrganization: shouldDeleteOrganization,
		});
	};

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Delete website forever</DialogTitle>
					<DialogDescription>
						This permanently removes the website data and removes organization
						members from the Resend audience.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="rounded border border-destructive/30 bg-destructive/5 p-4">
						<p className="font-medium text-destructive text-sm">
							{website?.name ?? "This website"} will be deleted forever.
						</p>
						<p className="mt-1 text-destructive/80 text-sm">
							This includes conversations, visitors, contacts, knowledge,
							agents, API keys, and uploaded files scoped to the website.
						</p>
					</div>

					<div className="space-y-2">
						<label
							className="font-medium text-sm"
							htmlFor="admin-delete-website-confirmation"
						>
							Type{" "}
							<span className="font-mono">
								{website?.slug ?? "website-slug"}
							</span>{" "}
							to confirm
						</label>
						<Input
							autoComplete="off"
							disabled={isPending}
							id="admin-delete-website-confirmation"
							onChange={(event) => setConfirmationInput(event.target.value)}
							placeholder={website?.slug ?? "website-slug"}
							value={confirmationInput}
						/>
					</div>

					<div className="flex items-start gap-3 rounded border bg-background-50 p-3">
						<Checkbox
							checked={shouldDeleteOrganization}
							disabled={
								isPending || previewQuery.isLoading || !canDeleteOrganization
							}
							id="admin-delete-organization"
							onCheckedChange={(checked) => {
								setDeleteOrganization(checked === true);
							}}
						/>
						<div className="min-w-0 space-y-1">
							<label
								className="cursor-pointer font-medium text-sm"
								htmlFor="admin-delete-organization"
							>
								Also delete organization
							</label>
							<p className="text-muted-foreground text-xs">
								{previewQuery.isLoading
									? "Checking organization websites..."
									: hasOtherActiveWebsites
										? `Blocked because ${preview?.organization.name ?? "this organization"} has ${activeWebsiteCount} active websites.`
										: preview
											? `${preview.organization.name} has ${preview.organization.memberEmailCount} member emails queued for Resend removal.`
											: "Organization deletion is checked on the server before deleting."}
							</p>
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button
						disabled={isPending}
						onClick={() => handleOpenChange(false)}
						type="button"
						variant="outline"
					>
						Cancel
					</Button>
					<Button
						disabled={!isConfirmed || isPending}
						onClick={handleDelete}
						type="button"
						variant="destructive"
					>
						{isPending ? "Deleting..." : "Delete forever"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function AdminGrantAiUsageSheet({
	website,
	open,
	isPending,
	onOpenChange,
	onConfirm,
}: {
	website: AdminWebsite | null;
	open: boolean;
	isPending: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (amount: number) => void;
}) {
	const trpc = useTRPC();
	const usageQuery = useQuery({
		...trpc.admin.getWebsiteAiUsage.queryOptions({
			websiteId: website?.id ?? "",
		}),
		enabled: open && Boolean(website?.id),
	});

	return (
		<NumericConfirmationSheet
			confirmLabel="Grant usage"
			description="Grant AI credits by removing already-started usage from this website's organization meter."
			inputLabel="Credits to grant"
			inputSuffix="credits"
			isPending={isPending}
			onConfirm={onConfirm}
			onOpenChange={onOpenChange}
			open={open}
			targetDescription={
				website ? `${website.domain} - ${website.organizationName}` : undefined
			}
			targetLabel={website?.name ?? "Website"}
			title="Grant AI usage"
		>
			<AdminAiUsageSummary
				data={usageQuery.data ?? null}
				isError={usageQuery.isError}
				isLoading={usageQuery.isLoading && open}
			/>
		</NumericConfirmationSheet>
	);
}

function AdminAiUsageSummary({
	data,
	isError,
	isLoading,
}: {
	data: AdminWebsiteAiUsage | null;
	isError: boolean;
	isLoading: boolean;
}) {
	if (isLoading) {
		return (
			<div className="rounded border bg-background-50 px-3 py-3">
				<div className="h-4 w-32 animate-pulse rounded bg-background-300" />
				<div className="mt-3 h-2 w-full animate-pulse rounded bg-background-300" />
				<div className="mt-2 h-3 w-24 animate-pulse rounded bg-background-300" />
			</div>
		);
	}

	if (isError) {
		return (
			<div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-3">
				<p className="font-medium text-destructive text-sm">
					Could not load current AI usage
				</p>
				<p className="mt-1 text-muted-foreground text-xs">
					The grant action is still available, but the live meter snapshot is
					unavailable.
				</p>
			</div>
		);
	}

	if (!data) {
		return null;
	}

	const usageView = getAiCreditUsageView(data.aiCredits);
	const includedCreditsLabel =
		typeof data.plan.includedAiCredits === "number"
			? `${formatAiCreditAmount(data.plan.includedAiCredits)} included`
			: "Included credits unavailable";
	const usagePercentage =
		usageView?.kind === "metered" && usageView.limit && usageView.limit > 0
			? Math.min(100, Math.max(0, (usageView.current / usageView.limit) * 100))
			: null;

	return (
		<div className="rounded border bg-background-50 px-3 py-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="font-medium text-sm">Current AI usage</p>
					<p className="mt-1 truncate text-muted-foreground text-xs">
						{data.plan.displayName} plan
					</p>
				</div>
				<Badge className="shrink-0" variant="secondary">
					{includedCreditsLabel}
				</Badge>
			</div>

			{usageView ? (
				<div className="mt-3 space-y-2">
					<div className="flex items-center justify-between gap-3 text-sm">
						<span>{usageView.usageLabel}</span>
						{usageView.remainingLabel ? (
							<span className="shrink-0 text-muted-foreground">
								{usageView.remainingLabel}
							</span>
						) : null}
					</div>
					{usagePercentage !== null ? (
						<div className="h-2 overflow-hidden rounded-full bg-background-300">
							<div
								className="h-full rounded-full bg-primary transition-[width]"
								style={{ width: `${usagePercentage}%` }}
							/>
						</div>
					) : null}
				</div>
			) : (
				<p className="mt-3 text-muted-foreground text-sm">
					Live meter data is unavailable. Plan includes{" "}
					{typeof data.plan.includedAiCredits === "number"
						? `${formatAiCreditAmount(data.plan.includedAiCredits)} AI credits`
						: "AI credits that could not be resolved"}
					.
				</p>
			)}
		</div>
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

export default AdminPageContent;
