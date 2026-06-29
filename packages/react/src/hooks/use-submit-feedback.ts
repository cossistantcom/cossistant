"use client";

import type { CossistantClient } from "@cossistant/core";
import type {
	SubmitFeedbackRequest,
	SubmitFeedbackResponse,
} from "@cossistant/types/api/feedback";
import { useCallback, useState } from "react";
import { useOptionalSupportContext } from "../provider";

export type UseSubmitFeedbackOptions = {
	client?: CossistantClient | null;
	onSuccess?: (data: SubmitFeedbackResponse) => void;
	onError?: (error: Error) => void;
};

export type SubmitFeedbackVariables = {
	rating: number;
	source?: string;
	topic?: string;
	comment?: string;
	trigger?: string;
	conversationId?: string;
	visitorId?: string;
	contactId?: string;
};

export type UseSubmitFeedbackResult = {
	mutate: (variables: SubmitFeedbackVariables) => void;
	mutateAsync: (
		variables: SubmitFeedbackVariables
	) => Promise<SubmitFeedbackResponse>;
	isPending: boolean;
	error: Error | null;
	reset: () => void;
};

function toError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}

	if (typeof error === "string") {
		return new Error(error);
	}

	return new Error("Unknown error");
}

function normalizeOptionalText(value: string | undefined): string | undefined {
	const normalized = value?.trim();
	return normalized ? normalized : undefined;
}

export function useSubmitFeedback(
	options: UseSubmitFeedbackOptions = {}
): UseSubmitFeedbackResult {
	const { client: overrideClient, onError, onSuccess } = options;
	const supportContext = useOptionalSupportContext();
	const contextClient = supportContext?.client ?? null;
	const website = supportContext?.website ?? null;
	const client = overrideClient === undefined ? contextClient : overrideClient;
	const visitorIdFromContext = website?.visitor?.id;
	const contactIdFromContext = website?.visitor?.contact?.id;
	const [isPending, setIsPending] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const mutateAsync = useCallback(
		async (
			variables: SubmitFeedbackVariables
		): Promise<SubmitFeedbackResponse> => {
			setIsPending(true);
			setError(null);

			try {
				if (!client) {
					throw new Error(
						"Cossistant client is not available. Please ensure you have configured your API key."
					);
				}

				const visitorId = variables.visitorId ?? visitorIdFromContext;

				if (!visitorId) {
					throw new Error("Visitor context is unavailable.");
				}

				const payload: SubmitFeedbackRequest = {
					rating: variables.rating,
					source: normalizeOptionalText(variables.source) ?? "widget",
					visitorId,
				};

				const comment = normalizeOptionalText(variables.comment);
				const topic = normalizeOptionalText(variables.topic);
				const trigger = normalizeOptionalText(variables.trigger);
				const conversationId = normalizeOptionalText(variables.conversationId);
				const contactId =
					normalizeOptionalText(variables.contactId) ?? contactIdFromContext;

				if (comment) {
					payload.comment = comment;
				}

				if (topic) {
					payload.topic = topic;
				}

				if (trigger) {
					payload.trigger = trigger;
				}

				if (conversationId) {
					payload.conversationId = conversationId;
				}

				if (contactId) {
					payload.contactId = contactId;
				}

				const response = await client.submitFeedback(payload);

				setIsPending(false);
				setError(null);
				onSuccess?.(response);
				return response;
			} catch (raw) {
				const normalizedError = toError(raw);
				setIsPending(false);
				setError(normalizedError);
				onError?.(normalizedError);
				throw normalizedError;
			}
		},
		[client, contactIdFromContext, onError, onSuccess, visitorIdFromContext]
	);

	const mutate = useCallback(
		(variables: SubmitFeedbackVariables) => {
			void mutateAsync(variables).catch(() => {
				// Intentionally swallow to match react-query semantics.
			});
		},
		[mutateAsync]
	);

	const reset = useCallback(() => {
		setError(null);
		setIsPending(false);
	}, []);

	return {
		mutate,
		mutateAsync,
		isPending,
		error,
		reset,
	};
}
