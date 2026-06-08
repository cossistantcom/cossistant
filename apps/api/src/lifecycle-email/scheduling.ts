const DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAY_INDEX: Record<string, number> = {
	Mon: 1,
	Tue: 2,
	Wed: 3,
	Thu: 4,
	Fri: 5,
	Sat: 6,
	Sun: 7,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

type LocalDateParts = {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	weekday: string;
};

function getFormatter(timezone: string) {
	const cached = formatterCache.get(timezone);
	if (cached) {
		return cached;
	}

	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone,
		weekday: "short",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
	formatterCache.set(timezone, formatter);

	return formatter;
}

export function getLocalDateParts(
	date: Date,
	timezone: string
): LocalDateParts {
	const entries = getFormatter(timezone)
		.formatToParts(date)
		.map((part) => [part.type, part.value]);
	const parts = Object.fromEntries(entries) as Record<string, string>;
	const hour = Number(parts.hour === "24" ? "0" : parts.hour);

	return {
		year: Number(parts.year),
		month: Number(parts.month),
		day: Number(parts.day),
		hour,
		minute: Number(parts.minute),
		weekday: parts.weekday,
	};
}

export function getLocalWeekKey(date: Date, timezone: string): string {
	const parts = getLocalDateParts(date, timezone);
	const weekdayIndex = WEEKDAY_INDEX[parts.weekday] ?? 1;
	const localDateUtc = Date.UTC(parts.year, parts.month - 1, parts.day);
	const monday = new Date(localDateUtc - (weekdayIndex - 1) * DAY_MS);

	return [
		monday.getUTCFullYear(),
		String(monday.getUTCMonth() + 1).padStart(2, "0"),
		String(monday.getUTCDate()).padStart(2, "0"),
	].join("-");
}

export function shouldScanWeeklyDigestForTimezone(params: {
	now: Date;
	timezone: string;
	windowMinutes?: number;
}): boolean {
	const parts = getLocalDateParts(params.now, params.timezone);
	const windowMinutes = params.windowMinutes ?? 15;

	return (
		parts.weekday === "Mon" &&
		parts.hour === 9 &&
		parts.minute >= 0 &&
		parts.minute < windowMinutes
	);
}

export function getWeeklyDigestDedupeKey(params: {
	websiteId: string;
	weekKey: string;
}): string {
	return `weekly_digest:${params.websiteId}:${params.weekKey}`;
}
