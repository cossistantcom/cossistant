"use client";

import * as React from "react";
import { useRenderElement } from "../../utils/use-render-element";
import { useAvatarContext } from "./avatar";

type FallbackState = {
	imageLoadingStatus: "idle" | "loading" | "loaded" | "error";
	initials?: string;
};

export type AvatarFallbackProps = Omit<
	React.HTMLAttributes<HTMLSpanElement>,
	"children"
> & {
	children?: React.ReactNode;
	name?: string;
	delayMs?: number;
	asChild?: boolean;
	className?: string;
};

const getInitials = (name: string): string => {
	const names = name.trim().split(" ");
	if (names.length === 0) {
		return "";
	}

	if (names.length === 1) {
		return names[0]?.charAt(0).toUpperCase() || "";
	}

	const firstInitial = names[0]?.charAt(0) || "";
	const lastInitial = names.at(-1)?.charAt(0) || "";

	return (firstInitial + lastInitial).toUpperCase();
};

/**
 * Displays initials or custom content while the avatar image loads or fails.
 * Optional delay avoids flashes when images load instantly.
 */
export const AvatarFallback = (() => {
	const Component = React.forwardRef<HTMLSpanElement, AvatarFallbackProps>(
		(
			{
				children,
				name = "",
				delayMs = 0,
				className,
				asChild = false,
				...props
			},
			ref
		) => {
			const { imageLoadingStatus } = useAvatarContext();
			const [canRender, setCanRender] = React.useState(delayMs === 0);

			React.useEffect(() => {
				if (delayMs > 0) {
					const timerId = window.setTimeout(() => setCanRender(true), delayMs);
					return () => window.clearTimeout(timerId);
				}
			}, [delayMs]);

			const initials = React.useMemo(() => {
				if (name) {
					return getInitials(name);
				}
				return "";
			}, [name]);

			const state: FallbackState = {
				imageLoadingStatus,
				initials,
			};

			// Keep showing the fallback while the image is still loading so slow
			// connections don't get a blank avatar (delayMs handles fast-load
			// flashes)
			const shouldRender = canRender && imageLoadingStatus !== "loaded";

			const content = children || initials;

			return useRenderElement(
				"span",
				{
					asChild,
					className,
				},
				{
					ref,
					state,
					enabled: shouldRender,
					props: {
						...props,
						children: content,
					},
				}
			);
		}
	);

	Component.displayName = "AvatarFallback";
	return Component;
})();
