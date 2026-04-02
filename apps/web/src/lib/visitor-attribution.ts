import type { VisitorAttribution } from "@plasma/types";

const CLICK_ID_LABELS = [
	"gclid",
	"gbraid",
	"wbraid",
	"fbclid",
	"msclkid",
	"ttclid",
	"li_fat_id",
	"twclid",
] as const;

type SourceRegistryEntry = {
	label: string;
	canonicalDomain: string;
	faviconDomain: string | null;
	referrerDomains: string[];
	utmSources: string[];
};

const SOURCE_REGISTRY = [
	{
		label: "Reddit",
		canonicalDomain: "reddit.com",
		faviconDomain: "reddit.com",
		referrerDomains: ["reddit.com"],
		utmSources: ["reddit"],
	},
	{
		label: "Twitter",
		canonicalDomain: "x.com",
		faviconDomain: "x.com",
		referrerDomains: ["x.com", "twitter.com"],
		utmSources: ["twitter", "x"],
	},
	{
		label: "Hacker News",
		canonicalDomain: "news.ycombinator.com",
		faviconDomain: "news.ycombinator.com",
		referrerDomains: ["news.ycombinator.com"],
		utmSources: ["hn", "hackernews", "hacker_news", "hacker-news"],
	},
	{
		label: "LinkedIn",
		canonicalDomain: "linkedin.com",
		faviconDomain: "linkedin.com",
		referrerDomains: ["linkedin.com", "lnkd.in"],
		utmSources: ["linkedin"],
	},
	{
		label: "Facebook",
		canonicalDomain: "facebook.com",
		faviconDomain: "facebook.com",
		referrerDomains: ["facebook.com", "fb.com"],
		utmSources: ["facebook", "fb"],
	},
	{
		label: "Instagram",
		canonicalDomain: "instagram.com",
		faviconDomain: "instagram.com",
		referrerDomains: ["instagram.com"],
		utmSources: ["instagram", "ig"],
	},
	{
		label: "YouTube",
		canonicalDomain: "youtube.com",
		faviconDomain: "youtube.com",
		referrerDomains: ["youtube.com", "youtu.be"],
		utmSources: ["youtube"],
	},
	{
		label: "GitHub",
		canonicalDomain: "github.com",
		faviconDomain: "github.com",
		referrerDomains: ["github.com"],
		utmSources: ["github"],
	},
	{
		label: "Product Hunt",
		canonicalDomain: "producthunt.com",
		faviconDomain: "producthunt.com",
		referrerDomains: ["producthunt.com"],
		utmSources: ["producthunt", "product_hunt", "product-hunt", "ph"],
	},
	{
		label: "Google",
		canonicalDomain: "google.com",
		faviconDomain: "google.com",
		referrerDomains: ["google.com"],
		utmSources: ["google"],
	},
	{
		label: "Bing",
		canonicalDomain: "bing.com",
		faviconDomain: "bing.com",
		referrerDomains: ["bing.com"],
		utmSources: ["bing"],
	},
	{
		label: "DuckDuckGo",
		canonicalDomain: "duckduckgo.com",
		faviconDomain: "duckduckgo.com",
		referrerDomains: ["duckduckgo.com"],
		utmSources: ["duckduckgo", "duck_duck_go", "duck-duck-go", "ddg"],
	},
	{
		label: "TikTok",
		canonicalDomain: "tiktok.com",
		faviconDomain: "tiktok.com",
		referrerDomains: ["tiktok.com"],
		utmSources: ["tiktok"],
	},
	{
		label: "Threads",
		canonicalDomain: "threads.net",
		faviconDomain: "threads.net",
		referrerDomains: ["threads.net"],
		utmSources: ["threads"],
	},
	{
		label: "Email",
		canonicalDomain: "email",
		faviconDomain: null,
		referrerDomains: [],
		utmSources: ["email"],
	},
	{
		label: "Newsletter",
		canonicalDomain: "newsletter",
		faviconDomain: null,
		referrerDomains: [],
		utmSources: ["newsletter"],
	},
] as const satisfies readonly SourceRegistryEntry[];

const COMMON_SECOND_LEVEL_SUFFIXES = new Set(["co", "com", "net", "org"]);

function toTitleCase(value: string): string {
	return value
		.replaceAll(/[-.]/g, "_")
		.split("_")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function normalizeDomain(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}

	return value
		.trim()
		.toLowerCase()
		.replace(/^\.+|\.+$/g, "");
}

function normalizeSourceValue(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}

	return value
		.trim()
		.toLowerCase()
		.replaceAll(/[\s_-]/g, "");
}

