"use client";

import * as React from "react";
import { useFeedbackForm } from "../../hooks/use-feedback-form";
import { FeedbackCommentInput } from "../../primitives/feedback-comment-input";
import { FeedbackRatingSelector } from "../../primitives/feedback-rating-selector";
import { FeedbackTopicSelect } from "../../primitives/feedback-topic-select";
import { useSupport } from "../../provider";
import { CoButton } from "../../support/components/button";
import { ConfigurationErrorDisplay } from "../../support/components/configuration-error";
import { Icon } from "../../support/components/icons";
import { cn } from "../../support/utils";
import { useFeedbackConfig } from "../context/widget";

const DEFAULT_TOPIC_PLACEHOLDER = "Select a topic...";
const DEFAULT_COMMENT_PLACEHOLDER = "Tell us what happened...";

export type FeedbackPanelProps = {
	className?: string;
	conversationId?: string;
	trigger?: string;
	topics?: string[];
	defaultTopic?: string;
	topicPlaceholder?: string;
	commentPlaceholder?: string;
	commentRequired?: boolean;
};

export function FeedbackPanel({
	className,
	conversationId,
	trigger,
	topics,
	defaultTopic,
	topicPlaceholder = DEFAULT_TOPIC_PLACEHOLDER,
	commentPlaceholder = DEFAULT_COMMENT_PLACEHOLDER,
	commentRequired = false,
}: FeedbackPanelProps) {
	const { configurationError } = useSupport();
	const { close, isOpen } = useFeedbackConfig();
	const topicRef = React.useRef<HTMLSelectElement>(null);
	const commentRef = React.useRef<HTMLTextAreaElement>(null);
	const handleFormOpenChange = React.useCallback(
		(nextOpen: boolean) => {
			if (!nextOpen) {
				close();
			}
		},
		[close]
	);
	const feedback = useFeedbackForm({
		commentRequired,
		conversationId,
		defaultTopic,
		onOpenChange: handleFormOpenChange,
		topics,
		trigger,
	});

	React.useEffect(() => {
		if (!isOpen) {
			feedback.resetForm();
		}
	}, [feedback.resetForm, isOpen]);

	React.useEffect(() => {
		if (!(isOpen && !feedback.hasSubmitted)) {
			return;
		}

		if (
			feedback.availableTopics.length > 0 &&
			feedback.normalizedTopic.length === 0
		) {
			topicRef.current?.focus();
			return;
		}

		commentRef.current?.focus();
	}, [
		feedback.availableTopics.length,
		feedback.hasSubmitted,
		feedback.normalizedTopic.length,
		isOpen,
	]);

	if (configurationError) {
		return (
			<ConfigurationErrorDisplay
				className={className}
				error={configurationError}
			/>
		);
	}

	return (
		<div
			className={cn(
				"flex h-full flex-col bg-co-background text-co-foreground",
				className
			)}
			data-feedback-panel="true"
			data-slot="feedback-panel"
			data-state={feedback.hasSubmitted ? "submitted" : "form"}
		>
			<div
				className="flex items-start justify-between gap-4 border-co-border/70 border-b px-5 py-4"
				data-feedback-panel-header="true"
				data-slot="feedback-panel-header"
			>
				<div className="space-y-1">
					<h2 className="font-semibold text-base">Share feedback</h2>
					<p className="max-w-[28ch] text-balance text-co-muted-foreground text-sm">
						Leave a quick note any time. We read every submission.
					</p>
				</div>
				<button
					aria-label="Close feedback"
					className="inline-flex h-9 w-9 items-center justify-center rounded-full text-co-muted-foreground transition-colors hover:bg-co-background-100 hover:text-co-foreground"
					data-feedback-close="true"
					data-slot="feedback-close"
					onClick={feedback.done}
					type="button"
				>
					<Icon className="h-4 w-4" name="close" />
				</button>
			</div>

			{feedback.hasSubmitted ? (
				<div
					className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-8 text-center"
					data-feedback-success="true"
					data-slot="feedback-success"
				>
					<div className="flex h-14 w-14 items-center justify-center rounded-full bg-co-primary/10 text-co-primary">
						<Icon className="h-6 w-6" name="check" />
					</div>
					<div className="space-y-1">
						<h3 className="font-semibold text-lg">Thanks for the feedback</h3>
						<p className="max-w-[30ch] text-balance text-co-muted-foreground text-sm">
							Your response was attached to the current visitor context and is
							now available in Cossistant.
						</p>
					</div>
					<div className="flex gap-3">
						<CoButton
							onClick={feedback.sendAnother}
							type="button"
							variant="secondary"
						>
							Send another
						</CoButton>
						<CoButton onClick={feedback.done} type="button">
							Done
						</CoButton>
					</div>
				</div>
			) : (
				<div
					className="flex min-h-0 flex-1 flex-col px-5 py-4"
					data-feedback-form="true"
					data-slot="feedback-form"
				>
					<div className="flex min-h-0 flex-1 flex-col gap-4">
						{feedback.availableTopics.length > 0 ? (
							<div className="space-y-2" data-slot="feedback-topic-field">
								<label className="sr-only" htmlFor="cossistant-feedback-topic">
									Feedback topic
								</label>
								<FeedbackTopicSelect
									aria-invalid={feedback.fields.topic.isMissing}
									disabled={feedback.isPending}
									iconClassName="text-co-muted-foreground"
									id="cossistant-feedback-topic"
									invalid={feedback.fields.topic.isMissing}
									onBlur={feedback.fields.topic.handleBlur}
									onValueChange={feedback.handleTopicChange}
									options={feedback.availableTopics}
									placeholder={topicPlaceholder}
									ref={topicRef}
									value={feedback.topic}
								/>
							</div>
						) : null}

						<div
							className="flex min-h-0 flex-1 flex-col space-y-2"
							data-slot="feedback-comment-field"
						>
							<label className="sr-only" htmlFor="cossistant-feedback-comment">
								Your feedback
							</label>
							<FeedbackCommentInput
								aria-invalid={feedback.fields.comment.isMissing}
								className={cn(
									"min-h-[220px] w-full flex-1 resize-none rounded-[20px] border bg-co-background px-4 py-4 text-base text-co-foreground outline-none transition-colors placeholder:text-co-muted-foreground",
									feedback.fields.comment.isMissing
										? null
										: "hover:border-co-foreground/25"
								)}
								disabled={feedback.isPending}
								id="cossistant-feedback-comment"
								invalid={feedback.fields.comment.isMissing}
								onBlur={feedback.fields.comment.handleBlur}
								onValueChange={feedback.handleCommentChange}
								placeholder={commentPlaceholder}
								ref={commentRef}
								rows={7}
								value={feedback.comment}
							/>
							{commentRequired ? (
								<p className="text-co-muted-foreground text-xs">
									A short message is required for this form.
								</p>
							) : null}
						</div>
					</div>

					<div
						className="mt-4 border-co-border/70 border-t pt-4"
						data-feedback-form-footer="true"
						data-slot="feedback-form-footer"
					>
						<div className="flex items-center justify-between gap-4">
							<div className="space-y-2" data-slot="feedback-rating-field">
								<p className="text-co-muted-foreground text-xs">
									Rate this experience
								</p>
								<FeedbackRatingSelector
									buttonClassName="rounded-full"
									disabled={feedback.isPending}
									hoveredValue={feedback.fields.rating.displayValue}
									labelForRating={(rating) => `Rate ${rating} out of 5`}
									onBlur={feedback.fields.rating.handleBlur}
									onHoverChange={feedback.handleRatingHoverChange}
									onSelect={feedback.handleRatingSelect}
									size="md"
									value={feedback.rating}
								/>
							</div>

							<CoButton
								className="h-14 rounded-[16px] px-6 text-base"
								data-feedback-submit="true"
								data-slot="feedback-submit"
								data-state={feedback.isPending ? "submitting" : "idle"}
								disabled={feedback.submit.disabled}
								onClick={() => {
									void feedback.handleSubmit();
								}}
								type="button"
							>
								{feedback.submit.label}
							</CoButton>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
