import { getOrganizationBySlug } from "@api/db/queries/organization";
import {
	getAuthUserIdByEmail,
	getFirstWebsiteForTeamIds,
	getInvitationForResend,
	getInvitationWebsiteScope,
	getJoinInvitation,
	getOrganizationMembershipIdByUser,
	getTeamInvitationForJoinRoute,
	getTeamOrganizationSummary,
	getTeamViewerMembershipRole,
	listOrganizationInvitations,
	listOrganizationInvitationsWithInviter,
	listOrganizationMembersWithEmails,
} from "@api/db/queries/team";
import { getWebsiteBySlugWithAccess } from "@api/db/queries/website";
import { auth } from "@api/lib/auth";
import { sendTeamInvitationEmail } from "@api/lib/team-invitation-mailer";
import {
	calculateWebsiteSeatUsage,
	hasPrivilegedRole,
	invitationAppliesToWebsite,
	listWebsiteAccessUsers,
	normalizeEmail,
	parseRoleList,
	withWebsiteInviteAdvisoryLock,
} from "@api/lib/team-seats";
import {
	incrementTeamInviteCounter,
	logTeamInviteEvent,
} from "@api/utils/team-invitation-monitoring";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../init";

const teamRoleSchema = z.enum(["member", "admin"]);
const emailSchema = z.email();

const inviteStatusSchema = z.enum([
	"invited",
	"added-to-team",
	"promoted-to-admin",
	"delivery-failed",
	"already-member",
	"already-invited",
	"invalid-email",
	"plan-limit",
	"failed",
]);
const resendDeliverySchema = z.enum(["sent", "failed"]);
const updateRoleInputSchema = z.union([z.string(), z.array(z.string())]);
const joinResultCodeSchema = z.enum([
	"accepted",
	"rejected",
	"wrong-account",
	"invalid-invitation",
	"email-verification-required",
	"error",
]);

const joinActionResultSchema = z.object({
	resultCode: joinResultCodeSchema,
	message: z.string().nullable().optional(),
});

const teamSettingsSchema = z.object({
	viewerRole: z.string().nullable(),
	canManageTeam: z.boolean(),
	seats: z.object({
		limit: z.number().nullable(),
		used: z.number(),
		reserved: z.number(),
		remaining: z.number().nullable(),
	}),
	members: z.array(
		z.object({
			memberId: z.string().nullable(),
			userId: z.string(),
			name: z.string().nullable(),
			email: z.string(),
			image: z.string().nullable(),
			role: z.string().nullable(),
			lastSeenAt: z.string().nullable(),
			accessSource: z.enum([
				"team",
				"org-admin-owner",
				"team-and-org-admin-owner",
			]),
		})
	),
	invitations: z.array(
		z.object({
			id: z.string(),
			email: z.string(),
			role: z.string(),
			status: z.string(),
			expiresAt: z.string(),
			inviterName: z.string().nullable(),
			isExpired: z.boolean(),
		})
	),
});

const joinRouteStateSchema = z.object({
	organizationId: z.string(),
	organizationName: z.string(),
	organizationSlug: z.string(),
	organizationLogoUrl: z.string().nullable(),
	websiteName: z.string().nullable(),
	websiteLogoUrl: z.string().nullable(),
	invitationId: z.string(),
	invitationStatus: z.enum([
		"pending",
		"accepted",
		"rejected",
		"canceled",
		"expired",
		"not-found",
	]),
	isInvitationValid: z.boolean(),
	invitedEmail: z.string().nullable(),
	recommendedAuthAction: z.enum(["login", "sign-up"]).nullable(),
	isAuthenticated: z.boolean(),
	signedInEmail: z.string().nullable(),
	isSignedInEmailMatchingInvitation: z.boolean().nullable(),
	isAlreadyMember: z.boolean(),
});

type InviteStatus = z.infer<typeof inviteStatusSchema>;
type JoinResultCode = z.infer<typeof joinResultCodeSchema>;

export function isInviteResultSuccess(status: InviteStatus): boolean {
	return (
		status === "invited" ||
		status === "added-to-team" ||
		status === "promoted-to-admin"
	);
}

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Unknown error";
}

function isEmailVerificationJoinError(message: string): boolean {
	return (
		message.includes(
			"email verification required before accepting or rejecting invitation"
		) || message.includes("email verification required")
	);
}

