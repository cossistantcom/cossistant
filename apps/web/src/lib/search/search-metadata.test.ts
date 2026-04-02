import { describe, expect, it } from "bun:test";
import {
	buildSearchAliases,
	buildSearchTags,
	getSearchFrontmatterFromData,
	inferFallbackKind,
	inferSourceFromUrl,
	inferTitleFromPath,
	normalizeSearchFrontmatter,
	resolveSearchKind,
	stripHash,
} from "./search-metadata";

describe("search metadata", () => {
	it("normalizes frontmatter tags and aliases", () => {
		const normalized = normalizeSearchFrontmatter({
			kind: "hook",
			tags: [" React Hooks ", "support", "support", "", 42],
			aliases: ["useSupport", "usesupport", " ", false],
		});

		expect(normalized).toEqual({
			kind: "hook",
			tags: ["React Hooks", "support"],
			aliases: ["useSupport"],
		});
	});

	it("extracts search frontmatter from page data", () => {
		const frontmatter = getSearchFrontmatterFromData({
			search: {
				kind: "component",
				tags: ["Widget"],
			},
		});

		expect(frontmatter.kind).toBe("component");
		expect(frontmatter.tags).toEqual(["Widget"]);
	});

	it("strips URL hash while preserving base path", () => {
		expect(stripHash("/docs/support-component/hooks#usesupport")).toBe(
			"/docs/support-component/hooks"
		);
		expect(stripHash("/blog/introducing-plasma-pandora")).toBe(
			"/blog/introducing-plasma-pandora"
		);
	});

	it("infers source from URL", () => {
		expect(inferSourceFromUrl("/docs/quickstart")).toBe("docs");
		expect(inferSourceFromUrl("/blog/intro")).toBe("blog");
		expect(inferSourceFromUrl("/changelog/2026-02-19-v0.1.2")).toBe(
			"changelog"
		);
		expect(inferSourceFromUrl("/pricing")).toBe("other");
	});

	it("resolves search kind from explicit metadata first", () => {
		const kind = resolveSearchKind({
			source: "docs",
			url: "/docs/support-component/hooks",
			path: "support-component/hooks.mdx",
			title: "Hooks",
			frontmatter: {
				kind: "type",
			},
		});

		expect(kind).toBe("type");
	});

	it("falls back to URL/title heuristics when no explicit kind exists", () => {
		expect(
			inferFallbackKind({
				source: "docs",
				url: "/docs/support-component/hooks",
				path: "support-component/hooks.mdx",
				title: "Hooks",
			})
		).toBe("hook");
		expect(
			inferFallbackKind({
				source: "blog",
				url: "/blog/introducing-plasma-pandora",
				title: "Introducing Cossistant",
			})
		).toBe("article");
		expect(
			inferFallbackKind({
				source: "changelog",
				url: "/changelog/2026-02-19-v0.1.2",
				title: "v0.1.2",
			})
		).toBe("release");
	});

	it("builds normalized search tags with source and kind", () => {
		const tags = buildSearchTags({
			source: "docs",
			kind: "hook",
			frontmatter: {
				tags: ["React Hooks", "Support"],
			},
			extraTags: ["Support", "useSupport"],
		});

		expect(tags).toEqual([
			"docs",
			"hook",
			"react-hooks",
			"support",
			"usesupport",
		]);
	});

	it("builds aliases with case-insensitive dedupe", () => {
		const aliases = buildSearchAliases({
			frontmatter: {
				aliases: ["useSupport", "useVisitor"],
			},
			extraAliases: ["UseSupport", "useSupportNavigation"],
		});

		expect(aliases).toEqual([
			"useSupport",
			"useVisitor",
			"useSupportNavigation",
		]);
	});

	it("infers readable fallback title from path", () => {
		expect(
			inferTitleFromPath(
				"support-component/hooks.mdx",
				"/docs/support-component/hooks"
			)
		).toBe("Hooks");
		expect(inferTitleFromPath("(root)/index.mdx", "/docs")).toBe("Docs");
	});
});
