import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dir, "../..");
const contentRoot = path.join(repositoryRoot, "apps/web/content");
const docsRoot = path.join(contentRoot, "docs");

type Page = {
	anchors: Set<string>;
	file: string;
	route: string;
	source: string;
};

const failures: string[] = [];

function fail(file: string, message: string) {
	failures.push(`${path.relative(repositoryRoot, file)}: ${message}`);
}

function walk(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		if (entry.name.startsWith(".")) {
			return [];
		}

		const resolved = path.join(directory, entry.name);
		return entry.isDirectory() ? walk(resolved) : [resolved];
	});
}

function routeFor(file: string): string {
	let relative = path
		.relative(contentRoot, file)
		.replaceAll(path.sep, "/")
		.replace(/\.mdx$/, "");

	if (relative.startsWith("docs/(root)/")) {
		relative = `docs/${relative.slice("docs/(root)/".length)}`;
	}

	if (relative.endsWith("/index")) {
		relative = relative.slice(0, -"/index".length);
	}

	return `/${relative}`.replace(/\/$/, "") || "/";
}

function frontmatterFor(file: string, source: string): string | null {
	const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) {
		fail(file, "missing YAML frontmatter");
		return null;
	}

	return match[1];
}

function requireFrontmatterKey(file: string, frontmatter: string, key: string) {
	const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	if (!new RegExp(`^${escaped}:\\s*\\S`, "m").test(frontmatter)) {
		fail(file, `missing required frontmatter field '${key}'`);
	}
}

function contentOutsideFences(source: string): string {
	let fence: string | null = null;
	const kept: string[] = [];

	for (const line of source.split(/\r?\n/)) {
		const marker = line.match(/^\s*(`{3,}|~{3,})/u)?.[1] ?? null;
		if (marker) {
			if (fence === null) {
				fence = marker[0];
			} else if (marker[0] === fence) {
				fence = null;
			}
			continue;
		}

		if (fence === null) {
			kept.push(line);
		}
	}

	return kept.join("\n");
}

function slugifyHeading(value: string): string {
	return value
		.toLowerCase()
		.replace(/<[^>]+>/g, "")
		.replace(/[`*_~]/g, "")
		.replace(/&[a-z]+;/g, "")
		.replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
		.trim()
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-");
}

function collectAnchorsAndCheckHeadings(file: string, source: string) {
	const visible = contentOutsideFences(source);
	const anchors = new Set<string>();
	const anchorCounts = new Map<string, number>();
	// Changelog collection routes render each entry description as H2 before MDX.
	let previousLevel = file.includes(`${path.sep}changelog${path.sep}`) ? 2 : 1;

	for (const match of visible.matchAll(/^(#{1,6})\s+(.+?)\s*$/gmu)) {
		const level = match[1].length;
		const label = match[2];
		if (level > previousLevel + 1) {
			fail(
				file,
				`heading hierarchy jumps from H${previousLevel} to H${level}: '${label}'`
			);
		}
		previousLevel = level;

		const anchor = slugifyHeading(label);
		if (!anchor) {
			fail(file, `heading has no stable slug: '${label}'`);
			continue;
		}
		const seenCount = anchorCounts.get(anchor) ?? 0;
		anchorCounts.set(anchor, seenCount + 1);
		anchors.add(seenCount === 0 ? anchor : `${anchor}-${seenCount}`);
	}

	return anchors;
}

function extractLinks(source: string): string[] {
	const visible = contentOutsideFences(source);
	const markdown = [...visible.matchAll(/\[[^\]]+\]\((\/[^)\s]+)\)/g)].map(
		(match) => match[1]
	);
	const jsx = [...visible.matchAll(/\bhref=["'](\/[^"']+)["']/g)].map(
		(match) => match[1]
	);
	return [...markdown, ...jsx];
}

function checkInternalLink(
	page: Page,
	link: string,
	routeIndex: Map<string, Page>
) {
	const parsed = new URL(link, "https://cossistant.com");
	if (!/^\/(?:docs|blog|changelog)(?:\/|$)/.test(parsed.pathname)) {
		return;
	}

	const normalizedPath = parsed.pathname.replace(/\/$/, "") || "/";
	const target = routeIndex.get(normalizedPath);
	if (!target) {
		fail(page.file, `internal link does not resolve: '${link}'`);
		return;
	}

	const anchor = decodeURIComponent(parsed.hash.slice(1));
	if (anchor && !target.anchors.has(anchor)) {
		fail(page.file, `internal link anchor does not resolve: '${link}'`);
	}
}

function checkImages(file: string, source: string) {
	const visible = contentOutsideFences(source);
	for (const match of visible.matchAll(/<(?:img|Image)\b[^>]*>/g)) {
		if (!/\balt=(?:"[^"]+"|'[^']+'|\{[^}]+\})/.test(match[0])) {
			fail(
				file,
				`image is missing descriptive alt text: ${match[0].slice(0, 100)}`
			);
		}
	}

	for (const match of visible.matchAll(/<ScreenshotFrame\b[\s\S]*?\/>/g)) {
		const block = match[0];
		const sources = [...block.matchAll(/\bsrc:\s*["'][^"']+["']/g)].length;
		const alts = [...block.matchAll(/\balt:\s*["'][^"']+["']/g)].length;
		if (sources !== alts) {
			fail(
				file,
				`ScreenshotFrame has ${sources} image source(s) but ${alts} descriptive alt value(s)`
			);
		}
	}
}

function codeFences(source: string): Array<{ code: string; language: string }> {
	const fences: Array<{ code: string; language: string }> = [];
	const pattern = /^```([a-z0-9_-]+)?[^\n]*\n([\s\S]*?)^```\s*$/gimu;
	for (const match of source.matchAll(pattern)) {
		fences.push({ language: (match[1] ?? "").toLowerCase(), code: match[2] });
	}
	return fences;
}

function checkDuplicateImports(file: string, source: string) {
	for (const fence of codeFences(source)) {
		if (!new Set(["js", "jsx", "ts", "tsx"]).has(fence.language)) {
			continue;
		}
		const bindings = new Set<string>();
		for (const match of fence.code.matchAll(
			/import\s+(?:type\s+)?\{([^}]+)\}\s+from/g
		)) {
			for (const rawBinding of match[1].split(",")) {
				const binding = rawBinding
					.trim()
					.replace(/^type\s+/, "")
					.split(/\s+as\s+/)
					.at(-1);
				if (!binding) {
					continue;
				}
				if (bindings.has(binding)) {
					fail(file, `code fence imports '${binding}' more than once`);
				}
				bindings.add(binding);
			}
		}
	}
}

