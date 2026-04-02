"use client";

import type { InboxAnalyticsResponse } from "@plasma/types";
import { useMemo } from "react";
import {
	SegmentedControl,
	type SegmentedControlOption,
} from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipOnHover } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import Icon, { type IconName } from "../ui/icons";
import { INBOX_ANALYTICS_RANGES, type InboxAnalyticsRangeDays } from "./types";

export type InboxAnalyticsDisplayLayout = "inline" | "sheet";

export type InboxAnalyticsLivePresence = {
	count: number | null;
	isLoading: boolean;
	isFetching: boolean;
};

type InboxAnalyticsDisplayProps = {
	data: InboxAnalyticsResponse | null;
	livePresence?: InboxAnalyticsLivePresence;
	rangeDays: InboxAnalyticsRangeDays;
	onRangeChange: (rangeDays: InboxAnalyticsRangeDays) => void;
	isLoading?: boolean;
	isError?: boolean;
	layout?: InboxAnalyticsDisplayLayout;
	controlSize?: "default" | "sm";
	className?: string;
	showControl?: boolean;
};

type MetricConfig = {
	key: keyof InboxAnalyticsResponse["current"];
	label: string;
	description: string;
	higherIsBetter: boolean;
	formatValue: (value: number | null) => string;
	formatSuffix?: (value: number | null) => string | null;
};

type MetricDisplay = MetricConfig & {
	current: number | null;
	delta: number | null;
	deltaLabel: string;
	trendPositive: boolean | null;
};

const LIVE_PRESENCE_DESCRIPTION =
	"Connected visitors seen in the last 5 minutes.";

const numberFormatter = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 0,
});

const rangeOptions = [
	{ value: "7", label: "7d" },
	{ value: "14", label: "14d" },
	{ value: "30", label: "30d" },
] as const satisfies readonly SegmentedControlOption<string>[];

const formatDuration = (value: number | null): string => {
	if (value === null || Number.isNaN(value)) {
		return "—";
	}

	const totalSeconds = Math.max(0, Math.round(value));
	if (totalSeconds < 60) {
		return `${totalSeconds}s`;
	}

	const totalMinutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (totalMinutes < 60) {
		return seconds > 0 ? `${totalMinutes}m ${seconds}s` : `${totalMinutes}m`;
	}

	const totalHours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (totalHours < 24) {
		return minutes > 0 ? `${totalHours}h ${minutes}m` : `${totalHours}h`;
	}

	const totalDays = Math.floor(totalHours / 24);
	const hours = totalHours % 24;
	return hours > 0 ? `${totalDays}d ${hours}h` : `${totalDays}d`;
};

const formatPercent = (value: number | null): string => {
	if (value === null || Number.isNaN(value)) {
		return "—";
	}

	return `${Math.round(value)}%`;
};

const formatIndex = (value: number | null): string => {
	if (value === null || Number.isNaN(value)) {
		return "—";
	}

	return numberFormatter.format(Math.round(value));
};

const formatCount = (value: number | null): string => {
	if (value === null || Number.isNaN(value)) {
		return "—";
	}

	return numberFormatter.format(Math.round(value));
};

const metricConfigs: MetricConfig[] = [
	{
		key: "medianResponseTimeSeconds",
		label: "Median response time",
		description:
			"The median time between when a conversation starts and when the first response is sent.",
		higherIsBetter: false,
		formatValue: formatDuration,
	},
	{
		key: "medianResolutionTimeSeconds",
		label: "Median time to resolution",
		description:
			"The median time from when a conversation starts until it's marked as resolved.",
		higherIsBetter: false,
		formatValue: formatDuration,
	},
	{
		key: "aiHandledRate",
		label: "% handled by AI",
		description:
			"Percentage of conversations fully resolved by AI without human escalation.",
		higherIsBetter: true,
		formatValue: formatPercent,
	},
	{
		key: "satisfactionIndex",
		label: "Satisfaction index",
		description:
			"Composite score (0-100) based on: ratings (40%), sentiment (25%), response time (20%), and resolution rate (15%). Starts at 50 when no data.",
		higherIsBetter: true,
		formatValue: formatIndex,
		formatSuffix: (value) => (value === null ? null : "/100"),
	},
	{
		key: "uniqueVisitors",
		label: "Unique visitors",
		description:
			"Number of distinct website visitors who loaded the widget during this period.",
		higherIsBetter: true,
		formatValue: formatCount,
	},
];

const computeDelta = (
	current: number | null,
	previous: number | null
): number | null => {
	if (
		current === null ||
		previous === null ||
		Number.isNaN(current) ||
		Number.isNaN(previous) ||
		previous === 0
	) {
		return null;
	}

	return ((current - previous) / previous) * 100;
};

