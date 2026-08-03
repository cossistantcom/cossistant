"use client";

import * as React from "react";
import { useRenderElement } from "../utils/use-render-element";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
	asChild?: boolean;
	className?: string;
};

/**
 * Thin wrapper over a `<button>` that supports `asChild` composition so the
 * primitives can be slotted into external design systems without losing
 * semantics.
 */
export const Button = (() => {
	const Component = React.forwardRef<HTMLButtonElement, ButtonProps>(
		({ className, asChild = false, ...props }, ref) =>
			useRenderElement(
				"button",
				{
					className,
					asChild,
				},
				{
					ref,
					props: {
						type: "button",
						...props,
					},
				}
			)
	);

	Component.displayName = "Button";
	return Component;
})();
