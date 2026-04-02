"use client";

import Image from "next/image";
import type { CSSProperties, KeyboardEvent } from "react";
import { useRef, useState } from "react";
import { BrowserShell } from "@/components/showcase/browser-shell";
import {
	StaticWidgetBubble,
	WidgetShell,
} from "@/components/showcase/widget-shell";
import { cn } from "@/lib/utils";

export type ScreenshotFrameItem = {
	src: string;
	alt: string;
	legend?: string;
	type?: "browser" | "widget";
	position?: "centered" | "bottom";
	zoomLevel?: number;
	xOffsetRatio?: number;
	yOffsetRatio?: number;
	browserUrl?: string;
};

export type ScreenshotFrameProps = {
	type: "browser" | "widget";
	items: ScreenshotFrameItem[];
	backgroundColor?: string;
	backgroundImageSrc?: string;
	strictContainerWidth?: boolean;
	className?: string;
};

const BREAKOUT_WIDTH_CLASSNAME =
	"2xl:relative 2xl:left-1/2 2xl:w-[min(calc(100%+360px),calc(100vw-2rem))] 2xl:max-w-none 2xl:-translate-x-1/2";
const SHARP_RADIUS_CLASSNAME = "rounded-[2px]";

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

export function getScreenshotFrameWidthClassName(strictContainerWidth = false) {
	return strictContainerWidth
		? "w-full"
		: cn("w-full", BREAKOUT_WIDTH_CLASSNAME);
}

export function getScreenshotMediaStyle(
	item: ScreenshotFrameItem
): CSSProperties {
	const zoomLevel = Math.max(item.zoomLevel ?? 1, 1);
	const baseY = item.position === "bottom" ? 100 : 50;
	const xOffsetRatio = clamp(item.xOffsetRatio ?? 0, -1, 1);
	const yOffsetRatio = clamp(item.yOffsetRatio ?? 0, -1, 1);
	const xPosition = clamp(50 + xOffsetRatio * 50, 0, 100);
	const yPosition = clamp(baseY + yOffsetRatio * 50, 0, 100);

	return {
		objectPosition: `${xPosition}% ${yPosition}%`,
		transform: `scale(${zoomLevel})`,
		transformOrigin: "center",
	};
}

function ScreenshotMedia({
	item,
	className,
	onLoad,
}: {
	item: ScreenshotFrameItem;
	className?: string;
	onLoad?: (aspectRatio: number) => void;
}) {
	if (!item.src) {
		return (
			<div
				className={cn(
					"absolute inset-0 flex items-center justify-center text-center",
					className
				)}
				data-slot="screenshot-frame-media-placeholder"
			>
				<span
					className={cn(
						SHARP_RADIUS_CLASSNAME,
						"border border-primary/15 border-dashed px-4 py-2 font-medium text-muted-foreground text-sm"
					)}
				>
					Replace screenshot
				</span>
			</div>
		);
	}

	return (
		<Image
			alt={item.alt}
			className={cn(
				"absolute inset-0 h-full w-full object-cover transition-[transform,object-position] duration-300 ease-out",
				className
			)}
			data-slot="screenshot-frame-media"
			draggable={false}
			fill
			onLoad={(event) => {
				const element = event.currentTarget;
				if (!(element.naturalWidth && element.naturalHeight)) {
					return;
				}

				onLoad?.(element.naturalWidth / element.naturalHeight);
			}}
			sizes="(max-width: 768px) calc(100vw - 2rem), (max-width: 1536px) 42rem, min(100vw - 2rem, 80rem)"
			src={item.src}
			style={getScreenshotMediaStyle(item)}
		/>
	);
}

