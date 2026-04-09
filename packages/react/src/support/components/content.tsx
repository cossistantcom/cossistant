"use client";

import {
	autoUpdate,
	flip,
	offset,
	type Placement,
	shift,
	useFloating,
} from "@floating-ui/react";
import * as React from "react";
import * as Primitive from "../../primitives";
import { useSupportMode } from "../context/mode";
import { useTriggerRef } from "../context/positioning";
import { SlotProvider, useSlots } from "../context/slots";
import { useSupportConfig } from "../store/support-store";
import type {
	Align,
	CollisionPadding,
	ContentProps as ContentPropsType,
	Side,
} from "../types";
import { cn } from "../utils";

export type { CollisionPadding, ContentProps } from "../types";

// =============================================================================
// Utils
// =============================================================================

/**
 * Convert side + align props to Floating UI placement
 */
function getPlacement(side: Side, align: Align): Placement {
	if (align === "center") {
		return side;
	}
	return `${side}-${align}` as Placement;
}

/**
 * Get fallback positioning classes for when Floating UI is not available
 * (e.g., trigger ref not set, or avoidCollisions is false)
 */
function getFallbackPositioningClasses(side: Side, align: Align): string {
	const sideClasses: Record<Side, string> = {
		top: "md:bottom-full md:mb-4",
		bottom: "md:top-full md:mt-4",
		left: "md:right-full md:mr-4",
		right: "md:left-full md:ml-4",
	};

	const alignClasses: Record<Side, Record<Align, string>> = {
		top: {
			start: "md:left-0",
			center: "md:left-1/2 md:-translate-x-1/2",
			end: "md:right-0",
		},
		bottom: {
			start: "md:left-0",
			center: "md:left-1/2 md:-translate-x-1/2",
			end: "md:right-0",
		},
		left: {
			start: "md:top-0",
			center: "md:top-1/2 md:-translate-y-1/2",
			end: "md:bottom-0",
		},
		right: {
			start: "md:top-0",
			center: "md:top-1/2 md:-translate-y-1/2",
			end: "md:bottom-0",
		},
	};

	return cn(sideClasses[side], alignClasses[side][align]);
}

/**
 * Get fallback offset styles for static positioning
 */
function getFallbackOffsetStyle(
	side: Side,
	sideOffset: number
): React.CSSProperties | undefined {
	if (sideOffset === 16) {
		return;
	}

	const offsetMap: Record<Side, React.CSSProperties> = {
		top: { marginBottom: sideOffset },
		bottom: { marginTop: sideOffset },
		left: { marginRight: sideOffset },
		right: { marginLeft: sideOffset },
	};

	return offsetMap[side];
}

// =============================================================================
// Hook for responsive detection
// =============================================================================

function useIsMobile(): boolean {
	const [isMobile, setIsMobile] = React.useState(false);

	React.useEffect(() => {
		if (
			typeof window === "undefined" ||
			typeof window.matchMedia !== "function"
		) {
			return;
		}

		const mediaQuery = window.matchMedia("(max-width: 767px)");
		setIsMobile(mediaQuery.matches);

		const handler = (event: MediaQueryListEvent) => {
			setIsMobile(event.matches);
		};

		mediaQuery.addEventListener("change", handler);
		return () => mediaQuery.removeEventListener("change", handler);
	}, []);

	return isMobile;
}

// =============================================================================
// Content Component
// =============================================================================

/**
 * Content component for the support window.
 * Uses Floating UI for automatic collision detection on desktop.
 * Fullscreen on mobile, floating on desktop.
 *
 * @example
 * // Basic usage (uses defaults: side="top", align="end")
 * <Support.Content />
 *
 * @example
 * // Custom positioning with collision avoidance
 * <Support.Content side="bottom" align="start" sideOffset={24} />
 *
 * @example
 * // Disable collision avoidance for static positioning
 * <Support.Content avoidCollisions={false} />
 *
 * @example
 * // Custom collision padding
 * <Support.Content collisionPadding={{ top: 16, bottom: 32 }} />
 */
