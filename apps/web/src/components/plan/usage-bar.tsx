import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

// FeatureValue can be boolean, number, or null
// - true means unlimited (converted to null)
// - false means disabled (converted to 0)
// - number is the actual limit
// - null means unlimited
type FeatureLimit = number | boolean | null;

function normalizeLimit(limit: FeatureLimit): number | null {
	if (limit === true || limit === null) {
		return null; // unlimited
	}
	if (limit === false) {
		return 0; // disabled
	}
	return limit;
}

type UsageBarProps = {
	label: string;
	current: number;
	limit: FeatureLimit;
	showBar?: boolean;
	formatValue?: (current: number, limit: number | null) => string;
};

function formatUsage(current: number, limit: number | null): string {
	if (limit === null) {
		return `${current.toLocaleString()} / Unlimited`;
	}

	return `${current.toLocaleString()} / ${limit.toLocaleString()}`;
}

function getUsagePercentage(current: number, limit: number | null): number {
	if (limit === null || limit === 0) {
		return 0;
	}

	return Math.min(100, (current / limit) * 100);
}

const segmentedBarStyle = {
	"--usage-bar-segment-width": "2px",
	"--usage-bar-segment-gap": "3px",
	"--usage-bar-segment-repeat":
		"calc(var(--usage-bar-segment-width) + var(--usage-bar-segment-gap))",
	"--usage-bar-min-fill": "var(--usage-bar-segment-width)",
} as CSSProperties;

const segmentedBarBackground =
	"repeating-linear-gradient(90deg, currentColor 0 var(--usage-bar-segment-width), currentColor var(--usage-bar-segment-width), transparent var(--usage-bar-segment-width), transparent var(--usage-bar-segment-repeat))";

export function UsageBar({
	label,
	current,
	limit: rawLimit,
	showBar = true,
	formatValue = formatUsage,
}: UsageBarProps) {
	const limit = normalizeLimit(rawLimit);
	const percentage = getUsagePercentage(current, limit);
	const isAtLimit = limit !== null && current >= limit;
	const hasFiniteLimit = limit !== null && limit > 0;
	const hasVisibleProgress = hasFiniteLimit && current > 0;
	const fillWidth = hasVisibleProgress
		? `max(${percentage}%, var(--usage-bar-min-fill))`
		: "0%";
	const progressValue = hasFiniteLimit ? Math.min(current, limit) : undefined;
	const meterClasses =
		"relative h-3.5 w-full overflow-hidden rounded-[2px] bg-background-200/80 dark:bg-background-800";

	return (
		<div>
			<div className="mb-2 flex items-center justify-between text-sm">
				<span
					className={cn("font-medium", isAtLimit && "text-plasma-orange")}
				>
					{label}
				</span>
				<span
					className={cn(
						"text-primary/60",
						isAtLimit && "text-plasma-orange"
					)}
				>
					{formatValue(current, limit)}
				</span>
			</div>
			{showBar &&
				limit !== null &&
				(hasFiniteLimit ? (
					<div
						aria-label={`${label} usage`}
						aria-valuemax={limit}
						aria-valuemin={0}
						aria-valuenow={progressValue}
						aria-valuetext={formatValue(current, limit)}
						className={meterClasses}
						data-slot="usage-bar-meter"
						role="progressbar"
						style={segmentedBarStyle}
					>
						<div
							aria-hidden="true"
							className="absolute inset-0 text-primary/12 dark:text-primary/20"
							data-slot="usage-bar-track"
							style={{ backgroundImage: segmentedBarBackground }}
						/>
						<div
							aria-hidden="true"
							className="absolute inset-y-0 left-0 overflow-hidden transition-[width] duration-300 ease-out"
							data-slot="usage-bar-fill"
							style={{ width: fillWidth }}
						>
							<div
								className={cn(
									"absolute inset-0",
									isAtLimit ? "text-plasma-orange" : "text-plasma-blue"
								)}
								style={{ backgroundImage: segmentedBarBackground }}
							/>
						</div>
					</div>
				) : (
					<div
						className={meterClasses}
						data-slot="usage-bar-meter"
						style={segmentedBarStyle}
					>
						<div
							aria-hidden="true"
							className="absolute inset-0 text-primary/12 dark:text-primary/20"
							data-slot="usage-bar-track"
							style={{ backgroundImage: segmentedBarBackground }}
						/>
						<div
							aria-hidden="true"
							className="absolute inset-y-0 left-0 overflow-hidden transition-[width] duration-300 ease-out"
							data-slot="usage-bar-fill"
							style={{ width: fillWidth }}
						>
							<div
								className={cn(
									"absolute inset-0",
									isAtLimit ? "text-plasma-orange" : "text-plasma-blue"
								)}
								style={{ backgroundImage: segmentedBarBackground }}
							/>
						</div>
					</div>
				))}
		</div>
	);
}
