"use client";

import { ConversationStatus } from "@plasma/types";
import { useCallback } from "react";
import { toast } from "sonner";
import { useOptionalInboxes } from "@/contexts/inboxes";
import { useConversationActions } from "@/data/use-conversation-actions";

export type RunConversationActionOptions = {
	successMessage?: string;
	errorMessage?: string;
	beforeAction?: () => void;
};

export type RunConversationAction = (
	action: () => Promise<unknown | boolean>,
	options?: RunConversationActionOptions
) => Promise<boolean>;

type UseConversationActionRunnerParams = Omit<
	Parameters<typeof useConversationActions>[0],
	"onNavigateAway"
>;

type UseConversationActionRunnerReturn = ReturnType<
	typeof useConversationActions
> & {
	runAction: RunConversationAction;
};

type InboxFilter = "open" | "resolved" | "spam" | "archived";

function resolveInboxFilter(
	status: ConversationStatus | "archived" | null | undefined
): InboxFilter {
	if (status === "archived") {
		return "archived";
	}

	switch (status) {
		case ConversationStatus.RESOLVED:
			return "resolved";
		case ConversationStatus.SPAM:
			return "spam";
		default:
			return "open";
	}
}

export function useConversationActionRunner(
	params: UseConversationActionRunnerParams
): UseConversationActionRunnerReturn {
	const inboxes = useOptionalInboxes();

	/**
	 * Navigate away callback that fires during onMutate (optimistic update phase).
	 * This provides instant navigation feedback before the mutation completes.
	 */
	const handleNavigateAway = useCallback(() => {
		if (!inboxes) {
			return false;
		}

		// Only navigate if this is the currently selected conversation
		if (inboxes.selectedConversationId !== params.conversationId) {
			return false;
		}

		// Use the navigateAwayIfNeeded helper which handles next/prev/goBack logic
		return inboxes.navigateAwayIfNeeded(params.conversationId);
	}, [inboxes, params.conversationId]);

	const actions = useConversationActions({
		...params,
		onNavigateAway: handleNavigateAway,
	});

	const runAction = useCallback<RunConversationAction>(
		async (action, options) => {
			const { successMessage, errorMessage, beforeAction } = options ?? {};

			beforeAction?.();

			try {
				const result = await action();

				if (result === false) {
					if (errorMessage) {
						toast.error(errorMessage);
					}

					return false;
				}

				if (successMessage) {
					toast.success(successMessage);
				}

				return true;
			} catch (error) {
				console.error("Failed to run conversation action", error);
				toast.error(errorMessage ?? "Failed to perform conversation action");
				return false;
			}
		},
		[]
	);

	return {
		...actions,
		runAction,
	};
}
