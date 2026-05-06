"use client";

import { useFeedbackForm } from "@cossistant/react/feedback";
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
const FEEDBACK_TRIGGER = "docs_feedback_example";
const RATING_OPTIONS = [
	{ label: "😭", value: 1 },
	{ label: "🙁", value: 2 },
	{ label: "😐", value: 3 },
	{ label: "🙂", value: 4 },
	{ label: "🤩", value: 5 },
] as const;

export default function EmojiFeedbackExample() {
	const feedback = useFeedbackForm({
		topics: FEEDBACK_TOPICS,
		trigger: FEEDBACK_TRIGGER,
	});

	return (
		<div className="flex min-h-full w-full items-center justify-center">
			<Popover onOpenChange={feedback.handleOpenChange} open={feedback.open}>
				<PopoverTrigger asChild>
					<Button type="button">Click to leave a feedback</Button>
				</PopoverTrigger>
				<PopoverContent
					align="end"
					className="w-[min(25rem,calc(100vw-2rem))] overflow-hidden p-0"
					side="bottom"
					sideOffset={8}
				>
					{feedback.hasSubmitted ? (
						<div className="flex flex-col items-center gap-4 px-5 py-6 text-center">
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
								<Button
									className="flex-1"
									onClick={feedback.done}
									type="button"
								>
									Done
								</Button>
							</div>
						</div>
					) : (
						<form className="overflow-hidden" onSubmit={feedback.handleSubmit}>
							<div className="space-y-1 p-1">
								<Select
									disabled={feedback.isPending}
									onValueChange={feedback.handleTopicChange}
									value={feedback.topic}
								>
									<SelectTrigger
										aria-invalid={feedback.fields.topic.isMissing}
										aria-label="Select topic"
										className={cn(
											"w-full",
											feedback.fields.topic.isMissing &&
												"border-destructive ring-destructive/20"
										)}
										onBlur={feedback.fields.topic.handleBlur}
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

								<Textarea
									aria-invalid={feedback.fields.comment.isMissing}
									aria-label="Your feedback"
									className={cn(
										feedback.fields.comment.isMissing &&
											"border-destructive ring-destructive/20"
									)}
									disabled={feedback.isPending}
									onBlur={feedback.fields.comment.handleBlur}
									onChange={(event) =>
										feedback.handleCommentChange(event.target.value)
									}
									placeholder="Your feedback"
									value={feedback.comment}
								/>
							</div>

							<div className="space-y-2 border-border border-t p-2">
								<div className="flex items-center justify-between gap-3">
									<div className="space-y-1">
										<ToggleGroup
											aria-invalid={feedback.fields.rating.isMissing}
											aria-label="Feedback rating"
											className="gap-2"
											onBlur={feedback.fields.rating.handleBlur}
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
									</div>

									<Button
										disabled={feedback.submit.disabled}
										size="sm"
										type="submit"
									>
										{feedback.submit.label}
									</Button>
								</div>
							</div>
						</form>
					)}
				</PopoverContent>
			</Popover>
		</div>
	);
}
