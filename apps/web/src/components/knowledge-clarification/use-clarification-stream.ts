"use client";

import { experimental_useObject as useObject } from "@ai-sdk/react";
import {
	type KnowledgeClarificationStreamStepRequest,
	type KnowledgeClarificationStreamStepResponse,
	knowledgeClarificationStreamStepResponseSchema,
} from "@cossistant/types";
import { useState } from "react";
import { getAPIBaseUrl } from "@/lib/url";

type UseKnowledgeClarificationStreamOptions = {
	onFinish?: (
		result: KnowledgeClarificationStreamStepResponse
	) => void | Promise<void>;
	onError?: (error: Error) => void;
};

export function useKnowledgeClarificationStream({
	onFinish,
	onError,
}: UseKnowledgeClarificationStreamOptions = {}) {
	const stream = useObject<
		typeof knowledgeClarificationStreamStepResponseSchema,
		KnowledgeClarificationStreamStepResponse,
		KnowledgeClarificationStreamStepRequest
	>({
		api: getAPIBaseUrl("/knowledge-clarification/stream-step"),
		credentials: "include",
		fetch: ((input, init) =>
			fetch(input, {
				...init,
				credentials: "include",
			})) as typeof fetch,
		onError,
		onFinish: ({ object, error }) => {
			if (error || !object) {
				return;
			}

			void onFinish?.(object);
		},
		schema: knowledgeClarificationStreamStepResponseSchema,
	});

	return stream;
}

export function useKnowledgeClarificationStreamAction<TAction extends string>({
	onFinish,
	onError,
}: UseKnowledgeClarificationStreamOptions = {}) {
	const [pendingAction, setPendingAction] = useState<TAction | null>(null);
	const stream = useKnowledgeClarificationStream({
		onError: (error) => {
			setPendingAction(null);
			onError?.(error);
		},
		onFinish: async (result) => {
			setPendingAction(null);
			await onFinish?.(result);
		},
	});

	return {
		...stream,
		pendingAction,
		isPendingAction: (action: TAction) =>
			stream.isLoading && pendingAction === action,
		submitAction: (
			action: TAction,
			input: KnowledgeClarificationStreamStepRequest
		) => {
			setPendingAction(action);
			stream.submit(input);
		},
	};
}
