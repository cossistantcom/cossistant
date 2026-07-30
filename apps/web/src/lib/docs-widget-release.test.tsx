import { beforeEach, describe, expect, it, mock } from "bun:test";
import path from "node:path";
import React from "react";

// This file lives at <repo>/apps/web/src/lib, so four levels up is the repo
// root. Deriving it keeps the test working in CI, git worktrees, and any
// checkout location — a hardcoded absolute path only passed on one machine.
const REPO_ROOT = path.resolve(import.meta.dir, "../../../..");
const APP_DIR = path.join(REPO_ROOT, "apps/web");

let packageVersion = "0.2.0";
let readFilePath = "";
let existingPackageJsonPath = path.join(
	REPO_ROOT,
	"packages/react/package.json"
);
let latestRelease = {
	version: "0.1.2",
	description: "Script embeds and AI clarification",
	tinyExcerpt: "Script embeds and AI clarification",
	date: "2026-04-20",
};

function LatestReleaseBody() {
	return <div>Latest release body</div>;
}

mock.module("node:fs/promises", () => ({
	access: async (targetPath: string) => {
		if (targetPath !== existingPackageJsonPath) {
			const error = new Error(`ENOENT: ${targetPath}`) as NodeJS.ErrnoException;
			error.code = "ENOENT";
			throw error;
		}
	},
	readFile: async (targetPath: string) => {
		readFilePath = targetPath;
		return JSON.stringify({ version: packageVersion });
	},
}));

mock.module("@/lib/latest-release", () => ({
	getLatestRelease: () => latestRelease,
	getLatestReleaseBody: () => LatestReleaseBody,
}));

const modulePromise = import("./docs-widget-release");

describe("getDocsWidgetRelease", () => {
	beforeEach(() => {
		packageVersion = "0.2.0";
		readFilePath = "";
		existingPackageJsonPath = path.join(
			REPO_ROOT,
			"packages/react/package.json"
		);
		latestRelease = {
			version: "0.1.2",
			description: "Script embeds and AI clarification",
			tinyExcerpt: "Script embeds and AI clarification",
			date: "2026-04-20",
		};
	});

	it("returns the widget version from the package metadata", async () => {
		const { getDocsWidgetRelease } = await modulePromise;
		const release = await getDocsWidgetRelease();

		expect(release.widgetVersion).toBe("0.2.0");
		expect(readFilePath).toBe(existingPackageJsonPath);
		expect(release.latestRelease?.version).toBe("0.1.2");
		expect(release.latestReleaseBody).toBe(LatestReleaseBody);
	});

	it("keeps the package version even when the latest changelog version differs", async () => {
		packageVersion = "0.2.0";
		latestRelease = {
			version: "0.1.2",
			description: "Older changelog entry",
			tinyExcerpt: "Older changelog entry",
			date: "2026-03-11",
		};

		const { getDocsWidgetRelease } = await modulePromise;
		const release = await getDocsWidgetRelease();

		expect(release.widgetVersion).toBe("0.2.0");
		expect(release.latestRelease?.version).toBe("0.1.2");
	});

	it("finds the widget package when the app runs from apps/web", async () => {
		const { findWidgetPackageJsonPath } = await modulePromise;
		const packageJsonPath = await findWidgetPackageJsonPath(APP_DIR);

		expect(packageJsonPath).toBe(existingPackageJsonPath);
	});
});
