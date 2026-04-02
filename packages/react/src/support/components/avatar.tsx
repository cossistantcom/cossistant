import { Facehash } from "facehash";
import type { ReactElement } from "react";

import {
	AvatarFallback,
	AvatarImage,
	Avatar as AvatarPrimitive,
} from "../../primitives/avatar";
import { cn } from "../utils";
import { PlasmaLogo } from "./plasma-branding";
import { getAgentStatus, OnlineIndicator } from "./online-indicator";

/**
 * Default Cossistant theme colors for avatar fallbacks.
 * These use the Tailwind classes defined in support.css.
 */
const DEFAULT_AVATAR_COLORS = [
	"bg-co-pink",
	"bg-co-blue",
	"bg-co-yellow",
	"bg-co-orange",
];

type AvatarProps = {
	className?: string;
	image?: string | null;
	name: string;
	facehashSeed?: string;
	/** Whether this avatar is for an AI agent */
	isAI?: boolean;
	/** Whether to show the background circle (default: true) */
	showBackground?: boolean;
	/**
	 * Tailwind class array for Facehash background colors.
	 * Defaults to Cossistant theme colors (pink, blue, yellow, orange).
	 * @example ["bg-pink-500", "bg-blue-500", "bg-green-500"]
	 */
	colorClasses?: string[];
	/**
	 * Last seen timestamp for the agent. When provided, shows a status indicator:
	 * - Green (online): seen within last 15 minutes
	 * - Orange (away): seen within last hour
	 * Only shown for non-AI agents.
	 */
	lastSeenAt?: string | null;
	/**
	 * Size of the online indicator in pixels.
	 * Defaults to 6px.
	 */
	indicatorSize?: number;
};

/**
 * Renders a squared avatar with graceful fallbacks using Facehash when no
 * image is available. Features rounded corners and a subtle ring border.
 *
 * For AI agents without an image, displays the Cossistant logo without
 * a background.
 */
export function Avatar({
	className,
	image,
	name,
	facehashSeed,
	isAI = false,
	showBackground = true,
	colorClasses = DEFAULT_AVATAR_COLORS,
	lastSeenAt,
	indicatorSize = 6,
}: AvatarProps): ReactElement {
	const agentStatus = isAI ? "offline" : getAgentStatus(lastSeenAt);
	const resolvedFacehashSeed = facehashSeed?.trim() || name.trim() || "avatar";

	// AI agent without image: show just the logo (no avatar wrapper)
	// Unless showBackground is true (e.g. in avatar stack), then wrap in a box
	if (isAI && !image) {
		if (showBackground) {
			return (
				<div
					className={cn(
						"flex items-center justify-center rounded bg-co-background-200 ring-1 ring-co-border/30 dark:bg-co-background-500",
						className
					)}
				>
					<PlasmaLogo className="h-1/2 w-1/2" />
				</div>
			);
		}
		return <PlasmaLogo className={cn("h-full w-full", className)} />;
	}

	// AI agent with image: show image in a square
	if (isAI && image) {
		return (
			<AvatarPrimitive
				className={cn(
					"flex size-9 items-center justify-center overflow-clip rounded bg-co-background-200 ring-1 ring-co-border/30 dark:bg-co-background-500",
					className
				)}
			>
				<AvatarImage alt={name} src={image} />
				<AvatarFallback className="size-full">
					<Facehash
						className="size-full text-black"
						colorClasses={colorClasses}
						interactive={false}
						name={resolvedFacehashSeed}
						showInitial={false}
						size="100%"
					/>
				</AvatarFallback>
			</AvatarPrimitive>
		);
	}

	return (
		<div className={cn("relative", className)}>
			<AvatarPrimitive
				className={cn(
					"flex size-full items-center justify-center overflow-clip rounded bg-co-background-200 ring-1 ring-co-border/30 dark:bg-co-background-500"
				)}
			>
				{image && image.trim() !== "" && <AvatarImage alt={name} src={image} />}
				<AvatarFallback className="size-full">
					<Facehash
						className="size-full text-black"
						colorClasses={colorClasses}
						interactive={false}
						name={resolvedFacehashSeed}
						showInitial={false}
						size="100%"
					/>
				</AvatarFallback>
			</AvatarPrimitive>
			<OnlineIndicator
				className="-bottom-0.5 -right-0.5 z-10"
				size={indicatorSize}
				status={agentStatus}
			/>
		</div>
	);
}