function BrowserSlide({
	item,
	mediaAspectRatio,
	onMediaLoad,
}: {
	item: ScreenshotFrameItem;
	mediaAspectRatio?: number;
	onMediaLoad?: (aspectRatio: number) => void;
}) {
	return (
		<div
			className="flex h-full w-full items-center"
			data-slot="screenshot-frame-browser-slide"
		>
			<BrowserShell
				chromeUrl={item.browserUrl}
				className={cn("w-full overflow-hidden rounded-md")}
				contentClassName="flex-none"
			>
				<div
					className="relative w-full overflow-hidden bg-background-50"
					data-slot="screenshot-frame-browser-viewport"
					style={{ aspectRatio: mediaAspectRatio ?? 16 / 10 }}
				>
					<ScreenshotMedia item={item} onLoad={onMediaLoad} />
				</div>
			</BrowserShell>
		</div>
	);
}

function WidgetSlide({ item }: { item: ScreenshotFrameItem }) {
	return (
		<div
			className="flex h-full w-full items-center justify-center px-2 py-3 sm:px-6 sm:py-4"
			data-slot="screenshot-frame-widget-slide"
		>
			<div className="w-full max-w-[420px]">
				<WidgetShell
					bubble={
						<StaticWidgetBubble
							className={cn(SHARP_RADIUS_CLASSNAME, "opacity-85")}
						/>
					}
					className="w-full"
					frameClassName={cn(SHARP_RADIUS_CLASSNAME, "aspect-[21/31] w-full")}
				>
					<div className="absolute inset-x-0 top-0 z-10 flex h-18 items-center justify-between bg-background px-4">
						<div
							className={cn(
								SHARP_RADIUS_CLASSNAME,
								"h-2.5 w-[72px] bg-foreground/8"
							)}
						/>
						<div className="flex items-center gap-2">
							<div
								className={cn(
									SHARP_RADIUS_CLASSNAME,
									"size-2.5 bg-foreground/10"
								)}
							/>
							<div
								className={cn(SHARP_RADIUS_CLASSNAME, "size-8 bg-foreground/6")}
							/>
						</div>
					</div>
					<div className="flex h-full flex-col gap-3 p-3 pt-20">
						<div
							className={cn(
								SHARP_RADIUS_CLASSNAME,
								"relative min-h-0 flex-1 overflow-hidden border border-co-border/60 bg-co-background-100"
							)}
							data-slot="screenshot-frame-widget-viewport"
						>
							<ScreenshotMedia item={item} />
						</div>
						<div
							className={cn(
								SHARP_RADIUS_CLASSNAME,
								"border border-co-border/70 bg-co-background-100 p-3 shadow-sm"
							)}
						>
							<div
								className={cn(
									SHARP_RADIUS_CLASSNAME,
									"h-12 bg-co-background-200/85"
								)}
							/>
						</div>
					</div>
				</WidgetShell>
			</div>
		</div>
	);
}

