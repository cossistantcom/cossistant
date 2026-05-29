const TIMEZONE_COOKIE_NAME = "cossistant_timezone";
const TIMEZONE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24;

export function getBrowserTimezone(): string | null {
	if (typeof Intl === "undefined") {
		return null;
	}

	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
	} catch {
		return null;
	}
}

export function persistBrowserTimezoneCookie() {
	if (typeof document === "undefined") {
		return;
	}

	const timezone = getBrowserTimezone();
	if (!timezone) {
		return;
	}

	// biome-ignore lint/suspicious/noDocumentCookie: Set a short-lived signup hint before auth redirects.
	document.cookie = `${TIMEZONE_COOKIE_NAME}=${encodeURIComponent(
		timezone
	)}; Max-Age=${TIMEZONE_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}
