"use client";

import type { LinkSourceResponse } from "@plasma/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

type LinkSourceListData = {
	items: LinkSourceResponse[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		hasMore: boolean;
	};
};

type UseLinkSourceMutationsOptions = {
	websiteSlug: string;
	aiAgentId: string | null;
	onCreateSuccess?: () => void;
};

export function useLinkSourceMutations({
	websiteSlug,
	aiAgentId,
	onCreateSuccess,
}: UseLinkSourceMutationsOptions) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	// Create link source mutation with optimistic updates
	const createMutation = useMutation(
		trpc.linkSource.create.mutationOptions({
			onMutate: async (newData) => {
				// Cancel outgoing refetches
				await queryClient.cancelQueries({
					queryKey: trpc.linkSource.list.queryKey({
						websiteSlug,
					}),
				});

				// Snapshot previous value
				const previousData = queryClient.getQueryData(
					trpc.linkSource.list.queryKey({
						websiteSlug,
						aiAgentId,
					})
				);

				// Optimistically add the new link source
				queryClient.setQueryData(
					trpc.linkSource.list.queryKey({
						websiteSlug,
						aiAgentId,
					}),
					(old: LinkSourceListData | undefined) => {
						if (!old) {
							return old;
						}

						const optimisticSource: LinkSourceResponse = {
							id: `optimistic-${Date.now()}`,
							organizationId: "",
							websiteId: "",
							aiAgentId: aiAgentId ?? null,
							parentLinkSourceId: null,
							url: newData.url,
							status: "pending",
							firecrawlJobId: null,
							depth: 0,
							discoveredPagesCount: 0,
							crawledPagesCount: 0,
							totalSizeBytes: 0,
							includePaths: newData.includePaths ?? null,
							excludePaths: newData.excludePaths ?? null,
							ignoredUrls: null,
							lastCrawledAt: null,
							errorMessage: null,
							createdAt: new Date().toISOString(),
							updatedAt: new Date().toISOString(),
							deletedAt: null,
						};

						return {
							...old,
							items: [optimisticSource, ...old.items],
							pagination: {
								...old.pagination,
								total: old.pagination.total + 1,
							},
						};
					}
				);

				return { previousData };
			},
			onError: (_error, _variables, context) => {
				// Rollback on error
				if (context?.previousData) {
					queryClient.setQueryData(
						trpc.linkSource.list.queryKey({
							websiteSlug,
							aiAgentId,
						}),
						context.previousData
					);
				}
				toast.error(_error.message || "Failed to add link source");
			},
			onSuccess: () => {
				onCreateSuccess?.();
				// Don't show toast here - realtime handler shows crawl progress toast
			},
			onSettled: () => {
				// Refetch after mutation
				void queryClient.invalidateQueries({
					queryKey: trpc.linkSource.list.queryKey({
						websiteSlug,
					}),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.linkSource.getTrainingStats.queryKey({
						websiteSlug,
					}),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.aiAgent.getTrainingReadiness.queryKey({
						websiteSlug,
					}),
				});
			},
		})
	);

	// Delete link source mutation with optimistic updates
	const deleteMutation = useMutation(
		trpc.linkSource.delete.mutationOptions({
			onMutate: async ({ id }) => {
				await queryClient.cancelQueries({
					queryKey: trpc.linkSource.list.queryKey({
						websiteSlug,
					}),
				});

				const previousData = queryClient.getQueryData(
					trpc.linkSource.list.queryKey({
						websiteSlug,
						aiAgentId,
					})
				);

				// Optimistically remove the link source
				queryClient.setQueryData(
					trpc.linkSource.list.queryKey({
						websiteSlug,
						aiAgentId,
					}),
					(old: LinkSourceListData | undefined) => {
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
			onError: (_error, _variables, context) => {
				if (context?.previousData) {
					queryClient.setQueryData(
						trpc.linkSource.list.queryKey({
							websiteSlug,
							aiAgentId,
						}),
						context.previousData
					);
				}
				toast.error(_error.message || "Failed to delete link source");
			},
			onSuccess: () => {
				toast.success("Link source deleted");
			},
			onSettled: () => {
				void queryClient.invalidateQueries({
					queryKey: trpc.linkSource.list.queryKey({
						websiteSlug,
					}),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.linkSource.getTrainingStats.queryKey({
						websiteSlug,
					}),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.aiAgent.getTrainingReadiness.queryKey({
						websiteSlug,
					}),
				});
			},
		})
	);

	// Recrawl link source mutation
	const recrawlMutation = useMutation(
		trpc.linkSource.recrawl.mutationOptions({
			onMutate: async ({ id }) => {
				await queryClient.cancelQueries({
					queryKey: trpc.linkSource.list.queryKey({
						websiteSlug,
					}),
				});

				const previousData = queryClient.getQueryData(
					trpc.linkSource.list.queryKey({
						websiteSlug,
						aiAgentId,
					})
				);

				// Optimistically update status to pending
				queryClient.setQueryData(
					trpc.linkSource.list.queryKey({
						websiteSlug,
						aiAgentId,
					}),
					(old: LinkSourceListData | undefined) => {
						if (!old) {
							return old;
						}

						return {
							...old,
							items: old.items.map((item) =>
								item.id === id ? { ...item, status: "pending" as const } : item
							),
						};
					}
				);

				return { previousData };
			},
			onError: (_error, _variables, context) => {
				if (context?.previousData) {
					queryClient.setQueryData(
						trpc.linkSource.list.queryKey({
							websiteSlug,
							aiAgentId,
						}),
						context.previousData
					);
				}
				toast.error(_error.message || "Failed to start recrawl");
			},
			onSuccess: () => {
				// Realtime crawl events will drive the visible progress toast.
			},
			onSettled: () => {
				void queryClient.invalidateQueries({
					queryKey: trpc.linkSource.list.queryKey({
						websiteSlug,
					}),
				});
			},
		})
	);

	// Cancel link source mutation
	const cancelMutation = useMutation(
		trpc.linkSource.cancel.mutationOptions({
			onMutate: async ({ id }) => {
				await queryClient.cancelQueries({
					queryKey: trpc.linkSource.list.queryKey({
						websiteSlug,
					}),
				});

				const previousData = queryClient.getQueryData(
					trpc.linkSource.list.queryKey({
						websiteSlug,
						aiAgentId,
					})
				);

				// Optimistically update status to failed
				queryClient.setQueryData(
					trpc.linkSource.list.queryKey({
						websiteSlug,
						aiAgentId,
					}),
					(old: LinkSourceListData | undefined) => {
						if (!old) {
							return old;
						}

						return {
							...old,
							items: old.items.map((item) =>
								item.id === id
									? {
											...item,
											status: "failed" as const,
											errorMessage: "Cancelled by user",
										}
									: item
							),
						};
					}
				);

				return { previousData };
			},
			onError: (_error, _variables, context) => {
				if (context?.previousData) {
					queryClient.setQueryData(
						trpc.linkSource.list.queryKey({
							websiteSlug,
							aiAgentId,
						}),
						context.previousData
					);
				}
				toast.error(_error.message || "Failed to cancel crawl");
			},
			onSuccess: () => {
				toast.success("Crawl cancelled");
			},
			onSettled: () => {
				void queryClient.invalidateQueries({
					queryKey: trpc.linkSource.list.queryKey({
						websiteSlug,
					}),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.linkSource.getTrainingStats.queryKey({
						websiteSlug,
					}),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.aiAgent.getTrainingReadiness.queryKey({
						websiteSlug,
					}),
				});
			},
		})
	);

	// Toggle knowledge included mutation
	const toggleIncludedMutation = useMutation(
		trpc.linkSource.toggleKnowledgeIncluded.mutationOptions({
			onError: (error) => {
				toast.error(error.message || "Failed to toggle inclusion");
			},
			onSettled: () => {
				void queryClient.invalidateQueries({
					queryKey: trpc.linkSource.getTrainingStats.queryKey({
						websiteSlug,
					}),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.aiAgent.getTrainingReadiness.queryKey({
						websiteSlug,
					}),
				});
			},
		})
	);

	// Reindex (re-scrape) a single page
	const reindexPageMutation = useMutation(
		trpc.linkSource.reindexPage.mutationOptions({
			onSuccess: (data) => {
				toast.success(`Re-indexed: ${data.sourceTitle ?? data.sourceUrl}`);
			},
			onError: (error) => {
				toast.error(error.message || "Failed to re-index page");
			},
			onSettled: (_data, _error, { linkSourceId }) => {
				void queryClient.invalidateQueries({
					queryKey: trpc.linkSource.listKnowledgeByLinkSource.queryKey({
						websiteSlug,
						linkSourceId,
					}),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.linkSource.getTrainingStats.queryKey({
						websiteSlug,
					}),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.aiAgent.getTrainingReadiness.queryKey({
						websiteSlug,
					}),
				});
			},
		})
	);

	// Delete a single page (soft delete knowledge entry)
	const deletePageMutation = useMutation(
		trpc.linkSource.deletePage.mutationOptions({
			onSuccess: () => {
				toast.success("Page deleted");
			},
			onError: (error) => {
				toast.error(error.message || "Failed to delete page");
			},
			onSettled: () => {
				// Invalidate all knowledge queries since we don't know which link source it was from
				void queryClient.invalidateQueries({
					queryKey: [["linkSource", "listKnowledgeByLinkSource"]],
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.linkSource.getTrainingStats.queryKey({
						websiteSlug,
					}),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.aiAgent.getTrainingReadiness.queryKey({
						websiteSlug,
					}),
				});
			},
		})
	);

	// Ignore a page (add to ignoredUrls and soft delete)
	const ignorePageMutation = useMutation(
		trpc.linkSource.ignorePage.mutationOptions({
			onSuccess: () => {
				toast.success("Page ignored. It will be excluded from future crawls.");
			},
			onError: (error) => {
				toast.error(error.message || "Failed to ignore page");
			},
			onSettled: (_data, _error, { linkSourceId }) => {
				void queryClient.invalidateQueries({
					queryKey: trpc.linkSource.listKnowledgeByLinkSource.queryKey({
						websiteSlug,
						linkSourceId,
					}),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.linkSource.list.queryKey({
						websiteSlug,
					}),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.linkSource.getTrainingStats.queryKey({
						websiteSlug,
					}),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.aiAgent.getTrainingReadiness.queryKey({
						websiteSlug,
					}),
				});
			},
		})
	);

	// Callback handlers
	const handleCreate = useCallback(
		async (params: {
			url: string;
			includePaths?: string[];
			excludePaths?: string[];
		}) => {
			if (!aiAgentId) {
				return;
			}

			await createMutation.mutateAsync({
				websiteSlug,
				aiAgentId,
				url: params.url,
				includePaths: params.includePaths,
				excludePaths: params.excludePaths,
			});
		},
		[createMutation, websiteSlug, aiAgentId]
	);

	const handleDelete = useCallback(
		async (id: string) => {
			await deleteMutation.mutateAsync({
				websiteSlug,
				id,
			});
		},
		[deleteMutation, websiteSlug]
	);

	const handleRecrawl = useCallback(
		async (id: string) => {
			await recrawlMutation.mutateAsync({
				websiteSlug,
				id,
			});
		},
		[recrawlMutation, websiteSlug]
	);

	const handleCancel = useCallback(
		async (id: string) => {
			await cancelMutation.mutateAsync({
				websiteSlug,
				id,
			});
		},
		[cancelMutation, websiteSlug]
	);

	const handleToggleIncluded = useCallback(
		async (knowledgeId: string, isIncluded: boolean) => {
			await toggleIncludedMutation.mutateAsync({
				websiteSlug,
				knowledgeId,
				isIncluded,
			});
		},
		[toggleIncludedMutation, websiteSlug]
	);

	const handleReindexPage = useCallback(
		async (linkSourceId: string, knowledgeId: string) => {
			await reindexPageMutation.mutateAsync({
				websiteSlug,
				linkSourceId,
				knowledgeId,
			});
		},
		[reindexPageMutation, websiteSlug]
	);

	const handleDeletePage = useCallback(
		async (knowledgeId: string) => {
			await deletePageMutation.mutateAsync({
				websiteSlug,
				knowledgeId,
			});
		},
		[deletePageMutation, websiteSlug]
	);

	const handleIgnorePage = useCallback(
		async (linkSourceId: string, knowledgeId: string) => {
			await ignorePageMutation.mutateAsync({
				websiteSlug,
				linkSourceId,
				knowledgeId,
			});
		},
		[ignorePageMutation, websiteSlug]
	);

	// Delete multiple link sources (e.g., all sources under a domain)
	const handleDeleteMultiple = useCallback(
		async (ids: string[]) => {
			if (ids.length === 0) {
				return;
			}

			// Optimistically remove all sources
			await queryClient.cancelQueries({
				queryKey: trpc.linkSource.list.queryKey({
					websiteSlug,
				}),
			});

			const previousData = queryClient.getQueryData(
				trpc.linkSource.list.queryKey({
					websiteSlug,
					aiAgentId,
				})
			);

			// Optimistically remove all the link sources
			const idsSet = new Set(ids);
			queryClient.setQueryData(
				trpc.linkSource.list.queryKey({
					websiteSlug,
					aiAgentId,
				}),
				(old: LinkSourceListData | undefined) => {
					if (!old) {
						return old;
					}

					return {
						...old,
						items: old.items.filter((item) => !idsSet.has(item.id)),
						pagination: {
							...old.pagination,
							total: Math.max(0, old.pagination.total - ids.length),
						},
					};
				}
			);

			try {
				// Delete all sources in parallel
				await Promise.all(
					ids.map((id) =>
						deleteMutation.mutateAsync({
							websiteSlug,
							id,
						})
					)
				);
				toast.success(
					`Deleted ${ids.length} ${ids.length === 1 ? "source" : "sources"}`
				);
			} catch (error) {
				// Rollback on error
				if (previousData) {
					queryClient.setQueryData(
						trpc.linkSource.list.queryKey({
							websiteSlug,
							aiAgentId,
						}),
						previousData
					);
				}
				toast.error("Failed to delete some sources");
			} finally {
				void queryClient.invalidateQueries({
					queryKey: trpc.linkSource.list.queryKey({
						websiteSlug,
					}),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.linkSource.getTrainingStats.queryKey({
						websiteSlug,
					}),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.aiAgent.getTrainingReadiness.queryKey({
						websiteSlug,
					}),
				});
			}
		},
		[deleteMutation, queryClient, trpc, websiteSlug, aiAgentId]
	);

	return {
		// Mutations
		createMutation,
		deleteMutation,
		recrawlMutation,
		cancelMutation,
		toggleIncludedMutation,
		reindexPageMutation,
		deletePageMutation,
		ignorePageMutation,

		// Handlers
		handleCreate,
		handleDelete,
		handleDeleteMultiple,
		handleRecrawl,
		handleCancel,
		handleToggleIncluded,
		handleReindexPage,
		handleDeletePage,
		handleIgnorePage,

		// States
		isCreating: createMutation.isPending,
		isDeleting: deleteMutation.isPending,
		isRecrawling: recrawlMutation.isPending,
		isCancelling: cancelMutation.isPending,
		isToggling: toggleIncludedMutation.isPending,
		isReindexing: reindexPageMutation.isPending,
		isIgnoring: ignorePageMutation.isPending,
	};
}
