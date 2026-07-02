/** biome-ignore-all lint/correctness/useExhaustiveDependencies: dependencies are intentionally managed */
/** biome-ignore-all lint/correctness/noChildrenProp: children prop is needed for React.createElement */
import React from "react";

import { useSupport } from "../../provider";
import {
	type SupportLocale,
	type SupportTextContentOverrides,
	type SupportTextContext,
	type SupportTextDefinitions,
	type SupportTextKey,
	type SupportTextProviderValue,
	type SupportTextResolvedFormatter,
	type SupportTextVariables,
	supportTextDefinitions,
} from "./locales/keys";
import {
	buildLocaleChain,
	createTextUtils,
	evaluateMessage,
	normalizeOverrides,
	resolveMessage,
} from "./runtime";

type SupportTextProviderProps<Locale extends string = SupportLocale> = {
	children: React.ReactNode;
	locale?: Locale;
	content?: SupportTextContentOverrides<Locale>;
};

const SupportTextRuntimeContext =
	React.createContext<SupportTextProviderValue | null>(null);

/**
 * Supplies localized copy and formatting helpers for the support widget. The
 * provider merges bundled locale strings with optional runtime overrides and
 * exposes a formatter that understands visitor/website context.
 */
export function SupportTextProvider<Locale extends string = SupportLocale>({
	children,
	locale,
	content,
}: SupportTextProviderProps<Locale>): React.ReactElement {
	const { website, availableHumanAgents, availableAIAgents, visitor } =
		useSupport();
	const [isHydrated, setIsHydrated] = React.useState(false);

	React.useEffect(() => {
		setIsHydrated(true);
	}, []);

	const localeChain = React.useMemo(
		() => buildLocaleChain([locale, visitor?.locale]),
		[locale, visitor?.locale]
	);

	const normalizedOverrides = React.useMemo(
		() => normalizeOverrides(content),
		[content]
	);

	const utils = React.useMemo(
		() => createTextUtils(localeChain[0] ?? "en", isHydrated),
		[localeChain, isHydrated]
	);

	const textContext = React.useMemo<SupportTextContext>(
		() => ({
			website,
			visitor: visitor ?? null,
			humanAgents: availableHumanAgents,
			aiAgents: availableAIAgents,
		}),
		[website, visitor, availableHumanAgents, availableAIAgents]
	);

	const format = ((key: SupportTextKey, variables?: unknown) => {
		const definition = supportTextDefinitions[key];
		const requiresVariables =
			definition.variables !== undefined &&
			!("optional" in definition && definition.optional === true);

		if (requiresVariables && variables === undefined) {
			throw new Error(`Missing variables for text key "${key}".`);
		}

		const resolved = resolveMessage(key, localeChain, normalizedOverrides);
		return evaluateMessage(
			key,
			resolved,
			variables as SupportTextVariables<typeof key>,
			textContext,
			utils
		);
	}) as SupportTextResolvedFormatter;

	const value = React.useMemo<SupportTextProviderValue>(
		() => ({
			format,
			locale: localeChain[0] ?? "en",
		}),
		[localeChain, normalizedOverrides, textContext, utils]
	);

	return (
		<SupportTextRuntimeContext.Provider value={value}>
			{children}
		</SupportTextRuntimeContext.Provider>
	);
}

/**
 * Returns the active text formatter for the support widget. Throws if used
 * outside of `SupportTextProvider` to help catch integration mistakes.
 */
export function useSupportText(): SupportTextResolvedFormatter {
	const context = React.useContext(SupportTextRuntimeContext);
	if (!context) {
		throw new Error("useSupportText must be used within SupportTextProvider");
	}

	return context.format;
}

const fallbackTextContext: SupportTextContext = {
	website: null,
	visitor: null,
	humanAgents: [],
	aiAgents: [],
};

let fallbackFormatter: SupportTextResolvedFormatter | null = null;

function getFallbackFormatter(): SupportTextResolvedFormatter {
	if (!fallbackFormatter) {
		const utils = createTextUtils("en", false);
		fallbackFormatter = ((key: SupportTextKey, variables?: unknown) => {
			const resolved = resolveMessage(key, ["en"], new Map());
			return evaluateMessage(
				key,
				resolved,
				variables as SupportTextVariables<typeof key>,
				fallbackTextContext,
				utils
			);
		}) as SupportTextResolvedFormatter;
	}

	return fallbackFormatter;
}

/**
 * Like `useSupportText`, but falls back to the bundled English strings when
 * no `SupportTextProvider` is mounted. Intended for components that can be
 * composed outside the default `<Support />` tree (e.g. the exported Header).
 */
export function useSupportTextSafe(): SupportTextResolvedFormatter {
	const context = React.useContext(SupportTextRuntimeContext);
	return context?.format ?? getFallbackFormatter();
}

type OptionalVariablesProp<K extends SupportTextKey> =
	SupportTextDefinitions[K]["variables"] extends undefined
		? { variables?: undefined }
		: "optional" extends keyof SupportTextDefinitions[K]
			? SupportTextDefinitions[K]["optional"] extends true
				? { variables?: SupportTextVariables<K> }
				: { variables: SupportTextVariables<K> }
			: { variables: SupportTextVariables<K> };

type TextProps<
	K extends SupportTextKey,
	As extends keyof React.JSX.IntrinsicElements = "span",
> = OptionalVariablesProp<K> & {
	textKey: K;
	as?: As;
} & Omit<React.ComponentPropsWithoutRef<As>, "children">;

function TextInner<
	K extends SupportTextKey,
	As extends keyof React.JSX.IntrinsicElements = "span",
>(props: Omit<TextProps<K, As>, "ref">, forwardedRef: React.Ref<Element>) {
	const { textKey, variables, as, ...rest } = props as TextProps<K, As>;
	const format = useSupportText();
	const Component = (as ?? "span") as As;
	const content =
		variables !== undefined
			? format(textKey, variables as SupportTextVariables<K>)
			: format(textKey);

	return React.createElement(Component, {
		...rest,
		ref: forwardedRef,
		"data-key-name": textKey,
		children: content,
	});
}

/**
 * Convenience component that renders localized support copy via the
 * `SupportTextProvider` context while still allowing callers to customize the
 * rendered HTML element.
 */
export const Text = React.forwardRef(TextInner) as <
	K extends SupportTextKey,
	As extends keyof React.JSX.IntrinsicElements = "span",
>(
	props: TextProps<K, As> & { ref?: React.Ref<Element> }
) => React.ReactElement | null;

(Text as { displayName?: string }).displayName = "SupportText";

export type {
	SupportLocale,
	SupportTextContentOverrides,
	SupportTextKey,
	SupportTextVariables,
} from "./locales/keys";
