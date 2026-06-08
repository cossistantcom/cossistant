import type { Database } from "@api/db";
import {
	type AdminWebsiteListRow,
	getActiveAdminWebsiteById,
	getAdminUserById,
	getAdminWebsiteForAiUsageGrant,
	listAdminOrganizationsByIds,
	listAdminUserOrganizationMemberships,
	listAdminUsers,
	listAdminUserTeamMemberships,
	listAdminWebsiteAccessRowsForOrganizations,
	listAdminWebsites,
	listOrganizationPolarCustomerContactCandidates,
} from "@api/db/queries/admin";
import type { UserSelect } from "@api/db/schema";
import { resolveAiCreditsView } from "@api/lib/ai-credits/plan-view";
import {
	getAiCreditMeterState,
	grantAiCreditUsage,
} from "@api/lib/ai-credits/polar-meter";
import { auth } from "@api/lib/auth";
import { isPolarEnabled } from "@api/lib/billing-mode";
import { getPlanForWebsite } from "@api/lib/plans/access";
import { getCustomerByOrganizationId } from "@api/lib/plans/polar";
import polarClient from "@api/lib/polar";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, createTRPCRouter, protectedProcedure } from "../init";

const ADMIN_USER_LIMIT = 40;
const ADMIN_WEBSITE_LIMIT = 40;
const DEFAULT_BAN_REASON = "Banned from the Cossistant admin panel";
const WEBSITE_WIDE_ROLES = ["owner", "admin"];

const userIdInput = z.object({
	userId: z.string().min(1),
});

const grantAmountInput = z
	.number()
	.finite()
	.positive()
	.max(1_000_000)
	.transform((value) => Math.round(value * 1000) / 1000)
	.refine((value) => value > 0, {
		message: "Amount must be greater than 0",
	});

function toIsoString(value: Date | string | null | undefined): string | null {
	if (!value) {
		return null;
	}

	return value instanceof Date ? value.toISOString() : value;
}

function serializeAdminUser(row: UserSelect) {
	return {
		id: row.id,
		name: row.name,
		email: row.email,
		image: row.image,
		role: row.role ?? "user",
		banned: row.banned ?? false,
		banReason: row.banReason,
		banExpires: toIsoString(row.banExpires),
		createdAt: toIsoString(row.createdAt) ?? new Date(0).toISOString(),
		updatedAt: toIsoString(row.updatedAt) ?? new Date(0).toISOString(),
		lastSeenAt: toIsoString(row.lastSeenAt),
	};
}

function serializeAdminWebsite(row: AdminWebsiteListRow) {
	return {
		id: row.id,
		name: row.name,
		slug: row.slug,
		domain: row.domain,
		logoUrl: row.logoUrl,
		status: row.status,
		organizationId: row.organizationId,
		organizationName: row.organizationName,
		organizationSlug: row.organizationSlug,
		teamId: row.teamId,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

function hasWebsiteWideRole(role: string | null | undefined): boolean {
	if (!role) {
		return false;
	}

	const normalizedRoles = role
		.split(",")
		.map((item) => item.trim().toLowerCase())
		.filter(Boolean);

	return normalizedRoles.some((item) => WEBSITE_WIDE_ROLES.includes(item));
}

function hasOwnerRole(role: string | null | undefined): boolean {
	if (!role) {
		return false;
	}

	return role
		.split(",")
		.map((item) => item.trim().toLowerCase())
		.includes("owner");
}

function getSetCookieValues(headers: Headers): string[] {
	const maybeGetSetCookie = (
		headers as Headers & { getSetCookie?: () => string[] }
	).getSetCookie?.();

	if (maybeGetSetCookie?.length) {
		return maybeGetSetCookie;
	}

	const value = headers.get("set-cookie");
	return value ? [value] : [];
}

function appendAuthCookies(
	headers: Headers | null | undefined,
	appendResponseHeader: ((name: string, value: string) => void) | undefined
) {
	if (!(headers && appendResponseHeader)) {
		return;
	}

	for (const cookie of getSetCookieValues(headers)) {
		appendResponseHeader("Set-Cookie", cookie);
	}
}

async function ensurePolarCustomerForOrganization(params: {
	db: Pick<Database, "select">;
	organizationId: string;
	organizationName: string;
}) {
	const existingCustomer = await getCustomerByOrganizationId(
		params.organizationId
	);
	if (existingCustomer) {
		return {
			customerId: existingCustomer.id,
			created: false,
		};
	}

	const members = await listOrganizationPolarCustomerContactCandidates(
		params.db,
		{
			organizationId: params.organizationId,
		}
	);

	const customerContact =
		members.find((row) => hasOwnerRole(row.role)) ?? members[0] ?? null;

	if (!customerContact?.email) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"No organization member email is available for Polar customer creation",
		});
	}

	const customer = await polarClient.customers.create({
		email: customerContact.email,
		externalId: params.organizationId,
		name: params.organizationName || customerContact.name,
	});

	return {
		customerId: customer.id,
		created: true,
	};
}

