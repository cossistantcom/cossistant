"use client";

import type { SubmitFeedbackResponse } from "@cossistant/types/api/feedback";
import * as React from "react";
import { useSubmitFeedback } from "./use-submit-feedback";

export type UseFeedbackFormOptions = {
	topics?: string[];
	defaultTopic?: string;
	trigger?: string;
	conversationId?: string;
	commentRequired?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	onSuccess?: (data: SubmitFeedbackResponse) => void;
	onError?: (error: Error) => void;
};

export type FeedbackFormSubmitEvent =
	| React.FormEvent<HTMLFormElement>
	| React.MouseEvent<HTMLElement>;

export type FeedbackFormFieldState = {
	error: string | null;
	isMissing: boolean;
};

export type FeedbackFormRatingFieldState = FeedbackFormFieldState & {
	displayValue: number | null;
	selectedValue: string;
};

export type FeedbackFormFields = {
	rating: FeedbackFormRatingFieldState;
	topic: FeedbackFormFieldState;
	comment: FeedbackFormFieldState;
};

export type FeedbackFormSubmitState = {
	canSubmit: boolean;
	canAttemptSubmit: boolean;
	disabled: boolean;
	label: "Rating needed" | "Send" | "Sending...";
};

export type UseFeedbackFormResult = {
	open: boolean;
	rating: number | null;
	hoveredRating: number | null;
	topic: string;
	comment: string;
	hasSubmitted: boolean;
	hasAttemptedSubmit: boolean;
	isPending: boolean;
	error: Error | null;
	submitError: string | null;
	isRatingMissing: boolean;
	isTopicMissing: boolean;
	isCommentMissing: boolean;
	canSubmit: boolean;
	fields: FeedbackFormFields;
	submit: FeedbackFormSubmitState;
	normalizedTopic: string;
	normalizedComment: string;
	availableTopics: string[];
	setOpen: (open: boolean) => void;
	handleOpenChange: (open: boolean) => void;
	handleRatingSelect: (rating: number) => void;
	handleRatingHoverChange: (rating: number | null) => void;
	handleTopicChange: (topic: string) => void;
	handleCommentChange: (comment: string) => void;
	handleSubmit: (event?: FeedbackFormSubmitEvent) => Promise<void>;
	resetForm: () => void;
	sendAnother: () => void;
	done: () => void;
};

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

function getSubmitError(error: Error | null): string | null {
	if (!error) {
		return null;
	}

	return (
		error.message || "We could not submit your feedback. Please try again."
	);
}

function getTopicError(isMissing: boolean): string | null {
	return isMissing ? "Select a topic before sending feedback." : null;
}

function getCommentError(isMissing: boolean): string | null {
	return isMissing ? "Add a message before sending feedback." : null;
}

function getRatingError(isMissing: boolean): string | null {
	return isMissing ? "Choose a rating before sending feedback." : null;
}

