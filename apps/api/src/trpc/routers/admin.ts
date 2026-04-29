import {
	member,
	organization,
	team,
	teamMember,
	user,
	website,
} from "@api/db/schema";
import { auth } from "@api/lib/auth";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, createTRPCRouter, protectedProcedure } from "../init";

const ADMIN_USER_LIMIT = 40;
const DEFAULT_BAN_REASON = "Banned from the Cossistant admin panel";
const WEBSITE_WIDE_ROLES = ["owner", "admin"];

const userIdInput = z.object({
	userId: z.string().min(1),
});

function toIsoString(value: Date | string | null | undefined): string | null {
	if (!value) {
		return null;
	}

	return value instanceof Date ? value.toISOString() : value;
}

function serializeAdminUser(row: typeof user.$inferSelect) {
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
			const likeTerm = search ? `%${search}%` : null;

			const rows = await db
				.select()
				.from(user)
				.where(
					likeTerm
						? or(ilike(user.email, likeTerm), ilike(user.name, likeTerm))
						: undefined
				)
				.orderBy(desc(user.createdAt))
				.limit(ADMIN_USER_LIMIT);

			return {
				users: rows.map(serializeAdminUser),
				limit: ADMIN_USER_LIMIT,
			};
		}),

	getUserWebsites: adminProcedure
		.input(userIdInput)
		.query(async ({ ctx: { db }, input }) => {
			const [organizationMemberships, teamMemberships] = await Promise.all([
				db
					.select({
						organizationId: organization.id,
						organizationName: organization.name,
						organizationSlug: organization.slug,
						role: member.role,
						joinedAt: member.createdAt,
					})
					.from(member)
					.innerJoin(organization, eq(member.organizationId, organization.id))
					.where(eq(member.userId, input.userId))
					.orderBy(desc(member.createdAt)),
				db
					.select({
						teamId: teamMember.teamId,
						organizationId: team.organizationId,
					})
					.from(teamMember)
					.innerJoin(team, eq(teamMember.teamId, team.id))
					.where(eq(teamMember.userId, input.userId)),
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
				return { organizations: [] };
			}

			const missingOrganizationIds = [...organizationIds].filter(
				(id) => !organizationById.has(id)
			);

			if (missingOrganizationIds.length > 0) {
				const missingOrganizations = await db
					.select({
						id: organization.id,
						name: organization.name,
						slug: organization.slug,
					})
					.from(organization)
					.where(inArray(organization.id, missingOrganizationIds));

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

			const websiteRows = await db
				.select({
					id: website.id,
					name: website.name,
					slug: website.slug,
					domain: website.domain,
					logoUrl: website.logoUrl,
					organizationId: website.organizationId,
					teamId: website.teamId,
					createdAt: website.createdAt,
				})
				.from(website)
				.where(
					and(
						inArray(website.organizationId, [...organizationIds]),
						isNull(website.deletedAt)
					)
				)
				.orderBy(desc(website.createdAt));

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
				organizations: [...organizationById.values()].map((org) => ({
					...org,
					websites: websitesByOrganizationId.get(org.id) ?? [],
				})),
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
