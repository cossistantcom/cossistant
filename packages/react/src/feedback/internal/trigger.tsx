"use client";

import * as React from "react";
import { useRenderElement } from "../../utils/use-render-element";
import { useTriggerRef } from "../context/positioning";
import { useFeedbackConfig } from "../context/widget";

export type FeedbackTriggerRenderProps = {
	isOpen: boolean;
	toggle: () => void;
};

export type InternalFeedbackTriggerProps = Omit<
	React.ButtonHTMLAttributes<HTMLButtonElement>,
	"children"
> & {
	children?:
		| React.ReactNode
		| ((props: FeedbackTriggerRenderProps) => React.ReactNode);
	asChild?: boolean;
	className?: string;
};

export const FeedbackTriggerPrimitive = React.forwardRef<
	HTMLButtonElement,
	InternalFeedbackTriggerProps
>(({ children, className, asChild = false, ...props }, ref) => {
	const { isOpen, toggle } = useFeedbackConfig();
	const triggerRefContext = useTriggerRef();
	const setTriggerElement = triggerRefContext?.setTriggerElement;

	const mergedRef = React.useCallback(
		(element: HTMLButtonElement | null) => {
			setTriggerElement?.(element);

			if (typeof ref === "function") {
				ref(element);
			} else if (ref) {
				ref.current = element;
			}
		},
		[ref, setTriggerElement]
	);

	const renderProps: FeedbackTriggerRenderProps = {
		isOpen,
		toggle,
	};
	const dataState = isOpen ? "open" : "closed";

	const content =
		typeof children === "function" ? children(renderProps) : children;

	return useRenderElement(
		"button",
		{
			asChild,
			className,
		},
		{
			ref: mergedRef,
			state: renderProps,
			props: {
				type: "button",
				"aria-haspopup": "dialog",
				"aria-expanded": isOpen,
				onClick: toggle,
				...props,
				"data-feedback-trigger": "true",
				"data-slot": "feedback-trigger",
				"data-state": dataState,
				children: content,
			} as Partial<React.ButtonHTMLAttributes<HTMLButtonElement>> & {
				"data-feedback-trigger": string;
				"data-slot": string;
				"data-state": string;
			},
		}
	);
});

FeedbackTriggerPrimitive.displayName = "FeedbackTriggerPrimitive";
