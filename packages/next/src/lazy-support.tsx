"use client";

import { loadSupport as loadReactSupport } from "@cossistant/react/lazy-support";
import type {
	SupportHandle as LazySupportHandle,
	SupportLocale as LazySupportLocale,
	SupportProps as LazySupportProps,
} from "@cossistant/react/support";
import dynamic from "next/dynamic";
import type { ReactElement, Ref } from "react";

export const loadSupport = loadReactSupport;
export const preloadSupport = loadSupport;

type LazySupportComponent = <Locale extends string = LazySupportLocale>(
	props: LazySupportProps<Locale> & { ref?: Ref<LazySupportHandle> }
) => ReactElement | null;

/**
 * Next-aware code-split Support component. Disabling server rendering prevents
 * an unhydrated trigger from being interactive before its client chunk arrives.
 */
export const LazySupport = dynamic(
	() => loadSupport().then(({ Support }) => Support),
	{ ssr: false }
) as LazySupportComponent;

export type {
	SupportHandle,
	SupportLocale,
	SupportProps,
} from "@cossistant/react/support";