function isInvalidInvitationJoinError(message: string): boolean {
	return (
		message.includes("invitation_not_found") ||
		message.includes("invitation not found") ||
		message.includes("expired")
	);
}

function isWrongAccountJoinError(message: string): boolean {
	return (
		message.includes("you are not the recipient of the invitation") ||
		message.includes("recipient")
	);
}

export function mapJoinErrorToResult(error: unknown): {
	resultCode: JoinResultCode;
	message: string | null;
} {
	const message = toErrorMessage(error);
	const normalizedMessage = message.toLowerCase();

	if (isEmailVerificationJoinError(normalizedMessage)) {
		return {
			resultCode: "email-verification-required",
			message,
		};
	}

	if (isWrongAccountJoinError(normalizedMessage)) {
		return {
			resultCode: "wrong-account",
			message,
		};
	}

	if (isInvalidInvitationJoinError(normalizedMessage)) {
		return {
			resultCode: "invalid-invitation",
			message,
		};
	}

	return {
		resultCode: "error",
		message,
	};
}

async function ensureActiveOrganization(params: {
	headers: Headers;
	organizationId: string;
	activeOrganizationId: string | null | undefined;
}) {
	if (params.activeOrganizationId === params.organizationId) {
		return;
	}

	await auth.api.setActiveOrganization({
		headers: params.headers,
		body: {
			organizationId: params.organizationId,
		},
	});
}

function mapInviteError(error: unknown): {
	status: z.infer<typeof inviteStatusSchema>;
	message: string;
} {
	const message =
		error instanceof Error ? error.message : "Failed to create invitation";
	const lowerMessage = message.toLowerCase();

	if (
		lowerMessage.includes("already invited") ||
		lowerMessage.includes("already_invited")
	) {
		return {
			status: "already-invited",
			message,
		};
	}

	if (
		lowerMessage.includes("already a member") ||
		lowerMessage.includes("already_member")
	) {
		return {
			status: "already-member",
			message,
		};
	}

	if (lowerMessage.includes("limit")) {
		return {
			status: "plan-limit",
			message,
		};
	}

	return {
		status: "failed",
		message,
	};
}