export const Content: React.FC<ContentPropsType> = ({
	className,
	children,
	side = "top",
	align = "end",
	sideOffset = 16,
	avoidCollisions = true,
	collisionPadding = 8,
}) => {
	const [showScrollIndicator, setShowScrollIndicator] = React.useState(false);
	const containerRef = React.useRef<HTMLDivElement>(null);
	const hasEverPositionedRef = React.useRef(false);
	const isMobile = useIsMobile();
	const mode = useSupportMode();
	const triggerRefContext = useTriggerRef();
	const { isOpen } = useSupportConfig();
	const isResponsive = mode === "responsive";

	// Set up Floating UI middleware
	const middleware = React.useMemo(() => {
		const middlewares = [offset(sideOffset)];

		if (avoidCollisions) {
			middlewares.push(
				flip({
					padding: collisionPadding,
					fallbackAxisSideDirection: "start",
				}),
				shift({
					padding: collisionPadding,
				})
			);
		}

		return middlewares;
	}, [sideOffset, avoidCollisions, collisionPadding]);

	// Get trigger element from context (stored in state for reactivity)
	const triggerElement = triggerRefContext?.triggerElement ?? null;

	// Initialize Floating UI with the trigger element as reference
	// Using strategy: 'fixed' because Content uses position: fixed (md:fixed class)
	// This ensures Floating UI calculates positions relative to the viewport
	// The `open` prop synchronizes Floating UI with visibility state for proper autoUpdate
	const { refs, update, x, y, isPositioned } = useFloating({
		placement: getPlacement(side, align),
		strategy: "fixed",
		middleware,
		whileElementsMounted: autoUpdate,
		open: isResponsive ? false : isOpen,
		elements: {
			reference: triggerElement,
		},
	});

	// Merge refs for the floating element
	const setFloatingRef = React.useCallback(
		(node: HTMLDivElement | null) => {
			refs.setFloating(node);
		},
		[refs]
	);

	// Force position recalculation when trigger element becomes available
	// This handles the case where content mounts before trigger
	React.useEffect(() => {
		if (!isResponsive && triggerElement && isOpen) {
			// Defer update to ensure DOM is ready
			requestAnimationFrame(() => {
				update();
			});
		}
	}, [isResponsive, triggerElement, isOpen, update]);

	// Determine if we should use Floating UI positioning
	// Only use Floating UI when trigger element is available
	const useFloatingPositioning =
		!isResponsive && avoidCollisions && !isMobile && triggerElement !== null;

	// Scroll indicator logic
	const checkScroll = React.useCallback(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		const { scrollTop, scrollHeight, clientHeight } = container;
		const isScrollable = scrollHeight > clientHeight;
		const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 5;

		setShowScrollIndicator(isScrollable && !isAtBottom);
	}, []);

	React.useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		checkScroll();

		const handleScroll = () => {
			checkScroll();
		};

		container.addEventListener("scroll", handleScroll, { passive: true });

		const resizeObserver = new ResizeObserver(() => {
			checkScroll();
		});

		resizeObserver.observe(container);

		const mutationObserver = new MutationObserver(() => {
			checkScroll();
		});

		mutationObserver.observe(container, {
			childList: true,
			subtree: true,
			characterData: true,
		});

		return () => {
			container.removeEventListener("scroll", handleScroll);
			resizeObserver.disconnect();
			mutationObserver.disconnect();
		};
	}, [checkScroll]);

	// Track when Floating UI has successfully positioned at least once
	// Using a ref to persist across renders - once positioned, always valid
	// This avoids the bug where (0,0) was wrongly treated as invalid
	if (isPositioned) {
		hasEverPositionedRef.current = true;
	}

	// Check if Floating UI has successfully calculated valid positions
	// We use the ref to handle legitimate (0,0) positions correctly
	const hasValidFloatingPosition = hasEverPositionedRef.current;

	// Compute styles based on positioning mode
	// Use raw x, y coordinates from Floating UI when available
	const computedStyles = React.useMemo<React.CSSProperties>(() => {
		if (isResponsive) {
			return {};
		}

		if (isMobile) {
			// Mobile: no positioning styles needed, handled by CSS classes
			return {};
		}

		if (useFloatingPositioning && hasValidFloatingPosition) {
			// Desktop with Floating UI: use calculated coordinates
			return {
				position: "fixed" as const,
				left: x,
				top: y,
			};
		}

		// Desktop fallback: use static offset styles when Floating UI isn't ready
		return getFallbackOffsetStyle(side, sideOffset) ?? {};
	}, [
		isMobile,
		useFloatingPositioning,
		hasValidFloatingPosition,
		x,
		y,
		side,
		sideOffset,
		isResponsive,
	]);

	// Compute className based on positioning mode
	const computedClassName = cn(
		// Common base styles
		"flex flex-col overflow-hidden overscroll-none bg-co-background",

		isResponsive
			? "h-full min-h-0 w-full"
			: [
					// Entrance animation
					"co-animate-panel-in",

					// Mobile: fullscreen fixed
					"max-md:fixed max-md:inset-0 max-md:z-[9999]",

					// Desktop: floating window base styles
					"md:z-[9999] md:aspect-[9/17] md:max-h-[calc(100vh-6rem)] md:w-[400px] md:rounded-md md:border md:border-co-border md:shadow md:dark:shadow-co-background-600/50",

					// Positioning mode specific styles
					// Use fixed positioning when Floating UI has valid coordinates,
					// otherwise use fallback absolute positioning with CSS classes
					useFloatingPositioning && hasValidFloatingPosition
						? "md:fixed"
						: cn("md:absolute", getFallbackPositioningClasses(side, align)),
				],

		className
	);

	const content = (
		<div
			className={computedClassName}
			data-support-mode={mode}
			ref={isResponsive ? undefined : setFloatingRef}
			style={computedStyles}
		>
			<ContentInner
				containerRef={containerRef}
				showScrollIndicator={showScrollIndicator}
			>
				{children}
			</ContentInner>
		</div>
	);

	return (
		<SlotProvider>
			{isResponsive ? (
				content
			) : (
				<Primitive.Window asChild>{content}</Primitive.Window>
			)}
		</SlotProvider>
	);
};

