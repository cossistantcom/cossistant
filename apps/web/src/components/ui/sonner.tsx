"use client";

import { useTheme } from "next-themes";
import type { CSSProperties } from "react";
import {
	type ExternalToast,
	Toaster as Sonner,
	type ToasterProps,
	toast,
} from "sonner";

import { cn } from "@/lib/utils";
import { Progress } from "./progress";
import { Spinner } from "./spinner";

type ProgressToastContentProps = {
	title: string;
	status: string;
	value?: number;
	valueLabel?: string;
	indeterminate?: boolean;
};

type ShowProgressToastOptions = ProgressToastContentProps & {
	id: NonNullable<ExternalToast["id"]>;
	duration?: number;
};

const progressToastOuterClassName = "w-[var(--width)] max-w-[calc(100vw-2rem)]";

function ProgressToastContent({
	title,
	status,
	value,
	valueLabel,
	indeterminate = false,
}: ProgressToastContentProps) {
	const resolvedValueLabel =
		valueLabel ??
		(indeterminate || value === undefined
			? undefined
			: `${Math.round(value)}%`);

	return (
		<div
			className="w-full rounded-[2px] border border-border/90 border-dashed bg-popover/95 px-3 py-3 text-popover-foreground shadow-[0_12px_32px_-20px_rgba(0,0,0,0.65)] backdrop-blur-sm supports-[backdrop-filter]:bg-popover/85"
			data-slot="progress-toast"
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<p className="truncate font-medium text-popover-foreground text-sm">
						{title}
					</p>
					<p className="mt-1 text-pretty text-primary/60 text-xs">{status}</p>
				</div>
				{resolvedValueLabel ? (
					<span className="shrink-0 font-medium text-[11px] text-plasma-blue">
						{resolvedValueLabel}
					</span>
				) : null}
			</div>
			<Progress
				aria-label={`${title} progress`}
				aria-valuetext={resolvedValueLabel ?? status}
				className="mt-3 h-2 bg-background-200/80 dark:bg-background-800"
				indeterminate={indeterminate}
				indicatorClassName="text-plasma-blue"
				value={value}
			/>
		</div>
	);
}

function showProgressToast({
	id,
	duration = Number.POSITIVE_INFINITY,
	...content
}: ShowProgressToastOptions) {
	return toast.custom(() => <ProgressToastContent {...content} />, {
		className: progressToastOuterClassName,
		duration,
		id,
	});
}

const Toaster = ({ toastOptions, ...props }: ToasterProps) => {
	const { theme = "system" } = useTheme();

	return (
		<Sonner
			className="toaster group"
			icons={{
				loading: <Spinner size={16} squareSize={2} squaresPerSide={3} />,
			}}
			style={
				{
					"--normal-bg": "var(--popover)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "var(--border)",
					"--border-radius": "1px",
				} as CSSProperties
			}
			theme={theme as ToasterProps["theme"]}
			toastOptions={{
				...(toastOptions ?? {}),
				className: cn(
					"border-dashed px-2 py-1.5 text-sm",
					toastOptions?.className
				),
			}}
			{...props}
		/>
	);
};

export { ProgressToastContent, showProgressToast, Toaster };
