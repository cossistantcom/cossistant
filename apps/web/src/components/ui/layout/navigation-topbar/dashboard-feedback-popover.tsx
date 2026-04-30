"use client";

import { useFeedbackForm } from "@cossistant/next/feedback";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

const FEEDBACK_TOPICS = ["Bug", "Feature request", "UX", "Other"];
const DASHBOARD_FEEDBACK_TRIGGER = "dashboard_topbar";
const RATING_OPTIONS = [
	{ label: "😭", value: 1 },
	{ label: "🙁", value: 2 },
	{ label: "😐", value: 3 },
	{ label: "🙂", value: 4 },
	{ label: "🤩", value: 5 },
] as const;

export function DashboardFeedbackPopover() {
	const feedback = useFeedbackForm({
		commentRequired: true,
		topics: FEEDBACK_TOPICS,
		trigger: DASHBOARD_FEEDBACK_TRIGGER,
	});

	const topicErrorId = "dashboard-feedback-topic-error";
	const commentErrorId = "dashboard-feedback-comment-error";
	const ratingErrorId = "dashboard-feedback-rating-error";

	return (
		<Popover onOpenChange={feedback.handleOpenChange} open={feedback.open}>
			<PopoverTrigger asChild>
				<Button
					className="h-auto px-2 py-1 text-primary/80 text-sm hover:bg-background-300 hover:text-primary"
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
				className="w-[min(25rem,calc(100vw-2rem))] overflow-hidden p-0"
				data-slot="dashboard-feedback-popover"
				side="bottom"
				sideOffset={8}
			>
				{feedback.hasSubmitted ? (
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
								onClick={feedback.sendAnother}
								type="button"
								variant="secondary"
							>
								Send another
							</Button>
							<Button className="flex-1" onClick={feedback.done} type="button">
								Done
							</Button>
						</div>
					</div>
				) : (
					<form
						className="overflow-hidden"
						data-slot="dashboard-feedback-form"
						onSubmit={feedback.handleSubmit}
					>
						<div className="space-y-1 p-1">
							<Select
								disabled={feedback.isPending}
								onValueChange={feedback.handleTopicChange}
								value={feedback.topic}
							>
								<SelectTrigger
									aria-describedby={
										feedback.fields.topic.error ? topicErrorId : undefined
									}
									aria-invalid={feedback.fields.topic.isMissing}
									aria-label="Select topic"
									className={cn(
										"w-full",
										feedback.fields.topic.isMissing &&
											"border-destructive ring-destructive/20"
									)}
									data-slot="dashboard-feedback-topic"
									id="dashboard-feedback-topic"
								>
									<SelectValue placeholder="Select topic" />
								</SelectTrigger>
								<SelectContent align="end">
									{feedback.availableTopics.map((topic) => (
										<SelectItem key={topic} value={topic}>
											{topic}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{feedback.fields.topic.error ? (
								<p
									className="text-destructive text-xs"
									id={topicErrorId}
									role="alert"
								>
									{feedback.fields.topic.error}
								</p>
							) : null}

							<Textarea
								aria-describedby={
									feedback.fields.comment.error ? commentErrorId : undefined
								}
								aria-invalid={feedback.fields.comment.isMissing}
								aria-label="Your feedback"
								className={cn(
									feedback.fields.comment.isMissing &&
										"border-destructive ring-destructive/20"
								)}
								disabled={feedback.isPending}
								id="dashboard-feedback-comment"
								onChange={(event) =>
									feedback.handleCommentChange(event.target.value)
								}
								placeholder="Your feedback"
								value={feedback.comment}
							/>
							{feedback.fields.comment.error ? (
								<p
									className="text-destructive text-xs"
									id={commentErrorId}
									role="alert"
								>
									{feedback.fields.comment.error}
								</p>
							) : null}
						</div>

						<div className="space-y-2 border-border border-t p-2">
							<div className="flex items-center justify-between gap-3">
								<div className="space-y-1">
									<ToggleGroup
										aria-describedby={
											feedback.fields.rating.error ? ratingErrorId : undefined
										}
										aria-invalid={feedback.fields.rating.isMissing}
										aria-label="Feedback rating"
										className="gap-2"
										onValueChange={(value) => {
											if (value) {
												feedback.handleRatingSelect(Number(value));
											}
										}}
										type="single"
										value={feedback.fields.rating.selectedValue}
									>
										{RATING_OPTIONS.map((option) => (
											<ToggleGroupItem
												aria-label={`Rate ${option.value} out of 5`}
												className={cn(
													"size-7 p-0 text-lg opacity-45 transition-opacity hover:opacity-75",
													feedback.fields.rating.displayValue === option.value
														? "opacity-100"
														: null
												)}
												data-rating-value={option.value}
												disabled={feedback.isPending}
												key={option.value}
												onMouseEnter={() =>
													feedback.handleRatingHoverChange(option.value)
												}
												onMouseLeave={() =>
													feedback.handleRatingHoverChange(null)
												}
												type="button"
												value={option.value.toString()}
											>
												{option.label}
											</ToggleGroupItem>
										))}
									</ToggleGroup>
									{feedback.fields.rating.error ? (
										<p
											className="text-destructive text-xs"
											id={ratingErrorId}
											role="alert"
										>
											{feedback.fields.rating.error}
										</p>
									) : null}
								</div>

								<Button
									data-slot="dashboard-feedback-submit"
									disabled={feedback.submit.disabled}
									size="sm"
									type="submit"
								>
									{feedback.submit.label}
								</Button>
							</div>

							{feedback.submitError ? (
								<p
									aria-live="polite"
									className="text-destructive text-xs"
									role="alert"
								>
									{feedback.submitError}
								</p>
							) : null}
						</div>
					</form>
				)}
			</PopoverContent>
		</Popover>
	);
}
