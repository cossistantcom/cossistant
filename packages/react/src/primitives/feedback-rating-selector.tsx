"use client";

import type * as React from "react";
import { Icon } from "../support/components/icons";
import { cn } from "../support/utils";

const STAR_COUNT = 5;

export type FeedbackRatingSelectorSize = "sm" | "md";

export type FeedbackRatingSelectorProps = {
	value: number | null;
	hoveredValue?: number | null;
	onHoverChange?: (value: number | null) => void;
	onSelect?: (value: number) => void;
	onBlur?: React.FocusEventHandler<HTMLButtonElement>;
	disabled?: boolean;
	className?: string;
	buttonClassName?: string;
	iconClassName?: string;
	size?: FeedbackRatingSelectorSize;
	labelForRating?: (value: number) => string;
	"aria-label"?: string;
};

function getNextRating(current: number | null, key: string): number | null {
	const base = current ?? 0;

	switch (key) {
		case "ArrowRight":
		case "ArrowDown":
			return base >= STAR_COUNT ? 1 : base + 1;
		case "ArrowLeft":
		case "ArrowUp":
			return base <= 1 ? STAR_COUNT : base - 1;
		case "Home":
			return 1;
		case "End":
			return STAR_COUNT;
		default:
			return null;
	}
}

export function FeedbackRatingSelector({
	value,
	hoveredValue = null,
	onHoverChange,
	onSelect,
	onBlur,
	disabled = false,
	className,
	buttonClassName,
	iconClassName,
	size = "md",
	labelForRating = (rating) => `Rate ${rating} out of ${STAR_COUNT}`,
	"aria-label": ariaLabel = "Rating",
}: FeedbackRatingSelectorProps): React.ReactElement {
	const displayRating = hoveredValue ?? value;
	// Roving tabindex: the selected star (or the first when nothing is
	// selected) is the group's single tab stop.
	const tabbableRating = value ?? 1;

	const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
		const nextRating = getNextRating(value, event.key);
		if (nextRating == null) {
			return;
		}

		event.preventDefault();
		onSelect?.(nextRating);
		event.currentTarget.parentElement
			?.querySelector<HTMLButtonElement>(`[data-rating-value="${nextRating}"]`)
			?.focus();
	};

	return (
		<div
			aria-label={ariaLabel}
			className={cn("flex items-center gap-1", className)}
			data-feedback-rating-selector="true"
			role="radiogroup"
		>
			{Array.from({ length: STAR_COUNT }).map((_, index) => {
				const ratingValue = index + 1;
				const isFilled = displayRating ? ratingValue <= displayRating : false;

				return (
					// biome-ignore lint/a11y/useSemanticElements: styled star buttons implement the WAI-ARIA radiogroup pattern
					<button
						aria-checked={value === ratingValue}
						aria-label={labelForRating(ratingValue)}
						className={cn(
							"inline-flex items-center justify-center rounded-full transition-colors",
							size === "md" ? "h-9 w-9" : "h-8 w-8",
							disabled
								? "cursor-default opacity-70"
								: "hover:bg-co-background-100",
							buttonClassName
						)}
						data-feedback-rating-button="true"
						data-rating-active={isFilled}
						data-rating-value={ratingValue}
						disabled={disabled}
						key={ratingValue}
						onBlur={(event) => {
							onHoverChange?.(null);
							onBlur?.(event);
						}}
						onClick={() => onSelect?.(ratingValue)}
						onFocus={() => onHoverChange?.(ratingValue)}
						onKeyDown={handleKeyDown}
						onMouseEnter={() => onHoverChange?.(ratingValue)}
						onMouseLeave={() => onHoverChange?.(null)}
						role="radio"
						tabIndex={ratingValue === tabbableRating ? 0 : -1}
						type="button"
					>
						<Icon
							className={cn(
								size === "md" ? "h-5 w-5" : "h-4 w-4",
								isFilled ? "text-co-primary" : "text-co-muted-foreground/40",
								iconClassName
							)}
							name="star"
							variant={isFilled ? "filled" : "default"}
						/>
					</button>
				);
			})}
		</div>
	);
}
