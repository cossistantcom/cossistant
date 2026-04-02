"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon, MailPlusIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { UpgradeModal } from "@/components/plan/upgrade-modal";
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
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getTeamSeatCopy } from "@/lib/team/seat-copy";
import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

type TeamInviteModalProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	websiteSlug: string;
};

type InviteRole = "member" | "admin";

type InviteResult = {
	email: string;
	status:
		| "invited"
		| "added-to-team"
		| "promoted-to-admin"
		| "delivery-failed"
		| "already-member"
		| "already-invited"
		| "invalid-email"
		| "plan-limit"
		| "failed";
	message?: string;
};

function parseEmails(raw: string): string[] {
	return [
		...new Set(
			raw
				.split(/[\n,;]+/g)
				.map((item) => item.trim().toLowerCase())
				.filter(Boolean)
		),
	];
}

function statusLabel(status: InviteResult["status"]): string {
	switch (status) {
		case "invited":
			return "Invited";
		case "added-to-team":
			return "Added to website team";
		case "promoted-to-admin":
			return "Promoted to org admin";
		case "delivery-failed":
			return "Delivery failed";
		case "already-member":
			return "Already has access";
		case "already-invited":
			return "Already invited";
		case "invalid-email":
			return "Invalid email";
		case "plan-limit":
			return "Plan limit";
		default:
			return "Failed";
	}
}

function statusVariant(
	status: InviteResult["status"]
): "default" | "secondary" {
	return status === "invited" ||
		status === "added-to-team" ||
		status === "promoted-to-admin"
		? "default"
		: "secondary";
}

export function TeamInviteModal({
	open,
	onOpenChange,
	websiteSlug,
}: TeamInviteModalProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [emailsInput, setEmailsInput] = useState("");
	const [role, setRole] = useState<InviteRole>("member");
	const [results, setResults] = useState<InviteResult[]>([]);
	const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

	const parsedEmails = useMemo(() => parseEmails(emailsInput), [emailsInput]);

	const { data: teamSettings } = useQuery(
		trpc.team.getSettings.queryOptions({ websiteSlug })
	);
	const planInfoQuery = useQuery(
		trpc.plan.getPlanInfo.queryOptions({
			websiteSlug,
		})
	);

	const { mutateAsync: inviteMany, isPending } = useMutation(
		trpc.team.inviteMany.mutationOptions({
			onSuccess: async (data) => {
				setResults(data.results);
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
			},
			onError: (error) => {
				toast.error(error.message || "Failed to send invitations.");
			},
		})
	);

	useEffect(() => {
		if (!open) {
			setEmailsInput("");
			setRole("member");
			setResults([]);
		}
	}, [open]);

	const atSeatLimit =
		typeof teamSettings?.seats.remaining === "number" &&
		teamSettings.seats.remaining <= 0;
	const canManageTeam = teamSettings?.canManageTeam ?? false;
	const seatCopy = getTeamSeatCopy({
		used: teamSettings?.seats.used ?? 0,
		limit: teamSettings?.seats.limit ?? null,
		reserved: teamSettings?.seats.reserved ?? 0,
	});
	const canOpenUpgradeModal = Boolean(
		planInfoQuery.data && !planInfoQuery.isPending
	);
	const initialUpgradePlanName =
		planInfoQuery.data?.plan.name === "free" ? "hobby" : "pro";

	const hasPlanLimitResult = results.some(
		(result) => result.status === "plan-limit"
	);

	const handleSubmit = async () => {
		if (!canManageTeam) {
			toast.error("Only admins and owners can invite team members.");
			return;
		}

		if (parsedEmails.length === 0) {
			toast.error("Please add at least one email.");
			return;
		}

		const response = await inviteMany({
			websiteSlug,
			emails: parsedEmails,
			role,
		});

		if (response.summary.invited > 0) {
			toast.success(
				`${response.summary.invited} access update${
					response.summary.invited === 1 ? "" : "s"
				} completed.`
			);
		}
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-[640px]">
				<DialogHeader>
					<DialogTitle>Invite team members</DialogTitle>
					<DialogDescription>
						Add one or more emails. You can separate entries with commas, new
						lines, or semicolons.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="invite-emails">Emails</Label>
						<Textarea
							id="invite-emails"
							onChange={(event) => setEmailsInput(event.target.value)}
							placeholder={"alice@company.com\nbob@company.com"}
							rows={6}
							value={emailsInput}
						/>
						<p className="text-muted-foreground text-xs">
							{parsedEmails.length} unique email
							{parsedEmails.length === 1 ? "" : "s"} ready to invite.
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="invite-role">Role</Label>
						<Select
							onValueChange={(value) => setRole(value as InviteRole)}
							value={role}
						>
							<SelectTrigger id="invite-role">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="member">Member (website access)</SelectItem>
								<SelectItem value="admin">
									Admin (organization-wide access)
								</SelectItem>
							</SelectContent>
						</Select>
						{role === "admin" ? (
							<p className="text-muted-foreground text-xs">
								Admins can access all websites in this organization.
							</p>
						) : null}
					</div>

					<div className="space-y-1 text-xs">
						<p className="font-medium">{seatCopy.primary}</p>
						<p className="text-muted-foreground">{seatCopy.secondary}</p>
					</div>

					{atSeatLimit && (
						<div className="flex items-center justify-between gap-6 text-xs">
							<p className="text-plasma-orange">
								You've reached your seat limit.
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
					)}

					{teamSettings && !canManageTeam && (
						<div className="rounded border bg-background-100 px-3 py-2 text-muted-foreground text-xs">
							Only organization admins and owners can send invitations.
						</div>
					)}

					{results.length > 0 && (
						<div className="max-h-50 space-y-2 overflow-y-auto rounded border bg-background-100 p-2">
							{results.map((result) => (
								<div
									className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-sm"
									key={`${result.email}-${result.status}`}
								>
									<div className="min-w-0">
										<p className="truncate font-medium">{result.email}</p>
										{result.message ? (
											<p className="truncate text-muted-foreground text-xs">
												{result.message}
											</p>
										) : null}
									</div>
									<Badge variant={statusVariant(result.status)}>
										{statusLabel(result.status)}
									</Badge>
								</div>
							))}
						</div>
					)}

					{hasPlanLimitResult && !atSeatLimit && (
						<div className="flex items-center justify-between gap-3">
							<p className="text-plasma-orange text-xs">
								Some invites were blocked by your plan limit.
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
					)}
				</div>

				<DialogFooter>
					<Button onClick={() => onOpenChange(false)} variant="outline">
						Close
					</Button>
					<Button
						className={cn(atSeatLimit && "opacity-60")}
						disabled={!canManageTeam || isPending || parsedEmails.length === 0}
						onClick={handleSubmit}
					>
						{isPending ? (
							<>
								<Loader2Icon className="mr-2 size-4 animate-spin" />
								Sending...
							</>
						) : (
							<>
								<MailPlusIcon className="mr-2 size-4" />
								Send invites
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>

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
		</Dialog>
	);
}
