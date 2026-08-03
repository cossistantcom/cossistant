import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { Button as ButtonPrimitive } from "../../primitives/button";
import { cn } from "../utils";

export const coButtonVariants = cva(
	"group/btn inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-co border font-medium text-sm outline-none transition-all hover:cursor-pointer focus-visible:border-co-ring focus-visible:ring-[3px] focus-visible:ring-co-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-co-destructive aria-invalid:ring-co-destructive/20 dark:aria-invalid:ring-co-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default:
					"bg-co-primary text-co-primary-foreground hover:bg-co-primary/90",
				secondary:
					"border-co-border bg-co-background-50/50 text-co-primary hover:bg-co-background-100 hover:text-co-foreground dark:bg-co-background-200 dark:hover:bg-co-background-300",
				ghost:
					"border-transparent text-co-primary hover:bg-co-background-200 hover:text-co-foreground dark:hover:bg-co-background-300",
				outline:
					"border border-co-border bg-co-background text-co-primary hover:bg-co-background-100 dark:bg-co-background-200 dark:hover:bg-co-background-300",
				tab: "opacity-40 hover:bg-co-background-100 hover:text-co-foreground hover:opacity-90 dark:hover:bg-co-background-200",
				"tab-selected":
					"hover:bg-co-background-100 hover:text-co-foreground dark:hover:bg-co-background-200",
			},
			size: {
				default: "h-8 px-4 py-2 has-[>svg]:px-3",
				large: "h-14 px-6 has-[>svg]:px-4",
				small: "h-6 px-1 text-xs has-[>svg]:px-1.5",
				icon: "size-6",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	}
);

export type CossistantButtonProps = React.ComponentProps<"button"> & {
	asChild?: boolean;
} & VariantProps<typeof coButtonVariants>;

/**
 * Styled button primitive that forwards variant and size props to the shared
 * design tokens.
 */
export function CoButton({
	className,
	variant,
	size,
	...props
}: CossistantButtonProps): React.ReactElement {
	return (
		<ButtonPrimitive
			className={cn(coButtonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}
