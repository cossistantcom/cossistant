"use client";

import type { KnowledgeResponse, KnowledgeType } from "@plasma/types";
import { useQueryNormalizer } from "@normy/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import type { TrainingControls } from "@/hooks/use-training-controls";
import { useTRPC } from "@/lib/trpc/client";

type QueryNormalizer = ReturnType<typeof useQueryNormalizer>;
type NormyData = Parameters<QueryNormalizer["setNormalizedData"]>[0];
type SupportedKnowledgeType = Extract<KnowledgeType, "faq" | "article">;

type UseKnowledgeEntryMutationsOptions<
	TPayload,
	TKnowledgeType extends SupportedKnowledgeType,
> = {
	websiteSlug: string;
	aiAgentId: string | null;
	knowledgeType: TKnowledgeType;
	createSuccessMessage: string;
	updateSuccessMessage: string;
	deleteSuccessMessage: string;
	onCreateSuccess?: () => void;
	onUpdateSuccess?: () => void;
	trainingControls?: TrainingControls;
	getOptimisticSizeBytes?: (payload: TPayload) => number;
};

function toNormyData(data: KnowledgeResponse): NormyData {
	return data as unknown as NormyData;
}

function createOptimisticKnowledgeEntry<TPayload>({
	aiAgentId,
	knowledgeType,
	origin,
	payload,
	sizeBytes,
	sourceTitle,
}: {
	aiAgentId: string | null;
	knowledgeType: SupportedKnowledgeType;
	origin: string;
	payload: TPayload;
	sizeBytes: number;
	sourceTitle: string | null;
}): KnowledgeResponse {
	return {
		id: `optimistic-${Date.now()}`,
		organizationId: "",
		websiteId: "",
		aiAgentId,
		linkSourceId: null,
		type: knowledgeType,
		sourceUrl: null,
		sourceTitle,
		origin,
		createdBy: "",
		contentHash: "",
		payload: payload as KnowledgeResponse["payload"],
		metadata: undefined,
		isIncluded: true,
		sizeBytes,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		deletedAt: null,
	};
}

export function useKnowledgeEntryMutations<
	TPayload,
	TKnowledgeType extends SupportedKnowledgeType,
