import type { Database } from "@api/db";
import { website } from "@api/db/schema";
import {
	user as authUser,
	invitation,
	member,
	organization,
} from "@api/db/schema/auth";
import { and, eq, inArray, isNull } from "drizzle-orm";

export async function getTeamViewerMembershipRole(
	db: Database,
	params: {
		organizationId: string;
		userId: string;
	}
): Promise<{ role: string | null } | null> {
	const [viewerMembership] = await db
		.select({
			role: member.role,
		})
		.from(member)
		.where(
			and(
				eq(member.organizationId, params.organizationId),
				eq(member.userId, params.userId)
			)
		)
		.limit(1);

	return viewerMembership ?? null;
}

export async function getTeamInvitationForJoinRoute(
	db: Database,
	params: {
		invitationId: string;
		organizationId: string;
	}
): Promise<{
	id: string;
	email: string;
	status: string;
	expiresAt: Date;
	teamId: string | null;
} | null> {
	const [invitationRecord] = await db
		.select({
			id: invitation.id,
			email: invitation.email,
			status: invitation.status,
			expiresAt: invitation.expiresAt,
			teamId: invitation.teamId,
		})
		.from(invitation)
		.where(
			and(
				eq(invitation.id, params.invitationId),
				eq(invitation.organizationId, params.organizationId)
			)
		)
		.limit(1);

	return invitationRecord ?? null;
}

export async function getFirstWebsiteForTeamIds(
	db: Database,
	params: {
		organizationId: string;
		teamIds: string[];
	}
): Promise<{ name: string; logoUrl: string | null } | null> {
	if (params.teamIds.length === 0) {
		return null;
	}

	const [targetWebsite] = await db
		.select({
			name: website.name,
			logoUrl: website.logoUrl,
		})
		.from(website)
		.where(
			and(
				eq(website.organizationId, params.organizationId),
				inArray(website.teamId, params.teamIds),
				isNull(website.deletedAt)
			)
		)
		.limit(1);

	return targetWebsite ?? null;
}

export async function getAuthUserIdByEmail(
	db: Database,
	params: {
		email: string;
	}
): Promise<{ id: string } | null> {
	const [matchingUser] = await db
		.select({
			id: authUser.id,
		})
		.from(authUser)
		.where(eq(authUser.email, params.email))
		.limit(1);

	return matchingUser ?? null;
}

export async function getOrganizationMembershipIdByUser(
	db: Database,
	params: {
		organizationId: string;
		userId: string;
	}
): Promise<{ id: string } | null> {
	const [existingMembership] = await db
		.select({
			id: member.id,
		})
		.from(member)
		.where(
			and(
				eq(member.organizationId, params.organizationId),
				eq(member.userId, params.userId)
			)
		)
		.limit(1);

	return existingMembership ?? null;
}

export async function listOrganizationInvitationsWithInviter(
	db: Database,
	params: {
		organizationId: string;
	}
): Promise<
	Array<{
		id: string;
		email: string;
		role: string | null;
		status: string;
		expiresAt: Date;
		teamId: string | null;
		inviterName: string | null;
	}>
> {
	return db
		.select({
			id: invitation.id,
			email: invitation.email,
			role: invitation.role,
			status: invitation.status,
			expiresAt: invitation.expiresAt,
			teamId: invitation.teamId,
			inviterName: authUser.name,
		})
		.from(invitation)
		.leftJoin(authUser, eq(invitation.inviterId, authUser.id))
		.where(eq(invitation.organizationId, params.organizationId));
}

export async function getTeamOrganizationSummary(
	db: Database,
	params: {
		organizationId: string;
	}
): Promise<{ id: string; name: string; slug: string } | null> {
	const [organizationRecord] = await db
		.select({
			id: organization.id,
			name: organization.name,
			slug: organization.slug,
		})
		.from(organization)
		.where(eq(organization.id, params.organizationId))
		.limit(1);

	return organizationRecord ?? null;
}

export async function listOrganizationInvitations(
	db: Database,
	params: {
		organizationId: string;
	}
): Promise<
	Array<{
		id: string;
		email: string;
		role: string | null;
		status: string;
		expiresAt: Date;
		teamId: string | null;
	}>
> {
	return db
		.select({
			id: invitation.id,
			email: invitation.email,
			role: invitation.role,
			status: invitation.status,
			expiresAt: invitation.expiresAt,
			teamId: invitation.teamId,
		})
		.from(invitation)
		.where(eq(invitation.organizationId, params.organizationId));
}

export async function listOrganizationMembersWithEmails(
	db: Database,
	params: {
		organizationId: string;
	}
): Promise<
	Array<{
		memberId: string;
		userId: string;
		role: string | null;
		email: string;
	}>
> {
	return db
		.select({
			memberId: member.id,
			userId: member.userId,
			role: member.role,
			email: authUser.email,
		})
		.from(member)
		.innerJoin(authUser, eq(member.userId, authUser.id))
		.where(eq(member.organizationId, params.organizationId));
}

export async function getInvitationForResend(
	db: Database,
	params: {
		invitationId: string;
		organizationId: string;
	}
): Promise<{
	id: string;
	email: string;
	role: string | null;
	teamId: string | null;
	status: string;
	expiresAt: Date;
} | null> {
	const [existingInvitation] = await db
		.select({
			id: invitation.id,
			email: invitation.email,
			role: invitation.role,
			teamId: invitation.teamId,
			status: invitation.status,
			expiresAt: invitation.expiresAt,
		})
		.from(invitation)
		.where(
			and(
				eq(invitation.id, params.invitationId),
				eq(invitation.organizationId, params.organizationId)
			)
		)
		.limit(1);

	return existingInvitation ?? null;
}

export async function getInvitationWebsiteScope(
	db: Database,
	params: {
		invitationId: string;
		organizationId: string;
	}
): Promise<{ id: string; role: string | null; teamId: string | null } | null> {
	const [existingInvitation] = await db
		.select({
			id: invitation.id,
			role: invitation.role,
			teamId: invitation.teamId,
		})
		.from(invitation)
		.where(
			and(
				eq(invitation.id, params.invitationId),
				eq(invitation.organizationId, params.organizationId)
			)
		)
		.limit(1);

	return existingInvitation ?? null;
}

export async function getJoinInvitation(
	db: Database,
	params: {
		invitationId: string;
		organizationId: string;
	}
): Promise<{
	id: string;
	email: string;
	status: string;
	expiresAt: Date;
} | null> {
	const [invitationRecord] = await db
		.select({
			id: invitation.id,
			email: invitation.email,
			status: invitation.status,
			expiresAt: invitation.expiresAt,
		})
		.from(invitation)
		.where(
			and(
				eq(invitation.id, params.invitationId),
				eq(invitation.organizationId, params.organizationId)
			)
		)
		.limit(1);

	return invitationRecord ?? null;
}
