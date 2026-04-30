"use client";

import * as React from "react";
import { useRenderElement } from "../../utils/use-render-element";
import { useFeedbackConfig } from "../context/widget";

export type WindowRenderProps = {
	isOpen: boolean;
	close: () => void;
};

export type WindowProps = Omit<
	React.HTMLAttributes<HTMLDivElement>,
	"children"
> & {
	isOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	children?: React.ReactNode | ((props: WindowRenderProps) => React.ReactNode);
	asChild?: boolean;
	closeOnEscape?: boolean;
	trapFocus?: boolean;
	restoreFocus?: boolean;
	id?: string;
};

const FOCUSABLE_SELECTOR = [
	"a[href]",
	"area[href]",
	"input:not([disabled])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"button:not([disabled])",
	"iframe",
	"object",
	"embed",
	"[tabindex]:not([tabindex='-1'])",
	"[contenteditable]",
	"audio[controls]",
	"video[controls]",
].join(",");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
	return Array.from(
		container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
	).filter((element) => {
		const style = window.getComputedStyle(element);
		return style.display !== "none" && style.visibility !== "hidden";
	});
}

export const FeedbackWindow = React.forwardRef<HTMLDivElement, WindowProps>(
	(
		{
			isOpen: isOpenProp,
			onOpenChange,
			children,
			className,
			asChild = false,
			closeOnEscape = true,
			trapFocus = true,
			restoreFocus = true,
			id = "cossistant-feedback-window",
			...props
		},
		ref
	) => {
		const { isOpen, close } = useFeedbackConfig();
		const containerRef = React.useRef<HTMLDivElement>(null);
		const previouslyFocusedRef = React.useRef<HTMLElement | null>(null);

		const open = isOpenProp ?? isOpen;

		const closeWindow = React.useCallback(() => {
			if (onOpenChange) {
				onOpenChange(false);
				return;
			}

			close();
		}, [close, onOpenChange]);

		React.useEffect(() => {
			if (open) {
				previouslyFocusedRef.current = document.activeElement as HTMLElement;

				const timer = window.setTimeout(() => {
					const container = containerRef.current;
					if (!container) {
						return;
					}

					const firstFocusableElement = getFocusableElements(container)[0];
					if (firstFocusableElement) {
						firstFocusableElement.focus();
						return;
					}

					container.focus();
				}, 50);

				return () => window.clearTimeout(timer);
			}

			if (!(restoreFocus && previouslyFocusedRef.current)) {
				return;
			}

			previouslyFocusedRef.current.focus();
			previouslyFocusedRef.current = null;
		}, [open, restoreFocus]);

		React.useEffect(() => {
			if (!(open && closeOnEscape)) {
				return;
			}

			const handleKeyDown = (event: KeyboardEvent) => {
				if (event.key === "Escape") {
					closeWindow();
				}
			};

			window.addEventListener("keydown", handleKeyDown);
			return () => window.removeEventListener("keydown", handleKeyDown);
		}, [closeOnEscape, closeWindow, open]);

		React.useEffect(() => {
			if (!(open && trapFocus)) {
				return;
			}

			const container = containerRef.current;
			if (!container) {
				return;
			}

			const handleKeyDown = (event: KeyboardEvent) => {
				if (event.key !== "Tab") {
					return;
				}

				const focusableElements = getFocusableElements(container);
				if (focusableElements.length === 0) {
					event.preventDefault();
					return;
				}

				const firstElement = focusableElements[0];
				const lastElement = focusableElements.at(-1);
				const activeElement = document.activeElement;

				if (event.shiftKey && activeElement === firstElement) {
					event.preventDefault();
					lastElement?.focus();
					return;
				}

				if (!event.shiftKey && activeElement === lastElement) {
					event.preventDefault();
					firstElement?.focus();
					return;
				}

				if (!container.contains(activeElement)) {
					event.preventDefault();
					firstElement?.focus();
				}
			};

			document.addEventListener("keydown", handleKeyDown);
			return () => document.removeEventListener("keydown", handleKeyDown);
		}, [open, trapFocus]);

		const mergedRef = React.useCallback(
			(node: HTMLDivElement | null) => {
				containerRef.current = node;

				if (typeof ref === "function") {
					ref(node);
				} else if (ref) {
					ref.current = node;
				}
			},
			[ref]
		);

		const renderProps: WindowRenderProps = {
			isOpen: open,
			close: closeWindow,
		};

		const content =
			typeof children === "function" ? children(renderProps) : children;

		return useRenderElement(
			"div",
			{
				className,
				asChild,
			},
			{
				ref: mergedRef,
				state: renderProps,
				props: {
					role: "dialog",
					"aria-modal": "true",
					"data-feedback-window": "true",
					"data-state": open ? "open" : "closed",
					id,
					tabIndex: -1,
					...props,
					children: content,
				} as Partial<React.HTMLAttributes<HTMLDivElement>> & {
					"data-feedback-window": string;
					"data-state": string;
				},
				enabled: open,
			}
		);
	}
);

FeedbackWindow.displayName = "FeedbackWindow";
