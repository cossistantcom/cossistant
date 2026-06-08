import type { Database } from "@api/db";
import { SECURITY_CACHE_CONFIG } from "@api/db/cache/config";
import { member, teamMember, user } from "@api/db/schema";
import { listWebsiteAccessUsers } from "@api/lib/team-seats";
import { normalizeHumanAgentName } from "@cossistant/core";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";

const WEBSITE_ACCESS_ROLES = ["owner", "admin"] as const;

export type WebsiteMember = {
	id: string;
	name: string | null;
	email: string;
	image: string | null;
	role: string | null;
	createdAt: string;
	updatedAt: string;
	lastSeenAt: string | null;
};

export async function getOrganizationMemberByUserId(
	db: Database,
	params: {
		organizationId: string;
		userId: string;
	}
): Promise<typeof member.$inferSelect | null> {
	const [membership] = await db
		.select()
		.from(member)
		.where(
			and(
				eq(member.userId, params.userId),
				eq(member.organizationId, params.organizationId)
			)
		)
		.limit(1);

	return membership ?? null;
}

// Check if user has access to a website
export async function getWebsiteMembers(
	db: Database,
	params: {
		organizationId: string;
		websiteTeamId: string;
	}
): Promise<WebsiteMember[]> {
	const members = await listWebsiteAccessUsers(db, {
		organizationId: params.organizationId,
		teamId: params.websiteTeamId,
	});

	return members.map((websiteAccessUser) => ({
		id: websiteAccessUser.userId,
		name: normalizeHumanAgentName(websiteAccessUser.name),
		email: websiteAccessUser.email,
		image: websiteAccessUser.image,
		role: websiteAccessUser.role,
		createdAt: (
			websiteAccessUser.joinedAt ??
			websiteAccessUser.updatedAt ??
			new Date()
		).toISOString(),
		updatedAt: (websiteAccessUser.updatedAt ?? new Date()).toISOString(),
		lastSeenAt: websiteAccessUser.lastSeenAt?.toISOString() ?? null,
	}));
}

export async function getWebsiteMemberById(
	db: Database,
	params: {
		organizationId: string;
		websiteTeamId: string;
		userId: string;
	}
): Promise<WebsiteMember | null> {
	const [entry] = await db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			image: user.image,
			role: member.role,
			createdAt: member.createdAt,
			updatedAt: user.updatedAt,
			lastSeenAt: user.lastSeenAt,
		})
		.from(user)
		.leftJoin(
			member,
			and(
				eq(member.userId, user.id),
				eq(member.organizationId, params.organizationId)
			)
		)
		.leftJoin(
			teamMember,
			and(
				eq(teamMember.userId, user.id),
				eq(teamMember.teamId, params.websiteTeamId)
			)
		)
		.where(
			and(
				eq(user.id, params.userId),
				or(
					isNotNull(teamMember.userId),
					inArray(member.role, WEBSITE_ACCESS_ROLES)
				)
			)
		)
		.limit(1)
		.$withCache({
			config: SECURITY_CACHE_CONFIG,
		});

	if (!entry) {
		return null;
	}

	return {
		id: entry.id,
		name: normalizeHumanAgentName(entry.name),
		email: entry.email,
		image: entry.image,
		role: entry.role ?? "member",
		createdAt: (entry.createdAt ?? entry.updatedAt ?? new Date()).toISOString(),
		updatedAt: (entry.updatedAt ?? new Date()).toISOString(),
		lastSeenAt: entry.lastSeenAt?.toISOString() ?? null,
	};
}
