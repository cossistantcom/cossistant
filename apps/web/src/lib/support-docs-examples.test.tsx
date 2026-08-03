import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import {
	ComponentPreview as DocsComponentPreview,
	resolveDocsPreviewName,
} from "@/app/(lander-docs)/components/docs/component-preview";
import StyleTokenCascade from "@/app/(lander-docs)/components/docs/style-token-cascade";
import ThemeScenarios from "@/app/(lander-docs)/components/docs/theme-scenarios";
import { ComponentPreviewTabs } from "@/components/component-preview-tabs";
import SupportBubbleAndHomeDemo from "@/components/support/demo-bubble-and-home";
import SupportClassicBubbleDemo from "@/components/support/demo-classic-bubble";
import SupportCustomHomeDemo from "@/components/support/demo-custom-home";
import SupportDocDemo from "@/components/support/demo-doc";
import SupportFullCompositionDemo from "@/components/support/demo-full-composition";
import SupportPillBubbleDemo from "@/components/support/demo-pill-bubble";
import SupportResponsiveEmbedDemo from "@/components/support/demo-responsive-embed";
import { Index } from "@/registry/__index__";

const docsRoot = path.resolve(
	import.meta.dir,
	"../../content/docs/support-component"
);
const packageReadmePath = path.resolve(
	import.meta.dir,
	"../../../../packages/react/README.md"
);
const docsMdxComponentsPath = path.resolve(
	import.meta.dir,
	"../app/(lander-docs)/components/docs/mdx-components.tsx"
);
const webRoot = path.resolve(import.meta.dir, "../..");
const roundedClassPattern = /\brounded(?:-\[[^\]]+\]|-[a-z0-9:/[\].]+)?\b/;

function resolveWebPath(registryPath: string) {
	return path.resolve(webRoot, registryPath);
}

async function renderWithSuspense(element: React.ReactNode) {
	const stream = await renderToReadableStream(
		<React.Suspense fallback={<div>Loading...</div>}>{element}</React.Suspense>
	);
	await stream.allReady;
	return await new Response(stream).text();
}

