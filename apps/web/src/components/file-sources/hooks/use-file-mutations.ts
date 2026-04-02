"use client";

import type { ArticleKnowledgePayload } from "@plasma/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { useKnowledgeEntryMutations } from "@/components/training-entries";
import type { TrainingControls } from "@/hooks/use-training-controls";
import { useTRPC } from "@/lib/trpc/client";

// Regex for removing file extensions
const FILE_EXTENSION_REGEX = /\.(md|txt)$/;

type UseFileMutationsOptions = {
	websiteSlug: string;
	aiAgentId: string | null;
	onCreateSuccess?: () => void;
	onUpdateSuccess?: () => void;
	onUploadSuccess?: () => void;
	trainingControls?: TrainingControls;
};

export function useFileMutations({
	websiteSlug,
	aiAgentId,
	onCreateSuccess,
	onUpdateSuccess,
	onUploadSuccess,
	trainingControls,
}: UseFileMutationsOptions) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const {
		createMutation,
		updateMutation,
		deleteMutation,
		toggleIncludedMutation,
	} = useKnowledgeEntryMutations<ArticleKnowledgePayload, "article">({
		websiteSlug,
		aiAgentId,
		knowledgeType: "article",
		createSuccessMessage: "File added",
		updateSuccessMessage: "File updated",
		deleteSuccessMessage: "File deleted",
		onCreateSuccess,
		onUpdateSuccess,
		trainingControls,
		getOptimisticSizeBytes: (payload) =>
			new TextEncoder().encode(payload.markdown).length,
	});

	// Upload file mutation
	const uploadMutation = useMutation(
		trpc.knowledge.uploadFile.mutationOptions({
			onMutate: async (newData) => {
				// Cancel outgoing refetches
				await queryClient.cancelQueries({
					queryKey: trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "article",
					}),
				});

				// Snapshot previous value
				const previousData = queryClient.getQueryData(
					trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "article",
						aiAgentId,
					})
				);

				// Optimistically add the new file
				queryClient.setQueryData(
					trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "article",
						aiAgentId,
					}),
					(old) => {
						if (!old) {
							return old;
						}

						const optimisticFile = {
							id: `optimistic-${Date.now()}`,
							organizationId: "",
							websiteId: "",
							aiAgentId: aiAgentId ?? null,
							linkSourceId: null,
							type: "article" as const,
							sourceUrl: null,
							sourceTitle: newData.fileName.replace(FILE_EXTENSION_REGEX, ""),
							origin: "file-upload",
							createdBy: "",
							contentHash: "",
							payload: {
								title: newData.fileName.replace(FILE_EXTENSION_REGEX, ""),
								summary: null,
								markdown: newData.fileContent,
								keywords: [],
							},
							metadata: undefined,
							isIncluded: true,
							sizeBytes: new TextEncoder().encode(newData.fileContent).length,
							createdAt: new Date().toISOString(),
							updatedAt: new Date().toISOString(),
							deletedAt: null,
						};

						return {
							...old,
							items: [optimisticFile, ...old.items],
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
						trpc.knowledge.list.queryKey({
							websiteSlug,
							type: "article",
							aiAgentId,
						}),
						context.previousData
					);
				}
				toast.error(_error.message || "Failed to upload file");
			},
			onSuccess: async (data) => {
				onUploadSuccess?.();

				const autoStarted = trainingControls?.canAutoStartTraining
					? await trainingControls.startTrainingIfAllowed()
					: false;

				if (!autoStarted) {
					toast.success(`File uploaded: ${data.sourceTitle}`, {
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
			onSettled: () => {
				// Refetch after mutation
				void queryClient.invalidateQueries({
					queryKey: trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "article",
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
		async (params: { title: string; markdown: string; summary?: string }) => {
			const payload: ArticleKnowledgePayload = {
				title: params.title,
				summary: params.summary ?? null,
				markdown: params.markdown,
				keywords: [],
			};

			return await createMutation.mutateAsync({
				websiteSlug,
				aiAgentId: aiAgentId ?? undefined,
				type: "article",
				sourceTitle: params.title,
				origin: "manual",
				payload,
			});
		},
		[createMutation, websiteSlug, aiAgentId]
	);

	const handleUpload = useCallback(
		async (file: File) => {
			const content = await file.text();
			const match = file.name.match(FILE_EXTENSION_REGEX);
			if (!match) {
				throw new Error(
					"Unsupported file type. Only .md and .txt files are allowed."
				);
			}
			const extension = match[1] as "md" | "txt";

			return await uploadMutation.mutateAsync({
				websiteSlug,
				aiAgentId: aiAgentId ?? undefined,
				fileName: file.name,
				fileContent: content,
				fileExtension: extension,
			});
		},
		[uploadMutation, websiteSlug, aiAgentId]
	);

	const handleUpdate = useCallback(
		async (
			id: string,
			params: { title: string; markdown: string; summary?: string }
		) => {
			const payload: ArticleKnowledgePayload = {
				title: params.title,
				summary: params.summary ?? null,
				markdown: params.markdown,
				keywords: [],
			};

			return await updateMutation.mutateAsync({
				websiteSlug,
				id,
				sourceTitle: params.title,
				payload,
			});
		},
		[updateMutation, websiteSlug]
	);

	const handleDelete = useCallback(
		async (id: string) =>
			await deleteMutation.mutateAsync({
				websiteSlug,
				id,
			}),
		[deleteMutation, websiteSlug]
	);

	const handleToggleIncluded = useCallback(
		async (id: string, isIncluded: boolean) =>
			await toggleIncludedMutation.mutateAsync({
				websiteSlug,
				id,
				isIncluded,
			}),
		[toggleIncludedMutation, websiteSlug]
	);

	return {
		// Mutations
		createMutation,
		uploadMutation,
		updateMutation,
		deleteMutation,
		toggleIncludedMutation,

		// Handlers
		handleCreate,
		handleUpload,
		handleUpdate,
		handleDelete,
		handleToggleIncluded,

		// States
		isCreating: createMutation.isPending,
		isUploading: uploadMutation.isPending,
		isUpdating: updateMutation.isPending,
		isDeleting: deleteMutation.isPending,
		isToggling: toggleIncludedMutation.isPending,
	};
}