export const adminRouter = createTRPCRouter({
	listUsers: adminProcedure
		.input(
			z
				.object({
					search: z.string().max(200).optional(),
				})
				.optional()
		)
		.query(async ({ ctx: { db }, input }) => {
			const search = input?.search?.trim();
			const rows = await listAdminUsers(db, {
				search,
				limit: ADMIN_USER_LIMIT,
			});

			return {
				users: rows.map(serializeAdminUser),
				limit: ADMIN_USER_LIMIT,
			};
		}),

	listWebsites: adminProcedure
		.input(
			z
				.object({
					search: z.string().max(200).optional(),
				})
				.optional()
		)
		.query(async ({ ctx: { db }, input }) => {
			const search = input?.search?.trim();
			const rows = await listAdminWebsites(db, {
				search,
				limit: ADMIN_WEBSITE_LIMIT,
			});

			return {
				websites: rows.map(serializeAdminWebsite),
				limit: ADMIN_WEBSITE_LIMIT,
			};
		}),

	getUserWebsites: adminProcedure
		.input(userIdInput)
		.query(async ({ ctx: { db }, input }) => {
			const selectedUser = await getAdminUserById(db, {
				userId: input.userId,
			});

			if (!selectedUser) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "User not found",
				});
			}

			const [organizationMemberships, teamMemberships] = await Promise.all([
				listAdminUserOrganizationMemberships(db, {
					userId: input.userId,
				}),
				listAdminUserTeamMemberships(db, {
					userId: input.userId,
				}),
			]);

			const organizationIds = new Set<string>();
			const organizationById = new Map<
				string,
				{
					id: string;
					name: string;
					slug: string;
					role: string | null;
					joinedAt: string | null;
				}
			>();
			const orgRoleById = new Map<string, string | null>();
			const teamIds = new Set<string>();

			for (const row of organizationMemberships) {
				organizationIds.add(row.organizationId);
				orgRoleById.set(row.organizationId, row.role);
				organizationById.set(row.organizationId, {
					id: row.organizationId,
					name: row.organizationName,
					slug: row.organizationSlug,
					role: row.role,
					joinedAt: toIsoString(row.joinedAt),
				});
			}

			for (const row of teamMemberships) {
				teamIds.add(row.teamId);
				organizationIds.add(row.organizationId);
			}

			if (organizationIds.size === 0) {
				return {
					user: serializeAdminUser(selectedUser),
					organizations: [],
				};
			}

			const missingOrganizationIds = [...organizationIds].filter(
				(id) => !organizationById.has(id)
			);

			if (missingOrganizationIds.length > 0) {
				const missingOrganizations = await listAdminOrganizationsByIds(db, {
					organizationIds: missingOrganizationIds,
				});

				for (const row of missingOrganizations) {
					organizationById.set(row.id, {
						id: row.id,
						name: row.name,
						slug: row.slug,
						role: orgRoleById.get(row.id) ?? null,
						joinedAt: null,
					});
				}
			}

			const websiteRows = await listAdminWebsiteAccessRowsForOrganizations(db, {
				organizationIds: [...organizationIds],
			});

			const websitesByOrganizationId = new Map<
				string,
				Array<{
					id: string;
					name: string;
					slug: string;
					domain: string;
					logoUrl: string | null;
					accessSource: "organization" | "team";
					createdAt: string;
				}>
			>();

			for (const row of websiteRows) {
				const organizationRole = orgRoleById.get(row.organizationId);
				const hasOrganizationAccess = hasWebsiteWideRole(organizationRole);
				const hasTeamAccess = teamIds.has(row.teamId);

				if (!(hasOrganizationAccess || hasTeamAccess)) {
					continue;
				}

				const existing = websitesByOrganizationId.get(row.organizationId) ?? [];
				existing.push({
					id: row.id,
					name: row.name,
					slug: row.slug,
					domain: row.domain,
					logoUrl: row.logoUrl,
					accessSource: hasOrganizationAccess ? "organization" : "team",
					createdAt: row.createdAt,
				});
				websitesByOrganizationId.set(row.organizationId, existing);
			}

			return {
				user: serializeAdminUser(selectedUser),
				organizations: [...organizationById.values()].map((org) => ({
					...org,
					websites: websitesByOrganizationId.get(org.id) ?? [],
				})),
			};
		}),

	getWebsiteAiUsage: adminProcedure
		.input(
			z.object({
				websiteId: z.string().min(1),
			})
		)
		.query(async ({ ctx, input }) => {
			const site = await getActiveAdminWebsiteById(ctx.db, {
				websiteId: input.websiteId,
			});

			if (!site) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found",
				});
			}

			const [planInfo, aiCreditMeterState] = await Promise.all([
				getPlanForWebsite(site),
				getAiCreditMeterState(site.organizationId),
			]);

			const includedAiCredits =
				typeof planInfo.features["ai-credit"] === "number"
					? planInfo.features["ai-credit"]
					: null;

			return {
				website: {
					id: site.id,
					name: site.name,
					slug: site.slug,
					organizationId: site.organizationId,
				},
				plan: {
					name: planInfo.planName,
					displayName: planInfo.displayName,
					includedAiCredits,
				},
				billing: planInfo.billing,
				aiCredits: resolveAiCreditsView({
					planInfo,
					meterState: aiCreditMeterState,
				}),
			};
		}),

	grantWebsiteAiUsage: adminProcedure
		.input(
			z.object({
				websiteId: z.string().min(1),
				amount: grantAmountInput,
			})
		)
		.mutation(async ({ ctx, input }) => {
			if (!isPolarEnabled()) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Polar billing is disabled for this deployment",
				});
			}

			const site = await getAdminWebsiteForAiUsageGrant(ctx.db, {
				websiteId: input.websiteId,
			});

			if (!site) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found",
				});
			}

			const customer = await ensurePolarCustomerForOrganization({
				db: ctx.db,
				organizationId: site.organizationId,
				organizationName: site.organizationName,
			});

			const result = await grantAiCreditUsage({
				organizationId: site.organizationId,
				websiteId: site.id,
				amount: input.amount,
				adminUserId: ctx.user.id,
			});

			if (result.status !== "ingested") {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to grant AI usage",
				});
			}

			return {
				success: true,
				amount: input.amount,
				websiteId: site.id,
				websiteSlug: site.slug,
				organizationId: site.organizationId,
				customerId: customer.customerId,
				customerCreated: customer.created,
			};
		}),

	banUser: adminProcedure
		.input(
			userIdInput.extend({
				banReason: z.string().max(500).optional(),
			})
		)
		.mutation(async ({ ctx, input }) => {
			const result = await auth.api.banUser({
				body: {
					userId: input.userId,
					banReason: input.banReason ?? DEFAULT_BAN_REASON,
				},
				headers: ctx.headers,
				returnHeaders: true,
			});

			appendAuthCookies(result.headers, ctx.appendResponseHeader);

			return { success: true };
		}),

	unbanUser: adminProcedure
		.input(userIdInput)
		.mutation(async ({ ctx, input }) => {
			const result = await auth.api.unbanUser({
				body: {
					userId: input.userId,
				},
				headers: ctx.headers,
				returnHeaders: true,
			});

			appendAuthCookies(result.headers, ctx.appendResponseHeader);

			return { success: true };
		}),

	revokeUserSessions: adminProcedure
		.input(userIdInput)
		.mutation(async ({ ctx, input }) => {
			const result = await auth.api.revokeUserSessions({
				body: {
					userId: input.userId,
				},
				headers: ctx.headers,
				returnHeaders: true,
			});

			appendAuthCookies(result.headers, ctx.appendResponseHeader);

			return { success: true };
		}),

	impersonateUser: adminProcedure
		.input(userIdInput)
		.mutation(async ({ ctx, input }) => {
			const result = await auth.api.impersonateUser({
				body: {
					userId: input.userId,
				},
				headers: ctx.headers,
				returnHeaders: true,
			});

			appendAuthCookies(result.headers, ctx.appendResponseHeader);

			return { success: true };
		}),

	stopImpersonating: protectedProcedure.mutation(async ({ ctx }) => {
		if (!ctx.session.impersonatedBy) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "You are not impersonating anyone",
			});
		}

		const result = await auth.api.stopImpersonating({
			headers: ctx.headers,
			returnHeaders: true,
		});

		appendAuthCookies(result.headers, ctx.appendResponseHeader);

		return { success: true };
	}),
});
