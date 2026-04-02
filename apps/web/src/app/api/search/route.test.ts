import { describe, expect, it } from "bun:test";
import {
	buildAdvancedSearchIndex,
	buildSearchMetadataText,
	type SearchStructuredData,
} from "./route-utils";

const baseStructuredData: SearchStructuredData = {
	headings: [{ id: "overview", content: "Overview" }],
	contents: [
		{ heading: "overview", content: "The Support widget can be customized." },
	],
};

describe("search route utils", () => {
	it("builds advanced index with source and kind tags", () => {
		const index = buildAdvancedSearchIndex({
			id: "docs:/docs/support-component/primitives",
			source: "docs",
			path: "support-component/primitives.mdx",
			url: "/docs/support-component/primitives",
			title: "Primitives",
			description: "Headless building blocks.",
			breadcrumbs: ["Docs", "<Support />"],
			structuredData: baseStructuredData,
			search: {
				kind: "component",
				tags: ["Headless UI"],
				aliases: ["Primitives.Trigger"],
			},
		});

		expect(index.tag).toEqual(["docs", "component", "headless-ui"]);
		expect(index.structuredData.contents).toHaveLength(
			baseStructuredData.contents.length + 1
		);
		expect(index.structuredData.contents.at(-1)?.content).toContain(
			"Component"
		);
		expect(index.structuredData.contents.at(-1)?.content).toContain(
			"Primitives.Trigger"
		);
		expect(baseStructuredData.contents).toHaveLength(1);
	});

	it("falls back to source-based kind when metadata is missing", () => {
		const index = buildAdvancedSearchIndex({
			id: "blog:/blog/introducing-plasma-pandora",
			source: "blog",
			path: "introducing-plasma-pandora.mdx",
			url: "/blog/introducing-plasma-pandora",
			title: "Introducing Cossistant",
			structuredData: baseStructuredData,
			extraTags: ["announcement"],
		});

		expect(index.tag).toEqual(["blog", "article", "announcement"]);
		expect(index.structuredData.contents.at(-1)?.content).toContain("Article");
		expect(index.structuredData.contents.at(-1)?.content).toContain("Blog");
	});

	it("adds aliases and extra tags for changelog entries", () => {
		const index = buildAdvancedSearchIndex({
			id: "changelog:/changelog/2026-02-19-v0.1.2",
			source: "changelog",
			path: "2026-02-19-v0.1.2.mdx",
			url: "/changelog/2026-02-19-v0.1.2",
			title: "v0.1.2",
			structuredData: baseStructuredData,
			extraTags: ["2026-02-19"],
			extraAliases: ["v0.1.2"],
		});

		expect(index.tag).toEqual(["changelog", "release", "2026-02-19"]);
		expect(index.structuredData.contents.at(-1)?.content).toContain("Release");
		expect(index.structuredData.contents.at(-1)?.content).toContain("v0.1.2");
	});

	it("creates deduped metadata text for index enrichment", () => {
		const text = buildSearchMetadataText({
			source: "docs",
			kind: "hook",
			title: "Hooks",
			tags: ["docs", "hook", "hooks"],
			aliases: ["useSupport", "useSupport"],
		});

		expect(text).toBe("Hooks Docs Hook useSupport");
	});
});
