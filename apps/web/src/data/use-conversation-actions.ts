"use client";

import type {
	OrigamiTRPCRouter,
	RouterInputs,
	RouterOutputs,
} from "@api/trpc/types";
import { ConversationStatus } from "@cossistant/types";
import { useQueryNormalizer } from "@normy/react-query";
import {
	type InfiniteData,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import type { TRPCClientErrorLike } from "@trpc/client";
import { useCallback, useMemo } from "react";
import { useUserSession, useWebsite } from "@/contexts/website";
import { useTRPC } from "@/lib/trpc/client";
import {
	type ConversationHeader,
	type ConversationHeadersPage,
	createConversationHeadersInfiniteQueryKey,
	forEachConversationHeadersQuery,
	updateConversationHeaderInCache,
} from "./conversation-header-cache";

type ConversationMutationResponse =
	RouterOutputs["conversation"]["markResolved"];
type UpdateTitleResponse = RouterOutputs["conversation"]["updateTitle"];
type BlockVisitorResponse = RouterOutputs["visitor"]["block"];

type BaseConversationMutationVariables =
	RouterInputs["conversation"]["markResolved"];
type MarkReadVariables = RouterInputs["conversation"]["markRead"];
type MarkUnreadVariables = RouterInputs["conversation"]["markUnread"];
type PauseAiVariables = RouterInputs["conversation"]["pauseAi"];
type ResumeAiVariables = RouterInputs["conversation"]["resumeAi"];
type UpdateTitleVariables = RouterInputs["conversation"]["updateTitle"];
type UpdatePriorityVariables = RouterInputs["conversation"]["updatePriority"];
type UpdateSentimentVariables = RouterInputs["conversation"]["updateSentiment"];
type BlockVisitorVariables = RouterInputs["visitor"]["block"];
type UnblockVisitorVariables = RouterInputs["visitor"]["unblock"];

type TRPCError = TRPCClientErrorLike<OrigamiTRPCRouter>;

type MutationContext = {
	previousHeader?: ConversationHeader | null;
	visitorQueryKey?: readonly unknown[] | null;
	previousVisitor?: RouterOutputs["conversation"]["getVisitorById"] | null;
	headersSnapshots?: Array<{
		queryKey: readonly unknown[];
		data: InfiniteData<ConversationHeadersPage> | undefined;
	}>;
};

function cloneConversationHeader(
	header: ConversationHeader
): ConversationHeader {
	return JSON.parse(JSON.stringify(header)) as ConversationHeader;
}

type UseConversationActionsParams = {
	conversationId: string;
	visitorId?: string | null;
	/**
	 * Optional callback to navigate away after an action that moves
	 * the conversation out of the current filter (archive, spam, resolve).
	 * Returns true if navigation happened.
	 */
	onNavigateAway?: () => boolean;
};

type UseConversationActionsReturn = {
	markResolved: () => Promise<ConversationMutationResponse>;
	markOpen: () => Promise<ConversationMutationResponse>;
	markSpam: () => Promise<ConversationMutationResponse>;
	markNotSpam: () => Promise<ConversationMutationResponse>;
	markArchived: () => Promise<ConversationMutationResponse>;
	markUnarchived: () => Promise<ConversationMutationResponse>;
	markRead: () => Promise<ConversationMutationResponse>;
	markUnread: () => Promise<ConversationMutationResponse>;
	pauseAi: (durationMinutes: number) => Promise<ConversationMutationResponse>;
	resumeAi: () => Promise<ConversationMutationResponse>;
	updateTitle: (title: string | null) => Promise<UpdateTitleResponse>;
	updatePriority: (
		priority: UpdatePriorityVariables["priority"]
	) => Promise<ConversationMutationResponse>;
	updateSentiment: (
		sentiment: UpdateSentimentVariables["sentiment"]
	) => Promise<ConversationMutationResponse>;
	joinEscalation: () => Promise<ConversationMutationResponse>;
	blockVisitor: () => Promise<BlockVisitorResponse>;
	unblockVisitor: () => Promise<BlockVisitorResponse>;
	isAnyPending: boolean;
	pendingAction: {
		markResolved: boolean;
		markOpen: boolean;
		markSpam: boolean;
		markNotSpam: boolean;
		markArchived: boolean;
		markUnarchived: boolean;
		markRead: boolean;
		markUnread: boolean;
		pauseAi: boolean;
		resumeAi: boolean;
		updateTitle: boolean;
		updatePriority: boolean;
		updateSentiment: boolean;
		joinEscalation: boolean;
		blockVisitor: boolean;
		unblockVisitor: boolean;
	};
};

function mergeWithServerConversation(
	existing: ConversationHeader,
	server: ConversationMutationResponse["conversation"]
): ConversationHeader {
	return {
		...existing,
		...server,
	};
}

function computeResolutionTime(
	existing: ConversationHeader,
	now: string
): number | null {
	if (!existing.startedAt) {
		return existing.resolutionTime ?? null;
	}

	const diffSeconds = Math.max(
		0,
		Math.round(
			(new Date(now).getTime() - new Date(existing.startedAt).getTime()) / 1000
		)
	);

	return diffSeconds;
}

function computePausedUntil(durationMinutes: number): string {
	return new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
}

export function useConversationActions({
	conversationId,
	visitorId,
	onNavigateAway,
}: UseConversationActionsParams): UseConversationActionsReturn {
	const trpc = useTRPC();
	const website = useWebsite();
	const { user } = useUserSession();
	const queryClient = useQueryClient();
	const queryNormalizer = useQueryNormalizer();

	const effectiveVisitorId = visitorId ?? null;

	const headersQueryKey = useMemo(
		() =>
			createConversationHeadersInfiniteQueryKey(
				trpc.conversation.listConversationsHeaders.queryOptions({
					websiteSlug: website.slug,
				}).queryKey
			),
		[trpc, website.slug]
	);

	const prepareContext = useCallback(async (): Promise<MutationContext> => {
		await queryClient.cancelQueries({ queryKey: headersQueryKey });

		// Type assertion needed because TimelineItemParts contains complex union types
		// that don't fit @normy/react-query's simpler Data type constraints
		const existingHeader = queryNormalizer.getObjectById(conversationId) as
			| ConversationHeader
			| undefined;

		const headersSnapshots: MutationContext["headersSnapshots"] = [];
		forEachConversationHeadersQuery(queryClient, website.slug, (queryKey) => {
			headersSnapshots.push({
				queryKey,
				data: queryClient.getQueryData<InfiniteData<ConversationHeadersPage>>(
					queryKey
				),
			});
		});

		return {
			previousHeader: existingHeader
				? cloneConversationHeader(existingHeader)
				: null,
			headersSnapshots,
		};
	}, [
		conversationId,
		headersQueryKey,
		queryClient,
		queryNormalizer,
		website.slug,
	]);

	const restoreContext = useCallback(
		(context?: MutationContext) => {
			if (context?.previousHeader) {
				queryNormalizer.setNormalizedData(
					context.previousHeader as Parameters<
						typeof queryNormalizer.setNormalizedData
					>[0]
				);
			}

			if (context?.visitorQueryKey) {
				queryClient.setQueryData(
					context.visitorQueryKey,
					context.previousVisitor ?? null
				);
			}

			for (const snapshot of context?.headersSnapshots ?? []) {
				queryClient.setQueryData(snapshot.queryKey, snapshot.data);
			}
		},
		[queryClient, queryNormalizer]
	);

	const applyOptimisticUpdate = useCallback(
		(updater: (conversation: ConversationHeader) => ConversationHeader) => {
			forEachConversationHeadersQuery(queryClient, website.slug, (queryKey) => {
				updateConversationHeaderInCache(
					queryClient,
					queryKey,
					conversationId,
					updater
				);
			});

			const existing = queryNormalizer.getObjectById(conversationId) as
				| ConversationHeader
				| undefined;

			if (!existing) {
				return;
			}

			const updated = updater(cloneConversationHeader(existing));
			queryNormalizer.setNormalizedData(
				updated as Parameters<typeof queryNormalizer.setNormalizedData>[0]
			);
		},
		[conversationId, queryClient, queryNormalizer, website.slug]
	);

	const markResolvedMutation = useMutation<
		ConversationMutationResponse,
		TRPCError,
		BaseConversationMutationVariables,
		MutationContext
	>({
		...trpc.conversation.markResolved.mutationOptions(),
		onMutate: async () => {
			const context = await prepareContext();
			const now = new Date().toISOString();

			applyOptimisticUpdate((existing) => ({
				...existing,
				status: ConversationStatus.RESOLVED,
				resolvedAt: now,
				resolvedByUserId: user.id,
				resolvedByAiAgentId: null,
				resolutionTime: computeResolutionTime(existing, now),
				updatedAt: now,
			}));

			// Navigate away after optimistic update (conversation will leave Open filter)
			onNavigateAway?.();

			return context;
		},
		onError: (_error, _variables, context) => {
			restoreContext(context);
		},
		onSuccess: (data) => {
			applyOptimisticUpdate((existing) =>
				mergeWithServerConversation(existing, data.conversation)
			);
		},
	});

	const markOpenMutation = useMutation<
		ConversationMutationResponse,
		TRPCError,
		BaseConversationMutationVariables,
		MutationContext
	>({
		...trpc.conversation.markOpen.mutationOptions(),
		onMutate: async () => {
			const context = await prepareContext();
			const now = new Date().toISOString();

			applyOptimisticUpdate((existing) => ({
				...existing,
				status: ConversationStatus.OPEN,
				resolvedAt: null,
				resolvedByUserId: null,
				resolvedByAiAgentId: null,
				resolutionTime: null,
				updatedAt: now,
			}));

			return context;
		},
		onError: (_error, _variables, context) => {
			restoreContext(context);
		},
		onSuccess: (data) => {
			applyOptimisticUpdate((existing) =>
				mergeWithServerConversation(existing, data.conversation)
			);
		},
	});

	const markSpamMutation = useMutation<
		ConversationMutationResponse,
		TRPCError,
		BaseConversationMutationVariables,
		MutationContext
	>({
		...trpc.conversation.markSpam.mutationOptions(),
		onMutate: async () => {
			const context = await prepareContext();
			const now = new Date().toISOString();

			applyOptimisticUpdate((existing) => ({
				...existing,
				status: ConversationStatus.SPAM,
				resolvedAt: null,
				resolvedByUserId: null,
				resolvedByAiAgentId: null,
				updatedAt: now,
			}));

			// Navigate away after optimistic update (conversation will leave current filter)
			onNavigateAway?.();

			return context;
		},
		onError: (_error, _variables, context) => {
			restoreContext(context);
		},
		onSuccess: (data) => {
			applyOptimisticUpdate((existing) =>
				mergeWithServerConversation(existing, data.conversation)
			);
		},
	});

	const markNotSpamMutation = useMutation<
		ConversationMutationResponse,
		TRPCError,
		BaseConversationMutationVariables,
		MutationContext
	>({
		...trpc.conversation.markNotSpam.mutationOptions(),
		onMutate: async () => {
			const context = await prepareContext();
			const now = new Date().toISOString();

			applyOptimisticUpdate((existing) => ({
				...existing,
				status: ConversationStatus.OPEN,
				resolvedAt: null,
				resolvedByUserId: null,
				resolvedByAiAgentId: null,
				resolutionTime: null,
				updatedAt: now,
			}));

			return context;
		},
		onError: (_error, _variables, context) => {
			restoreContext(context);
		},
		onSuccess: (data) => {
			applyOptimisticUpdate((existing) =>
				mergeWithServerConversation(existing, data.conversation)
			);
		},
	});

	const markArchivedMutation = useMutation<
		ConversationMutationResponse,
		TRPCError,
		BaseConversationMutationVariables,
		MutationContext
	>({
		...trpc.conversation.markArchived.mutationOptions(),
		onMutate: async () => {
			const context = await prepareContext();
			const now = new Date().toISOString();

			applyOptimisticUpdate((existing) => ({
				...existing,
				deletedAt: now,
				updatedAt: now,
			}));

			// Navigate away after optimistic update (conversation will leave current filter)
			onNavigateAway?.();

			return context;
		},
		onError: (_error, _variables, context) => {
			restoreContext(context);
		},
		onSuccess: (data) => {
			applyOptimisticUpdate((existing) =>
				mergeWithServerConversation(existing, data.conversation)
			);
		},
	});

	const markUnarchivedMutation = useMutation<
		ConversationMutationResponse,
		TRPCError,
		BaseConversationMutationVariables,
		MutationContext
	>({
		...trpc.conversation.markUnarchived.mutationOptions(),
		onMutate: async () => {
			const context = await prepareContext();
			const now = new Date().toISOString();

			applyOptimisticUpdate((existing) => ({
				...existing,
				deletedAt: null,
				updatedAt: now,
			}));

			return context;
		},
		onError: (_error, _variables, context) => {
			restoreContext(context);
		},
		onSuccess: (data) => {
			applyOptimisticUpdate((existing) =>
				mergeWithServerConversation(existing, data.conversation)
			);
		},
	});

	const markReadMutation = useMutation<
		ConversationMutationResponse,
		TRPCError,
		MarkReadVariables,
		MutationContext
	>({
		...trpc.conversation.markRead.mutationOptions(),
		onMutate: async () => {
			const context = await prepareContext();
			const now = new Date().toISOString();

			applyOptimisticUpdate((existing) => ({
				...existing,
				lastSeenAt: now,
			}));

			return context;
		},
		onError: (_error, _variables, context) => {
			restoreContext(context);
		},
		onSuccess: (data) => {
			applyOptimisticUpdate((existing) =>
				mergeWithServerConversation(existing, data.conversation)
			);
		},
	});

	const markUnreadMutation = useMutation<
		ConversationMutationResponse,
		TRPCError,
		MarkUnreadVariables,
		MutationContext
	>({
		...trpc.conversation.markUnread.mutationOptions(),
		onMutate: async () => {
			const context = await prepareContext();

			applyOptimisticUpdate((existing) => ({
				...existing,
				lastSeenAt: null,
			}));

			return context;
		},
		onError: (_error, _variables, context) => {
			restoreContext(context);
		},
		onSuccess: (data) => {
			applyOptimisticUpdate((existing) =>
				mergeWithServerConversation(existing, data.conversation)
			);
		},
	});

	const pauseAiMutation = useMutation<
		ConversationMutationResponse,
		TRPCError,
		PauseAiVariables,
		MutationContext
	>({
		...trpc.conversation.pauseAi.mutationOptions(),
		onMutate: async (variables) => {
			const context = await prepareContext();
			if (variables.durationMinutes === undefined) {
				return context;
			}
			const now = new Date().toISOString();
			const aiPausedUntil = computePausedUntil(variables.durationMinutes);

			applyOptimisticUpdate((existing) => ({
				...existing,
				aiPausedUntil,
				updatedAt: now,
			}));

			return context;
		},
		onError: (_error, _variables, context) => {
			restoreContext(context);
		},
		onSuccess: (data) => {
			applyOptimisticUpdate((existing) =>
				mergeWithServerConversation(existing, data.conversation)
			);
		},
	});

	const resumeAiMutation = useMutation<
		ConversationMutationResponse,
		TRPCError,
		ResumeAiVariables,
		MutationContext
	>({
		...trpc.conversation.resumeAi.mutationOptions(),
		onMutate: async () => {
			const context = await prepareContext();
			const now = new Date().toISOString();

			applyOptimisticUpdate((existing) => ({
				...existing,
				aiPausedUntil: null,
				updatedAt: now,
			}));

			return context;
		},
		onError: (_error, _variables, context) => {
			restoreContext(context);
		},
		onSuccess: (data) => {
			applyOptimisticUpdate((existing) =>
				mergeWithServerConversation(existing, data.conversation)
			);
		},
	});

	const updateTitleMutation = useMutation<
		UpdateTitleResponse,
		TRPCError,
		UpdateTitleVariables,
		MutationContext
	>({
		...trpc.conversation.updateTitle.mutationOptions(),
		onMutate: async (variables) => {
			const context = await prepareContext();
			const now = new Date().toISOString();

			applyOptimisticUpdate((existing) => ({
				...existing,
				title: variables.title,
				titleSource: "user",
				updatedAt: now,
			}));

			return context;
		},
		onError: (_error, _variables, context) => {
			restoreContext(context);
		},
		onSuccess: (data) => {
			applyOptimisticUpdate((existing) =>
				mergeWithServerConversation(existing, data.conversation)
			);
		},
	});

	const updatePriorityMutation = useMutation<
		ConversationMutationResponse,
		TRPCError,
		UpdatePriorityVariables,
		MutationContext
	>({
		...trpc.conversation.updatePriority.mutationOptions(),
		onMutate: async (variables) => {
			const context = await prepareContext();
			const now = new Date().toISOString();

			applyOptimisticUpdate((existing) => ({
				...existing,
				priority: variables.priority,
				prioritySource: "user",
				updatedAt: now,
			}));

			return context;
		},
		onError: (_error, _variables, context) => {
			restoreContext(context);
		},
		onSuccess: (data) => {
			applyOptimisticUpdate((existing) =>
				mergeWithServerConversation(existing, data.conversation)
			);
		},
	});

	const updateSentimentMutation = useMutation<
		ConversationMutationResponse,
		TRPCError,
		UpdateSentimentVariables,
		MutationContext
	>({
		...trpc.conversation.updateSentiment.mutationOptions(),
		onMutate: async (variables) => {
			const context = await prepareContext();
			const now = new Date().toISOString();

			applyOptimisticUpdate((existing) => ({
				...existing,
				sentiment: variables.sentiment,
				sentimentConfidence: null,
				sentimentSource: "user",
				updatedAt: now,
			}));

			return context;
		},
		onError: (_error, _variables, context) => {
			restoreContext(context);
		},
		onSuccess: (data) => {
			applyOptimisticUpdate((existing) =>
				mergeWithServerConversation(existing, data.conversation)
			);
		},
	});

	const joinEscalationMutation = useMutation<
		ConversationMutationResponse,
		TRPCError,
		BaseConversationMutationVariables,
		MutationContext
	>({
		...trpc.conversation.joinEscalation.mutationOptions(),
		onMutate: async () => {
			const context = await prepareContext();
			const now = new Date().toISOString();

			applyOptimisticUpdate((existing) => ({
				...existing,
				escalationHandledAt: now,
				escalationHandledByUserId: user.id,
				updatedAt: now,
			}));

			return context;
		},
		onError: (_error, _variables, context) => {
			restoreContext(context);
		},
		onSuccess: (data) => {
			applyOptimisticUpdate((existing) =>
				mergeWithServerConversation(existing, data.conversation)
			);
		},
	});

	const blockVisitorMutation = useMutation<
		BlockVisitorResponse,
		TRPCError,
		BlockVisitorVariables,
		MutationContext
	>({
		...trpc.visitor.block.mutationOptions(),
		onMutate: async () => {
			const context = await prepareContext();
			const blockedAt = new Date().toISOString();

			if (effectiveVisitorId) {
				const visitorQueryKey = trpc.conversation.getVisitorById.queryOptions({
					websiteSlug: website.slug,
					visitorId: effectiveVisitorId,
				}).queryKey;

				context.visitorQueryKey = visitorQueryKey;
				context.previousVisitor =
					queryClient.getQueryData(visitorQueryKey) ?? null;

				queryClient.setQueryData(visitorQueryKey, (existing) => {
					if (!existing) {
						return existing;
					}

					return {
						...existing,
						blockedAt,
						blockedByUserId: user.id,
						isBlocked: true,
						updatedAt: blockedAt,
					};
				});
			}

			applyOptimisticUpdate((existing) => {
				if (!effectiveVisitorId) {
					return existing;
				}

				const visitor = existing.visitor;
				if (!visitor || visitor.id !== effectiveVisitorId) {
					return existing;
				}

				return {
					...existing,
					visitor: {
						...visitor,
						blockedAt,
						blockedByUserId: user.id,
						isBlocked: true,
					},
					updatedAt: blockedAt,
				};
			});

			return context;
		},
		onError: (_error, _variables, context) => {
			restoreContext(context);
		},
		onSuccess: (data, _variables, context) => {
			applyOptimisticUpdate((existing) => {
				const merged = mergeWithServerConversation(existing, data.conversation);

				if (!effectiveVisitorId) {
					return merged;
				}

				const visitor = merged.visitor;
				if (!visitor || visitor.id !== effectiveVisitorId) {
					return merged;
				}

				return {
					...merged,
					visitor: {
						...visitor,
						blockedAt: data.visitor.blockedAt,
						blockedByUserId: data.visitor.blockedByUserId,
						isBlocked: data.visitor.isBlocked,
						lastSeenAt: data.visitor.lastSeenAt ?? visitor.lastSeenAt,
					},
				};
			});

			if (context?.visitorQueryKey) {
				queryClient.setQueryData(context.visitorQueryKey, data.visitor);
			}
		},
	});

	const unblockVisitorMutation = useMutation<
		BlockVisitorResponse,
		TRPCError,
		UnblockVisitorVariables,
		MutationContext
	>({
		...trpc.visitor.unblock.mutationOptions(),
		onMutate: async () => {
			const context = await prepareContext();
			const unblockedAt = new Date().toISOString();

			if (effectiveVisitorId) {
				const visitorQueryKey = trpc.conversation.getVisitorById.queryOptions({
					websiteSlug: website.slug,
					visitorId: effectiveVisitorId,
				}).queryKey;

				context.visitorQueryKey = visitorQueryKey;
				context.previousVisitor =
					queryClient.getQueryData(visitorQueryKey) ?? null;

				queryClient.setQueryData(visitorQueryKey, (existing) => {
					if (!existing) {
						return existing;
					}

					return {
						...existing,
						blockedAt: null,
						blockedByUserId: null,
						isBlocked: false,
						updatedAt: unblockedAt,
					};
				});
			}

			applyOptimisticUpdate((existing) => {
				if (!effectiveVisitorId) {
					return existing;
				}

				const visitor = existing.visitor;
				if (!visitor || visitor.id !== effectiveVisitorId) {
					return existing;
				}

				return {
					...existing,
					visitor: {
						...visitor,
						blockedAt: null,
						blockedByUserId: null,
						isBlocked: false,
					},
					updatedAt: unblockedAt,
				};
			});

			return context;
		},
		onError: (_error, _variables, context) => {
			restoreContext(context);
		},
		onSuccess: (data, _variables, context) => {
			applyOptimisticUpdate((existing) => {
				const merged = mergeWithServerConversation(existing, data.conversation);

				if (!effectiveVisitorId) {
					return merged;
				}

				const visitor = merged.visitor;
				if (!visitor || visitor.id !== effectiveVisitorId) {
					return merged;
				}

				return {
					...merged,
					visitor: {
						...visitor,
						blockedAt: data.visitor.blockedAt,
						blockedByUserId: data.visitor.blockedByUserId,
						isBlocked: data.visitor.isBlocked,
						lastSeenAt: data.visitor.lastSeenAt ?? visitor.lastSeenAt,
					},
				};
			});

			if (context?.visitorQueryKey) {
				queryClient.setQueryData(context.visitorQueryKey, data.visitor);
			}
		},
	});

	const markResolved = useCallback(
		() =>
			markResolvedMutation.mutateAsync({
				conversationId,
				websiteSlug: website.slug,
			}),
		[conversationId, markResolvedMutation, website.slug]
	);

	const markOpen = useCallback(
		() =>
			markOpenMutation.mutateAsync({
				conversationId,
				websiteSlug: website.slug,
			}),
		[conversationId, markOpenMutation, website.slug]
	);

	const markSpam = useCallback(
		() =>
			markSpamMutation.mutateAsync({
				conversationId,
				websiteSlug: website.slug,
			}),
		[conversationId, markSpamMutation, website.slug]
	);

	const markNotSpam = useCallback(
		() =>
			markNotSpamMutation.mutateAsync({
				conversationId,
				websiteSlug: website.slug,
			}),
		[conversationId, markNotSpamMutation, website.slug]
	);

	const markArchived = useCallback(
		() =>
			markArchivedMutation.mutateAsync({
				conversationId,
				websiteSlug: website.slug,
			}),
		[conversationId, markArchivedMutation, website.slug]
	);

	const markUnarchived = useCallback(
		() =>
			markUnarchivedMutation.mutateAsync({
				conversationId,
				websiteSlug: website.slug,
			}),
		[conversationId, markUnarchivedMutation, website.slug]
	);

	const markRead = useCallback(
		() =>
			markReadMutation.mutateAsync({
				conversationId,
				websiteSlug: website.slug,
			}),
		[conversationId, markReadMutation, website.slug]
	);

	const markUnread = useCallback(
		() =>
			markUnreadMutation.mutateAsync({
				conversationId,
				websiteSlug: website.slug,
			}),
		[conversationId, markUnreadMutation, website.slug]
	);

	const pauseAi = useCallback(
		(durationMinutes: number) =>
			pauseAiMutation.mutateAsync({
				conversationId,
				websiteSlug: website.slug,
				durationMinutes,
			}),
		[conversationId, pauseAiMutation, website.slug]
	);

	const resumeAi = useCallback(
		() =>
			resumeAiMutation.mutateAsync({
				conversationId,
				websiteSlug: website.slug,
			}),
		[conversationId, resumeAiMutation, website.slug]
	);

	const updateTitle = useCallback(
		(title: string | null) =>
			updateTitleMutation.mutateAsync({
				conversationId,
				websiteSlug: website.slug,
				title,
			}),
		[conversationId, updateTitleMutation, website.slug]
	);

	const updatePriority = useCallback(
		(priority: UpdatePriorityVariables["priority"]) =>
			updatePriorityMutation.mutateAsync({
				conversationId,
				websiteSlug: website.slug,
				priority,
			}),
		[conversationId, updatePriorityMutation, website.slug]
	);

	const updateSentiment = useCallback(
		(sentiment: UpdateSentimentVariables["sentiment"]) =>
			updateSentimentMutation.mutateAsync({
				conversationId,
				websiteSlug: website.slug,
				sentiment,
			}),
		[conversationId, updateSentimentMutation, website.slug]
	);

	const joinEscalation = useCallback(
		() =>
			joinEscalationMutation.mutateAsync({
				conversationId,
				websiteSlug: website.slug,
			}),
		[conversationId, joinEscalationMutation, website.slug]
	);

	const blockVisitor = useCallback(
		() =>
			blockVisitorMutation.mutateAsync({
				conversationId,
				websiteSlug: website.slug,
			}),
		[blockVisitorMutation, conversationId, website.slug]
	);

	const unblockVisitor = useCallback(
		() =>
			unblockVisitorMutation.mutateAsync({
				conversationId,
				websiteSlug: website.slug,
			}),
		[conversationId, unblockVisitorMutation, website.slug]
	);

	return {
		markResolved,
		markOpen,
		markSpam,
		markNotSpam,
		markArchived,
		markUnarchived,
		markRead,
		markUnread,
		pauseAi,
		resumeAi,
		updateTitle,
		updatePriority,
		updateSentiment,
		joinEscalation,
		blockVisitor,
		unblockVisitor,
		isAnyPending:
			markResolvedMutation.isPending ||
			markOpenMutation.isPending ||
			markSpamMutation.isPending ||
			markNotSpamMutation.isPending ||
			markArchivedMutation.isPending ||
			markUnarchivedMutation.isPending ||
			markReadMutation.isPending ||
			markUnreadMutation.isPending ||
			pauseAiMutation.isPending ||
			resumeAiMutation.isPending ||
			updateTitleMutation.isPending ||
			updatePriorityMutation.isPending ||
			updateSentimentMutation.isPending ||
			joinEscalationMutation.isPending ||
			blockVisitorMutation.isPending ||
			unblockVisitorMutation.isPending,
		pendingAction: {
			markResolved: markResolvedMutation.isPending,
			markOpen: markOpenMutation.isPending,
			markSpam: markSpamMutation.isPending,
			markNotSpam: markNotSpamMutation.isPending,
			markArchived: markArchivedMutation.isPending,
			markUnarchived: markUnarchivedMutation.isPending,
			markRead: markReadMutation.isPending,
			markUnread: markUnreadMutation.isPending,
			pauseAi: pauseAiMutation.isPending,
			resumeAi: resumeAiMutation.isPending,
			updateTitle: updateTitleMutation.isPending,
			updatePriority: updatePriorityMutation.isPending,
			updateSentiment: updateSentimentMutation.isPending,
			joinEscalation: joinEscalationMutation.isPending,
			blockVisitor: blockVisitorMutation.isPending,
			unblockVisitor: unblockVisitorMutation.isPending,
		},
	};
}
