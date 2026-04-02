"use client";

import type { VisitorAttribution } from "@plasma/types";
import { Globe } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { getVisitorAttributionDisplay } from "@/lib/visitor-attribution";

export function VisitorSourceBadge({
	attribution,
	className,
	includeDirect = false,
	prependText = "",
}: {
	attribution: VisitorAttribution | null | undefined;
	className?: string;
	includeDirect?: boolean;
	prependText?: string;
}) {
	const [imageFailed, setImageFailed] = useState(false);
	const display = getVisitorAttributionDisplay(attribution);

	if (!display.sourceLabel) {
		return null;
	}

	if (display.isDirect && !includeDirect) {
		return null;
	}

	const showFavicon = Boolean(display.faviconUrl && !imageFailed);

	return (
		<span
			className={cn(
				"inline-flex max-w-full items-center gap-1.5 text-primary",
				className
			)}
			data-slot="visitor-source-badge"
			title={display.sourceUrl ?? display.sourceLabel}
		>
			{prependText ? (
				<span className="text-primary/50">{prependText}</span>
			) : null}
			{showFavicon ? (
				// biome-ignore lint/a11y/noNoninteractiveElementInteractions: passive image error handling keeps the fallback internal to the badge.
				// biome-ignore lint/performance/noImgElement: referrer favicons come from arbitrary third-party domains and should not require next/image configuration.
				<img
					alt=""
					className="size-3 shrink-0 rounded-[2px]"
					data-slot="visitor-source-badge-favicon"
					height={16}
					onError={() => setImageFailed(true)}
					src={display.faviconUrl ?? undefined}
					width={16}
				/>
			) : (
				<Globe
					className="size-2 shrink-0 text-primary/50"
					data-slot="visitor-source-badge-fallback"
				/>
			)}
			<span className="truncate">{display.sourceLabel}</span>
		</span>
	);
}
