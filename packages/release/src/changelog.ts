import path from "node:path";
import fs from "fs-extra";

const VERSION_REGEX = /@(\d+)\.(\d+)\.(\d+)$/;
const FILENAME_VERSION_REGEX = /v(\d+\.\d+\.\d+)\.mdx$/;

export function getNextVersion(
	lastTag: string | null,
	releaseType: "patch" | "minor" | "major"
): string {
	if (!lastTag) {
		return releaseType === "major"
			? "1.0.0"
			: releaseType === "minor"
				? "0.1.0"
				: "0.0.1";
	}

	// Extract version from tag like "@plasma/react@0.0.26"
	const match = lastTag.match(VERSION_REGEX);
	if (!match) {
		return "0.0.1";
	}

	const [, majorStr, minorStr, patchStr] = match;
	const major = Number(majorStr);
	const minor = Number(minorStr);
	const patch = Number(patchStr);

	switch (releaseType) {
		case "major":
			return `${major + 1}.0.0`;
		case "minor":
			return `${major}.${minor + 1}.0`;
		default:
			return `${major}.${minor}.${patch + 1}`;
	}
}

export async function getLatestChangelogVersion(): Promise<string | null> {
	const changelogDir = path.join(process.cwd(), "apps/web/content/changelog");

	if (!(await fs.pathExists(changelogDir))) {
		return null;
	}

	const files = await fs.readdir(changelogDir);
	const versions = files
		.map((f) => {
			const match = f.match(FILENAME_VERSION_REGEX);
			if (!match?.[1]) {
				return null;
			}
			const raw = match[1];
			const parts = raw.split(".").map(Number);
			return {
				major: parts[0] ?? 0,
				minor: parts[1] ?? 0,
				patch: parts[2] ?? 0,
				raw,
			};
		})
		.filter(Boolean) as {
		major: number;
		minor: number;
		patch: number;
		raw: string;
	}[];

	if (versions.length === 0) {
		return null;
	}

	versions.sort((a, b) =>
		a.major !== b.major
			? b.major - a.major
			: a.minor !== b.minor
				? b.minor - a.minor
				: b.patch - a.patch
	);

	const latest = versions[0];
	return latest?.raw ?? null;
}

export function incrementVersion(
	version: string,
	releaseType: "patch" | "minor" | "major"
): string {
	const parts = version.split(".").map(Number);
	const major = parts[0] ?? 0;
	const minor = parts[1] ?? 0;
	const patch = parts[2] ?? 0;
	switch (releaseType) {
		case "major":
			return `${major + 1}.0.0`;
		case "minor":
			return `${major}.${minor + 1}.0`;
		default:
			return `${major}.${minor}.${patch + 1}`;
	}
}

export async function saveChangelog(
	content: string,
	version: string
): Promise<string> {
	const today = new Date().toISOString().split("T")[0];
	const filename = `${today}-v${version}.mdx`;
	const filepath = path.join(
		process.cwd(),
		"apps/web/content/changelog",
		filename
	);

	await fs.outputFile(filepath, content);
	return filepath;
}