describe("support docs examples", () => {
	it("keeps every primary support demo registered and renderable", () => {
		const demos = [
			["support-doc", SupportDocDemo],
			["support-classic-bubble", SupportClassicBubbleDemo],
			["support-pill-bubble", SupportPillBubbleDemo],
			["support-custom-home", SupportCustomHomeDemo],
			["support-bubble-and-home", SupportBubbleAndHomeDemo],
			["support-full-composition", SupportFullCompositionDemo],
			["support-responsive-embed", SupportResponsiveEmbedDemo],
		] as const;

		for (const [name, Component] of demos) {
			expect(Index[name]).toBeDefined();
			expect(Index[name]?.path).toContain("src/components/support/");
			expect(Index[name]?.sourcePath).toContain(
				"src/components/support/examples/"
			);

			const html = renderToStaticMarkup(React.createElement(Component));
			expect(html.length).toBeGreaterThan(0);
		}
	});

	it("shows React-first source examples while runtime demos keep docs-only harness code", () => {
		const demoNames = [
			"support-doc",
			"support-classic-bubble",
			"support-pill-bubble",
			"support-custom-home",
			"support-bubble-and-home",
			"support-full-composition",
			"support-responsive-embed",
		] as const;
		const triggerDemoNames = new Set([
			"support-classic-bubble",
			"support-pill-bubble",
		]);

		for (const name of demoNames) {
			const item = Index[name];
			expect(item).toBeDefined();
			if (!item?.sourcePath) {
				throw new Error(`Missing docs example registration for ${name}`);
			}
			const runtimeCode = readFileSync(resolveWebPath(item.path), "utf8");
			const sourceCode = readFileSync(resolveWebPath(item.sourcePath), "utf8");

			expect(runtimeCode).toContain("SupportDemoStage");
			expect(sourceCode).toContain("@cossistant/react");
			expect(sourceCode).not.toContain("SupportDocsProvider");

			if (triggerDemoNames.has(name)) {
				expect(runtimeCode).toContain("SupportTriggerStatePreview");
				expect(runtimeCode).toContain("../examples/");
				expect(runtimeCode).not.toContain("SupportDocsProvider");
				expect(runtimeCode).not.toContain('from "@cossistant/react"');
				expect(runtimeCode).not.toMatch(/<Support(?:\s|>|\.)/);
				expect(runtimeCode).not.toContain("../custom-trigger");
			} else {
				expect(runtimeCode).toContain("SupportDocsProvider");
			}
		}
	});

	it("keeps trigger preview code and trigger preview UI wired to the same components", () => {
		const classicItem = Index["support-classic-bubble"];
		const pillItem = Index["support-pill-bubble"];

		if (!(classicItem?.sourcePath && pillItem?.sourcePath)) {
			throw new Error("Missing trigger demo registry source paths");
		}

		const classicRuntime = readFileSync(
			resolveWebPath(classicItem.path),
			"utf8"
		);
		const classicSource = readFileSync(
			resolveWebPath(classicItem.sourcePath),
			"utf8"
		);
		const pillRuntime = readFileSync(resolveWebPath(pillItem.path), "utf8");
		const pillSource = readFileSync(
			resolveWebPath(pillItem.sourcePath),
			"utf8"
		);

		expect(classicSource).toContain("export const ClassicBubble");
		expect(classicSource).toContain("ExampleClassicBubble");
		expect(classicRuntime).toContain(
			'import { ClassicBubble } from "../examples/classic-bubble";'
		);
		expect(pillSource).toContain("export const PillBubble");
		expect(pillSource).toContain("ExamplePillBubble");
		expect(pillRuntime).toContain(
			'import { PillBubble } from "../examples/pill-bubble";'
		);
	});

	it("keeps the support docs React-first, ordered by learning path, and preview-backed", () => {
		const topMeta = JSON.parse(
			readFileSync(
				path.resolve(import.meta.dir, "../../content/docs/meta.json"),
				"utf8"
			)
		) as { pages: string[] };
		const meta = JSON.parse(
			readFileSync(path.join(docsRoot, "meta.json"), "utf8")
		) as { pages: string[] };
		const advancedMeta = JSON.parse(
			readFileSync(
				path.resolve(import.meta.dir, "../../content/docs/advanced/meta.json"),
				"utf8"
			)
		) as { pages: string[] };
		const indexDoc = readFileSync(path.join(docsRoot, "index.mdx"), "utf8");
		const customizationDoc = readFileSync(
			path.join(docsRoot, "customization.mdx"),
			"utf8"
		);
		const routingDoc = readFileSync(path.join(docsRoot, "routing.mdx"), "utf8");
		const advancedIndexDoc = readFileSync(
			path.resolve(import.meta.dir, "../../content/docs/advanced/index.mdx"),
			"utf8"
		);
		const advancedPrimitivesDoc = readFileSync(
			path.resolve(
				import.meta.dir,
				"../../content/docs/advanced/primitives.mdx"
			),
			"utf8"
		);
		const quickstartDoc = readFileSync(
			path.resolve(import.meta.dir, "../../content/docs/quickstart/index.mdx"),
			"utf8"
		);
		const reactQuickstartDoc = readFileSync(
			path.resolve(import.meta.dir, "../../content/docs/quickstart/react.mdx"),
			"utf8"
		);
		const userFeedbackDoc = readFileSync(
			path.resolve(
				import.meta.dir,
				"../../content/docs/user-feedback/index.mdx"
			),
			"utf8"
		);

		expect(topMeta.pages).toEqual([
			"(root)",
			"quickstart",
			"support-component",
			"user-feedback",
			"advanced",
			"concepts",
			"self-host",
			"others",
		]);
		expect(meta.pages).toEqual([
			"index",
			"customization",
			"theme",
			"routing",
			"support-state",
			"text",
			"hooks",
			"events",
			"types",
		]);
		expect(advancedMeta.pages).toEqual(["index", "primitives"]);

		expect(indexDoc).not.toContain("@cossistant/next");
		expect(customizationDoc).not.toContain("@cossistant/next");
		expect(routingDoc).not.toContain("@cossistant/next");

		expect(indexDoc).toContain("title: Overview");
		expect(indexDoc).toContain('name="support-doc"');
		expect(indexDoc).toContain("[Advanced](/docs/advanced)");
		expect(indexDoc).not.toContain("sizeClasses=");
		expect(customizationDoc).toContain("title: Change One Thing");
		expect(customizationDoc).toContain('name="support-classic-bubble"');
		expect(customizationDoc).toContain('name="support-pill-bubble"');
		expect(customizationDoc).toContain('name="support-custom-home"');
		expect(customizationDoc).not.toContain("sizeClasses=");
		expect(routingDoc).toContain("title: Pages & Layouts");
		expect(routingDoc).toContain('name="support-responsive-embed"');
		expect(routingDoc).toContain('name="support-full-composition"');
		expect(routingDoc).toContain("[Advanced](/docs/advanced)");
		expect(routingDoc).not.toContain("sizeClasses=");
		expect(routingDoc).not.toContain("/docs/support-component/primitives");
		expect(userFeedbackDoc).toContain('name="user-feedback-emoji"');
		expect(userFeedbackDoc).toContain('name="user-feedback-stars"');
		expect(userFeedbackDoc).toContain(
			"npx shadcn@latest add button popover select textarea toggle-group"
		);
		expect(userFeedbackDoc).not.toContain("Preview submissions are faked");
		expect(advancedIndexDoc).toContain("title: Advanced");
		expect(advancedIndexDoc).toContain("## Build sequence");
		expect(advancedIndexDoc).not.toContain("Templates are coming soon");
		expect(advancedIndexDoc).toContain(
			"https://github.com/cossistantcom/cossistant/tree/main/packages/react/src/support"
		);
		expect(advancedPrimitivesDoc).toContain("title: Primitives");
		expect(advancedPrimitivesDoc).toContain("/docs/advanced");
		expect(quickstartDoc).toContain("## Next in the Support docs");
		expect(quickstartDoc).toContain(
			"bunx --bun shadcn@latest add cossistantcom/cossistant/support"
		);
		expect(quickstartDoc).toContain("## Manual package install");
		expect(quickstartDoc).toContain(
			"[Change One Thing](/docs/support-component/customization)"
		);
		expect(reactQuickstartDoc).toContain("## Next in the Support docs");
		expect(reactQuickstartDoc).toContain(
			"bunx --bun shadcn@latest add cossistantcom/cossistant/support-react"
		);
		expect(reactQuickstartDoc).toContain("## Manual package install");
		expect(reactQuickstartDoc).toContain(
			"[Match Your Brand](/docs/support-component/theme)"
		);
	});

	it("keeps support docs, previews, and install examples sharp-cornered", () => {
		const demoNames = [
			"support-doc",
			"support-classic-bubble",
			"support-pill-bubble",
			"support-custom-home",
			"support-bubble-and-home",
			"support-full-composition",
			"support-responsive-embed",
		] as const;
		const checkedFiles = new Set<string>([
			path.join(docsRoot, "customization.mdx"),
			path.join(docsRoot, "routing.mdx"),
			path.join(docsRoot, "hooks.mdx"),
			path.join(docsRoot, "theme.mdx"),
			path.resolve(
				import.meta.dir,
				"../../content/docs/advanced/primitives.mdx"
			),
			docsMdxComponentsPath,
			path.resolve(
				import.meta.dir,
				"../app/(lander-docs)/components/docs/component-preview.tsx"
			),
			path.resolve(
				import.meta.dir,
				"../app/(lander-docs)/components/docs/component-preview-tabs.tsx"
			),
			path.resolve(import.meta.dir, "../components/component-preview.tsx"),
			path.resolve(import.meta.dir, "../components/component-preview-tabs.tsx"),
			path.resolve(import.meta.dir, "../components/code-block-command.tsx"),
			path.resolve(
				import.meta.dir,
				"../components/code-collapsible-wrapper.tsx"
			),
			path.resolve(
				import.meta.dir,
				"../components/support/docs-demo/trigger-state-preview.tsx"
			),
			path.resolve(
				import.meta.dir,
				"../app/(lander-docs)/components/install/index.tsx"
			),
			path.resolve(
				import.meta.dir,
				"../app/(lander-docs)/components/install/framework-install-command-tabs.tsx"
			),
		]);

		for (const name of demoNames) {
			const item = Index[name];
			if (!item?.sourcePath) {
				throw new Error(`Missing docs example registration for ${name}`);
			}
			checkedFiles.add(resolveWebPath(item.path));
			checkedFiles.add(resolveWebPath(item.sourcePath));
		}

		for (const file of checkedFiles) {
			const source = readFileSync(file, "utf8");
			const match = source.match(roundedClassPattern);

			if (match) {
				throw new Error(`${file} still contains ${match[0]}`);
			}
		}
	});

	it("adds square color swatches to the theme token tables", () => {
		const themeDoc = readFileSync(path.join(docsRoot, "theme.mdx"), "utf8");
		const quickstartDoc = readFileSync(
			path.resolve(import.meta.dir, "../../content/docs/quickstart/index.mdx"),
			"utf8"
		);
		const reactQuickstartDoc = readFileSync(
			path.resolve(import.meta.dir, "../../content/docs/quickstart/react.mdx"),
			"utf8"
		);
		const integrationGuide = readFileSync(
			path.resolve(import.meta.dir, "../lib/support-integration-guide.ts"),
			"utf8"
		);

		expect(themeDoc).toContain("export function ColorSwatch");
		expect(themeDoc).toContain(
			'className="inline-block size-4 border border-dashed border-border align-middle"'
		);
		expect(themeDoc).toContain('<ColorSwatch value="oklch(99% 0 0)" />');
		expect(themeDoc).toContain("## Pick the simplest path");
		expect(themeDoc).toContain("<ThemeScenarios />");
		expect(themeDoc).toContain("## Theme precedence");
		expect(themeDoc).toContain("<StyleTokenCascade />");
		expect(themeDoc).toContain("## Do nothing in many shadcn apps");
		expect(themeDoc).toContain("No extra theme mapping is needed to start.");
		expect(themeDoc).toContain("## What gets inherited automatically");
		expect(themeDoc).toContain("### Status colors");
		expect(themeDoc).toContain("### Avatar accents");
		expect(themeDoc).toContain("### Background shades");
		expect(themeDoc).toContain("--co-theme-radius: 0px;");
		expect(themeDoc).toContain("custom spacing scales");
		expect(themeDoc).toContain(
			"If your app uses custom token names outside the standard shadcn-style base tokens, map them explicitly into `--co-theme-*`."
		);
		expect(quickstartDoc).toContain(
			"No extra theme mapping is needed to start."
		);
		expect(reactQuickstartDoc).toContain(
			"No extra theme mapping is needed to start."
		);
		expect(integrationGuide).toContain(
			"do not add extra widget theme mapping unless the user asks for explicit overrides"
		);
	});

	it("keeps the theme visuals registered and readable", () => {
		const mdxComponentsSource = readFileSync(docsMdxComponentsPath, "utf8");
		const scenariosHtml = renderToStaticMarkup(<ThemeScenarios />);
		const cascadeHtml = renderToStaticMarkup(<StyleTokenCascade />);

		expect(mdxComponentsSource).toContain(
			'import ThemeScenarios from "./theme-scenarios";'
		);
		expect(mdxComponentsSource).toContain("ThemeScenarios,");
		expect(scenariosHtml).toContain("Do nothing");
		expect(scenariosHtml).toContain("Set --co-theme-*");
		expect(scenariosHtml).toContain("Use theme=&quot;dark&quot;");
		expect(cascadeHtml).toContain("How the widget picks its background color");
		expect(cascadeHtml).toContain("Widget override");
		expect(cascadeHtml).toContain("Host app token");
		expect(cascadeHtml).toContain("Cossistant default");
	});

	it("renders docs previews through the docs-only wrapper and support alias", async () => {
		const mdxComponentsSource = readFileSync(docsMdxComponentsPath, "utf8");
		const html = await renderWithSuspense(
			<DocsComponentPreview name="support" />
		);

		expect(resolveDocsPreviewName("support")).toBe("support-doc");
		expect(resolveDocsPreviewName("support-classic-bubble")).toBe(
			"support-classic-bubble"
		);
		expect(mdxComponentsSource).toContain(
			'import { ComponentPreview } from "./component-preview";'
		);
		expect(mdxComponentsSource).not.toContain(
			'import { ComponentPreview } from "@/components/component-preview";'
		);
		expect(html).toContain('data-slot="docs-component-preview"');
		expect(html).toContain("min-h-[280px] md:min-h-[360px]");
		expect(html).not.toContain("min-h-[350px] md:min-h-[450px]");
		expect(html).toContain('data-support-demo-variant="panel"');
		expect(html).not.toContain('data-fake-widget-container="true"');
	});

	it("keeps the package README aligned with the new slots and composition API", () => {
		const readme = readFileSync(packageReadmePath, "utf8");

		expect(readme).toContain("slots");
		expect(readme).toContain("Support.Root");
		expect(readme).toContain("data-slot");
		expect(readme).not.toContain("@cossistant/next");
	});

	it("renders the shared preview shell with a dashed border and centered stage", () => {
		const html = renderToStaticMarkup(
			<ComponentPreviewTabs
				component={<div>Preview</div>}
				source={<div>Code</div>}
			/>
		);

		expect(html).toContain("border-dashed");
		expect(html).toContain('data-slot="component-preview-tabs"');
		expect(html).toContain('data-slot="component-preview-frame"');
		expect(html.indexOf('data-slot="component-preview-tabs"')).toBeLessThan(
			html.indexOf('data-slot="component-preview-frame"')
		);
		expect(html).toContain("items-center");
		expect(html).toContain("justify-center");
		expect(html).not.toContain("rounded");
	});
});
