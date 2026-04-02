"use client";

import {
	PRESENCE_AWAY_WINDOW_MS,
	PRESENCE_ONLINE_WINDOW_MS,
} from "@plasma/types";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { Facehash as FacehashComponent } from "facehash";
import type * as React from "react";
import { useEffect, useState } from "react";
import { formatTimeAgo } from "@/lib/date";
import { COSSISTANT_FACEHASH_COLOR_CLASSES } from "@/lib/facehash-palette";
import { cn } from "@/lib/utils";
import { TooltipOnHover } from "./tooltip";

function AvatarContainer({
	className,
	...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
	return (
		<AvatarPrimitive.Root
			className={cn(
				"relative flex size-8 shrink-0 overflow-hidden rounded",
				className
			)}
			data-slot="avatar"
			{...props}
		/>
	);
}

function AvatarImage({
	className,
	...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
	return (
		<AvatarPrimitive.Image
			className={cn("aspect-square size-full", className)}
			data-slot="avatar-image"
			{...props}
		/>
	);
}

interface AvatarFallbackProps
	extends React.ComponentProps<typeof AvatarPrimitive.Fallback> {
	value?: string | null;
	children?: string;
}

function getNonEmptyString(value: string | null | undefined): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const trimmedValue = value.trim();
	return trimmedValue.length > 0 ? trimmedValue : null;
}

function Facehash({
	className,
	name,
	interactive = true,
	onRenderMouth,
}: {
	className?: string;
	name: string;
	interactive?: boolean;
	onRenderMouth?: () => React.ReactNode;
}) {
	return (
		<FacehashComponent
			className={cn(className)}
			colorClasses={COSSISTANT_FACEHASH_COLOR_CLASSES}
			enableBlink
			intensity3d="dramatic"
			interactive={interactive}
			name={name}
			onRenderMouth={onRenderMouth}
			size="100%"
			style={{
				color: "#000000",
			}}
		/>
	);
}

function AvatarFallback({
	className,
	value,
	children,
	...props
}: AvatarFallbackProps) {
	const facehashName =
		getNonEmptyString(value) ?? getNonEmptyString(children) ?? "avatar";

	return (
		<AvatarPrimitive.Fallback
			className={cn(
				"flex size-full items-center justify-center text-black dark:text-black",
				className
			)}
			data-slot="avatar-fallback"
			{...props}
		>
			<Facehash name={facehashName} />
		</AvatarPrimitive.Fallback>
	);
}

type AvatarPresenceStatus = "online" | "away";

function resolveAvatarPresenceStatus({
	lastOnlineAt,
	nowMs,
	status,
}: {
	lastOnlineAt?: string | null;
	nowMs?: number;
	status?: AvatarPresenceStatus;
}): AvatarPresenceStatus | null {
	if (status === "online" || status === "away") {
		return status;
	}

	if (!lastOnlineAt || nowMs === undefined) {
		return null;
	}

	const lastOnlineTime = Date.parse(lastOnlineAt);
	if (Number.isNaN(lastOnlineTime)) {
		return null;
	}

	if (lastOnlineTime >= nowMs - PRESENCE_ONLINE_WINDOW_MS) {
		return "online";
	}

	if (lastOnlineTime >= nowMs - PRESENCE_AWAY_WINDOW_MS) {
		return "away";
	}

	return null;
}

function getDefaultTooltipContent({
	allowRelativeTime,
	fallbackName,
	lastOnlineDate,
	presenceStatus,
}: {
	allowRelativeTime: boolean;
	fallbackName: string;
	lastOnlineDate: Date | null;
	presenceStatus: AvatarPresenceStatus | null;
}): string | null {
	if (!lastOnlineDate) {
		return null;
	}

	const awayWindowMinutes = Math.round(PRESENCE_AWAY_WINDOW_MS / 60_000);

	if (presenceStatus === "online") {
		return `${fallbackName} is online`;
	}

	if (presenceStatus === "away") {
		return `${fallbackName} last seen less than ${awayWindowMinutes} minutes ago`;
	}

	if (!allowRelativeTime) {
		return null;
	}

	return `${fallbackName} last seen ${formatTimeAgo(lastOnlineDate)}`;
}

function Avatar({
	className,
	url,
	fallbackName,
	facehashSeed,
	lastOnlineAt,
	status,
	tooltipContent,
}: {
	className?: string;
	url: string | null | undefined;
	fallbackName: string;
	facehashSeed?: string;
	lastOnlineAt?: string | null;
	status?: "online" | "away";
	tooltipContent?: React.ReactNode | null;
}) {
	const [hasHydrated, setHasHydrated] = useState(false);
	const lastOnlineTime = lastOnlineAt ? Date.parse(lastOnlineAt) : Number.NaN;
	const lastOnlineDate = Number.isNaN(lastOnlineTime)
		? null
		: new Date(lastOnlineTime);
	const hasExplicitStatus = status === "online" || status === "away";

	useEffect(() => {
		setHasHydrated(true);
	}, []);

	const computedStatus = resolveAvatarPresenceStatus({
		lastOnlineAt,
		nowMs: hasHydrated ? Date.now() : undefined,
		status,
	});
	const isOnline = computedStatus === "online";
	const isAway = computedStatus === "away";
	const defaultTooltipContent = getDefaultTooltipContent({
		allowRelativeTime: hasHydrated || hasExplicitStatus,
		fallbackName,
		lastOnlineDate,
		presenceStatus: computedStatus,
	});
	const resolvedTooltipContent =
		tooltipContent === undefined ? defaultTooltipContent : tooltipContent;

	return (
		<TooltipOnHover content={resolvedTooltipContent}>
			<div className="relative inline-flex w-fit" data-slot="avatar-wrapper">
				<AvatarContainer
					className={cn(
						"size-8 shrink-0 ring-1 ring-border ring-offset-1 ring-offset-background",
						className
					)}
				>
					{url && <AvatarImage alt={fallbackName} src={url} />}
					<AvatarFallback
						className="pointer-events-none"
						value={facehashSeed ?? fallbackName}
					>
						{fallbackName}
					</AvatarFallback>
				</AvatarContainer>
				{(isOnline || isAway) && (
					<div
						className={cn(
							"-right-1 absolute bottom-0.5 hidden size-[5px] rounded-full ring-2 ring-background",
							{
								"block bg-plasma-green": isOnline,
								"block bg-plasma-orange": isAway,
							}
						)}
						data-slot="avatar-presence"
					/>
				)}
			</div>
		</TooltipOnHover>
	);
}

export { AvatarContainer, AvatarImage, AvatarFallback, Avatar, Facehash };
