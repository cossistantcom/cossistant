/**
 * Generate the canonical openapi.json artifact.
 *
 * Runs with no environment variables and no infrastructure: the document is
 * built purely from package-owned route descriptors.
 *
 *   bun run scripts/generate-openapi.ts           # write packages/protocol/openapi.json
 *   bun run scripts/generate-openapi.ts --check   # fail if the committed file is stale
 */
import { dirname, join } from "node:path";
import { buildCossistantOpenApiDocument } from "../src/openapi";

const checkOnly = process.argv.includes("--check");
const packageRoot = dirname(import.meta.dir);
const outputPath = join(packageRoot, "openapi.json");

const serialized = `${JSON.stringify(buildCossistantOpenApiDocument(), null, 2)}\n`;

if (checkOnly) {
	const existing = await Bun.file(outputPath)
		.text()
		.catch(() => null);

	if (existing === null) {
		console.error(
			`[protocol] ${outputPath} is missing. Run \`bun run generate:openapi\`.`
		);
		process.exit(1);
	}

	if (existing !== serialized) {
		console.error(
			`[protocol] ${outputPath} is stale. Run \`bun run generate:openapi\` and commit the result.`
		);
		process.exit(1);
	}

	console.log("[protocol] openapi.json is up to date");
} else {
	await Bun.write(outputPath, serialized);
	console.log(`[protocol] wrote ${outputPath}`);
}
