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
};

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
}: FeedbackRatingSelectorProps): React.ReactElement {
	const displayRating = hoveredValue ?? value;

	return (
		<div
			className={cn("flex items-center gap-1", className)}
			data-feedback-rating-selector="true"
		>
			{Array.from({ length: STAR_COUNT }).map((_, index) => {
				const ratingValue = index + 1;
				const isFilled = displayRating ? ratingValue <= displayRating : false;

				return (
					<button
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
						onBlur={onBlur}
						onClick={() => onSelect?.(ratingValue)}
						onMouseEnter={() => onHoverChange?.(ratingValue)}
						onMouseLeave={() => onHoverChange?.(null)}
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
