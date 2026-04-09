import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
	"group/btn inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[2px] border border-transparent font-medium text-sm outline-none transition-all hover:cursor-pointer focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:text-primary/60 [&_svg]:group-hover/btn:text-primary",
	{
		variants: {
			variant: {
				default:
					"bg-primary text-primary-foreground hover:bg-primary/90 [&_svg]:text-primary-foreground/60 [&_svg]:group-hover/btn:text-primary-foreground",
				destructive:
					"border-destructive/80 bg-destructive/10 text-destructive hover:border-destructive hover:bg-destructive/90 hover:text-white focus-visible:ring-destructive/20 dark:border-destructive/30 dark:bg-destructive/10 dark:focus-visible:ring-destructive/40 dark:hover:bg-destructive/50",
				outline:
					"border bg-background hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
				secondary:
					"bg-background-300 text-secondary-foreground hover:bg-background-400",
				ghost:
					"hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				default: "h-9 px-4 py-2 has-[>svg]:px-3",
				sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2",
				xs: "h-7 gap-1.5 px-2.5 text-xs has-[>svg]:px-1.5",
				lg: "h-10 px-8 has-[>svg]:gap-3 has-[>svg]:px-10",
				icon: "size-9",
				"icon-small": "size-6 rounded-md",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	}
);

export type ButtonProps = React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	};

function Button({
	className,
	variant,
	size,
	asChild = false,
	...props
}: ButtonProps) {
	const Comp: React.ElementType = asChild ? Slot : "button";

	return (
		<Comp
			className={cn(buttonVariants({ variant, size, className }))}
			data-slot="button"
			{...props}
		/>
	);
}

export { Button, buttonVariants };