const forbiddenPatterns: [RegExp, string][] = [
	[/pending_docs_conversation/, "uses the docs-only pending conversation ID"],
	[/<Facehash\b[^>]*\bshape=/, "uses the removed Facehash 'shape' prop"],
	[/\b!visitor\?\.contact\b/, "skips identity updates when any contact exists"],
	[/\bonEvent=\{/, "uses the nonexistent Support 'onEvent' prop"],
	[
		/\bbun(?:\s+run)?\s+db:generate\b/,
		"uses the nonexistent API db:generate script",
	],
	[/localhost:3001/, "documents the obsolete API development port"],
	[/\bGPL-3\.0\b(?![^\n]*AGPL)/, "names GPL-3.0 instead of AGPL-3.0"],
	[/AGPL[^\n]{0,80}non-commercial/i, "misstates AGPL as non-commercial"],
	[/\*\*Fingerprinting\*\*:/i, "claims visitor fingerprint identity"],
	[
		/<script\s+async[^>]+loader\.js[^>]*><\/script>\s*<script>\s*window\.Cossistant/s,
		"calls the Cossistant global after an unordered async loader",
	],
];

function checkKnownRegressions(file: string, source: string) {
	for (const [pattern, message] of forbiddenPatterns) {
		if (pattern.test(source)) {
			fail(file, message);
		}
	}
	checkDuplicateImports(file, source);
}

function checkNavigationMetadata() {
	for (const metaFile of walk(docsRoot).filter((file) =>
		file.endsWith("meta.json")
	)) {
		const metadata = JSON.parse(readFileSync(metaFile, "utf8")) as {
			pages?: string[];
		};
		if (!metadata.pages) {
			continue;
		}

		const directory = path.dirname(metaFile);
		const listed = new Set(metadata.pages);
		for (const item of metadata.pages) {
			if (item.startsWith("[") || item.startsWith("(")) {
				continue;
			}
			const candidates = [
				path.join(directory, `${item}.mdx`),
				path.join(directory, item, "index.mdx"),
				path.join(directory, item, "meta.json"),
			];
			if (!candidates.some(existsSync)) {
				fail(metaFile, `navigation entry '${item}' has no page or section`);
			}
		}

		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			if (entry.name.startsWith(".") || entry.name === "meta.json") {
				continue;
			}
			const item = entry.isDirectory()
				? entry.name
				: entry.name.endsWith(".mdx")
					? entry.name.slice(0, -4)
					: null;
			if (item && !listed.has(item)) {
				fail(metaFile, `navigation omits local content '${item}'`);
			}
		}
	}
}

const mdxFiles = walk(contentRoot).filter((file) => file.endsWith(".mdx"));
const pages: Page[] = mdxFiles.map((file) => {
	const source = readFileSync(file, "utf8");
	const frontmatter = frontmatterFor(file, source);
	if (frontmatter) {
		requireFrontmatterKey(file, frontmatter, "description");
		if (file.includes(`${path.sep}docs${path.sep}`)) {
			requireFrontmatterKey(file, frontmatter, "title");
		}
		if (file.includes(`${path.sep}blog${path.sep}`)) {
			for (const key of ["title", "date", "author", "tags"]) {
				requireFrontmatterKey(file, frontmatter, key);
			}
		}
		if (file.includes(`${path.sep}changelog${path.sep}`)) {
			for (const key of ["date", "author"]) {
				requireFrontmatterKey(file, frontmatter, key);
			}
		}
	}

	checkImages(file, source);
	checkKnownRegressions(file, source);
	return {
		anchors: collectAnchorsAndCheckHeadings(file, source),
		file,
		route: routeFor(file),
		source,
	};
});

const pagesByRoute = new Map(pages.map((page) => [page.route, page]));
for (const page of pages) {
	for (const link of extractLinks(page.source)) {
		checkInternalLink(page, link, pagesByRoute);
	}
}

checkNavigationMetadata();

if (failures.length > 0) {
	console.error(`Documentation content check failed (${failures.length}):`);
	for (const failure of failures) {
		console.error(`- ${failure}`);
	}
	process.exit(1);
}

console.log(
	`Documentation content check passed (${pages.length} MDX pages, ${pagesByRoute.size} routes).`
);
