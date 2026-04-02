import type { Metadata } from "next";
import { DISCORD_INVITE, GITHUB_URL, X_URL } from "@/constants";
import { normalizeCanonical, toAbsoluteUrl } from "@/lib/site-url";

export const SITE_NAME = "Cossistant";
export const SITE_TWITTER_HANDLE = "@plasmapandora";
export const DEFAULT_OG_IMAGE = "/og-image.png";
export const TITLE_TEMPLATE = `%s | ${SITE_NAME}`;
export const DEFAULT_SITE_TITLE =
	"Open-Source AI and Human Support Framework for React";
export const DEFAULT_SITE_DESCRIPTION =
	"Cossistant is the open-source support framework that puts human and AI help right in your React app with custom actions and UI.";
export const DEFAULT_SITE_KEYWORDS = [
	"AI support",
	"human-AI support",
	"react support framework",
	"open source support",
	"custom AI actions",
	"react component",
	"customer support framework",
	"AI agent support",
	"Next.js support widget",
];

export const SEO_TITLE_LIMITS = {
	min: 20,
	max: 65,
} as const;

export const SEO_DESCRIPTION_LIMITS = {
	min: 110,
	max: 170,
} as const;

type SeoImageInput =
	| string
	| {
			url: string;
			alt?: string;
			width?: number;
			height?: number;
	  };

type MetadataInput = {
	title?: string;
	description: string;
	path?: string;
	canonical?: string;
	image?: SeoImageInput;
	keywords?: string[];
	noIndex?: boolean;
	follow?: boolean;
	openGraphType?: "website" | "article";
	authors?: string[];
	publishedTime?: string;
	modifiedTime?: string;
	tags?: string[];
};

type BreadcrumbItem = {
	name: string;
	path: string;
};

function dedupeStrings(values: string[] = []): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean))
	);
}

function resolveImage(image: SeoImageInput | undefined, title?: string) {
	const resolved =
		typeof image === "string"
			? {
					url: image,
					alt: title ?? SITE_NAME,
					width: 1200,
					height: 630,
				}
			: image
				? {
						url: image.url,
						alt: image.alt ?? title ?? SITE_NAME,
						width: image.width ?? 1200,
						height: image.height ?? 630,
					}
				: {
						url: DEFAULT_OG_IMAGE,
						alt: title ?? DEFAULT_SITE_TITLE,
						width: 1200,
						height: 630,
					};

	return {
		url: toAbsoluteUrl(resolved.url),
		alt: resolved.alt,
		width: resolved.width,
		height: resolved.height,
	};
}

function buildRobots({
	noIndex = false,
	follow = !noIndex,
}: {
	noIndex?: boolean;
	follow?: boolean;
}): Metadata["robots"] {
	return {
		index: !noIndex,
		follow,
		nocache: noIndex,
		googleBot: {
			index: !noIndex,
			follow,
			"max-image-preview": "large",
			"max-snippet": -1,
			"max-video-preview": -1,
		},
	};
}

function buildMetadata({
	title,
	description,
	path,
	canonical,
	image,
	keywords,
	noIndex = false,
	follow = !noIndex,
	openGraphType = "website",
	authors,
	publishedTime,
	modifiedTime,
	tags,
}: MetadataInput): Metadata {
	const canonicalUrl = normalizeCanonical(canonical ?? path);
	const ogImage = resolveImage(image, title);
	const keywordList = dedupeStrings([
		...DEFAULT_SITE_KEYWORDS,
		...(keywords ?? []),
		...(tags ?? []),
	]);

	return {
		title,
		description,
		keywords: keywordList,
		authors: dedupeStrings(authors ?? []).map((name) => ({ name })),
		alternates: canonicalUrl
			? {
					canonical: canonicalUrl,
				}
			: undefined,
		robots: buildRobots({ noIndex, follow }),
		openGraph: {
			type: openGraphType,
			locale: "en_US",
			siteName: SITE_NAME,
			title,
			description,
			url: canonicalUrl,
			images: [ogImage],
			publishedTime,
			modifiedTime,
			authors: authors ? dedupeStrings(authors) : undefined,
			tags: tags ? dedupeStrings(tags) : undefined,
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
			images: [ogImage.url],
			creator: SITE_TWITTER_HANDLE,
		},
	};
}

