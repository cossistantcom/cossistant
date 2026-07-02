"use client";

import * as React from "react";

// Local class joiner: keeps this headless entry free of the styled support
// layer (tailwind-merge + the full icon registry).
function joinClassNames(
	...values: Array<string | false | null | undefined>
): string {
	return values.filter(Boolean).join(" ");
}

export type FeedbackTopicSelectProps = Omit<
	React.SelectHTMLAttributes<HTMLSelectElement>,
	"children" | "onChange" | "value"
> & {
	options: string[];
	value: string;
	onValueChange?: (value: string) => void;
	placeholder?: string;
	invalid?: boolean;
	wrapperClassName?: string;
	iconClassName?: string;
};

export function FeedbackTopicSelectView(
	{
		options,
		value,
		onValueChange,
		placeholder = "Select a topic...",
		invalid = false,
		className,
		wrapperClassName,
		iconClassName,
		...props
	}: FeedbackTopicSelectProps,
	ref: React.Ref<HTMLSelectElement>
): React.ReactElement {
	return (
		<div
			className={joinClassNames("relative", wrapperClassName)}
			data-feedback-topic-select="true"
		>
			<select
				{...props}
				className={joinClassNames(
					"h-14 w-full appearance-none rounded-[18px] border bg-co-background px-4 pr-12 text-base text-co-foreground outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50",
					invalid
						? "border-co-destructive"
						: "border-co-border hover:border-co-foreground/25 focus:border-co-primary",
					className
				)}
				data-feedback-topic-select-control="true"
				onChange={(event) => onValueChange?.(event.target.value)}
				ref={ref}
				value={value}
			>
				<option value="">{placeholder}</option>
				{options.map((option) => (
					<option key={option} value={option}>
						{option}
					</option>
				))}
			</select>
			<svg
				aria-hidden="true"
				className={joinClassNames(
					"-translate-y-1/2 pointer-events-none absolute top-1/2 right-4 inline-block h-4 w-4 shrink-0 text-co-muted-foreground",
					iconClassName
				)}
				fill="none"
				viewBox="0 0 24 24"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path
					d="M6 9L12 15L18 9"
					stroke="currentColor"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth="2"
				/>
			</svg>
		</div>
	);
}

export const FeedbackTopicSelect = React.forwardRef<
	HTMLSelectElement,
	FeedbackTopicSelectProps
>(FeedbackTopicSelectView);

FeedbackTopicSelect.displayName = "FeedbackTopicSelect";