const getDeltaClassName = (trendPositive: boolean | null) => {
	if (trendPositive === null) {
		return "text-muted-foreground";
	}

	return trendPositive ? "text-emerald-600" : "text-rose-600";
};

function LivePresenceDot() {
	return (
		<span
			aria-hidden="true"
			className="relative flex size-2 shrink-0 items-center justify-center"
		>
			<span
				className="absolute inset-[1px] animate-ping rounded-full bg-emerald-600/45 delay-200 duration-300"
				data-slot="inbox-analytics-live-dot-pulse"
			/>
			<span
				className="relative size-1.5 rounded-full bg-emerald-600"
				data-slot="inbox-analytics-live-dot"
			/>
		</span>
	);
}

function LivePresenceValue({
	className,
	livePresence,
}: {
	className: string;
	livePresence: InboxAnalyticsLivePresence;
}) {
	if (livePresence.isLoading && livePresence.count === null) {
		return <Skeleton className="h-5 w-8" />;
	}

	return (
		<span
			aria-live="polite"
			className={className}
			data-slot="inbox-analytics-live-count"
		>
			{formatCount(livePresence.count)}
		</span>
	);
}

function InlineLivePresenceMetric({
	livePresence,
}: {
	livePresence: InboxAnalyticsLivePresence;
}) {
	return (
		<TooltipOnHover
			content={LIVE_PRESENCE_DESCRIPTION}
			delay={300}
			side="bottom"
		>
			<section
				aria-label="Live visitors"
				className="flex h-[42px] min-w-[150px] flex-1 cursor-help flex-col justify-between"
				data-slot="inbox-analytics-live-presence"
			>
				<p className="text-primary/60 text-xs">Live visitors</p>
				<div className="flex items-center justify-start gap-2">
					<LivePresenceDot />
					<LivePresenceValue
						className="font-semibold text-md text-primary"
						livePresence={livePresence}
					/>
				</div>
			</section>
		</TooltipOnHover>
	);
}

function InlineMetric({
	metric,
	isLoading,
}: {
	metric: MetricDisplay;
	isLoading: boolean;
}) {
	const value = metric.formatValue(metric.current);
	const suffix = metric.formatSuffix?.(metric.current) ?? null;
	const deltaClassName = getDeltaClassName(metric.trendPositive);

	return (
		<TooltipOnHover content={metric.description} delay={300} side="bottom">
			<div
				className="flex h-[42px] min-w-[150px] flex-1 cursor-help flex-col justify-between"
				data-slot="inbox-analytics-metric"
			>
				<p className="text-primary/60 text-xs">{metric.label}</p>
				<div className="flex items-center justify-start gap-2">
					{isLoading ? (
						<Skeleton className="h-5 w-16" />
					) : (
						<div className="flex items-baseline gap-1">
							<span className="font-semibold text-md text-primary">
								{value}
							</span>
							{suffix ? (
								<span className="text-muted-foreground text-xs">{suffix}</span>
							) : null}
						</div>
					)}
					{isLoading ? (
						<Skeleton className="h-4 w-10" />
					) : (
						<span
							className={cn("font-medium text-xs", deltaClassName)}
							data-slot="inbox-analytics-delta"
						>
							{metric.deltaLabel}
						</span>
					)}
				</div>
			</div>
		</TooltipOnHover>
	);
}

function SheetLivePresenceMetric({
	livePresence,
}: {
	livePresence: InboxAnalyticsLivePresence;
}) {
	return (
		<section
			aria-label="Live visitors"
			className="flex flex-col gap-2 overflow-hidden rounded-[10px] border bg-background-100/70 px-3 py-3"
			data-slot="inbox-analytics-live-presence"
		>
			<p className="text-primary/60 text-xs">Live visitors</p>
			<div className="flex items-center justify-start gap-2">
				<LivePresenceDot />
				<LivePresenceValue
					className="font-semibold text-lg text-primary"
					livePresence={livePresence}
				/>
			</div>
		</section>
	);
}

function SheetMetric({
	metric,
	isLoading,
}: {
	metric: MetricDisplay;
	isLoading: boolean;
}) {
	const value = metric.formatValue(metric.current);
	const suffix = metric.formatSuffix?.(metric.current) ?? null;
	const deltaClassName = getDeltaClassName(metric.trendPositive);

	return (
		<div className="flex flex-col gap-2 rounded-[10px] border bg-background-100/70 px-3 py-3">
			<div className="flex items-center justify-between gap-3">
				<p className="text-primary/60 text-xs">{metric.label}</p>
				{isLoading ? (
					<Skeleton className="h-4 w-10" />
				) : (
					<span className={cn("font-medium text-xs", deltaClassName)}>
						{metric.deltaLabel}
					</span>
				)}
			</div>
			{isLoading ? (
				<Skeleton className="h-6 w-24" />
			) : (
				<div className="flex items-baseline gap-1">
					<span className="font-semibold text-lg text-primary">{value}</span>
					{suffix ? (
						<span className="text-muted-foreground text-xs">{suffix}</span>
					) : null}
				</div>
			)}
		</div>
	);
}

