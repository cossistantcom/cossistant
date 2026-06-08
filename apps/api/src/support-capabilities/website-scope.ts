import type { Database } from "@api/db";
import { getWebsiteByIdWithAccess } from "@api/db/queries/website";
import {
	member,
	teamMember,
	type WebsiteSelect,
	website,
} from "@api/db/schema";
import {
	and,
	asc,
	eq,
	ilike,
	inArray,
	isNotNull,
	isNull,
	or,
} from "drizzle-orm";
import { SupportCapabilityError } from "./errors";

const WEBSITE_ACCESS_ROLES = ["owner", "admin"] as const;

export type SupportWebsiteSelector = {
	websiteId?: string | null;
	websiteName?: string | null;
};

export type AccessibleSupportWebsite = Pick<
	WebsiteSelect,
	| "id"
	| "name"
	| "slug"
	| "domain"
	| "defaultLanguage"
	| "organizationId"
	| "teamId"
>;

function normalizeWebsiteSelector(selector: SupportWebsiteSelector) {
	const websiteId = selector.websiteId?.trim() || null;
	const websiteName = selector.websiteName?.trim() || null;

	if (Boolean(websiteId) === Boolean(websiteName)) {
		throw new SupportCapabilityError(
			400,
			"BAD_REQUEST",
			"Provide exactly one of websiteId or websiteName"
		);
	}

	return { websiteId, websiteName };
}

export async function listAccessibleWebsites(
	db: Database,
	params: {
		userId: string;
		query?: string | null;
		limit?: number;
	}
): Promise<AccessibleSupportWebsite[]> {
	const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
	const trimmedQuery = params.query?.trim();
	const searchPattern = trimmedQuery ? `%${trimmedQuery}%` : null;

	const rows = await db
		.select({
			id: website.id,
			name: website.name,
			slug: website.slug,
			domain: website.domain,
			defaultLanguage: website.defaultLanguage,
			organizationId: website.organizationId,
			teamId: website.teamId,
		})
		.from(website)
		.innerJoin(
			member,
			and(
				eq(member.organizationId, website.organizationId),
				eq(member.userId, params.userId)
			)
		)
		.leftJoin(
			teamMember,
			and(
				eq(teamMember.teamId, website.teamId),
				eq(teamMember.userId, params.userId)
			)
		)
		.where(
			and(
				isNull(website.deletedAt),
				or(
					inArray(member.role, WEBSITE_ACCESS_ROLES),
					isNotNull(teamMember.userId)
				),
				searchPattern
					? or(
							ilike(website.name, searchPattern),
							ilike(website.slug, searchPattern),
							ilike(website.domain, searchPattern)
						)
					: undefined
			)
		)
		.orderBy(asc(website.name), asc(website.slug))
		.limit(limit);

	return rows;
}

export async function resolveSupportWebsiteScope(
	db: Database,
	params: SupportWebsiteSelector & {
		userId: string;
	}
): Promise<WebsiteSelect> {
	const { websiteId, websiteName } = normalizeWebsiteSelector(params);

	if (websiteId) {
		const site = await getWebsiteByIdWithAccess(db, {
			userId: params.userId,
			websiteId,
		});

		if (!site) {
			throw new SupportCapabilityError(
				404,
				"NOT_FOUND",
				"Website not found or not accessible"
			);
		}

		return site;
	}

	const accessibleWebsites = await listAccessibleWebsites(db, {
		userId: params.userId,
		limit: 100,
	});
	const normalizedName = websiteName?.toLocaleLowerCase();
	const matches = accessibleWebsites.filter(
		(candidate) => candidate.name.toLocaleLowerCase() === normalizedName
	);

	if (matches.length === 0) {
		throw new SupportCapabilityError(
			404,
			"NOT_FOUND",
			"Website not found or not accessible"
		);
	}

	if (matches.length > 1) {
		throw new SupportCapabilityError(
			409,
			"CONFLICT",
			"Multiple accessible websites match that name; use websiteId instead"
		);
	}

	const [match] = matches;
	if (!match) {
		throw new SupportCapabilityError(
			404,
			"NOT_FOUND",
			"Website not found or not accessible"
		);
	}

	const site = await getWebsiteByIdWithAccess(db, {
		userId: params.userId,
		websiteId: match.id,
	});

	if (!site) {
		throw new SupportCapabilityError(
			404,
			"NOT_FOUND",
			"Website not found or not accessible"
		);
	}

	return site;
}
