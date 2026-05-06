import {
	formatFeedbackRatingLabel,
	getFeedbackTimelineComment,
	getFeedbackTimelineMetadataEntries,
	getTimelineItemFeedback,
	resolveTimelineItemText,
} from "@cossistant/core";
import { formatFileSize } from "@cossistant/core/upload-constants";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import type React from "react";
import { useMemo, useState } from "react";
import {
	TimelineItem as PrimitiveTimelineItem,
	TimelineItemContent,
	type TimelineItemContentMarkdownRenderers,
	TimelineItemTimestamp,
} from "../../primitives/timeline-item";
import {
	extractFileParts,
	extractImageParts,
} from "../../primitives/timeline-item-attachments";
import { hasExpandedTimelineContent } from "../../primitives/timeline-message-layout";
import { useSupportText } from "../text";
import { cn } from "../utils";
import Icon from "./icons";
import { ImageLightbox } from "./image-lightbox";
import { TimelineCodeBlock } from "./timeline-code-block";
import { TimelineCommandBlock } from "./timeline-command-block";

export type TimelineMessageItemProps = {
	item: TimelineItem;
	isLast?: boolean;
	isSentByViewer?: boolean;
};

export function getSupportMessageWidthClasses(
	text: string | null | undefined
): string {
	return hasExpandedTimelineContent(text) ? "w-full max-w-full" : "max-w-[92%]";
}

/**
 * Message bubble renderer that adapts layout depending on whether the visitor
 * or an agent sent the message.
 */
