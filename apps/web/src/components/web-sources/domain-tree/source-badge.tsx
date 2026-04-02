"use client";

import type { LinkSourceResponse } from "@plasma/types";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

type SourceBadgeProps = {
	status: LinkSourceResponse["status"];
	className?: string;
};

const statusConfig: Record<
	LinkSourceResponse["status"],
	{
		label: string;
		variant: "secondary" | "destructive";
		color: string;
	}
> = {
	pending: {
		label: "Pending",
		variant: "secondary",
		color: "text-muted-foreground",
	},
	mapping: {
		label: "Mapping...",
		variant: "secondary",
		color: "text-blue-500",
	},
	crawling: {
		label: "Crawling...",
		variant: "secondary",
		color: "text-blue-500",
	},
	completed: {
		label: "Completed",
		variant: "secondary",
		color: "text-green-500",
	},
	failed: {
		label: "Failed",
		variant: "destructive",
		color: "text-destructive",
	},
};

export function SourceStatusBadge({ status, className }: SourceBadgeProps) {
	const config = statusConfig[status];
	const isActive =
		status === "crawling" || status === "mapping" || status === "pending";

	return (
		<Badge
			className={`${config.color} ${className ?? ""}`}
			variant={config.variant}
		>
			{isActive && <Spinner className="-ml-1 mr-1 size-2" />}
			{config.label}
		</Badge>
	);
}

type SourceIndicatorProps = {
	sourceUrl: string;
	className?: string;
};

/**
 * Small indicator showing which source a page came from
 * Displayed on hover to help users understand page origin
 */
export function SourceIndicator({
	sourceUrl,
	className,
}: SourceIndicatorProps) {
	// Extract just the path from the source URL for display
	let displayPath = sourceUrl;
	try {
		const url = new URL(sourceUrl);
		displayPath = url.pathname || "/";
	} catch {
		// Keep original
	}

	return (
		<span
			className={`text-[10px] text-muted-foreground/60 ${className ?? ""}`}
			title={`From crawl: ${sourceUrl}`}
		>
			via {displayPath}
		</span>
	);
}
