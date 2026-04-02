import { ConversationStatus } from "@plasma/types";
import { useEffect, useRef, useState } from "react";
import { FeedbackCommentInput } from "../../primitives/feedback-comment-input";
import { FeedbackRatingSelector } from "../../primitives/feedback-rating-selector";
import { Text, useSupportText } from "../text";
import { cn } from "../utils";

type ConversationResolvedFeedbackProps = {
	status: ConversationStatus | null;
	rating: number | null;
	onRate?: (rating: number, comment?: string) => void | Promise<void>;
	isSubmitting?: boolean;
	className?: string;
};

export function ConversationResolvedFeedback({
	status,
	rating,
	onRate,
	isSubmitting = false,
	className,
}: ConversationResolvedFeedbackProps) {
	const text = useSupportText();
	const isResolved = status === ConversationStatus.RESOLVED;
	const isRated = rating != null;
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [selectedRating, setSelectedRating] = useState<number | null>(rating);
	const [hoveredRating, setHoveredRating] = useState<number | null>(null);
	const [comment, setComment] = useState("");
	const [hasSubmitted, setHasSubmitted] = useState(false);

	useEffect(() => {
		setSelectedRating(rating);
		setHoveredRating(null);
		setComment("");
		setHasSubmitted(false);
	}, [rating, status]);

	const showCommentField = selectedRating != null && !isRated && !hasSubmitted;
	const isInteractive =
		Boolean(onRate) && !isSubmitting && !isRated && !hasSubmitted;

	useEffect(() => {
		if (showCommentField) {
			textareaRef.current?.focus();
		}
	}, [showCommentField]);

	const handleRatingSelect = (value: number) => {
		if (!isInteractive) {
			return;
		}
		setSelectedRating(value);
	};

	const handleSubmit = async () => {
		if (!(onRate && selectedRating)) {
			return;
		}

		await onRate(selectedRating, comment.trim() || undefined);
		setHasSubmitted(true);
	};

	if (!isResolved) {
		const closedTextKey =
			status === ConversationStatus.SPAM
				? "component.conversationPage.spamMessage"
				: "component.conversationPage.closedMessage";

		return (
			<div
				className={cn(
					"m-4 flex items-center justify-center text-balance px-4 pb-6 text-center font-medium text-co-muted-foreground text-sm",
					className
				)}
			>
				<Text as="p" textKey={closedTextKey} />
			</div>
		);
	}

	return (
		<div
			className={cn(
				"m-4 rounded-md border border-co-border/60 bg-co-background-100 px-4 py-3 text-center text-sm shadow-sm",
				className
			)}
		>
			<Text
				as="p"
				className="font-medium text-co-foreground"
				textKey={
					isRated || hasSubmitted
						? "component.conversationPage.ratingThanks"
						: "component.conversationPage.ratingPrompt"
				}
			/>
			<FeedbackRatingSelector
				buttonClassName={cn(
					"rounded-md",
					isInteractive ? "hover:bg-co-muted" : "opacity-70"
				)}
				className="mt-2 justify-center"
				disabled={!isInteractive}
				hoveredValue={hoveredRating}
				labelForRating={(value) =>
					text("component.conversationPage.ratingLabel", {
						rating: value,
					})
				}
				onHoverChange={(value) => isInteractive && setHoveredRating(value)}
				onSelect={handleRatingSelect}
				size="sm"
				value={selectedRating}
			/>

			{showCommentField && (
				<div className="mt-3 space-y-2">
					<FeedbackCommentInput
						className="w-full resize-none rounded-md border border-co-border bg-co-background px-3 py-2 text-co-foreground text-sm placeholder:text-co-muted-foreground focus:border-co-primary focus:outline-none focus:ring-1 focus:ring-co-primary"
						disabled={isSubmitting}
						onValueChange={setComment}
						placeholder={text("component.conversationPage.commentPlaceholder")}
						ref={textareaRef}
						rows={3}
						value={comment}
					/>
					<button
						className={cn(
							"w-full rounded-md bg-co-primary px-4 py-2 font-medium text-co-primary-foreground text-sm transition-colors",
							isSubmitting
								? "cursor-not-allowed opacity-50"
								: "hover:bg-co-primary/90"
						)}
						disabled={isSubmitting}
						onClick={() => {
							void handleSubmit().catch(() => {
								// The parent handles error reporting and optimistic state rollback.
							});
						}}
						type="button"
					>
						{text("component.conversationPage.submitFeedback")}
					</button>
				</div>
			)}

			{(isRated || hasSubmitted || !showCommentField) && (
				<Text
					as="p"
					className="mt-2 text-co-muted-foreground text-xs"
					textKey="component.conversationPage.closedMessage"
				/>
			)}
		</div>
	);
}
