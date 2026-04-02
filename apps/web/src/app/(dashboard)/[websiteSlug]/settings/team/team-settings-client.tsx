"use client";

import type { RouterOutputs } from "@plasma/api/types";
import { parseCommaSeparatedRoles } from "@plasma/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
	Loader2Icon,
	MailIcon,
	MoreHorizontalIcon,
	RefreshCwIcon,
	Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { UpgradeModal } from "@/components/plan/upgrade-modal";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useInviteTeamModal } from "@/hooks/use-invite-team-modal";
import { resolveDashboardHumanAgentDisplay } from "@/lib/human-agent-display";
import { getTeamSeatCopy } from "@/lib/team/seat-copy";
import { useTRPC } from "@/lib/trpc/client";

type TeamSettings = RouterOutputs["team"]["getSettings"];
type TeamMember = TeamSettings["members"][number];
type TeamInvitation = TeamSettings["invitations"][number];
type PendingRoleChange = {
	target: TeamMember;
	nextRole: "member" | "admin";
};

type TeamSettingsClientProps = {
	websiteSlug: string;
	currentUserId: string;
};

function normalizeRole(
	role: string | null | undefined
): "owner" | "admin" | "member" | "unknown" {
	if (!role) {
		return "unknown";
	}

	const normalizedRoles = role ? parseCommaSeparatedRoles(role) : [];

	if (normalizedRoles.includes("owner")) {
		return "owner";
	}
	if (normalizedRoles.includes("admin")) {
		return "admin";
	}
	if (normalizedRoles.includes("member")) {
		return "member";
	}

	return "unknown";
}

function roleLabel(role: ReturnType<typeof normalizeRole>): string {
	switch (role) {
		case "owner":
			return "Owner";
		case "admin":
			return "Admin";
		case "member":
			return "Member";
		default:
			return "Unknown";
	}
}

function invitationStatusLabel(invitation: TeamInvitation): string {
	if (invitation.isExpired) {
		return "Expired";
	}

	switch (invitation.status) {
		case "pending":
			return "Pending";
		case "accepted":
			return "Accepted";
		case "rejected":
			return "Declined";
		case "canceled":
			return "Canceled";
		default:
			return invitation.status;
	}
}

function invitationStatusVariant(
	invitation: TeamInvitation
): "default" | "secondary" {
	if (invitation.status === "accepted") {
		return "default";
	}
	return "secondary";
}

