import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

describe("LandingSupportTrigger source", () => {
	it("keeps the full support widget behind the Next.js lazy entry", () => {
		const source = readFileSync(
			new URL("./landing-support-trigger.tsx", import.meta.url),
			"utf8"
		);

		expect(source).toContain(
			'import { LazySupport } from "@cossistant/next/lazy-support"'
		);
		expect(source).toContain("<Suspense fallback={null}>");
		expect(source).toContain("slots={LANDING_SUPPORT_SLOTS}");
		expect(source).not.toMatch(
			/import\s+\{\s*Support\s*\}\s+from\s+["']@cossistant\/(?:next|react)\/support["']/
		);
	});
});
