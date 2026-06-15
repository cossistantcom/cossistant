import type { Database } from "@api/db";
import {
	member,
	organization,
	team,
	teamMember,
	type UserSelect,
	user,
	website,
} from "@api/db/schema";
import { WebsiteStatus } from "@cossistant/types";
import {
	and,
	asc,
	count,
	desc,
	eq,
	ilike,
	inArray,
	isNull,
	or,
} from "drizzle-orm";

export async function listOrganizationPolarCustomerContactCandidates(
	db: Pick<Database, "select">,
	params: {
		organizationId: string;
	}
): Promise<
	Array<{
		email: string;
		name: string | null;
		role: string | null;
		createdAt: string | Date | null;
	}>
> {
	return db
		.select({
			email: user.email,
			name: user.name,
			role: member.role,
			createdAt: member.createdAt,
		})
		.from(member)
		.innerJoin(user, eq(member.userId, user.id))
		.where(eq(member.organizationId, params.organizationId))
		.orderBy(asc(member.createdAt));
}

export async function listAdminUsers(
	db: Database,
	params: {
		search?: string | null;
		limit: number;
	}
): Promise<UserSelect[]> {
	const likeTerm = params.search ? `%${params.search}%` : null;

	return db
		.select()
		.from(user)
		.where(
			likeTerm
				? or(ilike(user.email, likeTerm), ilike(user.name, likeTerm))
				: undefined
		)
		.orderBy(desc(user.createdAt))
		.limit(params.limit);
}

export type AdminWebsiteListRow = {
	id: string;
	name: string;
	slug: string;
	domain: string;
	logoUrl: string | null;
	status: WebsiteStatus;
	organizationId: string;
	organizationName: string;
	organizationSlug: string;
	teamId: string;
	createdAt: string;
	updatedAt: string;
};

export async function listAdminWebsites(
	db: Database,
	params: {
		search?: string | null;
		limit: number;
	}
): Promise<AdminWebsiteListRow[]> {
	const likeTerm = params.search ? `%${params.search}%` : null;

	return db
		.select({
			id: website.id,
			name: website.name,
			slug: website.slug,
			domain: website.domain,
			logoUrl: website.logoUrl,
			status: website.status,
			organizationId: website.organizationId,
			organizationName: organization.name,
			organizationSlug: organization.slug,
			teamId: website.teamId,
			createdAt: website.createdAt,
			updatedAt: website.updatedAt,
		})
		.from(website)
		.innerJoin(organization, eq(website.organizationId, organization.id))
		.where(
			and(
				eq(website.status, WebsiteStatus.ACTIVE),
				isNull(website.deletedAt),
				likeTerm
					? or(
							ilike(website.name, likeTerm),
							ilike(website.slug, likeTerm),
							ilike(website.domain, likeTerm),
							ilike(organization.name, likeTerm)
						)
					: undefined
			)
		)
		.orderBy(desc(website.createdAt))
		.limit(params.limit);
}

export async function getAdminUserById(
	db: Database,
	params: {
		userId: string;
	}
): Promise<UserSelect | null> {
	const [selectedUser] = await db
		.select()
		.from(user)
		.where(eq(user.id, params.userId))
		.limit(1);

	return selectedUser ?? null;
}

export async function listAdminUserOrganizationMemberships(
	db: Database,
	params: {
		userId: string;
	}
): Promise<
	Array<{
		organizationId: string;
		organizationName: string;
		organizationSlug: string;
		role: string | null;
		joinedAt: string | Date | null;
	}>
> {
	return db
		.select({
			organizationId: organization.id,
			organizationName: organization.name,
			organizationSlug: organization.slug,
			role: member.role,
			joinedAt: member.createdAt,
		})
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(eq(member.userId, params.userId))
		.orderBy(desc(member.createdAt));
}

export async function listAdminUserTeamMemberships(
	db: Database,
	params: {
		userId: string;
	}
): Promise<Array<{ teamId: string; organizationId: string }>> {
	return db
		.select({
			teamId: teamMember.teamId,
			organizationId: team.organizationId,
		})
		.from(teamMember)
		.innerJoin(team, eq(teamMember.teamId, team.id))
		.where(eq(teamMember.userId, params.userId));
}

