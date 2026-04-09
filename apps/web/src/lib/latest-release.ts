import {
	getChangelogData,
	getSortedChangelogEntries,
} from "@/lib/seo-content";

export type LatestRelease = {
	version: string;
	description: string;
	tinyExcerpt: string;
	date: string;
};

type LatestReleasePage = ReturnType<typeof getSortedChangelogEntries>[number];
type LatestReleaseBody = LatestReleasePage["data"]["body"];

export function getLatestRelease(): LatestRelease | null {
	const pages = getSortedChangelogEntries();
	const latest = pages[0];
	if (!latest) {
		return null;
	}

	const data = getChangelogData(latest);

	return {
		version: data.version ?? "",
		description: data.description,
		tinyExcerpt: data["tiny-excerpt"] ?? "New release available",
		date: data.date,
	};
}

/**
 * Returns the MDX body component for the latest changelog entry.
 * Must be called separately because the body is a React component
 * that needs to be rendered as JSX in a server component, then
 * passed as children through client component boundaries.
 */
export function getLatestReleaseBody(): LatestReleaseBody | null {
	const pages = getSortedChangelogEntries();
	const latest = pages[0];
	if (!latest) {
		return null;
	}

	return getChangelogData(latest).body ?? null;
}
