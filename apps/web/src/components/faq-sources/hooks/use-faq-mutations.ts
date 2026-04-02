"use client";

import type { FaqKnowledgePayload } from "@plasma/types";
import { useCallback } from "react";
import { useKnowledgeEntryMutations } from "@/components/training-entries";
import type { TrainingControls } from "@/hooks/use-training-controls";

type UseFaqMutationsOptions = {
	websiteSlug: string;
	aiAgentId: string | null;
	onCreateSuccess?: () => void;
	onUpdateSuccess?: () => void;
	trainingControls?: TrainingControls;
};

export function useFaqMutations({
	websiteSlug,
	aiAgentId,
	onCreateSuccess,
	onUpdateSuccess,
	trainingControls,
}: UseFaqMutationsOptions) {
	const {
		createMutation,
		updateMutation,
		deleteMutation,
		toggleIncludedMutation,
	} = useKnowledgeEntryMutations<FaqKnowledgePayload, "faq">({
		websiteSlug,
		aiAgentId,
		knowledgeType: "faq",
		createSuccessMessage: "FAQ added",
		updateSuccessMessage: "FAQ updated",
		deleteSuccessMessage: "FAQ deleted",
		onCreateSuccess,
		onUpdateSuccess,
		trainingControls,
	});

	// Callback handlers
	const handleCreate = useCallback(
		async (params: {
			question: string;
			answer: string;
			categories?: string[];
			relatedQuestions?: string[];
		}) => {
			const payload: FaqKnowledgePayload = {
				question: params.question,
				answer: params.answer,
				categories: params.categories ?? [],
				relatedQuestions: params.relatedQuestions ?? [],
			};

			return await createMutation.mutateAsync({
				websiteSlug,
				aiAgentId: aiAgentId ?? undefined,
				type: "faq",
				sourceTitle: params.question,
				origin: "manual",
				payload,
			});
		},
		[createMutation, websiteSlug, aiAgentId]
	);

	const handleUpdate = useCallback(
		async (
			id: string,
			params: {
				question: string;
				answer: string;
				categories?: string[];
				relatedQuestions?: string[];
			}
		) => {
			const payload: FaqKnowledgePayload = {
				question: params.question,
				answer: params.answer,
				categories: params.categories ?? [],
				relatedQuestions: params.relatedQuestions ?? [],
			};

			return await updateMutation.mutateAsync({
				websiteSlug,
				id,
				sourceTitle: params.question,
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
		updateMutation,
		deleteMutation,
		toggleIncludedMutation,

		// Handlers
		handleCreate,
		handleUpdate,
		handleDelete,
		handleToggleIncluded,

		// States
		isCreating: createMutation.isPending,
		isUpdating: updateMutation.isPending,
		isDeleting: deleteMutation.isPending,
		isToggling: toggleIncludedMutation.isPending,
	};
}