export function createRootMetadata(): Metadata {
	return {
		metadataBase: new URL(toAbsoluteUrl("/")),
		title: {
			default: DEFAULT_SITE_TITLE,
			template: TITLE_TEMPLATE,
		},
		description: DEFAULT_SITE_DESCRIPTION,
		keywords: DEFAULT_SITE_KEYWORDS,
		authors: [{ name: "Cossistant Team" }],
		creator: SITE_NAME,
		appleWebApp: {
			title: SITE_NAME,
		},
		icons: {
			icon: [
				{
					url: "/favicon.svg",
					type: "image/svg+xml",
				},
				{
					url: "/icon-light.svg",
					media: "(prefers-color-scheme: light)",
				},
				{
					url: "/icon-dark.svg",
					media: "(prefers-color-scheme: dark)",
				},
			],
		},
		openGraph: {
			type: "website",
			locale: "en_US",
			siteName: SITE_NAME,
			title: DEFAULT_SITE_TITLE,
			description: DEFAULT_SITE_DESCRIPTION,
			images: [resolveImage(DEFAULT_OG_IMAGE, DEFAULT_SITE_TITLE)],
		},
		twitter: {
			card: "summary_large_image",
			title: DEFAULT_SITE_TITLE,
			description: DEFAULT_SITE_DESCRIPTION,
			images: [toAbsoluteUrl(DEFAULT_OG_IMAGE)],
			creator: SITE_TWITTER_HANDLE,
		},
		robots: buildRobots({}),
	};
}

export function marketing({
	title,
	description,
	path,
	image,
	keywords,
	noIndex = false,
	follow = !noIndex,
}: Omit<MetadataInput, "canonical" | "openGraphType" | "authors">): Metadata {
	return buildMetadata({
		title,
		description,
		path,
		image,
		keywords,
		noIndex,
		follow,
		openGraphType: "website",
	});
}

export function blogArticle({
	title,
	description,
	path,
	image,
	keywords,
	tags,
	authors,
	publishedTime,
	modifiedTime,
	canonical,
	noIndex = false,
}: MetadataInput): Metadata {
	return buildMetadata({
		title,
		description,
		path,
		canonical,
		image,
		keywords,
		noIndex,
		follow: !noIndex,
		openGraphType: "article",
		authors,
		publishedTime,
		modifiedTime,
		tags,
	});
}

export function blogCollection({
	title,
	description,
	path,
	image,
	keywords,
	noIndex = false,
	follow = true,
}: Omit<MetadataInput, "canonical" | "openGraphType" | "authors">): Metadata {
	return buildMetadata({
		title,
		description,
		path,
		image,
		keywords,
		noIndex,
		follow,
		openGraphType: "website",
	});
}

export function docPage({
	title,
	description,
	path,
	image,
	keywords,
	canonical,
	noIndex = false,
}: MetadataInput): Metadata {
	return buildMetadata({
		title,
		description,
		path,
		canonical,
		image,
		keywords,
		noIndex,
		follow: !noIndex,
		openGraphType: "article",
	});
}

export function changelogCollection({
	title,
	description,
	path,
	image,
	keywords,
	noIndex = false,
	follow = true,
}: Omit<MetadataInput, "canonical" | "openGraphType" | "authors">): Metadata {
	return buildMetadata({
		title,
		description,
		path,
		image,
		keywords,
		noIndex,
		follow,
		openGraphType: "website",
	});
}

export function utilityNoindex({
	title,
	description = DEFAULT_SITE_DESCRIPTION,
	path,
	image,
	keywords,
}: {
	title?: string;
	description?: string;
	path?: string;
	image?: SeoImageInput;
	keywords?: string[];
}): Metadata {
	return buildMetadata({
		title,
		description,
		path,
		image,
		keywords,
		noIndex: true,
		follow: false,
		openGraphType: "website",
	});
}

