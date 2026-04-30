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

const topics = ["Bug", "Feature request", "UX", "Other"];
const ratings = [1, 2, 3, 4, 5] as const;

export default function StarFeedbackExample() {
	const feedback = useFeedbackForm({
		topics,
		trigger: "docs_feedback_example",
	});

	return (
		<Popover onOpenChange={feedback.handleOpenChange} open={feedback.open}>
			<PopoverTrigger asChild>
				<Button type="button" variant="ghost">
					Feedback?
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className="w-[min(25rem,calc(100vw-2rem))] overflow-hidden p-0"
			>
				{feedback.hasSubmitted ? (
					<div className="space-y-4 p-5 text-center">
						<p className="font-medium text-sm">Thanks for the feedback</p>
						<div className="flex gap-2">
							<Button
								onClick={feedback.sendAnother}
								type="button"
								variant="secondary"
							>
								Send another
							</Button>
							<Button onClick={feedback.done} type="button">
								Done
							</Button>
						</div>
					</div>
				) : (
					<form onSubmit={feedback.handleSubmit}>
						<div className="space-y-2 p-3 pb-2">
							<Select
								disabled={feedback.isPending}
								onValueChange={feedback.handleTopicChange}
								value={feedback.topic}
							>
								<SelectTrigger
									aria-invalid={feedback.isTopicMissing}
									aria-label="Select topic"
									className="h-12 w-full px-4 font-medium text-base"
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
								aria-label="Your feedback"
								className="min-h-32 resize-none px-4 py-4 text-base"
								disabled={feedback.isPending}
								onChange={(event) =>
									feedback.handleCommentChange(event.target.value)
								}
								placeholder="Your feedback"
								value={feedback.comment}
							/>
						</div>

						{feedback.isTopicMissing ||
						feedback.isRatingMissing ||
						feedback.submitError ? (
							<div className="space-y-1 px-4 pb-3">
								{feedback.isTopicMissing ? (
									<p className="text-destructive text-xs" role="alert">
										Select a topic before sending feedback.
									</p>
								) : null}
								{feedback.isRatingMissing ? (
									<p className="text-destructive text-xs" role="alert">
										Choose a rating before sending feedback.
									</p>
								) : null}
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
						) : null}

						<div className="flex items-center justify-between gap-3 border-t px-4 py-3">
							<ToggleGroup
								aria-label="Feedback rating"
								className="gap-1"
								onValueChange={(value) => {
									if (value) {
										feedback.handleRatingSelect(Number(value));
									}
								}}
								type="single"
								value={feedback.fields.rating.selectedValue}
							>
								{ratings.map((rating) => (
									<ToggleGroupItem
										aria-label={`Rate ${rating} out of 5`}
										className={cn(
											"size-8 p-0 text-lg opacity-35 transition-opacity hover:opacity-75",
											feedback.fields.rating.displayValue &&
												rating <= feedback.fields.rating.displayValue
												? "opacity-100"
												: null
										)}
										key={rating}
										onMouseEnter={() =>
											feedback.handleRatingHoverChange(rating)
										}
										onMouseLeave={() => feedback.handleRatingHoverChange(null)}
										value={rating.toString()}
									>
										★
									</ToggleGroupItem>
								))}
							</ToggleGroup>

							<Button
								disabled={feedback.submit.disabled}
								size="sm"
								type="submit"
							>
								{feedback.submit.label}
							</Button>
						</div>
					</form>
				)}
			</PopoverContent>
		</Popover>
	);
}
