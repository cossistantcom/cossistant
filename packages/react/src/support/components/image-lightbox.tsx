"use client";

import type { TimelinePartImage } from "@plasma/types/api/timeline-item";
import type * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../utils";
import Icon from "./icons";

export type ImageLightboxProps = {
	/**
	 * Array of images to display in the lightbox.
	 */
	images: TimelinePartImage[];
	/**
	 * Index of the initially selected image.
	 */
	initialIndex?: number;
	/**
	 * Whether the lightbox is open.
	 */
	isOpen: boolean;
	/**
	 * Callback when the lightbox should close.
	 */
	onClose: () => void;
	/**
	 * Optional className for the overlay.
	 */
	className?: string;
};

/**
 * Simple image lightbox/modal for viewing full-size images.
 * Supports keyboard navigation (Escape to close, Arrow keys to navigate).
 */
export function ImageLightbox({
	images,
	initialIndex = 0,
	isOpen,
	onClose,
	className,
}: ImageLightboxProps): React.ReactElement | null {
	const [currentIndex, setCurrentIndex] = useState(initialIndex);
	const [mounted, setMounted] = useState(false);

	// SSR safety: only render portal after component mounts on client
	useEffect(() => {
		setMounted(true);
	}, []);

	// Reset index when lightbox opens with new initial index
	useEffect(() => {
		if (isOpen) {
			setCurrentIndex(initialIndex);
		}
	}, [isOpen, initialIndex]);

	// Handle keyboard navigation
	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			if (!isOpen) {
				return;
			}

			switch (event.key) {
				case "Escape":
					onClose();
					break;
				case "ArrowLeft":
					setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
					break;
				case "ArrowRight":
					setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
					break;
				default:
					break;
			}
		},
		[isOpen, images.length, onClose]
	);

	useEffect(() => {
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [handleKeyDown]);

	// Prevent body scroll when lightbox is open
	useEffect(() => {
		if (isOpen) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "";
		}
		return () => {
			document.body.style.overflow = "";
		};
	}, [isOpen]);

	// Don't render until mounted (SSR safety) or if not open/no images
	if (!(mounted && isOpen) || images.length === 0) {
		return null;
	}

	const currentImage = images[currentIndex];
	const hasMultiple = images.length > 1;

	const handlePrevious = () => {
		setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
	};

	const handleNext = () => {
		setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
	};

	const handleBackdropClick = (event: React.MouseEvent) => {
		if (event.target === event.currentTarget) {
			onClose();
		}
	};

	// Render via portal to document.body to escape any CSS containing blocks
	// (e.g., transforms on widget containers that break position: fixed)
	return createPortal(
		// biome-ignore lint/a11y/noNoninteractiveElementInteractions: Dialog backdrop needs click handler for closing
		<div
			aria-label="Image viewer"
			aria-modal="true"
			className={cn(
				"fixed inset-0 z-[99999] flex items-center justify-center bg-black/90 p-4",
				className
			)}
			onClick={handleBackdropClick}
			onKeyDown={(e) => e.key === "Escape" && onClose()}
			role="dialog"
		>
			{/* Close button */}
			<button
				aria-label="Close lightbox"
				className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
				onClick={onClose}
				type="button"
			>
				<Icon className="h-6 w-6" name="close" />
			</button>

			{/* Navigation buttons */}
			{hasMultiple && (
				<>
					<button
						aria-label="Previous image"
						className="absolute left-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
						onClick={handlePrevious}
						type="button"
					>
						<Icon className="h-6 w-6" name="arrow-left" />
					</button>
					<button
						aria-label="Next image"
						className="absolute right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
						onClick={handleNext}
						type="button"
					>
						<Icon className="h-6 w-6" name="arrow-right" />
					</button>
				</>
			)}

			{/* Image */}
			{/* biome-ignore lint/performance/noImgElement: React package, not Next.js specific */}
			{/* biome-ignore lint/nursery/useImageSize: Dynamic image dimensions not known at render time */}
			<img
				alt={currentImage?.filename || `Image ${currentIndex + 1}`}
				className="max-h-[90vh] max-w-[90vw] object-contain"
				src={currentImage?.url}
			/>

			{/* Image counter */}
			{hasMultiple && (
				<div className="-translate-x-1/2 absolute bottom-4 left-1/2 rounded-full bg-black/50 px-3 py-1 text-sm text-white">
					{currentIndex + 1} / {images.length}
				</div>
			)}
		</div>,
		document.body
	);
}

/**
 * Hook to manage lightbox state.
 */
export function useLightbox() {
	const [isOpen, setIsOpen] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(0);

	const openLightbox = useCallback((index = 0) => {
		setSelectedIndex(index);
		setIsOpen(true);
	}, []);

	const closeLightbox = useCallback(() => {
		setIsOpen(false);
	}, []);

	return {
		isOpen,
		selectedIndex,
		openLightbox,
		closeLightbox,
	};
}
