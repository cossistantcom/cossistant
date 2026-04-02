import { formatFileSize } from "@plasma/core";
import {
	extractFileParts,
	extractImageParts,
	hasExpandedTimelineContent,
	TimelineItem as PrimitiveTimelineItem,
	TimelineItemContent,
	type TimelineItemContentMarkdownRenderers,
	TimelineItemTimestamp,
} from "@plasma/next/primitives";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import type React from "react";
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import Icon from "@/components/ui/icons";
import { TooltipOnHover } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TimelineCodeBlock } from "./timeline-code-block";
import { TimelineCommandBlock } from "./timeline-command-block";

export type TimelineMessageItemProps = {
	item: TimelineItem;
	isLast?: boolean;
	isSentByViewer?: boolean;
};

function usesExpandedMessageLayout(text: string | null | undefined): boolean {
	return hasExpandedTimelineContent(text);
}

export function getDashboardMessageContainerWidthClasses(
	text: string | null | undefined
): string {
	return usesExpandedMessageLayout(text)
		? "w-full max-w-full"
		: "w-fit max-w-full";
}

export function getDashboardMessageBubbleWidthClasses(
	text: string | null | undefined
): string {
	return usesExpandedMessageLayout(text)
		? "w-full max-w-full md:max-w-full"
		: "w-fit max-w-full md:max-w-[420px]";
}

