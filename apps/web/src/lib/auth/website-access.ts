import { db } from "@api/db";
import { checkUserWebsiteAccess } from "@api/db/queries/website";
import { notFound, redirect } from "next/navigation";
import { buildSessionExpiredLoginPath } from "./redirect";
import { getAuth } from "./server";

export const ensureWebsiteAccess = async (websiteSlug: string) => {
	const { user } = await getAuth();

	if (!user) {
		redirect(buildSessionExpiredLoginPath(`/${websiteSlug}/inbox`));
	}

	const accessCheck = await checkUserWebsiteAccess(db, {
		userId: user.id,
		websiteSlug,
	});

	if (!accessCheck.hasAccess) {
		notFound();
	}

	if (!accessCheck.website) {
		notFound();
	}

	return {
		user,
		website: accessCheck.website,
	};
};
