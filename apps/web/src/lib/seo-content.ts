import { readFileSync } from "node:fs";
import type { MetadataRoute } from "next";
import type React from "react";
import { parse } from "yaml";
import { getLLMText } from "@/lib/llm";
import { SEO_DESCRIPTION_LIMITS, SEO_TITLE_LIMITS } from "@/lib/metadata";
import { toAbsoluteUrl } from "@/lib/site-url";
import { blog, changelog, source } from "@/lib/source";

type RawBlogPage = ReturnType<typeof blog.getPages>[number];
type RawChangelogPage = ReturnType<typeof changelog.getPages>[number];
type RawDocsPage = ReturnType<typeof source.getPages>[number];
type PageWithPath = {
	absolutePath: string;
	data: unknown;
};

type BlogFrontmatter = {
	title: string;
	description: string;
	date: string;
	updatedAt?: string;
	author: string;
	tags: string[];
	image?: string;
	published?: boolean;
	canonical?: string;
	noindex?: boolean;
	keywords?: string[];
	top?: boolean;
	related?: string[];
	slug?: string;
};

type DocsFrontmatter = {
	title: string;
	description: string;
	image?: string;
	canonical?: string;
	noindex?: boolean;
	keywords?: string[];
	updatedAt?: string;
	search?: {
		kind?: string;
		tags?: string[];
		aliases?: string[];
	};
	type?: string;
	lastModified?: string;
};

type ChangelogFrontmatter = {
	version?: string;
	description: string;
	date: string;
	author: string;
	"tiny-excerpt"?: string;
};

type BlogTagRegistryEntry = {
	intro: string;
	aliases?: string[];
};

export type BlogPage = Omit<RawBlogPage, "data"> & {
	data: BlogFrontmatter & RawBlogPage["data"];
};

export type ChangelogPage = Omit<RawChangelogPage, "data"> & {
	data: ChangelogFrontmatter & RawChangelogPage["data"];
};

export type DocsPage = Omit<RawDocsPage, "data"> & {
	data: DocsFrontmatter &
		RawDocsPage["data"] & {
			body?: React.ComponentType<any>;
			toc?: unknown[];
		};
};

export const BLOG_TAG_MIN_INDEXABLE_POSTS = 3;

const BLOG_TAG_REGISTRY: Record<string, BlogTagRegistryEntry> = {
	react: {
		intro:
			"Implementation guides and patterns for shipping AI and human support inside React products.",
	},
	nextjs: {
		intro:
			"Next.js-focused tutorials for adding, customizing, and scaling support inside App Router apps.",
		aliases: ["next.js"],
	},
	"open-source": {
		intro:
			"Open-source release notes, implementation details, and product lessons from building Cossistant in public.",
	},
};

const frontmatterCache = new Map<string, Record<string, unknown>>();
const mergedFrontmatterCache = new Map<
	string,
	BlogFrontmatter & BlogPage["data"]
>();

export type SeoValidationIssue = {
	level: "error" | "warning";
	code: string;
	path: string;
	message: string;
};

export type SeoValidationEntry = {
	path: string;
	title: string;
	description: string;
	canonical?: string;
	image?: string;
	date?: string;
	updatedAt?: string;
};

