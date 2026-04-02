const SITE_FALLBACK_PRODUCTION_URL = "https://plasma-pandora.com";
const SITE_FALLBACK_DEVELOPMENT_URL = "http://localhost:3000";

const SITE_URL_ENV_KEYS = [
	"PUBLIC_APP_URL",
	"NEXT_PUBLIC_BASE_URL",
	"NEXT_PUBLIC_APP_URL",
	"NEXT_PUBLIC_URL",
] as const;

function normalizeBaseUrl(raw: string): string {
	const trimmed = raw.trim();

	if (!trimmed) {
		throw new Error("Site URL cannot be empty.");
	}

	const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)
		? trimmed
		: `https://${trimmed}`;

	return withProtocol.replace(/\/+$/, "");
}

export function getSiteUrl(): URL {
	for (const key of SITE_URL_ENV_KEYS) {
		const value = process.env[key];

		if (!value) {
			continue;
		}

		return new URL(normalizeBaseUrl(value));
	}

	if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
		return new URL(
			normalizeBaseUrl(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
		);
	}

	const fallback =
		process.env.NODE_ENV === "development"
			? SITE_FALLBACK_DEVELOPMENT_URL
			: SITE_FALLBACK_PRODUCTION_URL;

	return new URL(fallback);
}

export function getSiteOrigin(): string {
	return getSiteUrl().toString().replace(/\/$/, "");
}

export function toAbsoluteUrl(pathOrUrl: string): string {
	if (!pathOrUrl) {
		return getSiteOrigin();
	}

	return new URL(pathOrUrl, getSiteUrl()).toString();
}

export function normalizeCanonical(pathOrUrl?: string): string | undefined {
	if (!pathOrUrl) {
		return;
	}

	return toAbsoluteUrl(pathOrUrl);
}
