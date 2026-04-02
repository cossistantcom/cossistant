import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const highlightLineVariants = cva(
	"mr-1 mb-[3px] inline-flex h-4 items-center rounded border px-1 align-middle font-medium font-mono text-[9px] text-primary uppercase",
	{
		variants: {
			variant: {
				new: "border-primary/20 bg-plasma-green/20 text-primary dark:border-plasma-green/60 dark:text-plasma-green",
				updated:
					"border-primary/20 bg-plasma-blue/20 text-primary dark:border-plasma-blue/60 dark:text-plasma-blue",
				fixed:
					"border-primary/20 bg-plasma-yellow/20 text-primary dark:border-plasma-yellow/60 dark:text-plasma-yellow",
				removed:
					"border-primary/20 bg-plasma-red/20 text-primary dark:border-plasma-red/60 dark:text-plasma-red",
			},
		},
		defaultVariants: {
			variant: "new",
		},
	}
);

export type HighlightLineProps = React.ComponentProps<"span"> &
	VariantProps<typeof highlightLineVariants>;

export function HighlightLine({
	children,
	variant,
	className,
	...props
}: HighlightLineProps) {
	return (
		<span
			className={cn(
				"text-primary/80 [&>p]:m-0 [&>p]:inline [&>p]:text-primary/90",
				className
			)}
			{...props}
		>
			<span className={cn(highlightLineVariants({ variant }))}>
				{variant ?? "new"}
			</span>{" "}
			{children}
		</span>
	);
}
