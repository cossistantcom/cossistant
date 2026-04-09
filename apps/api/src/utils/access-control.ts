import type { Database } from "@api/db";
import { member } from "@api/db/schema/auth";
import { and, eq, inArray } from "drizzle-orm";

const ORGANIZATION_ADMIN_ROLES = ["owner", "admin"] as const;

export type OrganizationAdminRole = (typeof ORGANIZATION_ADMIN_ROLES)[number];

export async function isOrganizationAdminOrOwner(
	db: Database,
	params: { userId: string; organizationId: string }
): Promise<boolean> {
	const [result] = await db
		.select({ id: member.id })
		.from(member)
		.where(
			and(
				eq(member.userId, params.userId),
				eq(member.organizationId, params.organizationId),
				inArray(member.role, ORGANIZATION_ADMIN_ROLES)
			)
		)
		.limit(1)
		.$withCache();

	return Boolean(result);
}

export async function isOrganizationOwner(
	db: Database,
	params: { userId: string; organizationId: string }
): Promise<boolean> {
	const [result] = await db
		.select({ id: member.id })
		.from(member)
		.where(
			and(
				eq(member.userId, params.userId),
				eq(member.organizationId, params.organizationId),
				eq(member.role, "owner")
			)
		)
		.limit(1)
		.$withCache();

	return Boolean(result);
}
