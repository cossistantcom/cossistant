"use client";

import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { TooltipOnHover } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const segmentedControlVariants = cva(
	"relative inline-grid w-fit items-stretch overflow-visible rounded-[2px] border border-border bg-background dark:bg-background-50",
	{
		variants: {
			size: {
				default: "h-8",
				sm: "h-7",
			},
		},
		defaultVariants: {
			size: "default",
		},
	}
);

const segmentedControlItemVariants = cva(
	"relative z-10 inline-flex h-full w-full min-w-0 items-center justify-center px-2 font-medium outline-none transition-colors hover:cursor-pointer disabled:pointer-events-none disabled:opacity-50",
	{
		variants: {
			size: {
				default: "text-sm",
				sm: "px-2.5 text-xs",
			},
			colorVariant: {
				default:
					"text-primary/60 hover:text-foreground data-[state=on]:text-primary",
				private:
					"text-muted-foreground hover:text-foreground data-[state=on]:text-plasma-yellow-600",
			},
		},
		defaultVariants: {
			size: "default",
			colorVariant: "default",
		},
	}
);

export const segmentedControlIndicatorVariants = cva(
	"pointer-events-none absolute rounded-[2px] border bg-background-100 shadow-xs transition-[left,background-color,border-color] duration-100 ease-out dark:bg-background-300",
	{
		variants: {
			colorVariant: {
				default: "border-border",
				private:
					"border-plasma-yellow-600/25 dark:border-plasma-yellow-600/20",
			},
		},
		defaultVariants: {
			colorVariant: "default",
		},
	}
);

type SegmentedControlColorVariant = NonNullable<
	VariantProps<typeof segmentedControlItemVariants>["colorVariant"]
>;

type SegmentedControlTooltipOnHoverProps = Omit<
	React.ComponentProps<typeof TooltipOnHover>,
	"children"
>;

export type SegmentedControlOption<T extends string = string> = {
	value: T;
	label: React.ReactNode;
	disabled?: boolean;
	colorVariant?: SegmentedControlColorVariant;
	tooltipOnHover?: SegmentedControlTooltipOnHoverProps;
};

export type SegmentedControlProps<T extends string = string> = {
	options: readonly SegmentedControlOption<T>[];
	value: T;
	onValueChange: (value: T) => void;
	className?: string;
	disabled?: boolean;
	size?: VariantProps<typeof segmentedControlVariants>["size"];
	"aria-label": string;
};

export function SegmentedControl<T extends string = string>({
	options,
	value,
	onValueChange,
	className,
	disabled,
	size,
	"aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
	const activeIndex = options.findIndex((option) => option.value === value);
	const activeOption = activeIndex >= 0 ? options[activeIndex] : undefined;

	return (
		<ToggleGroupPrimitive.Root
			aria-label={ariaLabel}
			className={cn(segmentedControlVariants({ size, className }))}
			data-segment-count={options.length}
			data-slot="segmented-control"
			onValueChange={(nextValue) => {
				if (nextValue) {
					onValueChange(nextValue as T);
				}
			}}
			style={{
				gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
			}}
			type="single"
			value={value}
		>
			{activeIndex >= 0 ? (
				<div
					aria-hidden="true"
					className={cn(
						segmentedControlIndicatorVariants({
							colorVariant: activeOption?.colorVariant,
						})
					)}
					data-slot="segmented-control-indicator"
					style={{
						left: `calc(${activeIndex} * (100% / ${options.length}) - 1px)`,
						top: "-2px",
						bottom: "-2px",
						width: `calc(100% / ${options.length} + 4px)`,
					}}
				>
					{activeOption?.colorVariant === "private" ? (
						<div
							aria-hidden="true"
							className="absolute inset-0 rounded-[inherit] bg-plasma-yellow-100 dark:bg-plasma-yellow-100/25"
						/>
					) : null}
				</div>
			) : null}
			{options.map((option) => {
				const itemClassName = cn(
					segmentedControlItemVariants({
						size,
						colorVariant: option.colorVariant,
					})
				);

				if (option.tooltipOnHover) {
					return (
						<TooltipOnHover key={option.value} {...option.tooltipOnHover}>
							<span>
								<ToggleGroupPrimitive.Item
									className={itemClassName}
									data-slot="segmented-control-item"
									disabled={disabled || option.disabled}
									value={option.value}
								>
									{option.label}
								</ToggleGroupPrimitive.Item>
							</span>
						</TooltipOnHover>
					);
				}

				return (
					<ToggleGroupPrimitive.Item
						className={itemClassName}
						data-slot="segmented-control-item"
						disabled={disabled || option.disabled}
						key={option.value}
						value={option.value}
					>
						{option.label}
					</ToggleGroupPrimitive.Item>
				);
			})}
		</ToggleGroupPrimitive.Root>
	);
}

export { segmentedControlVariants };
