import type { Database } from "@api/db";
import { scheduleWelcomeLifecycleEmail } from "@api/db/queries/lifecycle-email";
import {
	member,
	type OrganizationSelect,
	organization,
	type WebsiteSelect,
	website,
} from "@api/db/schema";
import { auth } from "@api/lib/auth";
import { generateSlugFromEmailDomain } from "@api/utils/organization";
import { resolveOrganizationTimezone } from "@api/utils/timezone";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

export async function getOrganizationById(
	db: Database,
	id: string
): Promise<OrganizationSelect | undefined> {
	const result = await db.query.organization.findFirst({
		where: eq(organization.id, id),
	});

	return result;
}

export async function getOrganizationBySlug(
	db: Database,
	slug: string
): Promise<OrganizationSelect | undefined> {
	const result = await db.query.organization.findFirst({
		where: eq(organization.slug, slug),
	});

	return result;
}

// Get organizations for user
export async function getOrganizationsForUser(
	db: Database,
	params: {
		userId: string;
	}
) {
	// First, get the organizations for the user
	const organizations = await db
		.select({
			organization,
			role: member.role,
			joinedAt: member.createdAt,
		})
		.from(organization)
		.innerJoin(member, eq(member.organizationId, organization.id))
		.where(eq(member.userId, params.userId))
		.orderBy(desc(member.createdAt))
		.$withCache();

	// If no organizations, return empty array
	if (organizations.length === 0) {
		return [];
	}

	// Get all organization IDs
	const orgIds = organizations.map((org) => org.organization.id);

	// Get all websites for these organizations
	const allWebsites = await db
		.select()
		.from(website)
		.where(
			and(inArray(website.organizationId, orgIds), isNull(website.deletedAt))
		);

	// Group websites by organization ID
	const websitesByOrg = allWebsites.reduce(
		(acc, site) => {
			const orgId = site.organizationId;
			if (!acc[orgId]) {
				acc[orgId] = [];
			}
			acc[orgId].push(site);
			return acc;
		},
		{} as Record<string, WebsiteSelect[]>
	);

	// Combine organizations with their websites
	return organizations.map((org) => ({
		...org,
		websites: websitesByOrg[org.organization.id] || [],
	}));
}

export async function getOrganizationsForUserOrCreateDefault(
	db: Database,
	params: {
		userId: string;
		userEmail: string;
		userName: string;
		timezone?: string | null;
	}
): Promise<
	{
		organization: OrganizationSelect;
		role: string;
		joinedAt: Date;
		websites: WebsiteSelect[];
	}[]
> {
	const organizations = await getOrganizationsForUser(db, {
		userId: params.userId,
	});

	// If the user has no organizations, create a default one
	if (organizations.length === 0) {
		const { slug, organizationName } = await generateSlugFromEmailDomain(db, {
			email: params.userEmail,
		});

		const newOrganization = await auth.api.createOrganization({
			body: {
				name: organizationName,
				slug,
				userId: params.userId,
			},
		});

		if (!newOrganization) {
			throw new Error("Failed to create default organization");
		}

		const timezone = resolveOrganizationTimezone(params.timezone);
		const [updatedOrganization] = await db
			.update(organization)
			.set({ timezone })
			.where(eq(organization.id, newOrganization.id))
			.returning();
		const organizationRecord = updatedOrganization ?? {
			id: newOrganization.id,
			name: newOrganization.name,
			createdAt: newOrganization.createdAt,
			slug: newOrganization.slug,
			logo: newOrganization.logo ?? null,
			timezone,
			weeklyDigestEnabled: true,
			metadata: newOrganization.metadata
				? JSON.stringify(newOrganization.metadata)
				: null,
		};

		try {
			await scheduleWelcomeLifecycleEmail(db, {
				organizationId: organizationRecord.id,
				organizationName: organizationRecord.name,
			});
		} catch (error) {
			console.error("[lifecycle-email] Failed to schedule welcome email", {
				organizationId: organizationRecord.id,
				error,
			});
		}

		return [
			{
				organization: organizationRecord,
				role: "owner",
				joinedAt: new Date(),
				websites: [],
			},
		];
	}

	return organizations;
}
