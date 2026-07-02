import { useEffect, useRef, useState } from "react";

/**
 * Orchestrates a "wait" transition between keyed elements:
 * the current element exits, then the new element enters.
 *
 * @param activeKey      - The key of the element that should be visible.
 * @param exitDuration   - Exit animation duration in ms (match your CSS).
 * @returns `{ displayedKey, phase }` — render `displayedKey`, apply CSS class based on `phase`.
 *
 * @example
 * const { displayedKey, phase } = useTransitionSwap(isOpen ? "close" : "open", 100);
 * <div key={displayedKey} className={phase === "enter" ? "co-animate-fade-in" : "co-animate-fade-out"}>
 *   {displayedKey === "close" ? <CloseIcon /> : <OpenIcon />}
 * </div>
 */
export function useTransitionSwap<K extends string>(
	activeKey: K,
	exitDuration: number
) {
	const [displayedKey, setDisplayedKey] = useState(activeKey);
	const [phase, setPhase] = useState<"enter" | "exit">("enter");
	const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

	useEffect(() => {
		if (activeKey === displayedKey) {
			// A pending swap was cancelled (key returned to the displayed one
			// before the exit timeout fired) — recover from the exit phase.
			setPhase((current) => (current === "exit" ? "enter" : current));
			return;
		}

		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
		}

		// Start exit phase for current element
		setPhase("exit");

		// After exit completes, swap to new element and enter
		timeoutRef.current = setTimeout(() => {
			setDisplayedKey(activeKey);
			setPhase("enter");
		}, exitDuration);

		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, [activeKey, displayedKey, exitDuration]);

	return { displayedKey, phase } as const;
}
