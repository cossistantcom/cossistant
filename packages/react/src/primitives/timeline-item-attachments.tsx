"use client";

import { formatFileSize } from "@plasma/core";
import type {
	TimelineItemParts,
	TimelinePartFile,
	TimelinePartImage,
} from "@plasma/types/api/timeline-item";
import * as React from "react";
import { useRenderElement } from "../utils/use-render-element";

/**
 * Extract image parts from timeline item parts array.
 */
export function extractImageParts(
	parts: TimelineItemParts
): TimelinePartImage[] {
	return parts.filter(
		(part): part is TimelinePartImage => part.type === "image"
	);
}

/**
 * Extract file parts from timeline item parts array.
 */
export function extractFileParts(parts: TimelineItemParts): TimelinePartFile[] {
	return parts.filter((part): part is TimelinePartFile => part.type === "file");
}

/**
 * Check if timeline item has any attachments (images or files).
 */
export function hasAttachments(parts: TimelineItemParts): boolean {
	return parts.some((part) => part.type === "image" || part.type === "file");
}

// ============================================================================
// TimelineItemImages
// ============================================================================

export type TimelineItemImagesProps = Omit<
	React.HTMLAttributes<HTMLDivElement>,
	"children"
> & {
	children?:
		| React.ReactNode
		| ((
				images: TimelinePartImage[],
				onImageClick?: (index: number) => void
		  ) => React.ReactNode);
	asChild?: boolean;
	className?: string;
	images: TimelinePartImage[];
	/**
	 * Callback when an image is clicked (for lightbox).
	 */
	onImageClick?: (index: number) => void;
};

/**
 * Renders a grid of image thumbnails from timeline item parts.
 * Supports custom rendering via children render prop.
 */
export const TimelineItemImages = (() => {
	const Component = React.forwardRef<HTMLDivElement, TimelineItemImagesProps>(
		(
			{ children, className, asChild = false, images, onImageClick, ...props },
			ref
		) => {
			if (images.length === 0) {
				return null;
			}

			const content =
				typeof children === "function"
					? children(images, onImageClick)
					: children || (
							<div className="flex flex-wrap gap-2">
								{images.map((image, index) => (
									<button
										className="group relative overflow-hidden rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2"
										key={image.url}
										onClick={() => onImageClick?.(index)}
										type="button"
									>
										{/* biome-ignore lint/performance/noImgElement: React package, not Next.js specific */}
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
						);

			// biome-ignore lint/correctness/useHookAtTopLevel: useRenderElement is a utility function, not a hook
			return useRenderElement(
				"div",
				{
					className,
					asChild,
				},
				{
					ref,
					props: {
						...props,
						children: content,
					},
				}
			);
		}
	);

	Component.displayName = "TimelineItemImages";
	return Component;
})();

// ============================================================================
// TimelineItemFiles
// ============================================================================

export type TimelineItemFilesProps = Omit<
	React.HTMLAttributes<HTMLDivElement>,
	"children"
> & {
	children?: React.ReactNode | ((files: TimelinePartFile[]) => React.ReactNode);
	asChild?: boolean;
	className?: string;
	files: TimelinePartFile[];
};

/**
 * Get file icon based on MIME type.
 */
function getFileIcon(mediaType: string): string {
	if (mediaType === "application/pdf") {
		return "📄";
	}
	if (mediaType === "application/zip") {
		return "🗜️";
	}
	if (mediaType.startsWith("text/")) {
		return "📝";
	}
	return "📎";
}

/**
 * Renders a list of file attachments from timeline item parts.
 * Supports custom rendering via children render prop.
 */
export const TimelineItemFiles = (() => {
	const Component = React.forwardRef<HTMLDivElement, TimelineItemFilesProps>(
		({ children, className, asChild = false, files, ...props }, ref) => {
			if (files.length === 0) {
				return null;
			}

			const content =
				typeof children === "function"
					? children(files)
					: children || (
							<div className="flex flex-col gap-2">
								{files.map((file) => (
									<a
										className="flex items-center gap-2 rounded-lg bg-co-muted/50 px-3 py-2 text-sm transition-colors hover:bg-co-muted"
										download={file.filename}
										href={file.url}
										key={file.url}
										rel="noopener noreferrer"
										target="_blank"
									>
										<span className="text-lg">
											{getFileIcon(file.mediaType)}
										</span>
										<span className="flex-1 truncate font-medium">
											{file.filename || "Download file"}
										</span>
										{file.size && (
											<span className="text-co-muted-foreground text-xs">
												{formatFileSize(file.size)}
											</span>
										)}
									</a>
								))}
							</div>
						);

			// biome-ignore lint/correctness/useHookAtTopLevel: useRenderElement is a utility function, not a hook
			return useRenderElement(
				"div",
				{
					className,
					asChild,
				},
				{
					ref,
					props: {
						...props,
						children: content,
					},
				}
			);
		}
	);

	Component.displayName = "TimelineItemFiles";
	return Component;
})();

// ============================================================================
// TimelineItemAttachments (convenience wrapper)
// ============================================================================

export type TimelineItemAttachmentsProps = Omit<
	React.HTMLAttributes<HTMLDivElement>,
	"children"
> & {
	children?: React.ReactNode;
	asChild?: boolean;
	className?: string;
	parts: TimelineItemParts;
	/**
	 * Callback when an image is clicked (for lightbox).
	 */
	onImageClick?: (index: number) => void;
	/**
	 * Custom className for the images container.
	 */
	imagesClassName?: string;
	/**
	 * Custom className for the files container.
	 */
	filesClassName?: string;
};

/**
 * Convenience component that renders both images and files from timeline parts.
 * Extracts the appropriate parts and renders them in a single container.
 */
export const TimelineItemAttachments = (() => {
	const Component = React.forwardRef<
		HTMLDivElement,
		TimelineItemAttachmentsProps
	>(
		(
			{
				children,
				className,
				asChild = false,
				parts,
				onImageClick,
				imagesClassName,
				filesClassName,
				...props
			},
			ref
		) => {
			const images = extractImageParts(parts);
			const files = extractFileParts(parts);

			if (images.length === 0 && files.length === 0) {
				return null;
			}

			const content = children || (
				<>
					{images.length > 0 && (
						<TimelineItemImages
							className={imagesClassName}
							images={images}
							onImageClick={onImageClick}
						/>
					)}
					{files.length > 0 && (
						<TimelineItemFiles className={filesClassName} files={files} />
					)}
				</>
			);

			// biome-ignore lint/correctness/useHookAtTopLevel: useRenderElement is a utility function, not a hook
			return useRenderElement(
				"div",
				{
					className,
					asChild,
				},
				{
					ref,
					props: {
						...props,
						children: content,
					},
				}
			);
		}
	);

	Component.displayName = "TimelineItemAttachments";
	return Component;
})();
