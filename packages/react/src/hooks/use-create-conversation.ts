import type { CossistantClient } from "@cossistant/core";
import type { CreateConversationResponseBody } from "@cossistant/types/api/conversation";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import type { Conversation } from "@cossistant/types/schemas";
import { useCallback, useState } from "react";
import { useOptionalSupportContext } from "../provider";

export type UseCreateConversationOptions = {
	client?: CossistantClient | null;
	onSuccess?: (data: CreateConversationResponseBody) => void;
	onError?: (error: Error) => void;
};

export type CreateConversationVariables = {
	conversationId?: string;
	defaultTimelineItems?: TimelineItem[];
	visitorId?: string;
	websiteId?: string | null;
	status?: Conversation["status"];
	title?: string | null;
};

export type UseCreateConversationResult = {
	mutate: (variables?: CreateConversationVariables) => void;
	mutateAsync: (
		variables?: CreateConversationVariables
	) => Promise<CreateConversationResponseBody | null>;
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

/**
 * Imperative helper for bootstrapping a new conversation locally before the
 * backend persists it. Mirrors react-query's mutate API to simplify
 * integration with forms or buttons.
 */
export function useCreateConversation(
	options: UseCreateConversationOptions = {}
): UseCreateConversationResult {
	const supportContext = useOptionalSupportContext();
	const contextClient = supportContext?.client ?? null;
	const { client: overrideClient, onError, onSuccess } = options;
	const client = overrideClient === undefined ? contextClient : overrideClient;

	const [isPending, setIsPending] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const mutateAsync = useCallback(
		async (
			variables: CreateConversationVariables = {}
		): Promise<CreateConversationResponseBody | null> => {
			setIsPending(true);
			setError(null);

			try {
				const {
					websiteId,
					status,
					title,
					conversationId: providedConversationId,
					defaultTimelineItems = [],
					visitorId,
				} = variables;

				if (!client) {
					throw new Error(
						"Cossistant client is not available. Please ensure you have configured your API key."
					);
				}

				const initiated = client.initiateConversation({
					conversationId: providedConversationId ?? undefined,
					defaultTimelineItems,
					visitorId: visitorId ?? undefined,
					websiteId: websiteId ?? undefined,
					status: status ?? undefined,
					title: title ?? undefined,
				});

				const response: CreateConversationResponseBody = {
					conversation: initiated.conversation,
					initialTimelineItems: initiated.defaultTimelineItems,
				};

				setIsPending(false);
				setError(null);
				onSuccess?.(response);
				return response;
			} catch (raw) {
				const normalised = toError(raw);
				setIsPending(false);
				setError(normalised);
				onError?.(normalised);
				throw normalised;
			}
		},
		[client, onError, onSuccess]
	);

	const mutate = useCallback(
		(variables?: CreateConversationVariables) => {
			void mutateAsync(variables).catch(() => {
				// Intentionally swallow to match react-query semantics
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
