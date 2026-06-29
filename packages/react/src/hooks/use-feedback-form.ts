"use client";

import type { CossistantClient } from "@cossistant/core";
import type { SubmitFeedbackResponse } from "@cossistant/types/api/feedback";
import * as React from "react";
import { useSubmitFeedback } from "./use-submit-feedback";

export type UseFeedbackFormOptions = {
	client?: CossistantClient | null;
	topics?: string[];
	defaultTopic?: string;
	trigger?: string;
	conversationId?: string;
	source?: string;
	visitorId?: string;
	contactId?: string;
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
	handleBlur: () => void;
	isDirty: boolean;
	isMissing: boolean;
	isTouched: boolean;
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

type FeedbackFormFieldName = keyof FeedbackFormFields;

type FeedbackFormInteractionState = Record<FeedbackFormFieldName, boolean>;

const EMPTY_FIELD_INTERACTION: FeedbackFormInteractionState = {
	comment: false,
	rating: false,
	topic: false,
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
	client,
	topics,
	defaultTopic,
	trigger,
	conversationId,
	source,
	visitorId,
	contactId,
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
	const [dirtyFields, setDirtyFields] =
		React.useState<FeedbackFormInteractionState>(EMPTY_FIELD_INTERACTION);
	const [touchedFields, setTouchedFields] =
		React.useState<FeedbackFormInteractionState>(EMPTY_FIELD_INTERACTION);
	const {
		error,
		isPending,
		mutateAsync: submitFeedback,
		reset: resetSubmitFeedback,
	} = useSubmitFeedback({ client, onError, onSuccess });

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
	const canAttemptSubmit = canSubmit;
	const isRatingMissing = hasAttemptedSubmit && rawIsRatingMissing;
	const isTopicMissing = hasAttemptedSubmit && rawIsTopicMissing;
	const isCommentMissing = hasAttemptedSubmit && rawIsCommentMissing;
	const markFieldDirty = React.useCallback((field: FeedbackFormFieldName) => {
		setDirtyFields((current) =>
			current[field] ? current : { ...current, [field]: true }
		);
	}, []);
	const markFieldTouched = React.useCallback((field: FeedbackFormFieldName) => {
		setTouchedFields((current) =>
			current[field] ? current : { ...current, [field]: true }
		);
	}, []);
	const handleRatingBlur = React.useCallback(() => {
		markFieldTouched("rating");
	}, [markFieldTouched]);
	const handleTopicBlur = React.useCallback(() => {
		markFieldTouched("topic");
	}, [markFieldTouched]);
	const handleCommentBlur = React.useCallback(() => {
		markFieldTouched("comment");
	}, [markFieldTouched]);
	const shouldShowRatingError =
		rawIsRatingMissing && (dirtyFields.rating || touchedFields.rating);
	const shouldShowTopicError =
		rawIsTopicMissing && (dirtyFields.topic || touchedFields.topic);
	const shouldShowCommentError =
		rawIsCommentMissing && (dirtyFields.comment || touchedFields.comment);
	const fields: FeedbackFormFields = {
		rating: {
			displayValue: hoveredRating ?? rating,
			selectedValue: rating?.toString() ?? "",
			error: getRatingError(shouldShowRatingError),
			handleBlur: handleRatingBlur,
			isDirty: dirtyFields.rating,
			isMissing: shouldShowRatingError,
			isTouched: touchedFields.rating,
		},
		topic: {
			error: getTopicError(shouldShowTopicError),
			handleBlur: handleTopicBlur,
			isDirty: dirtyFields.topic,
			isMissing: shouldShowTopicError,
			isTouched: touchedFields.topic,
		},
		comment: {
			error: getCommentError(shouldShowCommentError),
			handleBlur: handleCommentBlur,
			isDirty: dirtyFields.comment,
			isMissing: shouldShowCommentError,
			isTouched: touchedFields.comment,
		},
	};
	const submit: FeedbackFormSubmitState = {
		canSubmit,
		canAttemptSubmit,
		disabled: !canSubmit,
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
		setDirtyFields(EMPTY_FIELD_INTERACTION);
		setTouchedFields(EMPTY_FIELD_INTERACTION);
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
			markFieldDirty("rating");
			markFieldTouched("rating");
			setRating(nextRating);
		},
		[clearSubmitError, markFieldDirty, markFieldTouched]
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
			markFieldDirty("topic");
			markFieldTouched("topic");
			setTopic(nextTopic);
		},
		[clearSubmitError, markFieldDirty, markFieldTouched]
	);

	const handleCommentChange = React.useCallback(
		(nextComment: string) => {
			clearSubmitError();
			markFieldDirty("comment");
			setComment(nextComment);
		},
		[clearSubmitError, markFieldDirty]
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
					source,
					visitorId,
					contactId,
				});
				setHasSubmitted(true);
			} catch {
				// Error state is owned by useSubmitFeedback.
			}
		},
		[
			conversationId,
			contactId,
			normalizedComment,
			normalizedTopic,
			normalizedTrigger,
			rating,
			rawIsCommentMissing,
			rawIsRatingMissing,
			rawIsTopicMissing,
			resetSubmitFeedback,
			source,
			submitFeedback,
			visitorId,
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
