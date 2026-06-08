import { DEFAULT_PAGE_LIMIT } from "@api/constants";
import type { Database } from "@api/db";
import { SECURITY_CACHE_CONFIG } from "@api/db/cache/config";
import type { WebsiteInsert } from "@api/db/schema";
import { organization, team, website } from "@api/db/schema";
import { auth } from "@api/lib/auth";
import {
	isOrganizationAdminOrOwner,
	isTeamMember,
} from "@api/utils/access-control";
import type { WebsiteStatus } from "@cossistant/types/enums";

import { and, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";

export class WebsiteCreationError extends Error {
	constructor(
		message = "Failed to create website",
		options?: { cause?: unknown }
	) {
		super(message, options);
		this.name = "WebsiteCreationError";
	}
}

export class WebsiteSlugConflictError extends WebsiteCreationError {
	constructor() {
		super("Website slug already exists");
		this.name = "WebsiteSlugConflictError";
	}
}

// Create website
export async function createWebsite(
	db: Database,
	params: {
		organizationId: string;
		data: Omit<WebsiteInsert, "organizationId" | "teamId">;
	}
) {
	let teamResponse: Awaited<ReturnType<typeof auth.api.createTeam>>;

	try {
		// Create a team for the website using better-auth API
		teamResponse = await auth.api.createTeam({
			body: {
				name: params.data.slug,
				organizationId: params.organizationId,
			},
		});
	} catch (error) {
		throw new WebsiteCreationError(undefined, { cause: error });
	}

	if (!teamResponse?.id) {
		throw new WebsiteCreationError();
	}

	// Create the website with the team
	try {
		const [newWebsite] = await db
			.insert(website)
			.values({
				...params.data,
				organizationId: params.organizationId,
				teamId: teamResponse.id,
			})
			.onConflictDoNothing({ target: website.slug })
			.returning();

		if (!newWebsite) {
			throw new WebsiteSlugConflictError();
		}

		return newWebsite;
	} catch (error) {
		if (error instanceof WebsiteCreationError) {
			throw error;
		}

		throw new WebsiteCreationError(undefined, { cause: error });
	}
}

// Get website by ID (with org check)
export async function getWebsiteById(
	db: Database,
	params: {
		orgId: string;
		websiteId: string;
	}
) {
	const [site] = await db
		.select()
		.from(website)
		.where(
			and(
				eq(website.id, params.websiteId),
				eq(website.organizationId, params.orgId),
				isNull(website.deletedAt)
			)
		)
		.limit(1);

	return site;
}

// Get all websites for organization
export async function getWebsitesByOrganization(
	db: Database,
	params: {
		orgId: string;
		status?: WebsiteStatus;
		limit?: number;
		offset?: number;
	}
) {
	const websites = await db
		.select()
		.from(website)
		.where(
			and(
				eq(website.organizationId, params.orgId),
				params.status ? eq(website.status, params.status) : undefined,
				isNull(website.deletedAt)
			)
		)
		.orderBy(desc(website.createdAt))
		.limit(params.limit ?? DEFAULT_PAGE_LIMIT)
		.offset(params.offset ?? 0);

	return websites;
}

export async function listOrganizationWebsitePlanTargets(
	db: Database,
	params: {
		organizationId: string;
	}
): Promise<Array<{ id: string; organizationId: string }>> {
	return db
		.select({
			id: website.id,
			organizationId: website.organizationId,
		})
		.from(website)
		.where(
			and(
				eq(website.organizationId, params.organizationId),
				isNull(website.deletedAt)
			)
		);
}

export async function listWebsiteListItemsForOrganization(
	db: Database,
	params: {
		organizationId: string;
	}
): Promise<
	Array<{
		id: string;
		name: string;
		slug: string;
		logoUrl: string | null;
		domain: string;
		defaultLanguage: string;
		organizationId: string;
	}>
> {
	return db
		.select({
			id: website.id,
			name: website.name,
			slug: website.slug,
			logoUrl: website.logoUrl,
			domain: website.domain,
			defaultLanguage: website.defaultLanguage,
			organizationId: website.organizationId,
		})
		.from(website)
		.where(
			and(
				eq(website.organizationId, params.organizationId),
				isNull(website.deletedAt)
			)
		)
		.orderBy(website.createdAt);
}

export async function getWebsiteApiKeyScope(
	db: Database,
	params: {
		websiteId: string;
		organizationId: string;
	}
): Promise<{
	id: string;
	organizationId: string;
	teamId: string | null;
} | null> {
	const [site] = await db
		.select({
			id: website.id,
			organizationId: website.organizationId,
			teamId: website.teamId,
		})
		.from(website)
		.where(
			and(
				eq(website.id, params.websiteId),
				eq(website.organizationId, params.organizationId),
				isNull(website.deletedAt)
			)
		)
		.limit(1);

	return site ?? null;
}

export async function findVerifiedWebsiteByDomain(
	db: Database,
	params: {
		domain: string;
		excludeWebsiteId?: string;
	}
): Promise<{ id: string } | null> {
	const conditions = [
		eq(website.domain, params.domain),
		eq(website.isDomainOwnershipVerified, true),
	];

	if (params.excludeWebsiteId) {
		conditions.push(ne(website.id, params.excludeWebsiteId));
	}

	const [site] = await db
		.select({ id: website.id })
		.from(website)
		.where(and(...conditions))
		.limit(1);

	return site ?? null;
}

// Update website
export async function updateWebsite(
	db: Database,
	params: {
		orgId: string;
		websiteId: string;
		data: Partial<Omit<WebsiteInsert, "organizationId">>;
	}
) {
	const [updatedWebsite] = await db
		.update(website)
		.set({
			...params.data,
			updatedAt: new Date().toISOString(),
		})
		.where(
			and(
				eq(website.id, params.websiteId),
				eq(website.organizationId, params.orgId)
			)
		)
		.returning();

	return updatedWebsite;
}

// Soft delete website
export async function deleteWebsite(
	db: Database,
	params: {
		orgId: string;
		websiteId: string;
	}
) {
	const [deletedWebsite] = await db
		.update(website)
		.set({
			deletedAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		})
		.where(
			and(
				eq(website.id, params.websiteId),
				eq(website.organizationId, params.orgId)
			)
		)
		.returning();

	return deletedWebsite;
}

// Permanently delete website and clean up orphaned team records.
export async function permanentlyDeleteWebsite(
	db: Database,
	params: {
		orgId: string;
		websiteId: string;
	}
): Promise<{ id: string; slug: string } | null> {
	return db.transaction(async (tx) => {
		const [deletedWebsite] = await tx
			.delete(website)
			.where(
				and(
					eq(website.id, params.websiteId),
					eq(website.organizationId, params.orgId)
				)
			)
			.returning({
				id: website.id,
				slug: website.slug,
				teamId: website.teamId,
			});

		if (!deletedWebsite) {
			return null;
		}

		if (deletedWebsite.teamId) {
			const [remainingActiveWebsite] = await tx
				.select({ id: website.id })
				.from(website)
				.where(
					and(
						eq(website.organizationId, params.orgId),
						eq(website.teamId, deletedWebsite.teamId),
						isNull(website.deletedAt)
					)
				)
				.limit(1);

			if (!remainingActiveWebsite) {
				await tx
					.delete(team)
					.where(
						and(
							eq(team.id, deletedWebsite.teamId),
							eq(team.organizationId, params.orgId)
						)
					);
			}
		}

		return {
			id: deletedWebsite.id,
			slug: deletedWebsite.slug,
		};
	});
}

// Restore website
export async function restoreWebsite(
	db: Database,
	params: {
		orgId: string;
		websiteId: string;
	}
) {
	const [restoredWebsite] = await db
		.update(website)
		.set({
			deletedAt: null,
			updatedAt: new Date().toISOString(),
		})
		.where(
			and(
				eq(website.id, params.websiteId),
				eq(website.organizationId, params.orgId)
			)
		)
		.returning();

	return restoredWebsite;
}

// Check if user has access to a website
export async function checkUserWebsiteAccess(
	db: Database,
	params: {
		userId: string;
		websiteSlug: string;
	}
) {
	const site = await getActiveWebsiteBySlug(db, {
		websiteSlug: params.websiteSlug,
	});

	if (!site) {
		return { hasAccess: false, website: null };
	}

	const hasAccess = await userHasWebsiteAccess(db, {
		userId: params.userId,
		site,
	});

	if (hasAccess) {
		return { hasAccess: true, website: site };
	}

	return { hasAccess: false, website: site };
}

// Get website by slug with access check
export async function getWebsiteBySlugWithAccess(
	db: Database,
	params: {
		userId: string;
		websiteSlug: string;
	}
) {
	const accessCheck = await checkUserWebsiteAccess(db, params);

	if (!(accessCheck.hasAccess && accessCheck.website)) {
		return null;
	}

	// Fetch organization slug
	const [org] = await db
		.select({ slug: organization.slug })
		.from(organization)
		.where(eq(organization.id, accessCheck.website.organizationId))
		.limit(1);

	return {
		...accessCheck.website,
		organizationSlug: org?.slug ?? null,
	};
}

// Get website by ID with access check
export async function getWebsiteByIdWithAccess(
	db: Database,
	params: {
		userId: string;
		websiteId: string;
	}
) {
	const site = await getActiveWebsiteById(db, {
		websiteId: params.websiteId,
	});

	if (!site) {
		return null;
	}

	if (
		await userHasWebsiteAccess(db, {
			userId: params.userId,
			site,
		})
	) {
		return site;
	}

	return null;
}

export async function getActiveWebsiteBySlug(
	db: Database,
	params: {
		websiteSlug: string;
	}
) {
	const [site] = await db
		.select()
		.from(website)
		.where(and(eq(website.slug, params.websiteSlug), isNull(website.deletedAt)))
		.limit(1)
		.$withCache({
			config: SECURITY_CACHE_CONFIG,
		});

	return site ?? null;
}

async function getActiveWebsiteById(
	db: Database,
	params: {
		websiteId: string;
	}
) {
	const [site] = await db
		.select()
		.from(website)
		.where(and(eq(website.id, params.websiteId), isNull(website.deletedAt)))
		.limit(1)
		.$withCache({
			config: SECURITY_CACHE_CONFIG,
		});

	return site ?? null;
}

async function userHasWebsiteAccess(
	db: Database,
	params: {
		userId: string;
		site: Awaited<ReturnType<typeof getActiveWebsiteById>>;
	}
) {
	if (!params.site) {
		return false;
	}

	if (
		await isOrganizationAdminOrOwner(db, {
			userId: params.userId,
			organizationId: params.site.organizationId,
		})
	) {
		return true;
	}

	if (!params.site.teamId) {
		return false;
	}

	return await isTeamMember(db, {
		userId: params.userId,
		teamId: params.site.teamId,
	});
}
