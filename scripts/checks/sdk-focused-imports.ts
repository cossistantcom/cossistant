import { relative, resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "../..");
const roots = ["apps", "examples", "packages/release"];
const sourceGlob = new Bun.Glob("**/*.{js,jsx,md,mdx,ts,tsx}");
const broadNextImport =
	/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']@cossistant\/next["']/g;
const violations: string[] = [];

for (const root of roots) {
	const rootPath = resolve(repoRoot, root);

	for await (const path of sourceGlob.scan({ cwd: rootPath, absolute: true })) {
		if (
			path.includes("/dist/") ||
			path.includes("/.next/") ||
			path.includes("/node_modules/")
		) {
			continue;
		}

		const source = await Bun.file(path).text();
		for (const match of source.matchAll(broadNextImport)) {
			const line = source.slice(0, match.index).split("\n").length;
			violations.push(`${relative(repoRoot, path)}:${line}`);
		}
	}
}

if (violations.length > 0) {
	console.error(
		"Use focused @cossistant/next/* entries so App Router routes do not share the full client barrel:"
	);
	for (const violation of violations) {
		console.error(`- ${violation}`);
	}
	process.exit(1);
}

console.log("focused Next SDK import guard passed");
