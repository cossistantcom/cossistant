import type { Database } from "@api/db";
import { website } from "@api/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

const WEBSITE_SLUG_SUFFIX_LENGTH = 6;
const MAX_WEBSITE_SLUG_ATTEMPTS = 10;

/**
 * Converts a domain name to a base slug candidate according to these rules:
 * - If domain ends with .com, remove .com (e.g., example.com → example)
 * - For any other single-level TLD, replace the dot with "dot" (e.g., example.io → exampledotio)
 * - For domains with multiple dots (subdomains or complex TLDs), extract apex name and add nanoid
 *
 * This function does not check database uniqueness. Use
 * `generateUniqueWebsiteSlug` before inserting a website record.
 */
export function domainToSlug(domain: string): string {
	const dotCount = (domain.match(/\./g) || []).length;

	// Handle domains with multiple dots (subdomains or complex TLDs)
	if (dotCount > 1) {
		const parts = domain.split(".");
		// Extract the main domain name (second-to-last part for most cases)
		// For app.example.com -> "example"
		// For uk.gouv.fr -> "gouv"
		// For subdomain.uk.gouv -> "uk"
		const apexName = parts.at(-2) || parts.at(0) || "domain";
		return `${apexName}-${nanoid(6)}`;
	}

	// Handle simple domains with single dot
	if (domain.endsWith(".com")) {
		return domain.slice(0, -4); // Remove '.com'
	}

	// Replace dot with "dot" for other single-level TLDs
	return domain.replace(".", "dot");
}

export async function generateUniqueWebsiteSlug(
	db: Database,
	domain: string
): Promise<string> {
	const baseSlug = domainToSlug(domain);

	for (let attempt = 0; attempt < MAX_WEBSITE_SLUG_ATTEMPTS; attempt++) {
		const candidate =
			attempt === 0
				? baseSlug
				: `${baseSlug}-${nanoid(WEBSITE_SLUG_SUFFIX_LENGTH)}`;

		const existingWebsite = await db.query.website.findFirst({
			where: eq(website.slug, candidate),
			columns: { id: true },
		});

		if (!existingWebsite) {
			return candidate;
		}
	}

	throw new Error("Failed to generate unique website slug");
}