export function TimelineMessageItem({
	item,
	isLast = false,
	isSentByViewer = false,
}: TimelineMessageItemProps) {
	const [lightboxOpen, setLightboxOpen] = useState(false);
	const [lightboxIndex, setLightboxIndex] = useState(0);

	// Extract image and file parts
	const images = extractImageParts(item.parts);
	const files = extractFileParts(item.parts);
	const hasAttachments = images.length > 0 || files.length > 0;
	const hasText = item.text && item.text.trim().length > 0;
	const messageContainerWidthClassName =
		getDashboardMessageContainerWidthClasses(item.text);
	const messageBubbleWidthClassName = getDashboardMessageBubbleWidthClasses(
		item.text
	);
	const isPrivate = item.visibility === "private";
	const markdownRenderers = useMemo<TimelineItemContentMarkdownRenderers>(
		() => ({
			codeBlock: ({ code, fileName, language }) => (
				<TimelineCodeBlock
					code={code}
					fileName={fileName}
					language={language}
				/>
			),
			commandBlock: ({ commands }) => (
				<TimelineCommandBlock commands={commands} />
			),
			inlineCode: ({ code }) => (
				<code className="rounded bg-background-300 px-1 py-0.5 text-xs">
					{code}
				</code>
			),
		}),
		[]
	);

	const openLightbox = (index: number) => {
		setLightboxIndex(index);
		setLightboxOpen(true);
	};

	const currentImage = images[lightboxIndex];

	return (
		<>
			<PrimitiveTimelineItem item={item}>
				{({ isAI, timestamp }) => (
					<div
						className={cn(
							"flex w-full gap-2",
							isSentByViewer && "flex-row-reverse",
							!isSentByViewer && "flex-row"
						)}
					>
						<div
							className={cn(
								"flex w-full min-w-0 flex-1 flex-col gap-2",
								isSentByViewer && "items-end"
							)}
						>
							{/* Text content */}
							{hasText && (
								<div
									className={cn(
										"flex min-w-0 flex-col",
										messageContainerWidthClassName,
										{
											"items-end": isSentByViewer,
										}
									)}
								>
									{isPrivate ? (
										<div
											className={cn(
												"flex min-w-0 flex-col gap-1 rounded-lg border border-plasma-yellow-600/40 border-dashed bg-plasma-yellow-100/30 px-3 py-2 dark:border-plasma-yellow-600/20 dark:bg-plasma-yellow-100/5",
												messageBubbleWidthClassName,
												{
													"rounded-br-[2px]":
														isLast && isSentByViewer && !hasAttachments,
													"rounded-bl-[2px]":
														isLast && !isSentByViewer && !hasAttachments,
												}
											)}
										>
											<span className="font-medium text-plasma-yellow-700 text-xs opacity-50 dark:text-plasma-yellow-600">
												NOTE
											</span>
											<TimelineItemContent
												className="block min-w-0 max-w-full break-words text-foreground text-sm"
												markdownRenderers={markdownRenderers}
												renderMarkdown
												text={item.text}
											/>
											<span className="mt-6 flex items-center gap-1 font-medium text-plasma-yellow-700 text-xs opacity-40 dark:text-plasma-yellow-600">
												<Icon
													className="mb-[1px] size-3 shrink-0"
													name="eye-off"
												/>
												Not visible to visitor
											</span>
										</div>
									) : (
										<TimelineItemContent
											className={cn(
												"block min-w-0 break-words rounded-lg px-3 py-2 text-sm",
												messageBubbleWidthClassName,
												{
													"bg-background-300 text-foreground dark:bg-background-600":
														!isSentByViewer,
													"bg-primary text-primary-foreground": isSentByViewer,
													"rounded-br-[2px]":
														isLast && isSentByViewer && !hasAttachments,
													"rounded-bl-[2px]":
														isLast && !isSentByViewer && !hasAttachments,
												}
											)}
											markdownRenderers={markdownRenderers}
											renderMarkdown
											text={item.text}
										/>
									)}
								</div>
							)}

							{/* Image attachments */}
							{images.length > 0 && (
								<div
									className={cn(
										"flex flex-wrap gap-2",
										isSentByViewer && "justify-end"
									)}
								>
									{images.map((image, index) => (
										<button
											className="group relative overflow-hidden rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
											key={image.url}
											onClick={() => openLightbox(index)}
											type="button"
										>
											{/* biome-ignore lint/performance/noImgElement: User-uploaded images from S3, not optimizable */}
											{/* biome-ignore lint/nursery/useImageSize: Dynamic image dimensions not known at render time */}
											<img
												alt={image.filename || `Image ${index + 1}`}
												className="max-h-[200px] max-w-[300px] cursor-pointer rounded-lg object-cover transition-transform group-hover:scale-105"
												loading="lazy"
												src={image.url}
											/>
										</button>
									))}
								</div>
							)}

							{/* File attachments */}
							{files.length > 0 && (
								<div className="flex flex-col gap-1">
									{files.map((file) => (
										<a
											className={cn(
												"flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors",
												{
													"bg-background-300 text-foreground hover:bg-background-400 dark:bg-background-600 dark:hover:bg-background-500":
														!isSentByViewer,
													"bg-primary/80 text-primary-foreground hover:bg-primary":
														isSentByViewer,
												}
											)}
											download={file.filename}
											href={file.url}
											key={file.url}
											rel="noopener noreferrer"
											target="_blank"
										>
											<Icon className="h-4 w-4 shrink-0" name="attachment" />
											<span className="flex-1 truncate font-medium">
												{file.filename || "Download file"}
											</span>
											{file.size && (
												<span className="text-muted-foreground opacity-70">
													{formatFileSize(file.size)}
												</span>
											)}
										</a>
									))}
								</div>
							)}

							{isLast && (
								<TimelineItemTimestamp
									className="px-1 text-muted-foreground text-xs"
									timestamp={timestamp}
								>
									{() => (
										<>
											{timestamp.toLocaleTimeString([], {
												hour: "2-digit",
												minute: "2-digit",
											})}
											{isAI && " • AI agent"}
										</>
									)}
								</TimelineItemTimestamp>
							)}
						</div>
					</div>
				)}
			</PrimitiveTimelineItem>

			{/* Lightbox dialog for images */}
			{images.length > 0 && (
				<Dialog onOpenChange={setLightboxOpen} open={lightboxOpen}>
					<DialogContent className="flex max-h-[90vh] max-w-[90vw] items-center justify-center border-none bg-black/90 p-4 [&>button]:hidden">
						<DialogTitle className="sr-only">
							{currentImage?.filename || `Image ${lightboxIndex + 1}`}
						</DialogTitle>

						{/* Close button */}
						<button
							aria-label="Close lightbox"
							className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
							onClick={() => setLightboxOpen(false)}
							type="button"
						>
							<Icon className="h-6 w-6" name="x" />
						</button>

						{/* biome-ignore lint/performance/noImgElement: User-uploaded images from S3, not optimizable */}
						{/* biome-ignore lint/nursery/useImageSize: Dynamic image dimensions not known at render time */}
						<img
							alt={currentImage?.filename || `Image ${lightboxIndex + 1}`}
							className="max-h-[85vh] max-w-[85vw] object-contain"
							src={currentImage?.url}
						/>

						{/* Navigation for multiple images */}
						{images.length > 1 && (
							<>
								<button
									aria-label="Previous image"
									className="absolute left-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
									onClick={() =>
										setLightboxIndex((prev) =>
											prev > 0 ? prev - 1 : images.length - 1
										)
									}
									type="button"
								>
									<Icon className="h-6 w-6" name="arrow-left" />
								</button>
								<button
									aria-label="Next image"
									className="absolute right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
									onClick={() =>
										setLightboxIndex((prev) =>
											prev < images.length - 1 ? prev + 1 : 0
										)
									}
									type="button"
								>
									<Icon className="h-6 w-6" name="arrow-right" />
								</button>
								<div className="-translate-x-1/2 absolute bottom-4 left-1/2 rounded-full bg-black/50 px-3 py-1 text-sm text-white">
									{lightboxIndex + 1} / {images.length}
								</div>
							</>
						)}
					</DialogContent>
				</Dialog>
			)}
		</>
	);
}