export function ScreenshotFrame({
	type,
	items,
	backgroundColor,
	backgroundImageSrc,
	strictContainerWidth = false,
	className,
}: ScreenshotFrameProps) {
	const [activeIndex, setActiveIndex] = useState(0);
	const [mediaAspectRatios, setMediaAspectRatios] = useState<
		Record<string, number>
	>({});
	const activeItem =
		items[clamp(activeIndex, 0, Math.max(items.length - 1, 0))];
	const activeType = activeItem?.type ?? type;
	const activeMediaAspectRatio = activeItem?.src
		? mediaAspectRatios[activeItem.src]
		: undefined;
	const hasLegends = items.some((item) => item.legend?.trim());
	const triggerRefs = useRef<Array<HTMLButtonElement | null>>([]);

	if (!activeItem) {
		return null;
	}

	const handleSelect = (index: number) => {
		setActiveIndex(clamp(index, 0, items.length - 1));
	};

	const handleMediaLoad = (src: string, aspectRatio: number) => {
		setMediaAspectRatios((current) => {
			if (!src || current[src] === aspectRatio) {
				return current;
			}

			return {
				...current,
				[src]: aspectRatio,
			};
		});
	};

	const handleKeyDown = (
		event: KeyboardEvent<HTMLButtonElement>,
		index: number
	) => {
		if (items.length <= 1) {
			return;
		}

		const isNextKey = event.key === "ArrowRight" || event.key === "ArrowDown";
		const isPreviousKey = event.key === "ArrowLeft" || event.key === "ArrowUp";

		if (!(isNextKey || isPreviousKey)) {
			return;
		}

		event.preventDefault();

		const nextIndex = isNextKey
			? (index + 1) % items.length
			: (index - 1 + items.length) % items.length;

		handleSelect(nextIndex);
		triggerRefs.current[nextIndex]?.focus();
	};

	return (
		<div
			className={cn(
				"not-prose my-10",
				getScreenshotFrameWidthClassName(strictContainerWidth),
				className
			)}
			data-breakout={!strictContainerWidth}
			data-slot="screenshot-frame"
			data-type={activeType}
		>
			<figure
				className={cn(
					SHARP_RADIUS_CLASSNAME,
					"relative overflow-hidden border border-dashed bg-background-200 px-3 py-3 sm:px-4 sm:py-4 md:px-5 md:py-5 dark:bg-background-400"
				)}
				style={{ backgroundColor }}
			>
				{backgroundImageSrc ? (
					<div
						aria-hidden="true"
						className="absolute inset-0 bg-center bg-cover opacity-[0.22] mix-blend-soft-light"
						style={{ backgroundImage: `url("${backgroundImageSrc}")` }}
					/>
				) : null}
				<div
					aria-hidden="true"
					className={cn(
						SHARP_RADIUS_CLASSNAME,
						"absolute inset-x-[14%] top-[12%] h-[58%]"
					)}
				/>

				<div className="relative z-10">
					<div
						className="relative aspect-[16/10] w-full"
						data-slot="screenshot-frame-stage"
					>
						<div className="absolute inset-0">
							{activeType === "browser" ? (
								<div className="dark">
									<BrowserSlide
										item={activeItem}
										mediaAspectRatio={activeMediaAspectRatio}
										onMediaLoad={(aspectRatio) =>
											handleMediaLoad(activeItem.src, aspectRatio)
										}
									/>
								</div>
							) : (
								<WidgetSlide item={activeItem} />
							)}
						</div>
					</div>
					{items.length > 1 ? (
						<div className="mt-5 flex justify-center">
							<fieldset
								className={cn(
									SHARP_RADIUS_CLASSNAME,
									"inline-flex items-center gap-2",
									hasLegends ? "flex-wrap justify-center" : ""
								)}
								data-has-legends={hasLegends}
								data-slot="screenshot-frame-navigation"
							>
								<legend className="sr-only">
									Screenshot gallery navigation
								</legend>
								{items.map((item, index) => {
									const isActive = index === activeIndex;
									const label =
										item.legend?.trim() || `Screenshot ${index + 1}`;

									return (
										<button
											aria-current={isActive ? "true" : undefined}
											aria-label={label}
											aria-pressed={isActive}
											className={cn(
												SHARP_RADIUS_CLASSNAME,
												"inline-flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/60",
												hasLegends
													? cn(
															"gap-2 px-3 py-2 font-medium text-sm",
															isActive
																? "text-foreground"
																: "text-muted-foreground hover:text-foreground"
														)
													: null
											)}
											key={`${item.src}-${index}`}
											onClick={() => handleSelect(index)}
											onKeyDown={(event) => handleKeyDown(event, index)}
											ref={(node) => {
												triggerRefs.current[index] = node;
											}}
											type="button"
										>
											<span
												className={cn(
													SHARP_RADIUS_CLASSNAME,
													"size-2.5 bg-primary/20 transition-colors",
													isActive && "bg-plasma-orange"
												)}
											/>
											{hasLegends ? <span>{label}</span> : null}
										</button>
									);
								})}
							</fieldset>
						</div>
					) : null}
					<div aria-live="polite" className="sr-only">
						{activeItem.alt}
					</div>
				</div>
			</figure>
		</div>
	);
}
