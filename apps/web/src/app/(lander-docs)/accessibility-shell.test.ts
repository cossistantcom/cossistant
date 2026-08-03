import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const webRoot = path.resolve(import.meta.dir, "../../..");

function readWebSource(relativePath: string) {
	return readFileSync(path.join(webRoot, relativePath), "utf8");
}

describe("docs accessibility shell", () => {
	it("keeps skip navigation connected to a focusable main landmark", () => {
		const layout = readWebSource("src/app/(lander-docs)/layout.tsx");

		expect(layout).toContain('href="#main-content"');
		expect(layout).toContain('id="main-content"');
		expect(layout).toContain("tabIndex={-1}");
		expect(layout).toContain("min-h-11");
	});

	it("does not disable browser zoom", () => {
		const rootLayout = readWebSource("src/app/layout.tsx");

		expect(rootLayout).toContain("maximumScale: 5");
		expect(rootLayout).toContain("userScalable: true");
		expect(rootLayout).not.toContain("userScalable: false");
	});

	it("provides a global reduced-motion fallback", () => {
		const globalCss = readWebSource("src/app/globals.css");

		expect(globalCss).toContain("@media (prefers-reduced-motion: reduce)");
		expect(globalCss).toContain("animation-duration: 0.01ms !important");
		expect(globalCss).toContain("transition-duration: 0.01ms !important");
	});

	it("renders page-scoped feedback after documentation content", () => {
		const docsPage = readWebSource(
			"src/app/(lander-docs)/docs/[[...slug]]/page.tsx"
		);

		expect(docsPage).toContain("<DocsFeedback");
		expect(docsPage).toContain("pageTitle={doc.title}");
		expect(docsPage).toContain("pageUrl={page.url}");
	});
});