function matchesDomain(domain: string, candidates: readonly string[]): boolean {
	return candidates.some(
		(candidate) => domain === candidate || domain.endsWith(`.${candidate}`)
	);
}

function resolveSourceEntry(params: {
	sourceDomain: string | null;
	utmSource: string | null;
}): SourceRegistryEntry | null {
	const normalizedDomain = normalizeDomain(params.sourceDomain);

	if (normalizedDomain) {
		const domainMatch = SOURCE_REGISTRY.find((entry) =>
			matchesDomain(normalizedDomain, entry.referrerDomains)
		);

		if (domainMatch) {
			return domainMatch;
		}
	}

	const normalizedSource = normalizeSourceValue(params.utmSource);

	if (!normalizedSource) {
		return null;
	}

	return (
		SOURCE_REGISTRY.find((entry) =>
			entry.utmSources.some(
				(candidate) => normalizeSourceValue(candidate) === normalizedSource
			)
		) ?? null
	);
}

function getDomainFallbackLabel(sourceDomain: string): string {
	const normalizedDomain = normalizeDomain(sourceDomain);

	if (!normalizedDomain) {
		return "";
	}

	const segments = normalizedDomain
		.replace(/^www\./, "")
		.split(".")
		.filter(Boolean);

	if (segments.length === 0) {
		return "";
	}

	const meaningfulSegments =
		segments.length > 1 ? segments.slice(0, -1) : segments;
	const compactSegments =
		meaningfulSegments.length > 1 &&
		COMMON_SECOND_LEVEL_SUFFIXES.has(
			meaningfulSegments[meaningfulSegments.length - 1] ?? ""
		)
			? meaningfulSegments.slice(0, -1)
			: meaningfulSegments;

	return toTitleCase(compactSegments.join("_"));
}

function getSourceLabel(params: {
	channel: string;
	isDirect: boolean;
	sourceDomain: string | null;
	utmSource: string | null;
}): string | null {
	const sourceEntry = resolveSourceEntry(params);

	if (sourceEntry) {
		return sourceEntry.label;
	}

	if (params.sourceDomain) {
		return getDomainFallbackLabel(params.sourceDomain);
	}

	if (params.utmSource) {
		return toTitleCase(params.utmSource);
	}

	if (params.isDirect) {
		return "Direct";
	}

	return toTitleCase(params.channel);
}

export type VisitorAttributionDisplay = {
	sourceLabel: string | null;
	sourceUrl: string | null;
	sourceDomain: string | null;
	faviconUrl: string | null;
	landingLabel: string | null;
	campaignLabel: string | null;
	adIdsLabel: string | null;
	channelLabel: string | null;
	isDirect: boolean;
};

export function getVisitorAttributionDisplay(
	attribution: VisitorAttribution | null | undefined
): VisitorAttributionDisplay {
	const firstTouch = attribution?.firstTouch;

	if (!firstTouch) {
		return {
			sourceLabel: null,
			sourceUrl: null,
			sourceDomain: null,
			faviconUrl: null,
			landingLabel: null,
			campaignLabel: null,
			adIdsLabel: null,
			channelLabel: null,
			isDirect: false,
		};
	}

	const sourceDomain = firstTouch.referrer.domain ?? null;
	const sourceEntry = resolveSourceEntry({
		sourceDomain,
		utmSource: firstTouch.utm.source,
	});
	const sourceLabel = getSourceLabel({
		channel: firstTouch.channel,
		isDirect: firstTouch.isDirect,
		sourceDomain,
		utmSource: firstTouch.utm.source,
	});
	const campaignLabel = [
		firstTouch.utm.source,
		firstTouch.utm.medium,
		firstTouch.utm.campaign,
	]
		.filter(Boolean)
		.join(" / ");
	const adIdsLabel = CLICK_ID_LABELS.filter(
		(key) => firstTouch.clickIds[key]
	).join(" / ");

	return {
		sourceLabel,
		sourceUrl: firstTouch.referrer.url ?? null,
		sourceDomain: sourceEntry?.canonicalDomain ?? sourceDomain,
		faviconUrl: sourceEntry?.faviconDomain
			? `https://${sourceEntry.faviconDomain}/favicon.ico`
			: sourceDomain
				? `https://${sourceDomain}/favicon.ico`
				: null,
		landingLabel:
			firstTouch.landing.path ??
			firstTouch.landing.url ??
			firstTouch.landing.title,
		campaignLabel: campaignLabel || null,
		adIdsLabel: adIdsLabel || null,
		channelLabel: toTitleCase(firstTouch.channel),
		isDirect: firstTouch.isDirect,
	};
}
