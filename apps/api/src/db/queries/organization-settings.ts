import type { Database } from "@api/db";
import { organization } from "@api/db/schema";
import { isOrganizationAdminOrOwner } from "@api/utils/access-control";
import { isValidTimezone } from "@api/utils/timezone";
import type { OrganizationSettingsResponse } from "@cossistant/types";
import { eq } from "drizzle-orm";

export async function getOrganizationSettings(
	db: Database,
	params: {
		organizationId: string;
		userId: string;
	}
): Promise<OrganizationSettingsResponse | null> {
	const hasAccess = await isOrganizationAdminOrOwner(db, {
		organizationId: params.organizationId,
		userId: params.userId,
	});

	if (!hasAccess) {
		return null;
	}

	const [result] = await db
		.select({
			id: organization.id,
			name: organization.name,
			slug: organization.slug,
			timezone: organization.timezone,
			weeklyDigestEnabled: organization.weeklyDigestEnabled,
		})
		.from(organization)
		.where(eq(organization.id, params.organizationId))
		.limit(1);

	return result ?? null;
}

export async function updateOrganizationSettings(
	db: Database,
	params: {
		organizationId: string;
		userId: string;
		timezone: string;
		weeklyDigestEnabled: boolean;
	}
): Promise<OrganizationSettingsResponse | null> {
	if (!isValidTimezone(params.timezone)) {
		throw new Error("Invalid timezone");
	}

	const hasAccess = await isOrganizationAdminOrOwner(db, {
		organizationId: params.organizationId,
		userId: params.userId,
	});

	if (!hasAccess) {
		return null;
	}

	const [updated] = await db
		.update(organization)
		.set({
			timezone: params.timezone.trim(),
			weeklyDigestEnabled: params.weeklyDigestEnabled,
		})
		.where(eq(organization.id, params.organizationId))
		.returning({
			id: organization.id,
			name: organization.name,
			slug: organization.slug,
			timezone: organization.timezone,
			weeklyDigestEnabled: organization.weeklyDigestEnabled,
		});

	return updated ?? null;
}
