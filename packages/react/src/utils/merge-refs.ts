"use client";

import * as React from "react";

type PossibleRef<T> = React.Ref<T> | React.RefCallback<T> | undefined | null;

/**
 * Merges multiple refs into a single callback ref.
 * Useful for forwarding refs to a component while also using a local ref.
 *
 * @example
 * const Component = forwardRef((props, forwardedRef) => {
 *   const localRef = useRef(null);
 *   const mergedRef = mergeRefs([forwardedRef, localRef]);
 *   return <div ref={mergedRef} />;
 * });
 */
export function mergeRefs<T>(
	refs: PossibleRef<T>[]
): React.RefCallback<T> | null {
	// Filter out null/undefined refs
	const filteredRefs = refs.filter(
		(ref): ref is NonNullable<PossibleRef<T>> => ref != null
	);

	if (filteredRefs.length === 0) {
		return null;
	}

	if (filteredRefs.length === 1) {
		const ref = filteredRefs[0];
		// If it's already a callback, return it directly
		if (typeof ref === "function") {
			return ref;
		}
		// If it's a RefObject, wrap it in a callback
		return (instance) => {
			(ref as React.MutableRefObject<T | null>).current = instance;
		};
	}

	return (instance) => {
		for (const ref of filteredRefs) {
			if (typeof ref === "function") {
				ref(instance);
			} else if (ref != null) {
				(ref as React.MutableRefObject<T | null>).current = instance;
			}
		}
	};
}

/**
 * Hook version of mergeRefs that memoizes the result.
 *
 * @example
 * const Component = forwardRef((props, forwardedRef) => {
 *   const localRef = useRef(null);
 *   const mergedRef = useMergeRefs([forwardedRef, localRef]);
 *   return <div ref={mergedRef} />;
 * });
 */
export function useMergeRefs<T>(
	refs: PossibleRef<T>[]
): React.RefCallback<T> | null {
	// eslint-disable-next-line react-hooks/exhaustive-deps
	return React.useMemo(() => mergeRefs(refs), refs);
}
