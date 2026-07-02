/** biome-ignore-all lint/nursery/useMaxParams: ok here */
import en from "./locales/en";
import es from "./locales/es";
import fr from "./locales/fr";
import type {
	SupportLocale,
	SupportLocaleMessages,
	SupportTextContentOverrides,
	SupportTextContext,
	SupportTextKey,
	SupportTextUtils,
	SupportTextVariables,
	SupportTimeOfDayToken,
} from "./locales/keys";

export type NormalizedOverride<K extends SupportTextKey> = {
	anyLocale?: SupportLocaleMessages[K];
	byLocale: Map<string, SupportLocaleMessages[K]>;
};

export type NormalizedOverrides = Map<
	SupportTextKey,
	NormalizedOverride<SupportTextKey>
>;

export const BUILTIN_LOCALES: Record<SupportLocale, SupportLocaleMessages> = {
	en,
	fr,
	es,
};

const TIME_OF_DAY_THRESHOLDS: Array<{
	token: SupportTimeOfDayToken;
	hour: number;
}> = [
	{ token: "morning", hour: 9 },
	{ token: "afternoon", hour: 15 },
	{ token: "evening", hour: 20 },
];

function buildDayPeriodLabels(
	locale: string
): Record<SupportTimeOfDayToken, string> {
	const fallback: Record<SupportTimeOfDayToken, string> = {
		morning: "morning",
		afternoon: "afternoon",
		evening: "evening",
	};

	try {
		const formatter = new Intl.DateTimeFormat(locale, {
			hour: "numeric",
			hour12: true,
		});

		const labels: Partial<Record<SupportTimeOfDayToken, string>> = {};
		for (const { token, hour } of TIME_OF_DAY_THRESHOLDS) {
			const parts = formatter.formatToParts(new Date(2020, 0, 1, hour));
			const part = parts.find((segment) => segment.type === "dayPeriod");
			if (part?.value) {
				const normalized = part.value.trim();
				if (normalized) {
					labels[token] = normalized;
				}
			}
		}

		return {
			morning: labels.morning ?? fallback.morning,
			afternoon: labels.afternoon ?? fallback.afternoon,
			evening: labels.evening ?? fallback.evening,
		};
	} catch {
		return fallback;
	}
}

/**
 * Builds formatting helpers tailored for the visitor locale. The utilities are
 * memoized by callers and include number formatting, pluralization, title
 * casing and dynamic time-of-day descriptions.
 */
export function createTextUtils(
	locale: string,
	isHydrated = false
): SupportTextUtils {
	const numberFormatter = new Intl.NumberFormat(locale);
	const pluralRules = new Intl.PluralRules(locale);
	const dayPeriodLabels = buildDayPeriodLabels(locale);

	return {
		formatNumber: (value: number, options?: Intl.NumberFormatOptions) =>
			options
				? new Intl.NumberFormat(locale, options).format(value)
				: numberFormatter.format(value),
		pluralize: (count: number, options: { one: string; other: string }) => {
			const rule = pluralRules.select(count);
			return rule === "one" ? options.one : options.other;
		},
		titleCase: (value: string) => {
			if (!value) {
				return "";
			}
			return value.charAt(0).toUpperCase() + value.slice(1);
		},
		timeOfDay: () => {
			// Return a stable default during SSR to avoid hydration mismatches
			if (!isHydrated || typeof window === "undefined") {
				return {
					token: "morning" as SupportTimeOfDayToken,
					label: dayPeriodLabels.morning,
				};
			}

			const hour = new Date().getHours();
			let token: SupportTimeOfDayToken;
			if (hour < 12) {
				token = "morning";
			} else if (hour < 18) {
				token = "afternoon";
			} else {
				token = "evening";
			}

			return {
				token,
				label: dayPeriodLabels[token],
			};
		},
	};
}

/**
 * Normalize a locale string to its base language code
 * Examples:
 * - "en-US" -> "en"
 * - "en-GB" -> "en"
 * - "fr-FR" -> "fr"
 */
