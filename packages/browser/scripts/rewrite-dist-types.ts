import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const packageDir = path.resolve(import.meta.dir, "..");
const distDir = path.join(packageDir, "dist");

const TYPE_IMPORT_PATTERN =
	/(?<prefix>from\s+["'])(?<source>\.{1,2}\/(?:[^"']*?)packages\/(?<packageName>core|react|types)\/src\/(?<subpath>[^"']+?))(?<suffix>["'])/g;

async function collectDeclarationFiles(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const fullPath = path.join(directory, entry.name);

			if (entry.isDirectory()) {
				return collectDeclarationFiles(fullPath);
			}

			if (entry.isFile() && fullPath.endsWith(".d.ts")) {
				return [fullPath];
			}

			return [];
		})
	);

	return files.flat();
}

function toPackageSpecifier(
	packageName: "core" | "react" | "types",
	subpath: string
): string {
	const normalizedSubpath = subpath.replace(/\.js$/, "");
	const packageSpecifier = `@cossistant/${packageName}`;

	if (normalizedSubpath === "index") {
		return packageSpecifier;
	}

	if (normalizedSubpath.endsWith("/index")) {
		return `${packageSpecifier}/${normalizedSubpath.replace(/\/index$/, "")}`;
	}

	return `${packageSpecifier}/${normalizedSubpath}`;
}

type TypeImportMatchGroups = {
	packageName: "core" | "react" | "types";
	prefix: string;
	source: string;
	subpath: string;
	suffix: string;
};

function rewriteTypeImportSpecifiers(contents: string): string {
	return contents.replace(TYPE_IMPORT_PATTERN, (...args) => {
		const groups = args.at(-1) as TypeImportMatchGroups | undefined;

		if (!groups) {
			return String(args[0] ?? "");
		}

		return `${groups.prefix}${toPackageSpecifier(groups.packageName, groups.subpath)}${groups.suffix}`;
	});
}

async function rewriteDeclarationFile(filePath: string): Promise<boolean> {
	const original = await readFile(filePath, "utf8");
	const rewritten = rewriteTypeImportSpecifiers(original);

	if (rewritten === original) {
		return false;
	}

	await writeFile(filePath, rewritten, "utf8");
	return true;
}

const distStats = await stat(distDir).catch(() => null);

if (!distStats?.isDirectory()) {
	throw new Error(
		`Expected built dist directory at ${distDir}. Run \`tsdown\` before rewriting declarations.`
	);
}

const declarationFiles = await collectDeclarationFiles(distDir);
let rewrittenCount = 0;

for (const filePath of declarationFiles) {
	if (await rewriteDeclarationFile(filePath)) {
		rewrittenCount += 1;
	}
}

console.log(
	`[rewrite:types] rewrote ${rewrittenCount} declaration files in ${path.relative(process.cwd(), distDir)}`
);