>({
	websiteSlug,
	aiAgentId,
	knowledgeType,
	createSuccessMessage,
	updateSuccessMessage,
	deleteSuccessMessage,
	onCreateSuccess,
	onUpdateSuccess,
	trainingControls,
	getOptimisticSizeBytes,
}: UseKnowledgeEntryMutationsOptions<TPayload, TKnowledgeType>) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const queryNormalizer = useQueryNormalizer();

	const invalidateSharedQueries = useCallback(
		async (knowledgeId?: string) => {
			const invalidations: Promise<void>[] = [
				queryClient.invalidateQueries({
					queryKey: trpc.knowledge.list.queryKey({
						websiteSlug,
						type: knowledgeType,
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
				}),
			];

			if (knowledgeId) {
				invalidations.push(
					queryClient.invalidateQueries({
						queryKey: trpc.knowledge.get.queryKey({
							websiteSlug,
							id: knowledgeId,
						}),
					})
				);
			}

			await Promise.all(invalidations);
		},
		[knowledgeType, queryClient, trpc, websiteSlug]
	);

	const createMutation = useMutation(
		trpc.knowledge.create.mutationOptions({
			onMutate: async (newData) => {
				await queryClient.cancelQueries({
					queryKey: trpc.knowledge.list.queryKey({
						websiteSlug,
						type: knowledgeType,
					}),
				});

				const previousData = queryClient.getQueryData(
					trpc.knowledge.list.queryKey({
						websiteSlug,
						type: knowledgeType,
						aiAgentId,
					})
				);

				queryClient.setQueryData(
					trpc.knowledge.list.queryKey({
						websiteSlug,
						type: knowledgeType,
						aiAgentId,
					}),
					(old) => {
						if (!old) {
							return old;
						}

						const optimisticEntry = createOptimisticKnowledgeEntry<TPayload>({
							aiAgentId,
							knowledgeType,
							origin: newData.origin,
							payload: newData.payload as TPayload,
							sizeBytes:
								getOptimisticSizeBytes?.(newData.payload as TPayload) ?? 0,
							sourceTitle: newData.sourceTitle ?? null,
						});

						return {
							...old,
							items: [optimisticEntry, ...old.items],
							pagination: {
								...old.pagination,
								total: old.pagination.total + 1,
							},
						};
					}
				);

				return { previousData };
			},
			onError: (error, _variables, context) => {
				if (context?.previousData) {
					queryClient.setQueryData(
						trpc.knowledge.list.queryKey({
							websiteSlug,
							type: knowledgeType,
							aiAgentId,
						}),
						context.previousData
					);
				}

				toast.error(error.message || `Failed to add ${knowledgeType}`);
			},
			onSuccess: async () => {
				onCreateSuccess?.();

				const autoStarted = trainingControls?.canAutoStartTraining
					? await trainingControls.startTrainingIfAllowed()
					: false;

				if (!autoStarted) {
					toast.success(createSuccessMessage, {
						...(trainingControls?.canRequestTraining && {
							action: {
								label: "Train Agent",
								onClick: () => {
									void trainingControls.requestTraining();
								},
							},
						}),
					});
				}
			},
			onSettled: async () => {
				await invalidateSharedQueries();
			},
		})
	);

	const updateMutation = useMutation(
		trpc.knowledge.update.mutationOptions({
			onMutate: async ({ id, payload, sourceTitle }) => {
				await queryClient.cancelQueries({
					queryKey: trpc.knowledge.list.queryKey({
						websiteSlug,
						type: knowledgeType,
					}),
				});

				const existingItem = queryNormalizer.getObjectById(id) as
					| KnowledgeResponse
					| undefined;

				const optimisticData = existingItem
					? ({
							...existingItem,
							payload: ((payload as TPayload | undefined) ??
								existingItem.payload) as KnowledgeResponse["payload"],
							sourceTitle: sourceTitle ?? existingItem.sourceTitle,
							updatedAt: new Date().toISOString(),
						} as KnowledgeResponse)
					: null;

				if (optimisticData) {
					queryNormalizer.setNormalizedData(toNormyData(optimisticData));
				}

				return {
					rollbackData: existingItem,
				};
			},
			onError: (error, _variables, context) => {
				if (context?.rollbackData) {
					queryNormalizer.setNormalizedData(toNormyData(context.rollbackData));
				}

				toast.error(error.message || `Failed to update ${knowledgeType}`);
			},
			onSuccess: (data) => {
				queryNormalizer.setNormalizedData(toNormyData(data));
				toast.success(updateSuccessMessage);
				onUpdateSuccess?.();
			},
			onSettled: async (_data, _error, variables) => {
				await invalidateSharedQueries(variables.id);
			},
		})
	);

	const deleteMutation = useMutation(
		trpc.knowledge.delete.mutationOptions({
			onMutate: async ({ id }) => {
				await queryClient.cancelQueries({
					queryKey: trpc.knowledge.list.queryKey({
						websiteSlug,
						type: knowledgeType,
					}),
				});

				const previousData = queryClient.getQueryData(
					trpc.knowledge.list.queryKey({
						websiteSlug,
						type: knowledgeType,
						aiAgentId,
					})
				);

				queryClient.setQueryData(
					trpc.knowledge.list.queryKey({
						websiteSlug,
						type: knowledgeType,
						aiAgentId,
					}),
					(old) => {
						if (!old) {
							return old;
						}

						return {
							...old,
							items: old.items.filter((item) => item.id !== id),
							pagination: {
								...old.pagination,
								total: Math.max(0, old.pagination.total - 1),
							},
						};
					}
				);

				return { previousData };
			},
			onError: (error, _variables, context) => {
				if (context?.previousData) {
					queryClient.setQueryData(
						trpc.knowledge.list.queryKey({
							websiteSlug,
							type: knowledgeType,
							aiAgentId,
						}),
						context.previousData
					);
				}

				toast.error(error.message || `Failed to delete ${knowledgeType}`);
			},
			onSuccess: () => {
				toast.success(deleteSuccessMessage);
			},
			onSettled: async (_data, _error, variables) => {
				await invalidateSharedQueries(variables.id);
			},
		})
	);

	const toggleIncludedMutation = useMutation(
		trpc.knowledge.toggleIncluded.mutationOptions({
			onMutate: async ({ id, isIncluded }) => {
				await queryClient.cancelQueries({
					queryKey: trpc.knowledge.list.queryKey({
						websiteSlug,
						type: knowledgeType,
					}),
				});

				const existingItem = queryNormalizer.getObjectById(id) as
					| KnowledgeResponse
					| undefined;

				const optimisticData = existingItem
					? ({
							...existingItem,
							isIncluded,
						} satisfies KnowledgeResponse)
					: null;

				if (optimisticData) {
					queryNormalizer.setNormalizedData(toNormyData(optimisticData));
				}

				return {
					rollbackData: existingItem,
				};
			},
			onError: (error, _variables, context) => {
				if (context?.rollbackData) {
					queryNormalizer.setNormalizedData(toNormyData(context.rollbackData));
				}

				toast.error(error.message || "Failed to toggle inclusion");
			},
			onSuccess: (data) => {
				const existingItem = queryNormalizer.getObjectById(data.id) as
					| KnowledgeResponse
					| undefined;

				if (existingItem) {
					queryNormalizer.setNormalizedData(
						toNormyData({
							...existingItem,
							isIncluded: data.isIncluded,
						})
					);
				}
			},
			onSettled: async (_data, _error, variables) => {
				await invalidateSharedQueries(variables.id);
			},
		})
	);

	return {
		createMutation,
		updateMutation,
		deleteMutation,
		toggleIncludedMutation,
	};
}

export type { SupportedKnowledgeType };
