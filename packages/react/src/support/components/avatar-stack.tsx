import type { AvailableAIAgent, AvailableHumanAgent } from "@plasma/types";
import type { ReactElement, ReactNode } from "react";
import { useRenderElement } from "../../utils/use-render-element";
import { useSupportText } from "../text";
import { cn } from "../utils";
import { resolveSupportHumanAgentDisplay } from "../utils/human-agent-display";
import { Avatar } from "./avatar";

type AvatarStackProps = {
	humanAgents: AvailableHumanAgent[];
	aiAgents: AvailableAIAgent[];
	hideBranding?: boolean;
	hideDefaultAIAgent?: boolean;
	className?: string;
	/** Size of avatars (default: 44px) */
	size?: number;
	/** Space between avatars (default: 28px) */
	spacing?: number;
	/** Gap width between avatars (default: 2px) */
	gapWidth?: number;
};

/**
 * Creates an SVG mask with a rounded rectangle cutout on the left side.
 * This respects the border radius of the avatars.
 */
function createRoundedCutoutMask(
	size: number,
	cutoutWidth: number,
	borderRadius: number
): string {
	// SVG mask: white = visible, black = hidden
	// We create a white rectangle (full size) and subtract a rounded rect on the left
	// The cutout rect is extended beyond top/bottom bounds so only the right-side curve is visible
	const extension = borderRadius * 0.15;
	const svg = `
		<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
			<defs>
				<mask id="m">
					<rect width="${size}" height="${size}" fill="white"/>
					<rect x="${-size + cutoutWidth}" y="${-extension}" width="${size}" height="${size + extension * 2}" rx="${borderRadius}" ry="${borderRadius}" fill="black"/>
				</mask>
			</defs>
			<rect width="${size}" height="${size}" fill="white" mask="url(#m)"/>
		</svg>
	`.replace(/\s+/g, " ");

	return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export const AvatarStackItem = ({
	children,
	index,
	size = 44,
	spacing = 32,
	gapWidth = 1,
	className,
}: {
	children: ReactNode;
	index: number;
	size?: number;
	spacing?: number;
	gapWidth?: number;
	className?: string;
}): ReactElement | null => {
	const isFirst = index === 0;

	// Calculate mask for squared avatars with rounded corners
	// The mask creates a cutout on the left side where the previous avatar overlaps
	const cutoutWidth = size - spacing + gapWidth;
	const borderRadius = 4; // Match the 4px border radius used on avatars

	const maskImage = createRoundedCutoutMask(size, cutoutWidth, borderRadius);

	return useRenderElement(
		"div",
		{ className },
		{
			props: {
				className: cn(
					"relative grid place-items-center",
					!isFirst && "[mask-repeat:no-repeat] [mask-size:100%_100%]"
				),
				style: {
					width: `${size}px`,
					height: `${size}px`,
					// Apply mask only to non-first items - uses SVG for rounded cutout
					...(isFirst
						? {}
						: {
								maskImage,
								WebkitMaskImage: maskImage,
							}),
				},
				children,
			},
		}
	);
};

/**
 * Displays a compact row of agent avatars with optional branding and overflow
 * counts.
 */
export function AvatarStack({
	humanAgents,
	aiAgents,
	hideBranding = false,
	hideDefaultAIAgent = true,
	className,
	size = 44,
	spacing = 36,
	gapWidth = 3,
}: AvatarStackProps): ReactElement | null {
	const text = useSupportText();
	const supportFallbackName = text("common.fallbacks.supportTeam");
	const displayedHumanAgents = humanAgents.slice(0, 2);
	const remainingHumanAgentsCount = Math.max(0, humanAgents.length - 2);

	// Create array of all items to display
	const items = [
		...displayedHumanAgents.map((agent) => ({
			type: "human" as const,
			agent,
		})),
		...(remainingHumanAgentsCount > 0
			? [
					{
						type: "count" as const,
						count: remainingHumanAgentsCount,
					},
				]
			: []),
		...(hideDefaultAIAgent
			? []
			: [
					{
						type: "ai" as const,
						agent: aiAgents[0],
					},
				]),
	];

	return useRenderElement(
		"div",
		{ className },
		{
			props: {
				className: "inline-grid items-center",
				style: {
					gridTemplateColumns: `repeat(${items.length}, ${spacing}px)`,
				},
				children: items.map((item, index) => (
					<AvatarStackItem
						gapWidth={gapWidth}
						index={index}
						key={`avatar-${index}`}
						size={size}
						spacing={spacing}
					>
						{item.type === "human" &&
							(() => {
								const humanDisplay = resolveSupportHumanAgentDisplay(
									item.agent,
									supportFallbackName
								);

								return (
									<Avatar
										className={cn("size-full")}
										facehashSeed={humanDisplay.facehashSeed}
										image={item.agent.image}
										lastSeenAt={item.agent.lastSeenAt}
										name={humanDisplay.displayName}
									/>
								);
							})()}
						{item.type === "count" && (
							<div className="flex size-full items-center justify-center rounded bg-co-background-200 font-medium text-co-primary text-sm ring-1 ring-co-border/30 dark:bg-co-background-500">
								+{item.count}
							</div>
						)}
						{item.type === "ai" && (
							<Avatar
								className="z-0 size-full"
								image={item.agent?.image}
								isAI
								name={item.agent?.name || "AI"}
								showBackground
							/>
						)}
					</AvatarStackItem>
				)),
			},
		}
	);
}
