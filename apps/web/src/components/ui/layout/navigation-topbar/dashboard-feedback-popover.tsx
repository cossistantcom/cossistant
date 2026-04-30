"use client";

import { useSubmitFeedback } from "@cossistant/next/feedback";
import {
	FeedbackCommentInput,
	FeedbackRatingSelector,
	FeedbackTopicSelect,
} from "@cossistant/next/primitives";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const FEEDBACK_TOPICS = ["Bug", "Feature request", "UX", "Other"];
const DASHBOARD_FEEDBACK_TRIGGER = "dashboard_topbar";

function getErrorMessage(error: Error | null): string | null {
	if (!error) {
		return null;
	}

	return (
		error.message || "We could not submit your feedback. Please try again."
	);
}

export function DashboardFeedbackPopover() {
	const [open, setOpen] = React.useState(false);
	const [rating, setRating] = React.useState<number | null>(null);
	const [hoveredRating, setHoveredRating] = React.useState<number | null>(null);
	const [topic, setTopic] = React.useState("");
	const [comment, setComment] = React.useState("");
	const [hasSubmitted, setHasSubmitted] = React.useState(false);
	const [hasAttemptedSubmit, setHasAttemptedSubmit] = React.useState(false);
	const { error, isPending, mutateAsync, reset } = useSubmitFeedback();
	const normalizedTopic = topic.trim();
	const normalizedComment = comment.trim();

	const resetForm = React.useCallback(() => {
		setRating(null);
		setHoveredRating(null);
		setTopic("");
		setComment("");
		setHasSubmitted(false);
		setHasAttemptedSubmit(false);
		reset();
	}, [reset]);

	const handleOpenChange = React.useCallback(
		(nextOpen: boolean) => {
			setOpen(nextOpen);

			if (!nextOpen) {
				resetForm();
			}
		},
		[resetForm]
	);

	const clearSubmitError = React.useCallback(() => {
		if (error) {
			reset();
		}
	}, [error, reset]);

	const handleTopicChange = React.useCallback(
		(value: string) => {
			clearSubmitError();
			setTopic(value);
		},
		[clearSubmitError]
	);

	const handleCommentChange = React.useCallback(
		(value: string) => {
			clearSubmitError();
			setComment(value);
		},
		[clearSubmitError]
	);

	const handleRatingSelect = React.useCallback(
		(value: number) => {
			clearSubmitError();
			setRating(value);
		},
		[clearSubmitError]
	);

	const handleSubmit = React.useCallback(
		async (event: React.FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			setHasAttemptedSubmit(true);
			reset();

			if (!(rating && normalizedTopic)) {
				return;
			}

			try {
				await mutateAsync({
					rating,
					topic: normalizedTopic,
					comment: normalizedComment || undefined,
					trigger: DASHBOARD_FEEDBACK_TRIGGER,
				});
				setHasSubmitted(true);
			} catch {
				// The hook exposes the error for rendering.
			}
		},
		[mutateAsync, normalizedComment, normalizedTopic, rating, reset]
	);

	const isRatingMissing = hasAttemptedSubmit && !rating;
	const isTopicMissing = hasAttemptedSubmit && normalizedTopic.length === 0;
	const submitError = getErrorMessage(error);

	return (
		<Popover onOpenChange={handleOpenChange} open={open}>
			<PopoverTrigger asChild>
				<Button
					className="h-auto rounded px-2 py-1 text-primary/80 text-sm hover:bg-background-300 hover:text-primary"
					data-slot="dashboard-feedback-trigger"
					size="sm"
					type="button"
					variant="ghost"
				>
					Feedback?
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className="w-[min(22rem,calc(100vw-2rem))] p-0"
				data-slot="dashboard-feedback-popover"
				side="bottom"
				sideOffset={8}
			>
				{hasSubmitted ? (
					<div
						className="flex flex-col items-center gap-4 px-5 py-6 text-center"
						data-slot="dashboard-feedback-success"
					>
						<div className="space-y-1">
							<p className="font-medium text-sm">Thanks for the feedback</p>
							<p className="text-muted-foreground text-sm">
								Your note was sent to the Cossistant team.
							</p>
						</div>
						<div className="flex w-full items-center gap-2">
							<Button
								className="flex-1"
								onClick={resetForm}
								type="button"
								variant="secondary"
							>
								Send another
							</Button>
							<Button
								className="flex-1"
								onClick={() => handleOpenChange(false)}
								type="button"
							>
								Done
							</Button>
						</div>
					</div>
				) : (
					<form
						className="space-y-4 p-4"
						data-slot="dashboard-feedback-form"
						onSubmit={handleSubmit}
					>
						<div className="space-y-1">
							<p className="font-medium text-sm">Share feedback</p>
							<p className="text-muted-foreground text-sm">
								Tell us what to improve in the dashboard.
							</p>
						</div>

						<div className="space-y-2">
							<Label htmlFor="dashboard-feedback-topic">Topic</Label>
							<FeedbackTopicSelect
								aria-invalid={isTopicMissing}
								className="h-9 rounded border-input bg-background text-sm focus:border-ring focus:ring-[3px] focus:ring-ring/50"
								disabled={isPending}
								id="dashboard-feedback-topic"
								invalid={isTopicMissing}
								onValueChange={handleTopicChange}
								options={FEEDBACK_TOPICS}
								placeholder="Select a topic"
								value={topic}
							/>
							{isTopicMissing ? (
								<p className="text-destructive text-xs" role="alert">
									Select a topic before sending feedback.
								</p>
							) : null}
						</div>

						<div className="space-y-2">
							<Label htmlFor="dashboard-feedback-comment">Comment</Label>
							<FeedbackCommentInput
								className="min-h-28 rounded border-input bg-background text-sm focus:border-ring focus:ring-[3px] focus:ring-ring/50"
								disabled={isPending}
								id="dashboard-feedback-comment"
								onValueChange={handleCommentChange}
								placeholder="What happened?"
								value={comment}
							/>
						</div>

						<div className="space-y-2">
							<Label>Rating</Label>
							<FeedbackRatingSelector
								buttonClassName={cn(
									"rounded text-muted-foreground hover:bg-background-200",
									isRatingMissing && "ring-1 ring-destructive"
								)}
								disabled={isPending}
								hoveredValue={hoveredRating}
								iconClassName="text-primary"
								labelForRating={(value) => `Rate dashboard ${value} out of 5`}
								onHoverChange={setHoveredRating}
								onSelect={handleRatingSelect}
								size="sm"
								value={rating}
							/>
							{isRatingMissing ? (
								<p className="text-destructive text-xs" role="alert">
									Choose a rating before sending feedback.
								</p>
							) : null}
						</div>

						{submitError ? (
							<p
								aria-live="polite"
								className="text-destructive text-xs"
								role="alert"
							>
								{submitError}
							</p>
						) : null}

						<div className="flex justify-end gap-2">
							<Button
								disabled={isPending}
								onClick={() => handleOpenChange(false)}
								type="button"
								variant="secondary"
							>
								Cancel
							</Button>
							<Button
								data-slot="dashboard-feedback-submit"
								disabled={isPending}
								type="submit"
							>
								{isPending ? "Sending..." : "Send"}
							</Button>
						</div>
					</form>
				)}
			</PopoverContent>
		</Popover>
	);
}