/**
 * Inner content component that consumes slots.
 * Separated to allow slot context to be established before consuming it.
 */
const ContentInner: React.FC<{
	children: React.ReactNode;
	containerRef: React.RefObject<HTMLDivElement | null>;
	showScrollIndicator: boolean;
}> = ({ children, containerRef, showScrollIndicator }) => {
	const { header, footer, hasCustomHeader, hasCustomFooter } = useSlots();

	return (
		<div className="relative flex h-full w-full flex-col">
			{/* Custom header slot */}
			{hasCustomHeader && <div className="flex-shrink-0">{header}</div>}

			<div
				className={cn(
					"flex flex-1 flex-col overflow-y-auto",
					// Only add top padding if no custom header (default header is absolute positioned)
					!hasCustomHeader && "pt-16"
				)}
				ref={containerRef}
			>
				{children}
			</div>

			{/* Custom footer slot */}
			{hasCustomFooter && <div className="flex-shrink-0">{footer}</div>}

			{/* Scroll indicator gradients — CSS transition for show/hide */}
			<div
				className={cn(
					"pointer-events-none absolute inset-x-0 bottom-0 z-5 h-32 bg-gradient-to-t from-co-background via-co-background/70 to-transparent transition-opacity duration-300 ease-in-out",
					showScrollIndicator ? "opacity-100" : "opacity-0"
				)}
			/>
			<div
				className={cn(
					"pointer-events-none absolute inset-x-0 bottom-0 z-5 h-48 bg-gradient-to-t from-co-background/80 via-co-background/30 to-transparent transition-opacity duration-400 ease-in-out",
					showScrollIndicator ? "opacity-60" : "opacity-0"
				)}
			/>
		</div>
	);
};