function normalizeLocaleString(locale: string): string {
	const [base] = locale.toLowerCase().split("-");
	return base || locale.toLowerCase();
}

/**
 * Derives the locale preference order from visitor/provider hints while
 * guaranteeing an English fallback.
 */
export function buildLocaleChain(
	preferences: Array<string | null | undefined>
): string[] {
	const seen = new Set<string>();
	const chain: string[] = [];

	const pushLocale = (value: string) => {
		// Keep the full tag for exact override matches (pt-BR -> pt-br),
		// then fall back to the base language (pt-BR -> pt)
		const fullTag = value.toLowerCase();
		if (!seen.has(fullTag)) {
			seen.add(fullTag);
			chain.push(fullTag);
		}

		const normalized = normalizeLocaleString(value);
		if (!seen.has(normalized)) {
			seen.add(normalized);
			chain.push(normalized);
		}
	};

	for (const candidate of preferences) {
		if (!candidate) {
			continue;
		}
		pushLocale(candidate);
	}

	// Always fallback to English
	if (!seen.has("en")) {
		chain.push("en");
	}

	return chain;
}

/**
 * Canonicalizes text override definitions into a lookup map that can be
 * consumed efficiently at runtime.
 */
export function normalizeOverrides(
	overrides?: SupportTextContentOverrides<string>
): NormalizedOverrides {
	const map: NormalizedOverrides = new Map();

	if (!overrides) {
		return map;
	}

	for (const key of Object.keys(overrides) as SupportTextKey[]) {
		const value = overrides[key];
		if (!value) {
			continue;
		}

		if (typeof value === "string" || typeof value === "function") {
			map.set(key, {
				anyLocale: value as SupportLocaleMessages[typeof key],
				byLocale: new Map(),
			});
			continue;
		}

		const byLocale = new Map<string, SupportLocaleMessages[typeof key]>();
		for (const [locale, localizedValue] of Object.entries(value)) {
			if (!localizedValue) {
				continue;
			}
			byLocale.set(
				locale.toLowerCase(),
				localizedValue as SupportLocaleMessages[typeof key]
			);
		}
		// Region-subtag overrides (pt-BR) also serve as the base-language
		// fallback (pt) unless an explicit base-language override exists
		for (const [locale, localizedValue] of Object.entries(value)) {
			if (!localizedValue) {
				continue;
			}
			const base = normalizeLocaleString(locale);
			if (!byLocale.has(base)) {
				byLocale.set(base, localizedValue as SupportLocaleMessages[typeof key]);
			}
		}

		map.set(key, { byLocale });
	}

	return map;
}

/**
 * Finds the best matching localized string for a key, consulting overrides
 * before bundled locale dictionaries.
 */
export function resolveMessage<K extends SupportTextKey>(
	key: K,
	localeChain: string[],
	overrides: NormalizedOverrides
): SupportLocaleMessages[K] {
	const override = overrides.get(key) as NormalizedOverride<K> | undefined;
	if (override) {
		for (const locale of localeChain) {
			const localized = override.byLocale.get(locale);
			if (localized) {
				return localized;
			}
		}
		if (override.anyLocale) {
			return override.anyLocale;
		}
	}

	for (const locale of localeChain) {
		if (locale in BUILTIN_LOCALES) {
			return BUILTIN_LOCALES[locale as SupportLocale][key];
		}
	}

	return BUILTIN_LOCALES.en[key];
}

/**
 * Produces the final rendered string by executing function overrides or
 * interpolating variables into template literals.
 */
export function evaluateMessage<K extends SupportTextKey>(
	key: K,
	message: SupportLocaleMessages[K],
	variables: SupportTextVariables<K> | undefined,
	context: SupportTextContext,
	utils: SupportTextUtils
): string {
	if (typeof message === "function") {
		return message({
			variables: variables as never,
			context,
			utils,
		});
	}

	return message;
}
