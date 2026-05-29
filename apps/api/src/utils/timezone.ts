import { timezones } from "@cossistant/location/timezones";

const BUNDLED_TIMEZONE_CODES = new Set(
	timezones.map((timezone) => timezone.tzCode)
);

export function isValidTimezone(
	value: string | null | undefined
): value is string {
	if (!value) {
		return false;
	}

	const normalized = value.trim();
	if (!normalized || normalized.length > 100) {
		return false;
	}

	if (BUNDLED_TIMEZONE_CODES.has(normalized)) {
		return true;
	}

	try {
		Intl.DateTimeFormat(undefined, { timeZone: normalized });
		return true;
	} catch {
		return false;
	}
}

export function resolveOrganizationTimezone(
	...candidates: Array<string | null | undefined>
): string {
	for (const candidate of candidates) {
		if (isValidTimezone(candidate)) {
			return candidate.trim();
		}
	}

	return "UTC";
}