type InboxAnalyticsRangeControlProps = {
	rangeDays: InboxAnalyticsRangeDays;
	onRangeChange: (rangeDays: InboxAnalyticsRangeDays) => void;
	size?: "default" | "sm";
	className?: string;
};

type InboxAnalyticsDesktopHeaderActionsProps = {
	rangeDays: InboxAnalyticsRangeDays;
	onRangeChange: (rangeDays: InboxAnalyticsRangeDays) => void;
	actionIconName: IconName;
	actionLabel: string;
	actionTooltip?: string;
	onActionClick: () => void;
	className?: string;
};

export function InboxAnalyticsRangeControl({
	rangeDays,
	onRangeChange,
	size = "sm",
	className,
}: InboxAnalyticsRangeControlProps) {
	const handleRangeChange = (nextValue: string) => {
		const parsed = Number(nextValue) as InboxAnalyticsRangeDays;

		if (INBOX_ANALYTICS_RANGES.includes(parsed)) {
			onRangeChange(parsed);
		}
	};

	return (
		<SegmentedControl
			aria-label="Analytics date range"
			className={className}
			onValueChange={handleRangeChange}
			options={rangeOptions}
			size={size}
			value={String(rangeDays)}
		/>
	);
}

export function InboxAnalyticsDesktopHeaderActions({
	rangeDays,
	onRangeChange,
	actionIconName,
	actionLabel,
	actionTooltip,
	onActionClick,
	className,
}: InboxAnalyticsDesktopHeaderActionsProps) {
	const sharedTriggerClassName = "size-7.5 rounded-[2px] border border-border";

	return (
		<div
			className={cn("hidden items-center gap-1.5 lg:flex", className)}
			data-action-icon={actionIconName}
			data-action-label={actionLabel}
			data-slot="inbox-analytics-desktop-header-actions"
		>
			<TooltipOnHover content={actionTooltip ?? actionLabel}>
				<Button
					className={sharedTriggerClassName}
					onClick={onActionClick}
					size="icon-small"
					type="button"
					variant="secondary"
				>
					<Icon name={actionIconName} />
					<span className="sr-only">{actionLabel}</span>
				</Button>
			</TooltipOnHover>
			<InboxAnalyticsRangeControl
				onRangeChange={onRangeChange}
				rangeDays={rangeDays}
				size="sm"
			/>
		</div>
	);
}

export function InboxAnalyticsDisplay({
	data,
	livePresence,
	rangeDays,
	onRangeChange,
	isLoading = false,
	isError = false,
	layout = "inline",
	controlSize = layout === "sheet" ? "default" : "sm",
	className,
	showControl = true,
}: InboxAnalyticsDisplayProps) {
	const metrics = useMemo(
		() =>
			metricConfigs.map((config) => {
				const current = data?.current?.[config.key] ?? null;
				const previous = data?.previous?.[config.key] ?? null;
				const delta = computeDelta(current, previous);
				const trendPositive =
					delta === null
						? null
						: config.higherIsBetter
							? delta >= 0
							: delta <= 0;
				const deltaLabel =
					delta === null ? "—" : `${delta > 0 ? "+" : ""}${Math.round(delta)}%`;

				return {
					...config,
					current,
					delta,
					deltaLabel,
					trendPositive,
				};
			}),
		[data]
	);

	return (
		<div
			className={cn(
				layout === "inline" ? "flex items-center gap-3" : "flex flex-col gap-4",
				className
			)}
			data-error={isError || undefined}
			data-layout={layout}
			data-slot="inbox-analytics-display"
		>
			{layout === "inline" ? (
				<>
					<div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pr-1">
						{livePresence ? (
							<InlineLivePresenceMetric livePresence={livePresence} />
						) : null}
						{metrics.map((metric) => (
							<InlineMetric
								isLoading={isLoading}
								key={metric.key}
								metric={metric}
							/>
						))}
					</div>
					{showControl ? (
						<InboxAnalyticsRangeControl
							className="shrink-0"
							onRangeChange={onRangeChange}
							rangeDays={rangeDays}
							size={controlSize}
						/>
					) : null}
				</>
			) : (
				<>
					{showControl ? (
						<InboxAnalyticsRangeControl
							onRangeChange={onRangeChange}
							rangeDays={rangeDays}
							size={controlSize}
						/>
					) : null}
					<div className="flex flex-col gap-3">
						{livePresence ? (
							<SheetLivePresenceMetric livePresence={livePresence} />
						) : null}
						{metrics.map((metric) => (
							<SheetMetric
								isLoading={isLoading}
								key={metric.key}
								metric={metric}
							/>
						))}
					</div>
				</>
			)}
		</div>
	);
}