export function toolPage({
	title,
	description,
	path,
	image,
	keywords,
	noIndex = false,
}: Omit<MetadataInput, "canonical" | "openGraphType" | "authors">): Metadata {
	return buildMetadata({
		title,
		description,
		path,
		image,
		keywords,
		noIndex,
		follow: !noIndex,
		openGraphType: "website",
	});
}

export function generateSiteMetadata({
	title,
	description = DEFAULT_SITE_DESCRIPTION,
	path,
	image,
	noIndex = false,
}: {
	title?: string;
	description?: string;
	path?: string;
	image?: SeoImageInput;
	noIndex?: boolean;
} = {}): Metadata {
	return noIndex
		? utilityNoindex({ title, description, path, image })
		: marketing({ title, description, path, image });
}

export function buildOrganizationJsonLd() {
	return {
		"@context": "https://schema.org",
		"@type": "Organization",
		name: SITE_NAME,
		url: toAbsoluteUrl("/"),
		logo: toAbsoluteUrl("/logo-email.png"),
		sameAs: [GITHUB_URL, X_URL, DISCORD_INVITE],
	};
}

export function buildSoftwareApplicationJsonLd({
	title = SITE_NAME,
	description = DEFAULT_SITE_DESCRIPTION,
	path = "/",
}: {
	title?: string;
	description?: string;
	path?: string;
}) {
	return {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: title,
		applicationCategory: "BusinessApplication",
		operatingSystem: "Web",
		url: toAbsoluteUrl(path),
		description,
		publisher: {
			"@type": "Organization",
			name: SITE_NAME,
			url: toAbsoluteUrl("/"),
		},
		offers: {
			"@type": "Offer",
			price: "0",
			priceCurrency: "USD",
		},
	};
}

export function buildCollectionPageJsonLd({
	title,
	description,
	path,
}: {
	title: string;
	description: string;
	path: string;
}) {
	return {
		"@context": "https://schema.org",
		"@type": "CollectionPage",
		name: title,
		description,
		url: toAbsoluteUrl(path),
	};
}

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: items.map((item, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: item.name,
			item: toAbsoluteUrl(item.path),
		})),
	};
}

export function buildBlogPostingJsonLd({
	title,
	description,
	path,
	image,
	author,
	publishedTime,
	modifiedTime,
	tags,
}: {
	title: string;
	description: string;
	path: string;
	image?: SeoImageInput;
	author: string;
	publishedTime: string;
	modifiedTime?: string;
	tags?: string[];
}) {
	return {
		"@context": "https://schema.org",
		"@type": "BlogPosting",
		headline: title,
		description,
		image: resolveImage(image, title).url,
		author: {
			"@type": "Person",
			name: author,
		},
		publisher: {
			"@type": "Organization",
			name: SITE_NAME,
			logo: {
				"@type": "ImageObject",
				url: toAbsoluteUrl("/logo-email.png"),
			},
		},
		datePublished: publishedTime,
		dateModified: modifiedTime ?? publishedTime,
		mainEntityOfPage: {
			"@type": "WebPage",
			"@id": toAbsoluteUrl(path),
		},
		keywords: dedupeStrings(tags ?? []).join(", "),
	};
}

export function buildTechArticleJsonLd({
	title,
	description,
	path,
	image,
	keywords,
	dateModified,
}: {
	title: string;
	description: string;
	path: string;
	image?: SeoImageInput;
	keywords?: string[];
	dateModified?: string;
}) {
	return {
		"@context": "https://schema.org",
		"@type": "TechArticle",
		headline: title,
		description,
		image: resolveImage(image, title).url,
		url: toAbsoluteUrl(path),
		dateModified,
		publisher: {
			"@type": "Organization",
			name: SITE_NAME,
			logo: {
				"@type": "ImageObject",
				url: toAbsoluteUrl("/logo-email.png"),
			},
		},
		keywords: dedupeStrings(keywords ?? []).join(", "),
	};
}