export function TeamSettingsClient({
	websiteSlug,
	currentUserId,
}: TeamSettingsClientProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { openInviteTeamModal } = useInviteTeamModal();
	const [updatingRoleMemberId, setUpdatingRoleMemberId] = useState<
		string | null
	>(null);
	const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
	const [resendingInvitationId, setResendingInvitationId] = useState<
		string | null
	>(null);
	const [cancelingInvitationId, setCancelingInvitationId] = useState<
		string | null
	>(null);
	const [pendingRemoveMember, setPendingRemoveMember] =
		useState<TeamMember | null>(null);
	const [pendingCancelInvitation, setPendingCancelInvitation] =
		useState<TeamInvitation | null>(null);
	const [pendingRoleChange, setPendingRoleChange] =
		useState<PendingRoleChange | null>(null);
	const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

	const settingsQuery = useQuery(
		trpc.team.getSettings.queryOptions({
			websiteSlug,
		})
	);
	const planInfoQuery = useQuery(
		trpc.plan.getPlanInfo.queryOptions({
			websiteSlug,
		})
	);

	const invalidateTeamViews = async () => {
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: trpc.team.getSettings.queryKey({ websiteSlug }),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.user.getWebsiteMembers.queryKey({ websiteSlug }),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.plan.getPlanInfo.queryKey({ websiteSlug }),
			}),
		]);
	};

	const { mutateAsync: updateMemberRole } = useMutation(
		trpc.team.updateMemberRole.mutationOptions({
			onSuccess: async () => {
				await invalidateTeamViews();
			},
		})
	);

	const { mutateAsync: removeMemberAccess } = useMutation(
		trpc.team.removeMemberAccess.mutationOptions({
			onSuccess: async () => {
				await invalidateTeamViews();
			},
		})
	);

	const { mutateAsync: resendInvitation } = useMutation(
		trpc.team.resendInvitation.mutationOptions({
			onSuccess: async () => {
				await invalidateTeamViews();
			},
		})
	);

	const { mutateAsync: cancelInvitation } = useMutation(
		trpc.team.cancelInvitation.mutationOptions({
			onSuccess: async () => {
				await invalidateTeamViews();
			},
		})
	);

	const handleRoleChange = (
		target: TeamMember,
		nextRole: "member" | "admin"
	) => {
		if (!target.memberId) {
			toast.error("This member can't be updated from this page.");
			return;
		}

		setPendingRoleChange({
			target,
			nextRole,
		});
	};

	const handleConfirmRoleChange = async () => {
		const pendingChange = pendingRoleChange;
		if (!pendingChange?.target.memberId) {
			return;
		}

		setUpdatingRoleMemberId(pendingChange.target.memberId);
		try {
			await updateMemberRole({
				websiteSlug,
				memberId: pendingChange.target.memberId,
				role: pendingChange.nextRole,
			});
			toast.success(`Organization role updated to ${pendingChange.nextRole}.`);
			setPendingRoleChange(null);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to update role.";
			toast.error(message);
		} finally {
			setUpdatingRoleMemberId(null);
		}
	};

	const handleRemoveMember = (target: TeamMember) => {
		if (!target.memberId) {
			toast.error("This member can't be removed from this page.");
			return;
		}

		setPendingRemoveMember(target);
	};

	const handleConfirmRemoveMember = async () => {
		const target = pendingRemoveMember;
		if (!target?.memberId) {
			return;
		}

		setRemovingMemberId(target.memberId);
		try {
			await removeMemberAccess({
				websiteSlug,
				memberId: target.memberId,
			});
			toast.success("Access removed.");
			setPendingRemoveMember(null);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to remove access.";
			toast.error(message);
		} finally {
			setRemovingMemberId(null);
		}
	};

	const handleResendInvitation = async (invitationId: string) => {
		setResendingInvitationId(invitationId);
		try {
			const result = await resendInvitation({
				websiteSlug,
				invitationId,
			});

			if (result.delivery === "sent") {
				toast.success("Invitation resent.");
			} else {
				toast.warning(
					result.message ??
						"Invitation was resent, but email delivery failed. Try again."
				);
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to resend invitation.";
			toast.error(message);
		} finally {
			setResendingInvitationId(null);
		}
	};

	const handleCancelInvitation = (invitation: TeamInvitation) => {
		setPendingCancelInvitation(invitation);
	};

	const handleConfirmCancelInvitation = async () => {
		const invitationId = pendingCancelInvitation?.id;
		if (!invitationId) {
			return;
		}

		setCancelingInvitationId(invitationId);
		try {
			await cancelInvitation({
				websiteSlug,
				invitationId,
			});
			toast.success("Invitation canceled.");
			setPendingCancelInvitation(null);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to cancel invitation.";
			toast.error(message);
		} finally {
			setCancelingInvitationId(null);
		}
	};

	if (settingsQuery.isPending) {
		return (
			<div className="flex items-center gap-2 p-4 text-muted-foreground text-sm">
				<Loader2Icon className="size-4 animate-spin" />
				Loading team settings...
			</div>
		);
	}

	if (settingsQuery.isError || !settingsQuery.data) {
		return (
			<div className="flex flex-col gap-3 p-4">
				<p className="text-destructive text-sm">
					{settingsQuery.error?.message ?? "Failed to load team settings."}
				</p>
				<Button
					className="w-fit"
					onClick={() => settingsQuery.refetch()}
					variant="outline"
				>
					<RefreshCwIcon className="size-4" />
					Retry
				</Button>
			</div>
		);
	}

	const settings = settingsQuery.data;
	const atSeatLimit =
		settings.seats.remaining !== null && settings.seats.remaining <= 0;
	const seatCopy = getTeamSeatCopy({
		used: settings.seats.used,
		limit: settings.seats.limit,
		reserved: settings.seats.reserved,
	});
	const canOpenUpgradeModal = Boolean(
		planInfoQuery.data && !planInfoQuery.isPending
	);
	const initialUpgradePlanName =
		planInfoQuery.data?.plan.name === "free" ? "hobby" : "pro";

	return (
		<>
			<div className="space-y-8 p-4">
				<section className="space-y-3">
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div className="space-y-1">
							<p className="font-medium text-sm">{seatCopy.primary}</p>
							<p className="text-muted-foreground text-xs">
								{seatCopy.secondary}
							</p>
						</div>

						{settings.canManageTeam &&
							(atSeatLimit ? (
								<div className="flex flex-wrap items-center gap-2">
									<p className="text-plasma-orange text-xs">
										You&apos;ve reached your seat limit.
									</p>
									<Button
										disabled={!canOpenUpgradeModal}
										onClick={() => setIsUpgradeModalOpen(true)}
										size="sm"
										variant="outline"
									>
										Upgrade
									</Button>
								</div>
							) : (
								<Button onClick={() => void openInviteTeamModal()} size="sm">
									Invite
								</Button>
							))}
					</div>

					<p className="text-muted-foreground text-xs">
						Current plan limits how many people can access this website.
					</p>
				</section>

				<section className="space-y-3 border-t pt-6">
					<div className="space-y-1">
						<p className="font-medium text-sm">
							Members with access [{settings.members.length}]
						</p>
					</div>

					<div className="divide-y divide-primary/10">
						{settings.members.map((member) => {
							const memberDisplay = resolveDashboardHumanAgentDisplay({
								id: member.userId,
								name: member.name,
							});
							const normalizedRole = normalizeRole(member.role);
							const isSelf = member.userId === currentUserId;
							const canManageThisMember =
								settings.canManageTeam &&
								Boolean(member.memberId) &&
								!isSelf &&
								normalizedRole !== "owner";
							const isUpdating = member.memberId === updatingRoleMemberId;
							const isRemoving = member.memberId === removingMemberId;

							return (
								<div
									className="group flex items-center gap-3 py-2 text-sm first:pt-0 last:pb-0"
									key={member.userId}
								>
									<Avatar
										className="size-8"
										facehashSeed={memberDisplay.facehashSeed}
										fallbackName={memberDisplay.displayName}
										lastOnlineAt={member.lastSeenAt}
										url={member.image}
									/>

									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<p className="truncate font-medium">
												{memberDisplay.displayName}
											</p>
											{isSelf && <Badge variant="secondary">You</Badge>}
										</div>
										<p className="truncate text-muted-foreground text-xs">
											{member.email}
										</p>
									</div>

									<div className="flex items-center gap-2">
										<span className="font-medium text-muted-foreground text-xs">
											{roleLabel(normalizedRole)}
										</span>
										{(normalizedRole === "owner" ||
											normalizedRole === "admin") && (
											<Badge variant="secondary">All websites</Badge>
										)}

										{canManageThisMember && (
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button size="icon-small" variant="ghost">
														<MoreHorizontalIcon className="size-4" />
														<span className="sr-only">Member actions</span>
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem
														disabled={isUpdating || normalizedRole === "admin"}
														onSelect={() =>
															void handleRoleChange(member, "admin")
														}
													>
														Make organization admin
													</DropdownMenuItem>
													<DropdownMenuItem
														disabled={isUpdating || normalizedRole === "member"}
														onSelect={() =>
															void handleRoleChange(member, "member")
														}
													>
														Make organization member
													</DropdownMenuItem>
													<DropdownMenuSeparator />
													<DropdownMenuItem
														disabled={isRemoving}
														onSelect={() => void handleRemoveMember(member)}
														variant="destructive"
													>
														<Trash2Icon className="size-4" />
														Remove access
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</section>

				<section className="space-y-3 border-t pt-6">
					<div className="space-y-1">
						<p className="font-medium text-sm">
							Invitations [{settings.invitations.length}]
						</p>
					</div>
					{settings.invitations.length === 0 ? (
						<p className="text-muted-foreground text-sm">No invitations yet.</p>
					) : (
						<div className="max-h-80 divide-y divide-primary/10 overflow-y-auto pr-1">
							{settings.invitations.map((invitation) => {
								const expiresAt = new Date(invitation.expiresAt);
								const isPending = invitation.status === "pending";
								const isResending = resendingInvitationId === invitation.id;
								const isCanceling = cancelingInvitationId === invitation.id;

								return (
									<div
										className="group flex items-center gap-3 py-2 text-sm first:pt-0 last:pb-0"
										key={invitation.id}
									>
										<div className="flex size-8 items-center justify-center rounded border bg-background-100">
											<MailIcon className="size-4 text-muted-foreground" />
										</div>

										<div className="min-w-0 flex-1">
											<p className="truncate font-medium">{invitation.email}</p>
											<p className="truncate text-muted-foreground text-xs">
												{invitation.inviterName
													? `Invited by ${invitation.inviterName}`
													: "Invitation sent"}{" "}
												•{" "}
												{invitation.isExpired
													? `Expired ${formatDistanceToNow(expiresAt, {
															addSuffix: true,
														})}`
													: `Expires ${formatDistanceToNow(expiresAt, {
															addSuffix: true,
														})}`}
											</p>
											{invitation.isExpired &&
											invitation.status === "pending" ? (
												<p className="text-muted-foreground text-xs">
													Resending will reactivate this invitation.
												</p>
											) : null}
										</div>

										<div className="flex items-center gap-2">
											<Badge variant={invitationStatusVariant(invitation)}>
												{invitationStatusLabel(invitation)}
											</Badge>

											{settings.canManageTeam && isPending && (
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button size="icon-small" variant="ghost">
															<MoreHorizontalIcon className="size-4" />
															<span className="sr-only">
																Invitation actions
															</span>
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuItem
															disabled={isResending}
															onSelect={() =>
																void handleResendInvitation(invitation.id)
															}
														>
															<RefreshCwIcon className="size-4" />
															Resend invitation
														</DropdownMenuItem>
														<DropdownMenuItem
															disabled={isCanceling}
															onSelect={() =>
																handleCancelInvitation(invitation)
															}
															variant="destructive"
														>
															<Trash2Icon className="size-4" />
															Cancel invitation
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											)}
										</div>
									</div>
								);
							})}
						</div>
					)}
				</section>
			</div>

			{planInfoQuery.data && (
				<UpgradeModal
					currentPlan={planInfoQuery.data.plan}
					highlightedFeatureKey="team-members"
					initialPlanName={initialUpgradePlanName}
					onOpenChange={setIsUpgradeModalOpen}
					open={isUpgradeModalOpen}
					websiteSlug={websiteSlug}
				/>
			)}

			<Dialog
				onOpenChange={(open) => {
					if (!(open || updatingRoleMemberId)) {
						setPendingRoleChange(null);
					}
				}}
				open={Boolean(pendingRoleChange)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Confirm role change</DialogTitle>
						<DialogDescription>
							{pendingRoleChange
								? pendingRoleChange.nextRole === "admin"
									? `Promote ${pendingRoleChange.target.email} to organization admin? This grants access across all websites.`
									: `Change ${pendingRoleChange.target.email} to organization member? This removes org-wide admin access across all websites.`
								: "Confirm role update."}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							disabled={Boolean(updatingRoleMemberId)}
							onClick={() => setPendingRoleChange(null)}
							variant="outline"
						>
							Cancel
						</Button>
						<Button
							disabled={Boolean(updatingRoleMemberId)}
							onClick={() => void handleConfirmRoleChange()}
						>
							{updatingRoleMemberId ? "Updating..." : "Confirm"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				onOpenChange={(open) => {
					if (!(open || removingMemberId)) {
						setPendingRemoveMember(null);
					}
				}}
				open={Boolean(pendingRemoveMember)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Remove member access</DialogTitle>
						<DialogDescription>
							{pendingRemoveMember
								? `This will remove ${pendingRemoveMember.email} from ${
										pendingRemoveMember.accessSource === "team"
											? "website-only access"
											: "organization-wide access across all websites"
									}.`
								: "Remove member access."}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							disabled={Boolean(removingMemberId)}
							onClick={() => setPendingRemoveMember(null)}
							variant="outline"
						>
							Cancel
						</Button>
						<Button
							disabled={Boolean(removingMemberId)}
							onClick={() => void handleConfirmRemoveMember()}
							variant="destructive"
						>
							{removingMemberId ? "Removing..." : "Remove access"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				onOpenChange={(open) => {
					if (!(open || cancelingInvitationId)) {
						setPendingCancelInvitation(null);
					}
				}}
				open={Boolean(pendingCancelInvitation)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Cancel invitation</DialogTitle>
						<DialogDescription>
							{pendingCancelInvitation
								? `Cancel the pending invitation for ${pendingCancelInvitation.email}?`
								: "Cancel this invitation?"}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							disabled={Boolean(cancelingInvitationId)}
							onClick={() => setPendingCancelInvitation(null)}
							variant="outline"
						>
							Keep invitation
						</Button>
						<Button
							disabled={Boolean(cancelingInvitationId)}
							onClick={() => void handleConfirmCancelInvitation()}
							variant="destructive"
						>
							{cancelingInvitationId ? "Canceling..." : "Cancel invitation"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