export function TimelineMessageItem({
	item,
	isLast = false,
	isSentByViewer = false,
}: TimelineMessageItemProps): React.ReactElement {
	const text = useSupportText();
	const [lightboxOpen, setLightboxOpen] = useState(false);
	const [lightboxIndex, setLightboxIndex] = useState(0);
	const displayText = resolveTimelineItemText(item, "visitor");
	const feedback = getTimelineItemFeedback(item);
	const feedbackComment = feedback
		? getFeedbackTimelineComment({
				parts: item.parts,
				text: displayText,
			})
		: null;
	const feedbackMetadataEntries = feedback
		? getFeedbackTimelineMetadataEntries(feedback)
		: [];

	// Extract image and file parts
	const images = extractImageParts(item.parts);
	const files = extractFileParts(item.parts);
	const hasAttachments = images.length > 0 || files.length > 0;
	const hasText = Boolean(
		!feedback && displayText && displayText.trim().length > 0
	);
	const messageWidthClassName = getSupportMessageWidthClasses(displayText);
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
				<code className="rounded-co bg-co-background-300 px-1 py-0.5 text-xs">
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

	return (
		<>
			<PrimitiveTimelineItem item={item}>
				{({ isAI, timestamp }) => {
					// isSentByViewer defaults to false, meaning messages are treated as received
					// (left side with background) unless explicitly marked as sent by viewer
					const isSentByViewerFinal = isSentByViewer;

					return (
						<div
							className={cn(
								"flex w-full gap-2",
								isSentByViewerFinal && "flex-row-reverse",
								!isSentByViewerFinal && "flex-row"
							)}
						>
							<div
								className={cn(
									"flex w-full min-w-0 flex-1 flex-col gap-1",
									isSentByViewerFinal && "items-end"
								)}
							>
								{feedback && (
									<div
										className={cn(
											"flex min-w-0 flex-col",
											messageWidthClassName,
											isSentByViewerFinal ? "self-end" : "self-start"
										)}
									>
										<div className="flex min-w-0 flex-col gap-3 rounded-co-lg border border-co-border/70 bg-co-background/80 px-3.5 py-3 text-co-foreground shadow-sm">
											<div className="flex items-center gap-2">
												<span className="flex size-6 shrink-0 items-center justify-center rounded-co bg-co-background-200 text-co-primary ring-1 ring-co-border/50 dark:bg-co-background-500">
													<Icon
														className="size-3"
														name="star"
														variant="filled"
													/>
												</span>
												<div className="min-w-0">
													<div className="font-medium text-co-foreground text-xs capitalize">
														{text("component.message.feedback.label")}
													</div>
													<div className="text-co-muted-foreground text-xs">
														{formatFeedbackRatingLabel(feedback.rating)}
													</div>
												</div>
											</div>

											{feedbackMetadataEntries.length > 0 && (
												<div className="flex flex-wrap gap-1.5">
													{feedbackMetadataEntries.map((entry) => (
														<span
															className="inline-flex items-center gap-1 rounded-co border border-co-border/60 bg-co-background-100 px-2 py-1 text-co-muted-foreground text-xs dark:bg-co-background-300"
															key={entry.label}
														>
															<span className="font-medium text-co-foreground">
																{entry.label}
															</span>
															<span>{entry.value}</span>
														</span>
													))}
												</div>
											)}

											{feedbackComment && (
												<TimelineItemContent
													className="block min-w-0 max-w-full break-words text-co-foreground text-sm"
													markdownRenderers={markdownRenderers}
													renderMarkdown
													text={feedbackComment}
												/>
											)}
										</div>
									</div>
								)}

								{/* Text content */}
								{hasText && (
									<TimelineItemContent
										className={cn(
											"inline-block min-w-0 break-words rounded-co-lg px-3.5 py-2.5 text-sm",
											messageWidthClassName,
											isSentByViewerFinal ? "self-end" : "self-start",
											{
												"bg-co-background-300 text-co-foreground dark:bg-co-background-600":
													!isSentByViewerFinal,
												"bg-co-primary text-co-primary-foreground":
													isSentByViewerFinal,
												"rounded-br-[calc(var(--co-radius)/2)]":
													isLast && isSentByViewerFinal && !hasAttachments,
												"rounded-bl-[calc(var(--co-radius)/2)]":
													isLast && !isSentByViewerFinal && !hasAttachments,
											}
										)}
										markdownRenderers={markdownRenderers}
										renderMarkdown
										text={displayText}
									/>
								)}

								{/* Image attachments */}
								{images.length > 0 && (
									<div
										className={cn(
											"flex flex-wrap gap-2",
											isSentByViewerFinal && "justify-end"
										)}
									>
										{images.map((image, index) => (
											<button
												className="group relative overflow-hidden rounded-co-lg focus:outline-none focus:ring-2 focus:ring-co-primary/50"
												key={image.url}
												onClick={() => openLightbox(index)}
												type="button"
											>
												{/* biome-ignore lint/performance/noImgElement: React package, not Next.js specific */}
												{/* biome-ignore lint/nursery/useImageSize: Dynamic image dimensions not known at render time */}
												<img
													alt={image.filename || `Image ${index + 1}`}
													className="max-h-[150px] max-w-[200px] cursor-pointer rounded-co-lg object-cover transition-transform group-hover:scale-105"
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
													"flex items-center gap-2 rounded-co-lg px-3 py-2 text-xs transition-colors",
													{
														"bg-co-background-300 text-co-foreground hover:bg-co-background-400 dark:bg-co-background-600 dark:hover:bg-co-background-500":
															!isSentByViewerFinal,
														"bg-co-primary/80 text-co-primary-foreground hover:bg-co-primary":
															isSentByViewerFinal,
													}
												)}
												download={file.filename}
												href={file.url}
												key={file.url}
												rel="noopener noreferrer"
												target="_blank"
											>
												<Icon className="h-4 w-4 shrink-0" name="file" />
												<span className="flex-1 truncate font-medium">
													{file.filename || "Download file"}
												</span>
												{file.size && (
													<span className="text-co-muted-foreground opacity-70">
														{formatFileSize(file.size)}
													</span>
												)}
											</a>
										))}
									</div>
								)}

								{isLast && (
									<TimelineItemTimestamp
										className="px-1 text-co-muted-foreground text-xs"
										timestamp={timestamp}
									>
										{() => (
											<>
												{timestamp.toLocaleTimeString([], {
													hour: "2-digit",
													minute: "2-digit",
												})}
												{isAI &&
													` ${text("component.message.timestamp.aiIndicator")}`}
											</>
										)}
									</TimelineItemTimestamp>
								)}
							</div>
						</div>
					);
				}}
			</PrimitiveTimelineItem>

			{/* Lightbox for images */}
			{images.length > 0 && (
				<ImageLightbox
					images={images}
					initialIndex={lightboxIndex}
					isOpen={lightboxOpen}
					onClose={() => setLightboxOpen(false)}
				/>
			)}
		</>
	);
}
