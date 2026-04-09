import type { RouterOutputs } from "@api/trpc/types";
import type {
	ConversationClarificationProgress,
	ConversationClarificationSummary,
	KnowledgeClarificationRequest,
} from "@cossistant/types";
import type { QueryClient } from "@tanstack/react-query";
import {
	forEachConversationHeadersQuery,
	updateConversationHeaderInCache,
} from "@/data/conversation-header-cache";

export type KnowledgeClarificationProposalsResponse =
	RouterOutputs["knowledgeClarification"]["listProposals"];
export type KnowledgeClarificationProposalResponse =
	RouterOutputs["knowledgeClarification"]["getProposal"];
export type KnowledgeClarificationProposalRequest =
	KnowledgeClarificationProposalsResponse["items"][number];

type ActiveClarificationQueryInput = {
	websiteSlug?: string;
	conversationId?: string;
};

type QueryKeyInput = {
	input?: ActiveClarificationQueryInput;
	type?: string;
};

function isActiveConversationClarificationStatus(
	status: KnowledgeClarificationRequest["status"]
): status is ConversationClarificationSummary["status"] {
	return (
		status === "analyzing" ||
		status === "awaiting_answer" ||
		status === "retry_required" ||
		status === "draft_ready"
	);
}

export function buildConversationClarificationSummaryFromRequest(params: {
	request: KnowledgeClarificationRequest | null;
	progress?: ConversationClarificationProgress | null;
}): ConversationClarificationSummary | null {
	if (
		!(
			params.request?.conversationId &&
			isActiveConversationClarificationStatus(params.request.status)
		)
	) {
		return null;
	}

	return {
		requestId: params.request.id,
		status: params.request.status,
		topicSummary: params.request.topicSummary,
		engagementMode: params.request.engagementMode,
		linkedConversationCount: params.request.linkedConversationCount,
		question: params.request.currentQuestion,
		currentSuggestedAnswers: params.request.currentSuggestedAnswers,
		currentQuestionInputMode: params.request.currentQuestionInputMode,
		currentQuestionScope: params.request.currentQuestionScope,
		stepIndex: params.request.stepIndex,
		maxSteps: params.request.maxSteps,
		updatedAt: params.request.updatedAt,
		progress: params.progress ?? null,
	};
}

function shouldAppearInProposalList(
	request: KnowledgeClarificationProposalRequest
): boolean {
	return (
		request.status === "analyzing" ||
		request.status === "awaiting_answer" ||
		request.status === "retry_required" ||
		request.status === "deferred" ||
		request.status === "draft_ready"
	);
}

function extractActiveClarificationInput(
	queryKey: readonly unknown[]
): ActiveClarificationQueryInput | null {
	if (queryKey.length < 2) {
		return null;
	}

	const maybeInput = queryKey[1];
	if (!maybeInput || typeof maybeInput !== "object") {
		return null;
	}

	const input = (maybeInput as QueryKeyInput).input;
	if (!input || typeof input !== "object") {
		return null;
	}

	return input;
}

export function forEachActiveConversationClarificationQuery(
	queryClient: QueryClient,
	params: {
		websiteSlug: string;
		conversationId: string;
		callback: (queryKey: readonly unknown[]) => void;
	}
): void {
	const queries = queryClient.getQueryCache().findAll({
		queryKey: [["knowledgeClarification", "getActiveForConversation"]],
	});

	for (const query of queries) {
		const queryKey = query.queryKey as readonly unknown[];
		const input = extractActiveClarificationInput(queryKey);

		if (!input) {
			continue;
		}

		if (input.websiteSlug !== params.websiteSlug) {
			continue;
		}

		if (input.conversationId !== params.conversationId) {
			continue;
		}

		params.callback(queryKey);
	}
}

export function invalidateActiveConversationClarificationQuery(
	queryClient: QueryClient,
	params: {
		websiteSlug: string;
		conversationId: string;
	}
): void {
	forEachActiveConversationClarificationQuery(queryClient, {
		...params,
		callback: (queryKey) => {
			void queryClient.invalidateQueries({
				queryKey,
				exact: true,
			});
		},
	});
}

export function setActiveConversationClarificationResponseInCache(
	queryClient: QueryClient,
	queryKey: readonly unknown[],
	request: KnowledgeClarificationRequest | null
): void {
	queryClient.setQueryData<{ request: KnowledgeClarificationRequest | null }>(
		queryKey,
		{
			request,
		}
	);
}

export function syncConversationClarificationRequestInCache(
	queryClient: QueryClient,
	params: {
		websiteSlug: string;
		request: KnowledgeClarificationRequest | null;
		conversationId?: string | null;
		progress?: ConversationClarificationProgress | null;
	}
): void {
	const conversationId =
		params.conversationId ?? params.request?.conversationId ?? null;
	if (!conversationId) {
		return;
	}

	const summary = buildConversationClarificationSummaryFromRequest({
		request: params.request,
		progress: params.progress ?? null,
	});

	forEachActiveConversationClarificationQuery(queryClient, {
		websiteSlug: params.websiteSlug,
		conversationId,
		callback: (queryKey) => {
			setActiveConversationClarificationResponseInCache(
				queryClient,
				queryKey,
				params.request
			);
		},
	});

	forEachConversationHeadersQuery(
		queryClient,
		params.websiteSlug,
		(queryKey) => {
			updateConversationHeaderInCache(
				queryClient,
				queryKey,
				conversationId,
				(header) => ({
					...header,
					activeClarification: summary,
				})
			);
		}
	);
}

export function clearConversationClarificationInCache(
	queryClient: QueryClient,
	params: {
		websiteSlug: string;
		conversationId: string;
	}
): void {
	syncConversationClarificationRequestInCache(queryClient, {
		websiteSlug: params.websiteSlug,
		request: null,
		conversationId: params.conversationId,
	});
}

export function syncProposalRequestInCache(
	queryClient: QueryClient,
	queryKey: readonly unknown[],
	request: KnowledgeClarificationProposalRequest
): void {
	queryClient.setQueryData<KnowledgeClarificationProposalsResponse | undefined>(
		queryKey,
		(existing) => {
			if (!existing) {
				return shouldAppearInProposalList(request)
					? { items: [request] }
					: existing;
			}

			const itemsWithoutRequest = existing.items.filter(
				(item) => item.id !== request.id
			);

			if (!shouldAppearInProposalList(request)) {
				if (itemsWithoutRequest.length === existing.items.length) {
					return existing;
				}

				return {
					...existing,
					items: itemsWithoutRequest,
				};
			}

			return {
				...existing,
				items: [request, ...itemsWithoutRequest],
			};
		}
	);
}

export function removeProposalRequestFromCache(
	queryClient: QueryClient,
	queryKey: readonly unknown[],
	requestId: string
): void {
	queryClient.setQueryData<KnowledgeClarificationProposalsResponse | undefined>(
		queryKey,
		(existing) => {
			if (!existing) {
				return existing;
			}

			const items = existing.items.filter((item) => item.id !== requestId);

			if (items.length === existing.items.length) {
				return existing;
			}

			return {
				...existing,
				items,
			};
		}
	);
}

export function setProposalResponseInCache(
	queryClient: QueryClient,
	queryKey: readonly unknown[],
	request: KnowledgeClarificationProposalRequest | null
): void {
	queryClient.setQueryData<KnowledgeClarificationProposalResponse | undefined>(
		queryKey,
		{ request }
	);
}
