"use client";

import * as React from "react";
import { useRenderElement } from "../utils/use-render-element";

const emptySubscribe = () => () => {
	// No-op: only used to detect hydration via useSyncExternalStore
};

/**
 * False on the server and during the hydration render, true afterwards.
 */
function useIsHydrated(): boolean {
	return React.useSyncExternalStore(
		emptySubscribe,
		() => true,
		() => false
	);
}

/**
 * Deterministic absolute date label used for SSR and the hydration render so
 * server markup never depends on the server clock, timezone offset or locale.
 */
const formatAbsoluteDate = (date: Date): string =>
	date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});

/**
 * Helper to check if a date is today
 */
const isToday = (date: Date): boolean => {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const itemDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	return itemDay.getTime() === today.getTime();
};

/**
 * Helper to check if a date is yesterday
 */
const isYesterday = (date: Date): boolean => {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);
	const itemDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	return itemDay.getTime() === yesterday.getTime();
};

/**
 * Default date formatter that returns "Today", "Yesterday", or a full date string
 */
export const defaultFormatDate = (date: Date): string => {
	if (isToday(date)) {
		return "Today";
	}

	if (isYesterday(date)) {
		return "Yesterday";
	}

	// Format as "January 15, 2024"
	return date.toLocaleDateString(undefined, {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
};

/**
 * Shape returned to render-prop children describing the day separator state
 */
export type DaySeparatorRenderProps = {
	date: Date;
	dateString: string;
	formattedDate: string;
	isToday: boolean;
	isYesterday: boolean;
};

export type DaySeparatorProps = Omit<
	React.HTMLAttributes<HTMLDivElement>,
	"children"
> & {
	children?:
		| React.ReactNode
		| ((props: DaySeparatorRenderProps) => React.ReactNode);
	asChild?: boolean;
	className?: string;
	date: Date;
	dateString: string;
	formatDate?: (date: Date) => string;
};

/**
 * Headless day separator component that marks the boundary between different days
 * in a conversation timeline. Consumers can either render their own layout via
 * a render prop or rely on slotted children.
 */
export const DaySeparator = (() => {
	const Component = React.forwardRef<HTMLDivElement, DaySeparatorProps>(
		(
			{
				children,
				className,
				asChild = false,
				date,
				dateString,
				formatDate = defaultFormatDate,
				...restProps
			},
			ref
		) => {
			const isHydrated = useIsHydrated();

			// Before hydration the default formatter would compare against the
			// server clock and use the server locale, mismatching the client's
			// first render. Render a deterministic absolute date instead.
			// Consumer-provided formatters are applied as-is.
			const useDeterministicLabel =
				!isHydrated && formatDate === defaultFormatDate;
			const formattedDate = useDeterministicLabel
				? formatAbsoluteDate(date)
				: formatDate(date);
			const isTodayValue = isHydrated && isToday(date);
			const isYesterdayValue = isHydrated && isYesterday(date);

			const renderProps: DaySeparatorRenderProps = {
				date,
				dateString,
				formattedDate,
				isToday: isTodayValue,
				isYesterday: isYesterdayValue,
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
					ref,
					state: renderProps,
					props: {
						role: "separator",
						"aria-label": `Day separator: ${formattedDate}`,
						...restProps,
						children: content,
					},
				}
			);
		}
	);

	Component.displayName = "DaySeparator";
	return Component;
})();

export type DaySeparatorLineProps = Omit<
	React.HTMLAttributes<HTMLDivElement>,
	"children"
> & {
	children?: React.ReactNode;
	asChild?: boolean;
	className?: string;
};

/**
 * Decorative line element for the day separator.
 * Typically rendered on either side of the label.
 */
export const DaySeparatorLine = (() => {
	const Component = React.forwardRef<HTMLDivElement, DaySeparatorLineProps>(
		({ children, className, asChild = false, ...props }, ref) =>
			useRenderElement(
				"div",
				{
					className,
					asChild,
				},
				{
					ref,
					props: {
						"aria-hidden": true,
						...props,
						children,
					},
				}
			)
	);

	Component.displayName = "DaySeparatorLine";
	return Component;
})();

export type DaySeparatorLabelProps = Omit<
	React.HTMLAttributes<HTMLSpanElement>,
	"children"
> & {
	children?:
		| React.ReactNode
		| ((props: { formattedDate: string }) => React.ReactNode);
	asChild?: boolean;
	className?: string;
	formattedDate?: string;
};

/**
 * Text label element for the day separator.
 * Displays the formatted date string.
 */
export const DaySeparatorLabel = (() => {
	const Component = React.forwardRef<HTMLSpanElement, DaySeparatorLabelProps>(
		(
			{ children, className, asChild = false, formattedDate = "", ...props },
			ref
		) => {
			const content =
				typeof children === "function"
					? children({ formattedDate })
					: (children ?? formattedDate);

			return useRenderElement(
				"span",
				{
					className,
					asChild,
				},
				{
					ref,
					props: {
						...props,
						children: content,
					},
				}
			);
		}
	);

	Component.displayName = "DaySeparatorLabel";
	return Component;
})();
