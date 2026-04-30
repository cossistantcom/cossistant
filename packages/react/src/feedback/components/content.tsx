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
import type { Align, CollisionPadding, Side } from "../../support/types";
import { cn } from "../../support/utils";
import { useTriggerRef } from "../context/positioning";
import { useFeedbackConfig } from "../context/widget";
import { FeedbackWindow } from "../internal/window";

export type FeedbackContentProps = {
	className?: string;
	side?: Side;
	align?: Align;
	sideOffset?: number;
	avoidCollisions?: boolean;
	collisionPadding?: CollisionPadding;
	children?: React.ReactNode;
};

function getPlacement(side: Side, align: Align): Placement {
	if (align === "center") {
		return side;
	}

	return `${side}-${align}` as Placement;
}

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

function useIsMobile(): boolean {
	const [isMobile, setIsMobile] = React.useState(false);

	React.useEffect(() => {
		const mediaQuery = window.matchMedia("(max-width: 767px)");
		setIsMobile(mediaQuery.matches);

		const handleChange = (event: MediaQueryListEvent) => {
			setIsMobile(event.matches);
		};

		mediaQuery.addEventListener("change", handleChange);
		return () => mediaQuery.removeEventListener("change", handleChange);
	}, []);

	return isMobile;
}

export const Content: React.FC<FeedbackContentProps> = ({
	className,
	children,
	side = "top",
	align = "end",
	sideOffset = 16,
	avoidCollisions = true,
	collisionPadding = 8,
}) => {
	const hasEverPositionedRef = React.useRef(false);
	const isMobile = useIsMobile();
	const triggerRefContext = useTriggerRef();
	const { isOpen } = useFeedbackConfig();

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
	}, [avoidCollisions, collisionPadding, sideOffset]);

	const triggerElement = triggerRefContext?.triggerElement ?? null;

	const { refs, update, x, y, isPositioned } = useFloating({
		placement: getPlacement(side, align),
		strategy: "fixed",
		middleware,
		whileElementsMounted: autoUpdate,
		open: isOpen,
		elements: {
			reference: triggerElement,
		},
	});

	const setFloatingRef = React.useCallback(
		(node: HTMLDivElement | null) => {
			refs.setFloating(node);
		},
		[refs]
	);

	React.useEffect(() => {
		if (triggerElement && isOpen) {
			requestAnimationFrame(() => {
				update();
			});
		}
	}, [isOpen, triggerElement, update]);

	const useFloatingPositioning =
		avoidCollisions && !isMobile && triggerElement !== null;

	if (isPositioned) {
		hasEverPositionedRef.current = true;
	}

	const hasValidFloatingPosition = hasEverPositionedRef.current;

	const computedStyles = React.useMemo<React.CSSProperties>(() => {
		if (isMobile) {
			return {};
		}

		if (useFloatingPositioning && hasValidFloatingPosition) {
			return {
				position: "fixed",
				left: x,
				top: y,
			};
		}

		return getFallbackOffsetStyle(side, sideOffset) ?? {};
	}, [
		hasValidFloatingPosition,
		isMobile,
		side,
		sideOffset,
		useFloatingPositioning,
		x,
		y,
	]);

	const computedClassName = cn(
		"co-animate-panel-in flex flex-col overflow-hidden bg-co-background text-co-foreground",
		"max-md:fixed max-md:inset-0 max-md:z-[9999]",
		"md:z-[9999] md:max-h-[min(560px,calc(100vh-6rem))] md:w-[360px] md:max-w-[calc(100vw-2rem)] md:rounded-[24px] md:border md:border-co-border/80 md:shadow-2xl md:shadow-black/15",
		useFloatingPositioning && hasValidFloatingPosition
			? "md:fixed"
			: cn("md:absolute", getFallbackPositioningClasses(side, align)),
		className
	);

	return (
		<FeedbackWindow asChild>
			<div
				className={computedClassName}
				data-feedback-content="true"
				data-slot="feedback-content"
				data-state={isOpen ? "open" : "closed"}
				ref={setFloatingRef}
				style={computedStyles}
			>
				{children}
			</div>
		</FeedbackWindow>
	);
};
