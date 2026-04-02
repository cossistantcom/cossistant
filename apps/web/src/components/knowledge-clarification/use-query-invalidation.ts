"use client";

import type { KnowledgeClarificationRequest } from "@plasma/types";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
	removeProposalRequestFromCache,
	setProposalResponseInCache,
	syncProposalRequestInCache,
} from "@/data/knowledge-clarification-cache";
import { useTRPC } from "@/lib/trpc/client";

type InvalidateKnowledgeClarificationOptions = {
	request?: KnowledgeClarificationRequest | null;
	requestId?: string | null;
	conversationId?: string | null;
	includeKnowledgeQueries?: boolean;
};

export function useKnowledgeClarificationQueryInvalidation(
	websiteSlug: string
) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	return useCallback(
		async ({
			request,
			requestId = null,
			conversationId = null,
			includeKnowledgeQueries = false,
		}: InvalidateKnowledgeClarificationOptions = {}) => {
			const resolvedRequestId = request?.id ?? requestId;
			const resolvedConversationId = request?.conversationId ?? conversationId;
			const proposalsQueryKey =
				trpc.knowledgeClarification.listProposals.queryKey({
					websiteSlug,
				});

			if (request) {
				syncProposalRequestInCache(queryClient, proposalsQueryKey, request);
			} else if (resolvedRequestId) {
				removeProposalRequestFromCache(
					queryClient,
					proposalsQueryKey,
					resolvedRequestId
				);
			}

			if (resolvedRequestId) {
				const proposalQueryKey =
					trpc.knowledgeClarification.getProposal.queryKey({
						websiteSlug,
						requestId: resolvedRequestId,
					});

				setProposalResponseInCache(
					queryClient,
					proposalQueryKey,
					request ?? null
				);
			}

			const invalidations: Promise<unknown>[] = [
				queryClient.invalidateQueries({
					queryKey: proposalsQueryKey,
				}),
			];

			if (resolvedConversationId) {
				invalidations.push(
					queryClient.invalidateQueries({
						queryKey:
							trpc.knowledgeClarification.getActiveForConversation.queryKey({
								websiteSlug,
								conversationId: resolvedConversationId,
							}),
					})
				);
			}

			if (resolvedRequestId) {
				invalidations.push(
					queryClient.invalidateQueries({
						queryKey: trpc.knowledgeClarification.getProposal.queryKey({
							websiteSlug,
							requestId: resolvedRequestId,
						}),
					})
				);
			}

			if (includeKnowledgeQueries) {
				invalidations.push(
					queryClient.invalidateQueries({
						queryKey: trpc.knowledge.list.queryKey({
							websiteSlug,
							type: "faq",
						}),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.linkSource.getTrainingStats.queryKey({
							websiteSlug,
						}),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.aiAgent.getTrainingReadiness.queryKey({
							websiteSlug,
						}),
					})
				);
			}

			await Promise.all(invalidations);
		},
		[queryClient, trpc, websiteSlug]
	);
}
