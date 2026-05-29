import { db } from "@api/db";
import { getOrganizationsForUserOrCreateDefault } from "@api/db/queries/organization";
import type { OrganizationSelect, WebsiteSelect } from "@api/db/schema";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ensurePageAuth } from "@/lib/auth/server";
import SelectClient from "./select-client";

export const dynamic = "force-dynamic";

const getDefaultWebsiteToRedirectTo = ({
	orgs,
}: {
	orgs: {
		organization: OrganizationSelect;
		websites: WebsiteSelect[];
		role: string;
		joinedAt: Date;
	}[];
}): {
	availableWebsitesCount: number;
	availableWebsites: {
		websiteSlug: string | undefined;
		organizationSlug: string | undefined;
	}[];
	defaultOrgSlug: string | undefined;
} => {
	const defaultOrgSlug = orgs[0]?.organization.slug ?? undefined;

	// Should not happen, but just in case
	if (orgs.length === 0) {
		return {
			availableWebsitesCount: 0,
			availableWebsites: [],
			defaultOrgSlug,
		};
	}

	const availableWebsites = orgs.flatMap((org) =>
		org.websites.map((orgWebsite) => ({
			websiteSlug: orgWebsite.slug ?? undefined,
			organizationSlug: org.organization.slug ?? undefined,
		}))
	);

	return {
		availableWebsitesCount: availableWebsites.length,
		availableWebsites,
		defaultOrgSlug,
	};
};

export default async function Select() {
	const { user } = await ensurePageAuth();

	const cookieStore = await cookies();
	const requestHeaders = await headers();
	const browserTimezone = cookieStore.get("cossistant_timezone")?.value ?? null;
	const requestTimezone = requestHeaders.get("x-user-timezone");

	// If the user lands on this page and is not a member of any organization, we create a default one for them
	const orgs = await getOrganizationsForUserOrCreateDefault(db, {
		userId: user?.id,
		userEmail: user?.email,
		userName: user?.name,
		timezone: browserTimezone ?? requestTimezone,
	});

	const { availableWebsitesCount, availableWebsites, defaultOrgSlug } =
		getDefaultWebsiteToRedirectTo({
			orgs,
		});

	// This should never happen, but just in case
	if (!defaultOrgSlug) {
		console.error(`ERROR: User ${user?.id} has no organizations found`);

		notFound();
	}

	// If the user has no website, we redirect to the onboarding "welcome"
	if (availableWebsitesCount === 0) {
		redirect(`/welcome/${defaultOrgSlug}`);
	}

	// If the user has only one website, we redirect to it
	if (availableWebsitesCount === 1 && availableWebsites[0]?.websiteSlug) {
		const websiteSlug = availableWebsites[0].websiteSlug;

		if (websiteSlug) {
			redirect(`/${websiteSlug}/inbox`);
		}
	}

	// If the user has multiple websites, we show the select page
	return <SelectClient organizations={orgs} />;
}
