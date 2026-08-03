"use client";

import * as React from "react";
import { useOptionalSupportConfig } from "../support/store/support-store";
import { useRenderElement } from "../utils/use-render-element";

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
	/**
	 * Whether to trap focus within the dialog when open.
	 * @default true
	 */
	trapFocus?: boolean;
	/**
	 * Whether to restore focus to the previously focused element when closing.
	 * @default true
	 */
	restoreFocus?: boolean;
	id?: string;
};

/**
 * Selector for focusable elements within a container
 */
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

/**
 * Get all focusable elements within a container
 */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
	return Array.from(
		container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
	).filter((el) => {
		// Check visibility
		const style = window.getComputedStyle(el);
		return style.display !== "none" && style.visibility !== "hidden";
	});
}

/**
 * Dialog container with open/close state, escape key handling,
 * focus trap, and focus restoration.
 *
 * @example
 * <Window isOpen={isOpen} onOpenChange={setOpen}>
 *   {({ isOpen, close }) => (
 *     <div>Content here</div>
 *   )}
 * </Window>
 */
export const SupportWindow = (() => {
	const Component = React.forwardRef<HTMLDivElement, WindowProps>(
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
				id = "cossistant-window",
				...props
			},
			ref
		) => {
			// Optional so controlled usage (isOpen/onOpenChange) works without a provider
			const supportConfig = useOptionalSupportConfig();
			const close = supportConfig?.close;
			const containerRef = React.useRef<HTMLDivElement>(null);
			const previouslyFocusedRef = React.useRef<HTMLElement | null>(null);

			const open = isOpenProp ?? supportConfig?.isOpen ?? false;

			const closeFn = React.useCallback(() => {
				if (onOpenChange) {
					onOpenChange(false);
				} else if (close) {
					close();
				}
			}, [onOpenChange, close]);

			// Store previously focused element and focus first element when opening
			React.useEffect(() => {
				if (open) {
					// Store the currently focused element
					previouslyFocusedRef.current = document.activeElement as HTMLElement;

					// Focus the first focusable element after a short delay
					// to allow the DOM to render
					const timer = setTimeout(() => {
						const container = containerRef.current;
						if (container) {
							const focusable = getFocusableElements(container);
							const firstElement = focusable[0];
							if (firstElement) {
								firstElement.focus();
							} else {
								// If no focusable elements, focus the container itself
								container.focus();
							}
						}
					}, 50);

					return () => clearTimeout(timer);
				}
				// Restore focus when closing
				if (!open && restoreFocus && previouslyFocusedRef.current) {
					previouslyFocusedRef.current.focus();
					previouslyFocusedRef.current = null;
				}
			}, [open, restoreFocus]);

			// Close on Escape
			React.useEffect(() => {
				if (!(open && closeOnEscape)) {
					return;
				}
				const onKey = (e: KeyboardEvent) => {
					// Only close when focus is within the widget so Escape keeps
					// working for host-page modals while the floating widget is open
					if (
						e.key === "Escape" &&
						containerRef.current?.contains(document.activeElement)
					) {
						closeFn();
					}
				};
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, [open, closeFn, closeOnEscape]);

			// Focus trap - trap Tab and Shift+Tab within the dialog
			React.useEffect(() => {
				if (!(open && trapFocus)) {
					return;
				}

				const container = containerRef.current;
				if (!container) {
					return;
				}

				const handleKeyDown = (e: KeyboardEvent) => {
					if (e.key !== "Tab") {
						return;
					}

					const active = document.activeElement;

					// The floating widget is non-modal: only wrap focus while it is
					// already inside the widget, never hijack Tab on the host page
					if (!container.contains(active)) {
						return;
					}

					const focusable = getFocusableElements(container);
					if (focusable.length === 0) {
						e.preventDefault();
						return;
					}

					const first = focusable[0];
					const last = focusable.at(-1);

					// Shift+Tab from first element wraps to last
					if (e.shiftKey && active === first) {
						e.preventDefault();
						last?.focus();
						return;
					}

					// Tab from last element wraps to first
					if (!e.shiftKey && active === last) {
						e.preventDefault();
						first?.focus();
					}
				};

				document.addEventListener("keydown", handleKeyDown);
				return () => document.removeEventListener("keydown", handleKeyDown);
			}, [open, trapFocus]);

			// Merge refs
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

			const renderProps: WindowRenderProps = { isOpen: open, close: closeFn };

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
						"aria-label": "Support",
						id,
						tabIndex: -1, // Allow container to receive focus
						...props,
						children: content,
					},
					enabled: open,
				}
			);
		}
	);

	Component.displayName = "SupportWindow";
	return Component;
})();