export const teamRouter = createTRPCRouter({
	getJoinRouteState: publicProcedure
		.input(
			z.object({
				organizationSlug: z.string(),
				invitationId: z.string(),
			})
		)
		.output(joinRouteStateSchema.nullable())
		.query(async ({ ctx: { db, user, session }, input }) => {
			const foundOrganization = await getOrganizationBySlug(
				db,
				input.organizationSlug
			);

			if (!foundOrganization) {
				return null;
			}

			const currentUser = user ?? null;
			const currentSession = session ?? null;
			const isAuthenticated = Boolean(currentUser && currentSession);
			const signedInEmail =
				isAuthenticated && currentUser
					? normalizeEmail(currentUser.email)
					: null;

			const invitationRecord = await getTeamInvitationForJoinRoute(db, {
				invitationId: input.invitationId,
				organizationId: foundOrganization.id,
			});

			if (!invitationRecord) {
				return {
					organizationId: foundOrganization.id,
					organizationName: foundOrganization.name,
					organizationSlug: foundOrganization.slug,
					organizationLogoUrl: foundOrganization.logo ?? null,
					websiteName: null,
					websiteLogoUrl: null,
					invitationId: input.invitationId,
					invitationStatus: "not-found",
					isInvitationValid: false,
					invitedEmail: null,
					recommendedAuthAction: null,
					isAuthenticated,
					signedInEmail,
					isSignedInEmailMatchingInvitation: null,
					isAlreadyMember: false,
				};
			}

			const invitedEmail = normalizeEmail(invitationRecord.email);
			const invitationStatus =
				invitationRecord.status === "pending"
					? invitationRecord.expiresAt.getTime() <= Date.now()
						? "expired"
						: "pending"
					: invitationRecord.status === "accepted"
						? "accepted"
						: invitationRecord.status === "rejected"
							? "rejected"
							: "canceled";
			const isInvitationValid = invitationStatus === "pending";

			const invitationTeamIds = invitationRecord.teamId
				? invitationRecord.teamId
						.split(",")
						.map((value) => value.trim())
						.filter(Boolean)
				: [];

			const targetWebsite = await getFirstWebsiteForTeamIds(db, {
				organizationId: foundOrganization.id,
				teamIds: invitationTeamIds,
			});

			const isSignedInEmailMatchingInvitation = signedInEmail
				? signedInEmail === invitedEmail
				: null;
			const matchingUser =
				!isAuthenticated && isInvitationValid
					? await getAuthUserIdByEmail(db, {
							email: invitedEmail,
						})
					: null;
			const existingMembership =
				isAuthenticated && currentUser
					? await getOrganizationMembershipIdByUser(db, {
							organizationId: foundOrganization.id,
							userId: currentUser.id,
						})
					: null;

			return {
				organizationId: foundOrganization.id,
				organizationName: foundOrganization.name,
				organizationSlug: foundOrganization.slug,
				organizationLogoUrl: foundOrganization.logo ?? null,
				websiteName: targetWebsite?.name ?? null,
				websiteLogoUrl: targetWebsite?.logoUrl ?? null,
				invitationId: invitationRecord.id,
				invitationStatus,
				isInvitationValid,
				invitedEmail,
				recommendedAuthAction:
					!isAuthenticated && isInvitationValid
						? matchingUser
							? "login"
							: "sign-up"
						: null,
				isAuthenticated,
				signedInEmail,
				isSignedInEmailMatchingInvitation,
				isAlreadyMember: Boolean(existingMembership),
			};
		}),
	getSettings: protectedProcedure
		.input(
			z.object({
				websiteSlug: z.string(),
			})
		)
		.output(teamSettingsSchema)
		.query(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData?.teamId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const [viewerMembership, accessUsers, seatUsage, invitationsRows] =
				await Promise.all([
					getTeamViewerMembershipRole(db, {
						organizationId: websiteData.organizationId,
						userId: user.id,
					}),
					listWebsiteAccessUsers(db, {
						organizationId: websiteData.organizationId,
						teamId: websiteData.teamId,
					}),
					calculateWebsiteSeatUsage(db, {
						website: websiteData,
					}),
					listOrganizationInvitationsWithInviter(db, {
						organizationId: websiteData.organizationId,
					}),
				]);

			const viewerRole = viewerMembership?.role ?? null;
			const canManageTeam = hasPrivilegedRole(viewerRole);

			const relevantInvitations = invitationsRows
				.filter((row) =>
					invitationAppliesToWebsite(row.role, row.teamId, websiteData.teamId)
				)
				.sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())
				.map((row) => ({
					id: row.id,
					email: normalizeEmail(row.email),
					role: row.role ?? "member",
					status: row.status,
					expiresAt: row.expiresAt.toISOString(),
					inviterName: row.inviterName ?? null,
					isExpired:
						row.status === "pending" && row.expiresAt.getTime() <= Date.now(),
				}));

			return {
				viewerRole,
				canManageTeam,
				seats: seatUsage,
				members: accessUsers.map((accessUser) => ({
					memberId: accessUser.memberId,
					userId: accessUser.userId,
					name: accessUser.name,
					email: accessUser.email,
					image: accessUser.image,
					role: accessUser.role,
					lastSeenAt: accessUser.lastSeenAt?.toISOString() ?? null,
					accessSource: accessUser.accessSource,
				})),
				invitations: relevantInvitations,
			};
		}),
	inviteMany: protectedProcedure
		.input(
			z.object({
				websiteSlug: z.string(),
				emails: z.array(z.string()).min(1).max(50),
				role: teamRoleSchema,
			})
		)
		.output(
			z.object({
				results: z.array(
					z.object({
						email: z.string(),
						status: inviteStatusSchema,
						message: z.string().optional(),
					})
				),
				summary: z.object({
					requested: z.number(),
					invited: z.number(),
					failed: z.number(),
				}),
				seats: z.object({
					limit: z.number().nullable(),
					used: z.number(),
					reserved: z.number(),
					remaining: z.number().nullable(),
				}),
			})
		)
		.mutation(async ({ ctx: { db, user, headers, session }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData?.teamId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const viewerMembership = await getTeamViewerMembershipRole(db, {
				organizationId: websiteData.organizationId,
				userId: user.id,
			});

			if (!hasPrivilegedRole(viewerMembership?.role)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only admins and owners can invite team members.",
				});
			}

			const normalizedEmails = [...new Set(input.emails.map(normalizeEmail))]
				.filter(Boolean)
				.slice(0, 50);

			const organizationRecord = await getTeamOrganizationSummary(db, {
				organizationId: websiteData.organizationId,
			});

			if (!organizationRecord) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Organization not found.",
				});
			}

			const inviteLockResult = await withWebsiteInviteAdvisoryLock(db, {
				websiteId: websiteData.id,
				run: async () => {
					const [accessUsers, seatUsage, invitationRows, organizationMembers] =
						await Promise.all([
							listWebsiteAccessUsers(db, {
								organizationId: websiteData.organizationId,
								teamId: websiteData.teamId,
							}),
							calculateWebsiteSeatUsage(db, {
								website: websiteData,
							}),
							listOrganizationInvitations(db, {
								organizationId: websiteData.organizationId,
							}),
							listOrganizationMembersWithEmails(db, {
								organizationId: websiteData.organizationId,
							}),
						]);

					const existingAccessEmails = new Set(
						accessUsers.map((accessUser) => normalizeEmail(accessUser.email))
					);
					const organizationMembersByEmail = new Map(
						organizationMembers.map((row) => [
							normalizeEmail(row.email),
							{
								memberId: row.memberId,
								userId: row.userId,
								role: row.role,
							},
						])
					);

					const pendingRelevantInvitations = new Set(
						invitationRows
							.filter(
								(row) =>
									row.status === "pending" &&
									row.expiresAt.getTime() > Date.now() &&
									invitationAppliesToWebsite(
										row.role,
										row.teamId,
										websiteData.teamId
									)
							)
							.map((row) => normalizeEmail(row.email))
					);

					let remainingSeats = seatUsage.remaining;
					const results: Array<{
						email: string;
						status: InviteStatus;
						message?: string;
					}> = [];

					for (const email of normalizedEmails) {
						if (!emailSchema.safeParse(email).success) {
							results.push({
								email,
								status: "invalid-email",
								message: "Invalid email format.",
							});
							continue;
						}

						if (existingAccessEmails.has(email)) {
							results.push({
								email,
								status: "already-member",
								message: "This user already has access.",
							});
							continue;
						}

						if (pendingRelevantInvitations.has(email)) {
							results.push({
								email,
								status: "already-invited",
								message:
									"There is already a pending invitation for this email.",
							});
							continue;
						}

						const existingOrganizationMember =
							organizationMembersByEmail.get(email);

						if (remainingSeats !== null && remainingSeats <= 0) {
							results.push({
								email,
								status: "plan-limit",
								message:
									"Your team member limit has been reached. Upgrade your plan to invite more teammates.",
							});
							continue;
						}

						if (existingOrganizationMember) {
							try {
								if (input.role === "member") {
									await ensureActiveOrganization({
										activeOrganizationId: session.activeOrganizationId,
										headers,
										organizationId: websiteData.organizationId,
									});
									await auth.api.addTeamMember({
										headers,
										body: {
											teamId: websiteData.teamId,
											userId: existingOrganizationMember.userId,
										},
									});
									results.push({
										email,
										status: "added-to-team",
									});
									logTeamInviteEvent({
										action: "added_to_team",
										email,
										organizationId: websiteData.organizationId,
										role: input.role,
										teamId: websiteData.teamId,
										timestamp: new Date(),
										websiteId: websiteData.id,
									});
								} else {
									await auth.api.updateMemberRole({
										headers,
										body: {
											organizationId: websiteData.organizationId,
											memberId: existingOrganizationMember.memberId,
											role: "admin",
										},
									});
									results.push({
										email,
										status: "promoted-to-admin",
									});
									logTeamInviteEvent({
										action: "promoted",
										email,
										organizationId: websiteData.organizationId,
										role: input.role,
										teamId: websiteData.teamId,
										timestamp: new Date(),
										websiteId: websiteData.id,
									});
								}

								existingAccessEmails.add(email);
								if (remainingSeats !== null) {
									remainingSeats -= 1;
								}
							} catch (error) {
								const mappedError = mapInviteError(error);
								results.push({
									email,
									status: mappedError.status,
									message: mappedError.message,
								});
							}

							continue;
						}

						try {
							const createdInvitation = await auth.api.createInvitation({
								headers,
								body: {
									organizationId: websiteData.organizationId,
									email,
									role: input.role,
									teamId:
										input.role === "member" ? websiteData.teamId : undefined,
								},
							});

							const emailDelivery = await sendTeamInvitationEmail({
								email,
								invitationId: createdInvitation.id,
								inviterName: user.name ?? null,
								organizationName: organizationRecord.name,
								organizationSlug: organizationRecord.slug,
							});

							results.push({
								email,
								status: emailDelivery.success ? "invited" : "delivery-failed",
								message: emailDelivery.success
									? undefined
									: (emailDelivery.errorMessage ??
										"Invitation created, but delivery failed. You can resend it."),
							});
							if (emailDelivery.success) {
								logTeamInviteEvent({
									action: "created",
									email,
									invitationId: createdInvitation.id,
									organizationId: websiteData.organizationId,
									role: input.role,
									teamId: websiteData.teamId,
									timestamp: new Date(),
									websiteId: websiteData.id,
								});
							} else {
								logTeamInviteEvent({
									action: "delivery_failed",
									email,
									invitationId: createdInvitation.id,
									organizationId: websiteData.organizationId,
									reason: emailDelivery.errorMessage,
									role: input.role,
									teamId: websiteData.teamId,
									timestamp: new Date(),
									websiteId: websiteData.id,
								});
								incrementTeamInviteCounter({
									counter: "invite_delivery_failed_total",
									organizationId: websiteData.organizationId,
									teamId: websiteData.teamId,
									websiteId: websiteData.id,
								});
							}
							pendingRelevantInvitations.add(email);
							if (remainingSeats !== null) {
								remainingSeats -= 1;
							}
						} catch (error) {
							const mappedError = mapInviteError(error);
							results.push({
								email,
								status: mappedError.status,
								message: mappedError.message,
							});
						}
					}

					const invitedCount = results.filter((result) =>
						isInviteResultSuccess(result.status)
					).length;
					const failedCount = results.length - invitedCount;
					const updatedSeatUsage = await calculateWebsiteSeatUsage(db, {
						website: websiteData,
					});

					return {
						results,
						summary: {
							requested: normalizedEmails.length,
							invited: invitedCount,
							failed: failedCount,
						},
						seats: updatedSeatUsage,
					};
				},
			});

			if (!inviteLockResult.acquired) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "Another invite operation is in progress. Please retry.",
				});
			}

			return inviteLockResult.value;
		}),
	resendInvitation: protectedProcedure
		.input(
			z.object({
				websiteSlug: z.string(),
				invitationId: z.string(),
			})
		)
		.output(
			z.object({
				success: z.boolean(),
				delivery: resendDeliverySchema,
				message: z.string().nullable().optional(),
			})
		)
		.mutation(async ({ ctx: { db, user, headers }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData?.teamId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const viewerMembership = await getTeamViewerMembershipRole(db, {
				organizationId: websiteData.organizationId,
				userId: user.id,
			});

			if (!hasPrivilegedRole(viewerMembership?.role)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only admins and owners can resend invitations.",
				});
			}

			const existingInvitation = await getInvitationForResend(db, {
				invitationId: input.invitationId,
				organizationId: websiteData.organizationId,
			});

			if (
				!(
					existingInvitation &&
					invitationAppliesToWebsite(
						existingInvitation.role,
						existingInvitation.teamId,
						websiteData.teamId
					)
				)
			) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Invitation not found.",
				});
			}

			const parsedRole = parseRoleList(existingInvitation.role).find(
				(value): value is "owner" | "admin" | "member" =>
					value === "owner" || value === "admin" || value === "member"
			);
			const role =
				parsedRole ?? (existingInvitation.teamId ? "member" : "admin");
			const teamIdPayload = existingInvitation.teamId?.includes(",")
				? existingInvitation.teamId
						.split(",")
						.map((teamId) => teamId.trim())
						.filter(Boolean)
				: (existingInvitation.teamId ?? undefined);

			const resentInvitation = await auth.api.createInvitation({
				headers,
				body: {
					organizationId: websiteData.organizationId,
					email: normalizeEmail(existingInvitation.email),
					role,
					teamId: teamIdPayload,
					resend: true,
				},
			});

			const organizationRecord = await getTeamOrganizationSummary(db, {
				organizationId: websiteData.organizationId,
			});

			if (!organizationRecord) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Organization not found.",
				});
			}

			const delivery = await sendTeamInvitationEmail({
				email: normalizeEmail(existingInvitation.email),
				invitationId: resentInvitation.id,
				inviterName: user.name ?? null,
				organizationName: organizationRecord.name,
				organizationSlug: organizationRecord.slug,
			});

			incrementTeamInviteCounter({
				counter: "invite_resend_attempt_total",
				organizationId: websiteData.organizationId,
				teamId: websiteData.teamId,
				websiteId: websiteData.id,
			});

			if (delivery.success) {
				logTeamInviteEvent({
					action: "resend_sent",
					email: normalizeEmail(existingInvitation.email),
					invitationId: resentInvitation.id,
					organizationId: websiteData.organizationId,
					role,
					teamId: websiteData.teamId,
					timestamp: new Date(),
					websiteId: websiteData.id,
				});
				incrementTeamInviteCounter({
					counter: "invite_resend_success_total",
					organizationId: websiteData.organizationId,
					teamId: websiteData.teamId,
					websiteId: websiteData.id,
				});
			} else {
				logTeamInviteEvent({
					action: "resend_failed",
					email: normalizeEmail(existingInvitation.email),
					invitationId: resentInvitation.id,
					organizationId: websiteData.organizationId,
					reason: delivery.errorMessage,
					role,
					teamId: websiteData.teamId,
					timestamp: new Date(),
					websiteId: websiteData.id,
				});
				incrementTeamInviteCounter({
					counter: "invite_delivery_failed_total",
					organizationId: websiteData.organizationId,
					teamId: websiteData.teamId,
					websiteId: websiteData.id,
				});
			}

			return {
				success: true,
				delivery: delivery.success ? "sent" : "failed",
				message: delivery.success
					? null
					: (delivery.errorMessage ??
						"Invitation resent, but delivery failed. Please try again."),
			};
		}),
	cancelInvitation: protectedProcedure
		.input(
			z.object({
				websiteSlug: z.string(),
				invitationId: z.string(),
			})
		)
		.mutation(async ({ ctx: { db, user, headers }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData?.teamId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const viewerMembership = await getTeamViewerMembershipRole(db, {
				organizationId: websiteData.organizationId,
				userId: user.id,
			});

			if (!hasPrivilegedRole(viewerMembership?.role)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only admins and owners can cancel invitations.",
				});
			}

			const existingInvitation = await getInvitationWebsiteScope(db, {
				invitationId: input.invitationId,
				organizationId: websiteData.organizationId,
			});

			if (
				!(
					existingInvitation &&
					invitationAppliesToWebsite(
						existingInvitation.role,
						existingInvitation.teamId,
						websiteData.teamId
					)
				)
			) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Invitation not found.",
				});
			}

			await auth.api.cancelInvitation({
				headers,
				body: {
					invitationId: input.invitationId,
				},
			});

			return { success: true };
		}),
	updateMemberRole: protectedProcedure
		.input(
			z.object({
				websiteSlug: z.string(),
				memberId: z.string(),
				role: updateRoleInputSchema,
			})
		)
		.mutation(async ({ ctx: { db, user, headers }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData?.teamId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const [viewerMembership, accessUsers] = await Promise.all([
				getTeamViewerMembershipRole(db, {
					organizationId: websiteData.organizationId,
					userId: user.id,
				}),
				listWebsiteAccessUsers(db, {
					organizationId: websiteData.organizationId,
					teamId: websiteData.teamId,
				}),
			]);

			if (!hasPrivilegedRole(viewerMembership?.role)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only admins and owners can update member roles.",
				});
			}

			const targetMember = accessUsers.find(
				(accessUser) => accessUser.memberId === input.memberId
			);

			if (!targetMember) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Member not found for this website.",
				});
			}

			await auth.api.updateMemberRole({
				headers,
				body: {
					organizationId: websiteData.organizationId,
					memberId: input.memberId,
					role: input.role,
				},
			});

			return {
				success: true,
			};
		}),
	removeMemberAccess: protectedProcedure
		.input(
			z.object({
				websiteSlug: z.string(),
				memberId: z.string(),
			})
		)
		.mutation(async ({ ctx: { db, user, headers, session }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData?.teamId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const [viewerMembership, accessUsers] = await Promise.all([
				getTeamViewerMembershipRole(db, {
					organizationId: websiteData.organizationId,
					userId: user.id,
				}),
				listWebsiteAccessUsers(db, {
					organizationId: websiteData.organizationId,
					teamId: websiteData.teamId,
				}),
			]);

			if (!hasPrivilegedRole(viewerMembership?.role)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only admins and owners can remove members.",
				});
			}

			const targetMember = accessUsers.find(
				(accessUser) => accessUser.memberId === input.memberId
			);

			if (!targetMember) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Member not found for this website.",
				});
			}

			if (targetMember.userId === user.id) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "You can't remove yourself from the organization here.",
				});
			}

			if (targetMember.accessSource === "team") {
				await ensureActiveOrganization({
					activeOrganizationId: session.activeOrganizationId,
					headers,
					organizationId: websiteData.organizationId,
				});
				await auth.api.removeTeamMember({
					headers,
					body: {
						teamId: websiteData.teamId,
						userId: targetMember.userId,
					},
				});
			} else {
				await auth.api.removeMember({
					headers,
					body: {
						organizationId: websiteData.organizationId,
						memberIdOrEmail: input.memberId,
					},
				});
			}

			return {
				success: true,
			};
		}),
	acceptJoinInvitation: protectedProcedure
		.input(
			z.object({
				organizationSlug: z.string(),
				invitationId: z.string(),
			})
		)
		.output(joinActionResultSchema)
		.mutation(async ({ ctx: { db, user, headers }, input }) => {
			const organizationRecord = await getOrganizationBySlug(
				db,
				input.organizationSlug
			);

			if (!organizationRecord) {
				return {
					resultCode: "invalid-invitation",
				};
			}

			const invitationRecord = await getJoinInvitation(db, {
				invitationId: input.invitationId,
				organizationId: organizationRecord.id,
			});

			if (
				!(
					invitationRecord &&
					invitationRecord.status === "pending" &&
					invitationRecord.expiresAt.getTime() > Date.now()
				)
			) {
				return {
					resultCode: "invalid-invitation",
				};
			}

			if (
				normalizeEmail(invitationRecord.email) !== normalizeEmail(user.email)
			) {
				return {
					resultCode: "wrong-account",
				};
			}

			try {
				await auth.api.acceptInvitation({
					headers,
					body: {
						invitationId: input.invitationId,
					},
				});
			} catch (error) {
				return mapJoinErrorToResult(error);
			}

			return {
				resultCode: "accepted",
			};
		}),
	rejectJoinInvitation: protectedProcedure
		.input(
			z.object({
				organizationSlug: z.string(),
				invitationId: z.string(),
			})
		)
		.output(joinActionResultSchema)
		.mutation(async ({ ctx: { db, user, headers }, input }) => {
			const organizationRecord = await getOrganizationBySlug(
				db,
				input.organizationSlug
			);

			if (!organizationRecord) {
				return {
					resultCode: "invalid-invitation",
				};
			}

			const invitationRecord = await getJoinInvitation(db, {
				invitationId: input.invitationId,
				organizationId: organizationRecord.id,
			});

			if (!invitationRecord) {
				return {
					resultCode: "invalid-invitation",
				};
			}

			if (
				normalizeEmail(invitationRecord.email) !== normalizeEmail(user.email)
			) {
				return {
					resultCode: "wrong-account",
				};
			}

			if (invitationRecord.status === "rejected") {
				return {
					resultCode: "rejected",
				};
			}

			if (
				invitationRecord.status !== "pending" ||
				invitationRecord.expiresAt.getTime() <= Date.now()
			) {
				return {
					resultCode: "invalid-invitation",
				};
			}

			try {
				await auth.api.rejectInvitation({
					headers,
					body: {
						invitationId: input.invitationId,
					},
				});
			} catch (error) {
				return mapJoinErrorToResult(error);
			}

			return {
				resultCode: "rejected",
			};
		}),
});