export function useFeedbackForm({
	topics,
	defaultTopic,
	trigger,
	conversationId,
	commentRequired = false,
	defaultOpen = false,
	onOpenChange,
	onSuccess,
	onError,
}: UseFeedbackFormOptions = {}): UseFeedbackFormResult {
	const [open, setOpenState] = React.useState(defaultOpen);
	const [rating, setRating] = React.useState<number | null>(null);
	const [hoveredRating, setHoveredRating] = React.useState<number | null>(null);
	const [comment, setComment] = React.useState("");
	const [hasSubmitted, setHasSubmitted] = React.useState(false);
	const [hasAttemptedSubmit, setHasAttemptedSubmit] = React.useState(false);
	const {
		error,
		isPending,
		mutateAsync: submitFeedback,
		reset: resetSubmitFeedback,
	} = useSubmitFeedback({ onError, onSuccess });

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

		return availableTopics.includes(normalizedDefaultTopic)
			? normalizedDefaultTopic
			: "";
	}, [availableTopics, defaultTopic]);
	const [topic, setTopic] = React.useState(resolvedDefaultTopic);

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
			"[cossistant] useFeedbackForm defaultTopic must match one of the provided topics. The invalid defaultTopic was ignored."
		);
	}, [availableTopics, defaultTopic, resolvedDefaultTopic]);

	const normalizedTopic = topic.trim();
	const normalizedComment = comment.trim();
	const normalizedTrigger = trigger?.trim();
	const topicRequired = availableTopics.length > 0;
	const rawIsRatingMissing = rating == null;
	const rawIsTopicMissing = topicRequired && normalizedTopic.length === 0;
	const rawIsCommentMissing = commentRequired && normalizedComment.length === 0;
	const submitError = getSubmitError(error);
	const isValid = !(
		rawIsRatingMissing ||
		rawIsTopicMissing ||
		rawIsCommentMissing
	);
	const canSubmit = isValid && !isPending;
	const canAttemptSubmit = !isPending && (!hasAttemptedSubmit || isValid);
	const isRatingMissing = hasAttemptedSubmit && rawIsRatingMissing;
	const isTopicMissing = hasAttemptedSubmit && rawIsTopicMissing;
	const isCommentMissing = hasAttemptedSubmit && rawIsCommentMissing;
	const fields: FeedbackFormFields = {
		rating: {
			displayValue: hoveredRating ?? rating,
			selectedValue: rating?.toString() ?? "",
			error: getRatingError(isRatingMissing),
			isMissing: isRatingMissing,
		},
		topic: {
			error: getTopicError(isTopicMissing),
			isMissing: isTopicMissing,
		},
		comment: {
			error: getCommentError(isCommentMissing),
			isMissing: isCommentMissing,
		},
	};
	const submit: FeedbackFormSubmitState = {
		canSubmit,
		canAttemptSubmit,
		disabled: !canAttemptSubmit,
		label: isPending
			? "Sending..."
			: rawIsRatingMissing
				? "Rating needed"
				: "Send",
	};

	const resetForm = React.useCallback(() => {
		setRating(null);
		setHoveredRating(null);
		setTopic(resolvedDefaultTopic);
		setComment("");
		setHasSubmitted(false);
		setHasAttemptedSubmit(false);
		resetSubmitFeedback();
	}, [resetSubmitFeedback, resolvedDefaultTopic]);

	React.useEffect(() => {
		resetForm();
	}, [conversationId, resetForm]);

	const handleOpenChange = React.useCallback(
		(nextOpen: boolean) => {
			setOpenState(nextOpen);
			onOpenChange?.(nextOpen);

			if (!nextOpen) {
				resetForm();
			}
		},
		[onOpenChange, resetForm]
	);

	const clearSubmitError = React.useCallback(() => {
		if (error) {
			resetSubmitFeedback();
		}
	}, [error, resetSubmitFeedback]);

	const handleRatingSelect = React.useCallback(
		(nextRating: number) => {
			clearSubmitError();
			setRating(nextRating);
		},
		[clearSubmitError]
	);

	const handleRatingHoverChange = React.useCallback(
		(nextRating: number | null) => {
			setHoveredRating(nextRating);
		},
		[]
	);

	const handleTopicChange = React.useCallback(
		(nextTopic: string) => {
			clearSubmitError();
			setTopic(nextTopic);
		},
		[clearSubmitError]
	);

	const handleCommentChange = React.useCallback(
		(nextComment: string) => {
			clearSubmitError();
			setComment(nextComment);
		},
		[clearSubmitError]
	);

	const handleSubmit = React.useCallback(
		async (event?: FeedbackFormSubmitEvent) => {
			event?.preventDefault();
			setHasAttemptedSubmit(true);
			resetSubmitFeedback();

			if (
				rawIsRatingMissing ||
				rawIsTopicMissing ||
				rawIsCommentMissing ||
				rating == null
			) {
				return;
			}

			try {
				await submitFeedback({
					rating,
					topic: normalizedTopic || undefined,
					comment: normalizedComment || undefined,
					trigger: normalizedTrigger || undefined,
					conversationId,
				});
				setHasSubmitted(true);
			} catch {
				// Error state is owned by useSubmitFeedback.
			}
		},
		[
			conversationId,
			normalizedComment,
			normalizedTopic,
			normalizedTrigger,
			rating,
			rawIsCommentMissing,
			rawIsRatingMissing,
			rawIsTopicMissing,
			resetSubmitFeedback,
			submitFeedback,
		]
	);

	const done = React.useCallback(() => {
		handleOpenChange(false);
	}, [handleOpenChange]);

	return {
		open,
		rating,
		hoveredRating,
		topic,
		comment,
		hasSubmitted,
		hasAttemptedSubmit,
		isPending,
		error,
		submitError,
		isRatingMissing,
		isTopicMissing,
		isCommentMissing,
		canSubmit,
		fields,
		submit,
		normalizedTopic,
		normalizedComment,
		availableTopics,
		setOpen: handleOpenChange,
		handleOpenChange,
		handleRatingSelect,
		handleRatingHoverChange,
		handleTopicChange,
		handleCommentChange,
		handleSubmit,
		resetForm,
		sendAnother: resetForm,
		done,
	};
}
