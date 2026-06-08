import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = fileURLToPath(new URL("../../", import.meta.url));

function listRouterFiles(dir: string): string[] {
	const entries = readdirSync(dir, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const fullPath = join(dir, entry.name);

		if (entry.isDirectory()) {
			files.push(...listRouterFiles(fullPath));
			continue;
		}

		if (
			entry.isFile() &&
			entry.name.endsWith(".ts") &&
			!entry.name.endsWith(".test.ts")
		) {
			files.push(fullPath);
		}
	}

	return files;
}

describe("router DB read placement", () => {
	it("keeps REST and TRPC router reads in db/queries modules", () => {
		const routerDirs = [
			join(srcDir, "rest/routers"),
			join(srcDir, "trpc/routers"),
		].filter((dir) => statSync(dir, { throwIfNoEntry: false })?.isDirectory());

		const violations = routerDirs.flatMap(listRouterFiles).flatMap((file) => {
			const contents = readFileSync(file, "utf8");
			const relativePath = relative(srcDir, file);
			const patterns = [
				{
					label: "db.select",
					regex: /\b(?:db|ctx\.db|params\.ctx\.db|params\.db)\s*\.select\s*\(/g,
				},
				{
					label: "db.query",
					regex: /\b(?:db|ctx\.db|params\.ctx\.db|params\.db)\s*\.query\s*\./g,
				},
			];

			return patterns.flatMap(({ label, regex }) =>
				[...contents.matchAll(regex)].map((match) => {
					const line = contents.slice(0, match.index).split("\n").length;
					return `${relativePath}:${line} uses ${label}`;
				})
			);
		});

		expect(violations).toEqual([]);
	});
});
