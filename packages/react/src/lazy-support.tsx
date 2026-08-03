"use client";

import { forwardRef, type ReactElement, type Ref } from "react";
import type {
	SupportHandle as LazySupportHandle,
	SupportLocale as LazySupportLocale,
	SupportProps as LazySupportProps,
} from "./support";

type SupportModule = typeof import("./support");

let supportModulePromise: Promise<SupportModule> | undefined;
let loadedSupport: SupportModule["Support"] | undefined;

/**
 * Load the complete Support component module on demand.
 *
 * The promise is shared so preloading and rendering never request the module
 * more than once. A failed request is cleared so callers can retry.
 */
export function loadSupport(): Promise<SupportModule> {
	if (!supportModulePromise) {
		supportModulePromise = import("./support").then(
			(supportModule) => {
				loadedSupport = supportModule.Support;
				return supportModule;
			},
			(error: unknown) => {
				supportModulePromise = undefined;
				throw error;
			}
		);
	}

	return supportModulePromise;
}

/** Preload the Support module in response to user intent such as hover/focus. */
export const preloadSupport = loadSupport;

type LazySupportComponent = <Locale extends string = LazySupportLocale>(
	props: LazySupportProps<Locale> & { ref?: Ref<LazySupportHandle> }
) => ReactElement | null;

/**
 * Code-split Support component. Render it inside a React Suspense boundary.
 * Use `preloadSupport` on hover/focus when the widget is opened explicitly.
 */
const LazySupportBase = forwardRef<LazySupportHandle, LazySupportProps>(
	(props, ref) => {
		if (!loadedSupport) {
			throw loadSupport();
		}

		const Support = loadedSupport;
		return <Support {...props} ref={ref} />;
	}
);

export const LazySupport = LazySupportBase as LazySupportComponent;

export type { SupportHandle, SupportLocale, SupportProps } from "./support";
