"use client";

import * as React from "react";
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

function normalizeTopics(topics?: string[]): string[] {
	if (!topics?.length) {
		return [];
	}

	return Array.from(
		new Set(
			topics.map((topic) => topic.trim()).filter((topic) => topic.length > 0)
		)
	);
}

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
	const { website, client, configurationError } = useSupport();
	const { close, isOpen } = useFeedbackConfig();
	const topicRef = React.useRef<HTMLSelectElement>(null);
	const commentRef = React.useRef<HTMLTextAreaElement>(null);
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const [submitError, setSubmitError] = React.useState<string | null>(null);

	const availableTopics = React.useMemo(
		() => normalizeTopics(topics),
		[topics]
	);
	const resolvedDefaultTopic = React.useMemo(() => {
		if (!defaultTopic || availableTopics.length === 0) {
			return "";
		}

		const normalizedDefaultTopic = defaultTopic.trim();
		if (normalizedDefaultTopic.length === 0) {
			return "";
		}

		if (
			availableTopics.length > 0 &&
			!availableTopics.includes(normalizedDefaultTopic)
		) {
			return "";
		}

		return normalizedDefaultTopic;
	}, [availableTopics, defaultTopic]);

	React.useEffect(() => {
		if (
			process.env.NODE_ENV === "production" ||
			!defaultTopic ||
			availableTopics.length === 0 ||
			resolvedDefaultTopic
		) {
			return;
		}

		console.warn(
			'[plasma] <Feedback defaultTopic="..."> must match one of the provided topics. The invalid defaultTopic was ignored.'
		);
	}, [availableTopics, defaultTopic, resolvedDefaultTopic]);

	const [selectedRating, setSelectedRating] = React.useState<number | null>(
		null
	);
	const [hoveredRating, setHoveredRating] = React.useState<number | null>(null);
	const [comment, setComment] = React.useState("");
	const [selectedTopic, setSelectedTopic] =
		React.useState(resolvedDefaultTopic);
	const [hasSubmitted, setHasSubmitted] = React.useState(false);
	const [hasAttemptedSubmit, setHasAttemptedSubmit] = React.useState(false);

	const resetForm = React.useCallback(() => {
		setSelectedRating(null);
		setHoveredRating(null);
		setComment("");
		setSelectedTopic(resolvedDefaultTopic);
		setHasSubmitted(false);
		setHasAttemptedSubmit(false);
	}, [resolvedDefaultTopic]);

	React.useEffect(() => {
		resetForm();
	}, [conversationId, resetForm]);

	React.useEffect(() => {
		if (!isOpen) {
			setSubmitError(null);
			setIsSubmitting(false);
			resetForm();
		}
	}, [isOpen, resetForm]);

	const normalizedComment = comment.trim();
	const normalizedTopic = selectedTopic.trim();
	const topicRequired = availableTopics.length > 0;
	const isRatingMissing = selectedRating == null;
	const isTopicMissing = topicRequired && normalizedTopic.length === 0;
	const isCommentMissing = commentRequired && normalizedComment.length === 0;

	React.useEffect(() => {
		if (!(isOpen && !hasSubmitted)) {
			return;
		}

		if (topicRequired && normalizedTopic.length === 0) {
			topicRef.current?.focus();
			return;
		}

		commentRef.current?.focus();
	}, [hasSubmitted, isOpen, normalizedTopic.length, topicRequired]);

	const handleSubmit = React.useCallback(async () => {
		setHasAttemptedSubmit(true);
		setSubmitError(null);

		if (isRatingMissing || isTopicMissing || isCommentMissing) {
			return;
		}

		if (!(client && website?.visitor?.id && selectedRating)) {
			setSubmitError("Visitor context is unavailable.");
			return;
		}

		setIsSubmitting(true);

		try {
			await client.submitFeedback({
				rating: selectedRating,
				comment: normalizedComment || undefined,
				topic: normalizedTopic || undefined,
				trigger: trigger?.trim() || undefined,
				conversationId,
				visitorId: website.visitor.id,
				contactId: website.visitor.contact?.id,
				source: "widget",
			});
			setHasSubmitted(true);
		} catch (error) {
			const message =
				error instanceof Error && error.message
					? error.message
					: "We could not submit your feedback. Please try again.";
			setSubmitError(message);
		} finally {
			setIsSubmitting(false);
		}
	}, [
		client,
		conversationId,
		isCommentMissing,
		isRatingMissing,
		isTopicMissing,
		normalizedComment,
		normalizedTopic,
		selectedRating,
		trigger,
		website,
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
		>
			<div className="flex items-start justify-between gap-4 border-co-border/70 border-b px-5 py-4">
				<div className="space-y-1">
					<h2 className="font-semibold text-base">Share feedback</h2>
					<p className="max-w-[28ch] text-balance text-co-muted-foreground text-sm">
						Leave a quick note any time. We read every submission.
					</p>
				</div>
				<button
					aria-label="Close feedback"
					className="inline-flex h-9 w-9 items-center justify-center rounded-full text-co-muted-foreground transition-colors hover:bg-co-background-100 hover:text-co-foreground"
					onClick={close}
					type="button"
				>
					<Icon className="h-4 w-4" name="close" />
				</button>
			</div>

			{hasSubmitted ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-8 text-center">
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
							onClick={() => {
								setSubmitError(null);
								resetForm();
							}}
							type="button"
							variant="secondary"
						>
							Send another
						</CoButton>
						<CoButton onClick={close} type="button">
							Done
						</CoButton>
					</div>
				</div>
			) : (
				<div className="flex min-h-0 flex-1 flex-col px-5 py-4">
					<div className="flex min-h-0 flex-1 flex-col gap-4">
						{availableTopics.length > 0 ? (
							<div className="space-y-2">
								<label className="sr-only" htmlFor="plasma-feedback-topic">
									Feedback topic
								</label>
								<FeedbackTopicSelect
									aria-invalid={hasAttemptedSubmit && isTopicMissing}
									disabled={isSubmitting}
									iconClassName="text-co-muted-foreground"
									id="plasma-feedback-topic"
									invalid={hasAttemptedSubmit && isTopicMissing}
									onValueChange={setSelectedTopic}
									options={availableTopics}
									placeholder={topicPlaceholder}
									ref={topicRef}
									value={selectedTopic}
								/>
								{hasAttemptedSubmit && isTopicMissing ? (
									<p className="text-co-destructive text-xs">
										Select a topic before sending feedback.
									</p>
								) : null}
							</div>
						) : null}

						<div className="flex min-h-0 flex-1 flex-col space-y-2">
							<label className="sr-only" htmlFor="plasma-feedback-comment">
								Your feedback
							</label>
							<FeedbackCommentInput
								aria-invalid={hasAttemptedSubmit && isCommentMissing}
								className={cn(
									"min-h-[220px] w-full flex-1 resize-none rounded-[20px] border bg-co-background px-4 py-4 text-base text-co-foreground outline-none transition-colors placeholder:text-co-muted-foreground",
									hasAttemptedSubmit && isCommentMissing
										? null
										: "hover:border-co-foreground/25"
								)}
								disabled={isSubmitting}
								id="plasma-feedback-comment"
								invalid={hasAttemptedSubmit && isCommentMissing}
								onValueChange={setComment}
								placeholder={commentPlaceholder}
								ref={commentRef}
								rows={7}
								value={comment}
							/>
							{hasAttemptedSubmit && isCommentMissing ? (
								<p className="text-co-destructive text-xs">
									Add a message before sending feedback.
								</p>
							) : commentRequired ? (
								<p className="text-co-muted-foreground text-xs">
									A short message is required for this form.
								</p>
							) : null}
						</div>
					</div>

					<div className="mt-4 border-co-border/70 border-t pt-4">
						<div className="flex items-center justify-between gap-4">
							<div className="space-y-2">
								<p className="text-co-muted-foreground text-xs">
									Rate this experience
								</p>
								<FeedbackRatingSelector
									buttonClassName="rounded-full"
									disabled={isSubmitting}
									hoveredValue={hoveredRating}
									labelForRating={(rating) => `Rate ${rating} out of 5`}
									onHoverChange={setHoveredRating}
									onSelect={setSelectedRating}
									size="md"
									value={selectedRating}
								/>
							</div>

							<CoButton
								className="h-14 rounded-[16px] px-6 text-base"
								disabled={isSubmitting}
								onClick={() => {
									void handleSubmit();
								}}
								type="button"
							>
								{isSubmitting ? "Sending..." : "Send"}
							</CoButton>
						</div>

						{hasAttemptedSubmit && isRatingMissing ? (
							<p className="mt-2 text-co-destructive text-xs">
								Choose a rating before sending feedback.
							</p>
						) : null}

						{submitError ? (
							<p className="mt-2 text-co-destructive text-xs">{submitError}</p>
						) : null}
					</div>
				</div>
			)}
		</div>
	);
}
