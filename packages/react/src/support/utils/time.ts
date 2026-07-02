const MINUTE_MS = 1000 * 60;
const HOUR_MS = MINUTE_MS * 60;
const DAY_MS = HOUR_MS * 24;

/**
 * Friendly relative time formatter used throughout the support widget.
 * Localized via Intl.RelativeTimeFormat; pass the widget locale to match the
 * rest of the UI (defaults to the browser locale).
 * Only use this in browser context (components with effects, not during SSR).
 */
export function formatTimeAgo(date: Date | string, locale?: string): string {
	// Guard against SSR - return empty string or static fallback
	if (typeof window === "undefined") {
		return "";
	}

	const now = new Date();
	const messageDate = typeof date === "string" ? new Date(date) : date;
	const diffMs = now.getTime() - messageDate.getTime();
	const diffMins = Math.floor(diffMs / MINUTE_MS);
	const diffHours = Math.floor(diffMs / HOUR_MS);
	const diffDays = Math.floor(diffMs / DAY_MS);

	const options: Intl.RelativeTimeFormatOptions = {
		numeric: "auto",
		style: "narrow",
	};
	let formatter: Intl.RelativeTimeFormat;
	try {
		formatter = new Intl.RelativeTimeFormat(locale, options);
	} catch {
		// Invalid locale tags must not break rendering
		formatter = new Intl.RelativeTimeFormat("en", options);
	}

	if (diffMins < 1) {
		return formatter.format(0, "second");
	}
	if (diffMins < 60) {
		return formatter.format(-diffMins, "minute");
	}
	if (diffHours < 24) {
		return formatter.format(-diffHours, "hour");
	}
	if (diffDays < 7) {
		return formatter.format(-diffDays, "day");
	}
	if (diffDays < 30) {
		return formatter.format(-Math.floor(diffDays / 7), "week");
	}
	if (diffDays < 365) {
		return formatter.format(-Math.floor(diffDays / 30), "month");
	}
	return formatter.format(-Math.floor(diffDays / 365), "year");
}
