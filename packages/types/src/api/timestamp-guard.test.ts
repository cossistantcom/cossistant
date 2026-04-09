import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function collectTypeScriptFiles(dirPath: string): string[] {
	const entries = readdirSync(dirPath);
	const files: string[] = [];

	for (const entry of entries) {
		const fullPath = join(dirPath, entry);
		const stats = statSync(fullPath);

		if (stats.isDirectory()) {
			files.push(...collectTypeScriptFiles(fullPath));
			continue;
		}

		if (fullPath.endsWith(".ts") && !fullPath.endsWith(".test.ts")) {
			files.push(fullPath);
		}
	}

	return files;
}

describe("API timestamp guard", () => {
	it("does not allow raw z.string timestamp fields in shared API schemas", () => {
		const apiDir = fileURLToPath(new URL(".", import.meta.url));
		const repoRoot = resolve(apiDir, "../../../..");
		const files = [
			...collectTypeScriptFiles(apiDir),
			resolve(apiDir, "../schemas.ts"),
		];
		const rawTimestampFieldPattern =
			/\b[A-Za-z][A-Za-z0-9]*At\b\s*:\s*z\.string\b/g;

		const violations = files.flatMap((filePath) => {
			const source = readFileSync(filePath, "utf8");

			return [...source.matchAll(rawTimestampFieldPattern)].map(
				(match) =>
					`${relative(repoRoot, filePath)}: ${match[0]?.trim() ?? "unknown"}`
			);
		});

		assert.deepEqual(violations, []);
	});
});
