function parseEnabledFlag(
	value: string | undefined,
	defaultValue = true
): boolean {
	if (value === undefined) {
		return defaultValue;
	}

	return value === "true";
}

export function isTinybirdEnabled(): boolean {
	return parseEnabledFlag(process.env.NEXT_PUBLIC_TINYBIRD_ENABLED, true);
}

export function isDatafastEnabled(): boolean {
	return parseEnabledFlag(
		process.env.NEXT_PUBLIC_DATAFAST_ENABLED,
		process.env.NODE_ENV === "production"
	);
}