function sortByNewestDate<T extends { data: { date: string } }>(
	pages: T[]
): T[] {
	return [...pages].sort(
		(a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime()
	);
}

function extractFrontmatter(path: string): Record<string, unknown> {
	const cached = frontmatterCache.get(path);

	if (cached) {
		return cached;
	}

	const raw = readFileSync(path, "utf8");
	const match = raw.match(/^---\n([\s\S]*?)\n---/);
	const parsed =
		match?.[1] && match[1].trim().length > 0
			? ((parse(match[1]) as Record<string, unknown>) ?? {})
			: {};

	frontmatterCache.set(path, parsed);
	return parsed;
}

function mergeFrontmatter<T>(page: PageWithPath): T {
	return {
		...(extractFrontmatter(page.absolutePath) as Record<string, unknown>),
		...((page.data ?? {}) as Record<string, unknown>),
	} as T;
}

function normalizeTag(tag: string): string {
	return tag.trim().toLowerCase();
}

function normalizeRegistryTag(tag: string): string {
	return normalizeTag(tag);
}

function resolveTagRegistryKey(tag: string): string | undefined {
	const normalized = normalizeRegistryTag(tag);

	for (const [key, entry] of Object.entries(BLOG_TAG_REGISTRY)) {
		if (key === normalized) {
			return key;
		}

		if (
			entry.aliases?.some((alias) => normalizeRegistryTag(alias) === normalized)
		) {
			return key;
		}
	}

	return;
}

function isValidDate(date: string | undefined): boolean {
	if (!date) {
		return false;
	}

	return !Number.isNaN(new Date(date).getTime());
}

function isValidCanonical(canonical: string | undefined): boolean {
	if (!canonical) {
		return true;
	}

	if (canonical.startsWith("/")) {
		return true;
	}

	try {
		new URL(canonical);
		return true;
	} catch {
		return false;
	}
}

function isValidImageUrl(image: string | undefined): boolean {
	if (!image) {
		return true;
	}

	if (image.startsWith("/")) {
		return true;
	}

	try {
		new URL(image);
		return true;
	} catch {
		return false;
	}
}

function isTitleWeak(title: string): boolean {
	return (
		title.trim().length < SEO_TITLE_LIMITS.min ||
		title.trim().length > SEO_TITLE_LIMITS.max
	);
}

function isDescriptionWeak(description: string): boolean {
	return (
		description.trim().length < SEO_DESCRIPTION_LIMITS.min ||
		description.trim().length > SEO_DESCRIPTION_LIMITS.max
	);
}

export function getPublishedBlogPosts(): BlogPage[] {
	const hydratedPosts: BlogPage[] = [];

	for (const post of blog.getPages()) {
		const data = getBlogData(post);

		if (data.published === false) {
			continue;
		}

		hydratedPosts.push({
			...post,
			data,
		});
	}

	return sortByNewestDate(hydratedPosts) as BlogPage[];
}

export function getBlogPostSlug(post: BlogPage): string {
	const firstSlug = post.slugs[0];

	return getBlogData(post).slug || firstSlug || post.path.replace(/\.mdx$/, "");
}

export function getBlogData(
	post: RawBlogPage | BlogPage
): BlogFrontmatter & BlogPage["data"] {
	const cacheKey = post.absolutePath ?? post.path;
	const cached = mergedFrontmatterCache.get(cacheKey);

	if (cached) {
		return cached;
	}

	const merged = mergeFrontmatter<BlogFrontmatter & BlogPage["data"]>(
		post as unknown as PageWithPath
	);
	mergedFrontmatterCache.set(cacheKey, merged);
	return merged;
}

export function getBlogPostBySlug(slug: string): BlogPage | undefined {
	return getPublishedBlogPosts().find((post) => getBlogPostSlug(post) === slug);
}

export function getAllBlogTags(): string[] {
	const tags = new Map<string, string>();

	for (const post of getPublishedBlogPosts()) {
		for (const tag of getBlogData(post).tags) {
			const normalized = normalizeTag(tag);

			if (!tags.has(normalized)) {
				tags.set(normalized, tag);
			}
		}
	}

	return Array.from(tags.values()).sort((a, b) => a.localeCompare(b));
}

export function getPostsByTag(tag: string): BlogPage[] {
	const normalized = normalizeTag(tag);

	return getPublishedBlogPosts().filter((post) =>
		getBlogData(post).tags.some((value) => normalizeTag(value) === normalized)
	);
}

export function getBlogTagIntro(tag: string): string | undefined {
	const registryKey = resolveTagRegistryKey(tag);
	return registryKey ? BLOG_TAG_REGISTRY[registryKey]?.intro : undefined;
}

export function isBlogTagIndexable(tag: string): boolean {
	return (
		getPostsByTag(tag).length >= BLOG_TAG_MIN_INDEXABLE_POSTS &&
		Boolean(getBlogTagIntro(tag))
	);
}

export function getIndexableBlogTags(): string[] {
	return getAllBlogTags().filter((tag) => isBlogTagIndexable(tag));
}

export function getDocsPages(): DocsPage[] {
	return source
		.getPages()
		.map((page) => ({
			...page,
			data: getDocsData(page),
		}))
		.filter((page) => getDocsData(page).type !== "openapi")
		.sort((a, b) => a.url.localeCompare(b.url)) as DocsPage[];
}

export function getDocsPageBySlug(slug?: string[]): DocsPage | undefined {
	const page = source.getPage(slug);
	if (!page) {
		return;
	}

	return {
		...page,
		data: getDocsData(page),
	} as DocsPage;
}

export function getDocsData(
	page: RawDocsPage | DocsPage
): DocsFrontmatter & DocsPage["data"] {
	return mergeFrontmatter<DocsFrontmatter & DocsPage["data"]>(
		page as unknown as PageWithPath
	);
}

export function getSortedChangelogEntries(): ChangelogPage[] {
	return sortByNewestDate(
		changelog.getPages().map((entry) => ({
			...entry,
			data: getChangelogData(entry),
		}))
	) as ChangelogPage[];
}

export function getChangelogData(
	entry: RawChangelogPage | ChangelogPage
): ChangelogFrontmatter & ChangelogPage["data"] {
	return mergeFrontmatter<ChangelogFrontmatter & ChangelogPage["data"]>(
		entry as unknown as PageWithPath
	);
}

export function getLanderSitemapEntries(): MetadataRoute.Sitemap {
	const docsPages = getDocsPages();
	const publishedPosts = getPublishedBlogPosts();
	const changelogEntries = getSortedChangelogEntries();

	return [
		{
			url: toAbsoluteUrl("/"),
			changeFrequency: "monthly",
			priority: 1,
		},
		{
			url: toAbsoluteUrl("/pricing"),
			changeFrequency: "monthly",
			priority: 0.9,
		},
		{
			url: toAbsoluteUrl("/open-source-program"),
			changeFrequency: "monthly",
			priority: 0.85,
		},
		{
			url: toAbsoluteUrl("/blog"),
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: toAbsoluteUrl("/changelog"),
			changeFrequency: "weekly",
			priority: 0.7,
		},
		{
			url: toAbsoluteUrl("/privacy"),
			changeFrequency: "yearly",
			priority: 0.2,
		},
		{
			url: toAbsoluteUrl("/terms"),
			changeFrequency: "yearly",
			priority: 0.2,
		},
		...publishedPosts.map((post) => ({
			url: toAbsoluteUrl(post.url),
			lastModified: new Date(
				getBlogData(post).updatedAt ?? getBlogData(post).date
			),
			changeFrequency: "monthly" as const,
			priority: 0.7,
		})),
		...getIndexableBlogTags().map((tag) => ({
			url: toAbsoluteUrl(`/blog/tag/${encodeURIComponent(tag)}`),
			changeFrequency: "weekly" as const,
			priority: 0.5,
		})),
		...changelogEntries.map((entry) => ({
			url: toAbsoluteUrl(entry.url),
			lastModified: new Date(getChangelogData(entry).date),
			changeFrequency: "monthly" as const,
			priority: 0.4,
		})),
		...docsPages.map((page) => {
			const pageData = getDocsData(page);

			return {
				url: toAbsoluteUrl(page.url),
				lastModified: pageData.updatedAt
					? new Date(pageData.updatedAt)
					: pageData.lastModified
						? new Date(pageData.lastModified)
						: undefined,
				changeFrequency: "weekly" as const,
				priority: page.url === "/docs" ? 0.8 : 0.5,
			};
		}),
	];
}

export function buildDocsLlmsIndexText(): string {
	const pages = getDocsPages();
	const lines: string[] = ["# Docs"];
	const grouped = new Map<string, string[]>();

	for (const page of pages) {
		const data = getDocsData(page);
		const group = page.slugs[0] ?? "root";
		const entries = grouped.get(group) ?? [];
		entries.push(`- [${data.title}](${page.url}): ${data.description}`);
		grouped.set(group, entries);
	}

	for (const [group, entries] of grouped) {
		lines.push(`## ${group}`);
		lines.push(entries.join("\n"));
	}

	return lines.join("\n\n");
}

export async function buildDocsLlmsFullText(): Promise<string> {
	const pages = getDocsPages();
	const scanned = await Promise.all(pages.map((page) => getLLMText(page)));
	return scanned.join("\n\n");
}

export function validateSeoEntry({
	path,
	title,
	description,
	canonical,
	image,
	date,
	updatedAt,
}: SeoValidationEntry): SeoValidationIssue[] {
	const issues: SeoValidationIssue[] = [];

	if (isTitleWeak(title)) {
		issues.push({
			level: "warning",
			code: "weak-title",
			path,
			message: `Title length ${title.length} is outside the preferred ${SEO_TITLE_LIMITS.min}-${SEO_TITLE_LIMITS.max} character range.`,
		});
	}

	if (isDescriptionWeak(description)) {
		issues.push({
			level: "warning",
			code: "weak-description",
			path,
			message: `Description length ${description.length} is outside the preferred ${SEO_DESCRIPTION_LIMITS.min}-${SEO_DESCRIPTION_LIMITS.max} character range.`,
		});
	}

	if (!isValidCanonical(canonical)) {
		issues.push({
			level: "error",
			code: "invalid-canonical",
			path,
			message: "Canonical must be an absolute URL or a site-relative path.",
		});
	}

	if (!isValidImageUrl(image)) {
		issues.push({
			level: "error",
			code: "invalid-image",
			path,
			message: "Image must be an absolute URL or a site-relative path.",
		});
	}

	if (date && !isValidDate(date)) {
		issues.push({
			level: "error",
			code: "invalid-date",
			path,
			message: "date must be a valid ISO-compatible date.",
		});
	}

	if (updatedAt && !isValidDate(updatedAt)) {
		issues.push({
			level: "error",
			code: "invalid-updatedAt",
			path,
			message: "updatedAt must be a valid ISO-compatible date.",
		});
	}

	return issues;
}

export function validateSeoContent(): SeoValidationIssue[] {
	const issues: SeoValidationIssue[] = [];

	for (const post of getPublishedBlogPosts()) {
		const slug = getBlogPostSlug(post);
		const path = `content/blog/${slug}`;
		const data = getBlogData(post);
		issues.push(
			...validateSeoEntry({
				path,
				title: data.title,
				description: data.description,
				canonical: data.canonical,
				image: data.image,
				date: data.date,
				updatedAt: data.updatedAt ?? data.date,
			})
		);
	}

	for (const page of getDocsPages()) {
		const doc = getDocsData(page);
		const path = `content/docs/${page.path}`;

		issues.push(
			...validateSeoEntry({
				path,
				title: doc.title,
				description: doc.description,
				canonical: doc.canonical,
				image: doc.image,
				updatedAt: doc.updatedAt,
			})
		);
	}

	for (const tag of getAllBlogTags()) {
		if (getPostsByTag(tag).length < BLOG_TAG_MIN_INDEXABLE_POSTS) {
			issues.push({
				level: "warning",
				code: "blog-tag-below-threshold",
				path: `/blog/tag/${encodeURIComponent(tag)}`,
				message: `Tag archive is below the ${BLOG_TAG_MIN_INDEXABLE_POSTS}-post indexability threshold.`,
			});
			continue;
		}

		if (!getBlogTagIntro(tag)) {
			issues.push({
				level: "warning",
				code: "blog-tag-missing-intro",
				path: `/blog/tag/${encodeURIComponent(tag)}`,
				message:
					"Tag archive is missing unique intro copy required for indexation.",
			});
		}
	}

	return issues;
}