export async function listAdminOrganizationsByIds(
	db: Database,
	params: {
		organizationIds: string[];
	}
): Promise<Array<{ id: string; name: string; slug: string }>> {
	if (params.organizationIds.length === 0) {
		return [];
	}

	return db
		.select({
			id: organization.id,
			name: organization.name,
			slug: organization.slug,
		})
		.from(organization)
		.where(inArray(organization.id, params.organizationIds));
}

export async function listAdminWebsiteAccessRowsForOrganizations(
	db: Database,
	params: {
		organizationIds: string[];
	}
): Promise<
	Array<{
		id: string;
		name: string;
		slug: string;
		domain: string;
		logoUrl: string | null;
		organizationId: string;
		teamId: string;
		createdAt: string;
	}>
> {
	if (params.organizationIds.length === 0) {
		return [];
	}

	return db
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
				inArray(website.organizationId, params.organizationIds),
				isNull(website.deletedAt)
			)
		)
		.orderBy(desc(website.createdAt));
}

export async function getActiveAdminWebsiteById(
	db: Database,
	params: {
		websiteId: string;
	}
): Promise<typeof website.$inferSelect | null> {
	const [site] = await db
		.select()
		.from(website)
		.where(
			and(
				eq(website.id, params.websiteId),
				eq(website.status, WebsiteStatus.ACTIVE),
				isNull(website.deletedAt)
			)
		)
		.limit(1);

	return site ?? null;
}

export async function getAdminWebsiteForAiUsageGrant(
	db: Database,
	params: {
		websiteId: string;
	}
): Promise<{
	id: string;
	name: string;
	slug: string;
	organizationId: string;
	organizationName: string;
} | null> {
	const [site] = await db
		.select({
			id: website.id,
			name: website.name,
			slug: website.slug,
			organizationId: website.organizationId,
			organizationName: organization.name,
		})
		.from(website)
		.innerJoin(organization, eq(website.organizationId, organization.id))
		.where(and(eq(website.id, params.websiteId), isNull(website.deletedAt)))
		.limit(1);

	return site ?? null;
}

export async function getAdminWebsiteDeletionTarget(
	db: Database,
	params: {
		websiteId: string;
	}
): Promise<{
	id: string;
	name: string;
	slug: string;
	domain: string;
	organizationId: string;
	organizationName: string;
	organizationSlug: string;
	teamId: string;
} | null> {
	const [site] = await db
		.select({
			id: website.id,
			name: website.name,
			slug: website.slug,
			domain: website.domain,
			organizationId: website.organizationId,
			organizationName: organization.name,
			organizationSlug: organization.slug,
			teamId: website.teamId,
		})
		.from(website)
		.innerJoin(organization, eq(website.organizationId, organization.id))
		.where(
			and(
				eq(website.id, params.websiteId),
				eq(website.status, WebsiteStatus.ACTIVE),
				isNull(website.deletedAt)
			)
		)
		.limit(1);

	return site ?? null;
}

export async function countActiveAdminWebsitesForOrganization(
	db: Database,
	params: {
		organizationId: string;
	}
): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(website)
		.where(
			and(
				eq(website.organizationId, params.organizationId),
				eq(website.status, WebsiteStatus.ACTIVE),
				isNull(website.deletedAt)
			)
		);

	return Number(row?.value ?? 0);
}

export async function listAdminOrganizationMemberEmails(
	db: Database,
	params: {
		organizationId: string;
	}
): Promise<Array<{ email: string; userId: string }>> {
	return db
		.select({
			email: user.email,
			userId: user.id,
		})
		.from(member)
		.innerJoin(user, eq(member.userId, user.id))
		.where(eq(member.organizationId, params.organizationId))
		.orderBy(asc(member.createdAt));
}

export async function deleteAdminOrganizationById(
	db: Database,
	params: {
		organizationId: string;
	}
): Promise<{ id: string; slug: string } | null> {
	const [deletedOrganization] = await db
		.delete(organization)
		.where(eq(organization.id, params.organizationId))
		.returning({
			id: organization.id,
			slug: organization.slug,
		});

	return deletedOrganization ?? null;
}
