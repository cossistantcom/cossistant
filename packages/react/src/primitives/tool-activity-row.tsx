"use client";

import type React from "react";
import { Spinner } from "../support/components/spinner";
import { cn } from "../support/utils";

export type ToolActivityRowState = "partial" | "result" | "error";
export type ToolActivityRowTone = "dashboard" | "widget";

export type ToolActivityRowProps = {
	state: ToolActivityRowState;
	text: React.ReactNode;
	leading?: React.ReactNode;
	details?: React.ReactNode;
	timestamp?: React.ReactNode;
	showIndicator?: boolean;
	showTerminalIndicator?: boolean;
	className?: string;
	bodyClassName?: string;
	textRowClassName?: string;
	textClassName?: string;
	detailsClassName?: string;
	timestampClassName?: string;
	indicatorSlotClassName?: string;
	indicatorClassName?: string;
	spinnerClassName?: string;
	tone?: ToolActivityRowTone;
};

const TONE_CLASSNAMES = {
	dashboard: {
		textRow: "flex min-h-6 gap-2 text-muted-foreground text-sm",
		text: "min-w-0 flex-1 break-words leading-6 [&_a]:underline [&_a]:underline-offset-2",
		details: "mt-1.5",
		timestamp:
			"text-xs opacity-0 transition-opacity group-hover/tool-activity:opacity-100",
		indicatorSlot: "flex h-6 w-5 shrink-0 items-center justify-center",
		indicator:
			"font-mono text-sm leading-6 text-muted-foreground data-[state=error]:text-destructive/70",
		spinner: "text-primary/70",
	},
	widget: {
		textRow: "flex min-h-6 gap-2 text-sm",
		text: "min-w-0 flex-1 break-words text-co-primary/75 text-sm leading-6 data-[state=error]:text-co-destructive",
		details: "pl-7 text-co-muted-foreground text-sm leading-5",
		timestamp: "text-[10px] text-co-muted-foreground/70",
		indicatorSlot: "flex h-6 w-5 shrink-0 items-center justify-center",
		indicator:
			"font-mono text-sm leading-6 text-co-muted-foreground data-[state=error]:text-co-destructive",
		spinner: "text-co-primary/70",
	},
} as const;

function ToolActivityIndicator({
	state,
	tone,
	showTerminalIndicator,
	slotClassName,
	className,
	spinnerClassName,
}: {
	state: ToolActivityRowState;
	tone: ToolActivityRowTone;
	showTerminalIndicator: boolean;
	slotClassName?: string;
	className?: string;
	spinnerClassName?: string;
}) {
	if (state !== "partial" && !showTerminalIndicator) {
		return null;
	}

	return (
		<span
			aria-hidden="true"
			className={cn(TONE_CLASSNAMES[tone].indicatorSlot, slotClassName)}
			data-tool-execution-indicator-slot="true"
		>
			{state === "partial" ? (
				<span
					className="shrink-0 leading-none"
					data-tool-execution-indicator="spinner"
				>
					<Spinner
						className={cn(TONE_CLASSNAMES[tone].spinner, spinnerClassName)}
						size={12}
					/>
				</span>
			) : (
				<span
					className={cn(TONE_CLASSNAMES[tone].indicator, className)}
					data-state={state}
					data-tool-execution-indicator="arrow"
				>
					{"->"}
				</span>
			)}
		</span>
	);
}

export function ToolActivityRow({
	state,
	text,
	leading,
	details,
	timestamp,
	showIndicator = true,
	showTerminalIndicator = true,
	className,
	bodyClassName,
	textRowClassName,
	textClassName,
	detailsClassName,
	timestampClassName,
	indicatorSlotClassName,
	indicatorClassName,
	spinnerClassName,
	tone = "dashboard",
}: ToolActivityRowProps): React.ReactElement {
	const toneClassNames = TONE_CLASSNAMES[tone];
	const shouldRenderIndicator =
		showIndicator && (state === "partial" || showTerminalIndicator);

	return (
		<div
			className={cn(
				"group/tool-activity flex w-full",
				leading ? "gap-2" : "gap-0",
				className
			)}
			data-tool-display-state={state}
		>
			{leading ? leading : null}
			<div className={cn("flex min-w-0 flex-1 flex-col", bodyClassName)}>
				<div
					className={cn(
						toneClassNames.textRow,
						shouldRenderIndicator ? "items-start" : "items-center",
						textRowClassName
					)}
				>
					{shouldRenderIndicator ? (
						<ToolActivityIndicator
							className={indicatorClassName}
							showTerminalIndicator={showTerminalIndicator}
							slotClassName={indicatorSlotClassName}
							spinnerClassName={spinnerClassName}
							state={state}
							tone={tone}
						/>
					) : null}
					<span
						className={cn(toneClassNames.text, textClassName)}
						data-state={state}
					>
						{text}
					</span>
					{timestamp ? (
						<time className={cn(toneClassNames.timestamp, timestampClassName)}>
							{timestamp}
						</time>
					) : null}
				</div>
				{details ? (
					<div className={cn(toneClassNames.details, detailsClassName)}>
						{details}
					</div>
				) : null}
			</div>
		</div>
	);
}
