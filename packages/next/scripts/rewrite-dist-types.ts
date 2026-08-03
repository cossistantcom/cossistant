import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const packageDir = path.resolve(import.meta.dir, "..");
const distDir = path.join(packageDir, "dist");

// tsdown's dts output for namespace/default re-export entries emits
// `import { __export, __reExport } from ".../_virtual/rolldown_runtime.js"`,
// but only the .js helper is emitted (no declaration file), which breaks
// consumers compiling with skipLibCheck:false (TS7016). The helpers are never
// referenced in the declarations, so the import can be stripped.
const VIRTUAL_RUNTIME_IMPORT_PATTERN =
	/^import\s*\{[^}]*\}\s*from\s*["'](?:\.\.?\/)+_virtual\/rolldown_runtime\.js["'];?\r?\n/gm;

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

async function rewriteDeclarationFile(filePath: string): Promise<boolean> {
	const original = await readFile(filePath, "utf8");
	const rewritten = original.replace(VIRTUAL_RUNTIME_IMPORT_PATTERN, "");

	if (rewritten === original) {
		return false;
	}

	if (/\b__(?:export|reExport)\b/.test(rewritten)) {
		throw new Error(
			`Declaration file ${filePath} still references rolldown runtime helpers after stripping the import. Emit a declaration for _virtual/rolldown_runtime.js instead.`
		);
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
