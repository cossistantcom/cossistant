import type { Database } from "@api/db";
import type { getWebsiteBySlugWithAccess } from "@api/db/queries/website";
import { invitation, member, teamMember, user } from "@api/db/schema";
import { getPlanForWebsite } from "@api/lib/plans/access";
import {
	hasAnyRole,
	normalizeHumanAgentName,
	parseCommaSeparatedRoles,
} from "@plasma/core";
import { and, eq, gt, inArray, sql } from "drizzle-orm";

const PRIVILEGED_ROLES = ["owner", "admin"] as const;
const TEAM_INVITE_LOCK_NAMESPACE = "team-invite";

export type WebsiteRecord = NonNullable<
	Awaited<ReturnType<typeof getWebsiteBySlugWithAccess>>
>;

type InviteLockResult<T> =
	| {
			acquired: false;
	  }
	| {
			acquired: true;
			value: T;
	  };

function buildWebsiteInviteLockKey(websiteId: string): string {
	return `${TEAM_INVITE_LOCK_NAMESPACE}:${websiteId}`;
}

export async function withWebsiteInviteAdvisoryLock<T>(
	db: Database,
	params: {
		websiteId: string;
		run: () => Promise<T>;
	}
): Promise<InviteLockResult<T>> {
	return db.transaction(async (tx) => {
		const lockKey = buildWebsiteInviteLockKey(params.websiteId);
		const lockResult = await tx.execute(
			sql<{
				locked: boolean;
			}>`select pg_try_advisory_xact_lock(hashtext(${lockKey})) as locked`
		);

		if (lockResult.rows[0]?.locked !== true) {
			return {
				acquired: false,
			};
		}

		const value = await params.run();
		return {
			acquired: true,
			value,
		};
	});
}

export function parseRoleList(value: string | null | undefined): string[] {
	return parseCommaSeparatedRoles(value);
}

export function hasPrivilegedRole(value: string | null | undefined): boolean {
	return hasAnyRole(value, PRIVILEGED_ROLES);
}

export function normalizeEmail(value: string): string {
	return value.trim().toLowerCase();
}

export function invitationAppliesToWebsite(
	invitationRole: string | null | undefined,
	invitationTeamIds: string | null | undefined,
	websiteTeamId: string
): boolean {
	if (hasPrivilegedRole(invitationRole)) {
		return true;
	}

	if (!invitationTeamIds) {
		return false;
	}

	const invitationTeams = invitationTeamIds
		.split(",")
		.map((teamId) => teamId.trim())
		.filter(Boolean);

	return invitationTeams.includes(websiteTeamId);
}

export type WebsiteAccessUser = {
	memberId: string | null;
	userId: string;
	name: string | null;
	email: string;
	image: string | null;
	role: string | null;
	joinedAt: Date | null;
	updatedAt: Date | null;
	lastSeenAt: Date | null;
	accessSource: "team" | "org-admin-owner" | "team-and-org-admin-owner";
};

export async function listWebsiteAccessUsers(
	db: Database,
	params: {
		organizationId: string;
		teamId: string;
	}
): Promise<WebsiteAccessUser[]> {
	const [organizationMembers, teamMemberships] = await Promise.all([
		db
			.select({
				memberId: member.id,
				userId: user.id,
				name: user.name,
				email: user.email,
				image: user.image,
				role: member.role,
				joinedAt: member.createdAt,
				updatedAt: user.updatedAt,
				lastSeenAt: user.lastSeenAt,
			})
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(eq(member.organizationId, params.organizationId)),
		db
			.select({
				userId: teamMember.userId,
			})
			.from(teamMember)
			.where(eq(teamMember.teamId, params.teamId)),
	]);

	const teamUserIds = new Set(teamMemberships.map((item) => item.userId));
	const usersById = new Map<string, WebsiteAccessUser>();

	for (const row of organizationMembers) {
		const isTeamMember = teamUserIds.has(row.userId);
		const isPrivileged = hasPrivilegedRole(row.role);

		if (!(isTeamMember || isPrivileged)) {
			continue;
		}

		let accessSource: WebsiteAccessUser["accessSource"] = "team";

		if (isPrivileged && isTeamMember) {
			accessSource = "team-and-org-admin-owner";
		} else if (isPrivileged) {
			accessSource = "org-admin-owner";
		}

		usersById.set(row.userId, {
			memberId: row.memberId,
			userId: row.userId,
			name: normalizeHumanAgentName(row.name),
			email: normalizeEmail(row.email),
			image: row.image,
			role: row.role,
			joinedAt: row.joinedAt,
			updatedAt: row.updatedAt,
			lastSeenAt: row.lastSeenAt,
			accessSource,
		});
	}

	const missingTeamUserIds = [...teamUserIds].filter(
		(userId) => !usersById.has(userId)
	);

	if (missingTeamUserIds.length > 0) {
		const missingUsers = await db
			.select({
				userId: user.id,
				name: user.name,
				email: user.email,
				image: user.image,
				updatedAt: user.updatedAt,
				lastSeenAt: user.lastSeenAt,
			})
			.from(user)
			.where(inArray(user.id, missingTeamUserIds));

		for (const row of missingUsers) {
			usersById.set(row.userId, {
				memberId: null,
				userId: row.userId,
				name: normalizeHumanAgentName(row.name),
				email: normalizeEmail(row.email),
				image: row.image,
				role: "member",
				joinedAt: null,
				updatedAt: row.updatedAt,
				lastSeenAt: row.lastSeenAt,
				accessSource: "team",
			});
		}
	}

	return [...usersById.values()].sort((a, b) => {
		if (a.accessSource === b.accessSource) {
			return (a.name ?? a.email).localeCompare(b.name ?? b.email);
		}

		if (a.accessSource === "team-and-org-admin-owner") {
			return -1;
		}
		if (b.accessSource === "team-and-org-admin-owner") {
			return 1;
		}
		if (a.accessSource === "org-admin-owner") {
			return -1;
		}
		if (b.accessSource === "org-admin-owner") {
			return 1;
		}

		return 0;
	});
}

export type WebsiteSeatUsage = {
	limit: number | null;
	used: number;
	reserved: number;
	remaining: number | null;
};

export async function calculateWebsiteSeatUsage(
	db: Database,
	params: {
		website: WebsiteRecord;
	}
): Promise<WebsiteSeatUsage> {
	const { website } = params;
	const accessUsers = await listWebsiteAccessUsers(db, {
		organizationId: website.organizationId,
		teamId: website.teamId,
	});

	const pendingInvitations = await db
		.select({
			email: invitation.email,
			role: invitation.role,
			teamId: invitation.teamId,
		})
		.from(invitation)
		.where(
			and(
				eq(invitation.organizationId, website.organizationId),
				eq(invitation.status, "pending"),
				gt(invitation.expiresAt, new Date())
			)
		);

	const reservedEmails = new Set<string>();

	for (const row of pendingInvitations) {
		if (!invitationAppliesToWebsite(row.role, row.teamId, website.teamId)) {
			continue;
		}
		reservedEmails.add(normalizeEmail(row.email));
	}

	const planInfo = await getPlanForWebsite(website);
	const featureValue = planInfo.features["team-members"];
	const seatLimit = typeof featureValue === "number" ? featureValue : null;
	const used = accessUsers.length;
	const reserved = reservedEmails.size;
	const remaining =
		seatLimit === null ? null : Math.max(0, seatLimit - used - reserved);

	return {
		limit: seatLimit,
		used,
		reserved,
		remaining,
	};
}
