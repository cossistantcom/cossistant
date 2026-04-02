"use client";

import type { FaqKnowledgePayload } from "@plasma/types";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTRPC } from "@/lib/trpc/client";
import {
	TrainingEntryDetailLayout,
	useTrainingPageState,
} from "../training-entries";
import { useFaqMutations } from "./hooks/use-faq-mutations";

type FaqEditorPageProps = {
	knowledgeId?: string;
};

type NormalizedFaqDraft = {
	question: string;
	answer: string;
	categories: string[];
	relatedQuestions: string[];
};

const EMPTY_FAQ_DRAFT: NormalizedFaqDraft = {
	question: "",
	answer: "",
	categories: [],
	relatedQuestions: [],
};

function splitCommaSeparated(value: string): string[] {
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

function normalizeFaqDraft(input: {
	question: string;
	answer: string;
	categories: string;
	relatedQuestions: string;
}): NormalizedFaqDraft {
	return {
		question: input.question.trim(),
		answer: input.answer.trim(),
		categories: splitCommaSeparated(input.categories),
		relatedQuestions: splitCommaSeparated(input.relatedQuestions),
	};
}

function areFaqDraftsEqual(
	left: NormalizedFaqDraft,
	right: NormalizedFaqDraft
): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

export function FaqEditorPage({ knowledgeId }: FaqEditorPageProps) {
	const router = useRouter();
	const trpc = useTRPC();
	const [question, setQuestion] = useState("");
	const [answer, setAnswer] = useState("");
	const [categories, setCategories] = useState("");
	const [relatedQuestions, setRelatedQuestions] = useState("");
	const [initialDraft, setInitialDraft] =
		useState<NormalizedFaqDraft>(EMPTY_FAQ_DRAFT);
	const pageState = useTrainingPageState({
		highlightedFeatureKey: "ai-agent-training-faqs",
	});

	const isCreateMode = !knowledgeId;
	const listHref = `/${pageState.websiteSlug}/agent/training/faq`;
	const { data: knowledge, isLoading: isLoadingKnowledge } = useQuery({
		...trpc.knowledge.get.queryOptions({
			websiteSlug: pageState.websiteSlug,
			id: knowledgeId ?? "",
		}),
		enabled: Boolean(knowledgeId),
	});

	const {
		handleCreate,
		handleDelete,
		handleToggleIncluded,
		handleUpdate,
		isCreating,
		isDeleting,
		isToggling,
		isUpdating,
	} = useFaqMutations({
		websiteSlug: pageState.websiteSlug,
		aiAgentId: pageState.aiAgentId,
		trainingControls: pageState.trainingControls,
	});

	const startClarificationMutation = useMutation(
		trpc.knowledgeClarification.startFromFaq.mutationOptions({
			onError: (error) => {
				toast.error(error.message || "Failed to start FAQ clarification");
			},
		})
	);

	useEffect(() => {
		if (!knowledge || knowledge.type !== "faq") {
			return;
		}

		const payload = knowledge.payload as FaqKnowledgePayload;
		const nextCategories = payload.categories.join(", ");
		const nextRelatedQuestions = payload.relatedQuestions.join(", ");
		const nextDraft = normalizeFaqDraft({
			question: payload.question,
			answer: payload.answer,
			categories: nextCategories,
			relatedQuestions: nextRelatedQuestions,
		});

		setQuestion(payload.question);
		setAnswer(payload.answer);
		setCategories(nextCategories);
		setRelatedQuestions(nextRelatedQuestions);
		setInitialDraft(nextDraft);
	}, [knowledge]);

	const isAtFaqLimit =
		pageState.stats?.planLimitFaqs !== null &&
		pageState.stats?.faqKnowledgeCount !== undefined &&
		pageState.stats.faqKnowledgeCount >= (pageState.stats.planLimitFaqs ?? 0);
	const isSaving = isCreateMode ? isCreating : isUpdating;
	const currentDraft = useMemo(
		() =>
			normalizeFaqDraft({
				question,
				answer,
				categories,
				relatedQuestions,
			}),
		[answer, categories, question, relatedQuestions]
	);
	const isDirty = !areFaqDraftsEqual(currentDraft, initialDraft);
	const isValid = question.trim().length > 0 && answer.trim().length > 0;
	const isUnavailable =
		!(isCreateMode || isLoadingKnowledge) &&
		(!knowledge || knowledge.type !== "faq");
	const title = useMemo(() => {
		if (question.trim()) {
			return question.trim();
		}

		return isCreateMode ? "New FAQ" : "Untitled FAQ";
	}, [isCreateMode, question]);

	const handleSave = async () => {
		if (!isValid) {
			return;
		}

		if (isCreateMode && isAtFaqLimit) {
			pageState.openUpgradeModal();
			return;
		}

		if (isCreateMode) {
			const created = await handleCreate(currentDraft);
			router.push(`/${pageState.websiteSlug}/agent/training/faq/${created.id}`);
			return;
		}

		if (!knowledgeId) {
			return;
		}

		await handleUpdate(knowledgeId, currentDraft);
		setInitialDraft(currentDraft);
	};

	const handleDeleteEntry = async () => {
		if (!knowledgeId) {
			return;
		}

		await handleDelete(knowledgeId);
		router.push(listHref);
	};

	const handleToggleEntryIncluded = async () => {
		if (!(knowledgeId && knowledge)) {
			return;
		}

		await handleToggleIncluded(knowledgeId, !knowledge.isIncluded);
	};

	const handleDeepen = async () => {
		if (!knowledgeId) {
			return;
		}

		const result = await startClarificationMutation.mutateAsync({
			websiteSlug: pageState.websiteSlug,
			knowledgeId,
		});
		router.push(
			`/${pageState.websiteSlug}/agent/training/faq/proposals/${result.step.request.id}`
		);
	};

	const canSave =
		isValid && isDirty && !isSaving && !(isCreateMode && isAtFaqLimit);
	const headerActions = isUnavailable ? null : (
		<>
			{!isCreateMode && knowledge ? (
				<Button
					disabled={isToggling}
					onClick={handleToggleEntryIncluded}
					size="sm"
					type="button"
					variant="ghost"
				>
					{knowledge.isIncluded ? "Exclude" : "Include"}
				</Button>
			) : null}
			{isCreateMode ? null : (
				<Button
					disabled={startClarificationMutation.isPending || isLoadingKnowledge}
					onClick={handleDeepen}
					size="sm"
					type="button"
					variant="ghost"
				>
					{startClarificationMutation.isPending ? "Opening..." : "Deepen"}
				</Button>
			)}
			{isCreateMode ? null : (
				<Button
					disabled={isDeleting}
					onClick={handleDeleteEntry}
					size="sm"
					type="button"
					variant="ghost"
				>
					Delete
				</Button>
			)}
			<Button disabled={!canSave} onClick={handleSave} size="sm" type="button">
				{isSaving ? "Saving..." : "Save"}
			</Button>
		</>
	);

	return (
		<>
			<TrainingEntryDetailLayout
				backHref={listHref}
				headerActions={headerActions}
				title={title}
			>
				{isUnavailable ? (
					<div className="space-y-2 py-12 text-center">
						<h2 className="font-medium text-base text-primary">Unavailable</h2>
						<p className="text-muted-foreground text-sm">
							This FAQ no longer exists or cannot be edited.
						</p>
					</div>
				) : (
					<form
						className="space-y-6"
						onSubmit={(event) => event.preventDefault()}
					>
						<div className="space-y-2">
							<Label htmlFor="faq-question">Question</Label>
							<Input
								disabled={isSaving || isLoadingKnowledge}
								id="faq-question"
								onChange={(event) => setQuestion(event.target.value)}
								placeholder="How do I reset my password?"
								value={question}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="faq-categories">Categories</Label>
							<Input
								disabled={isSaving || isLoadingKnowledge}
								id="faq-categories"
								onChange={(event) => setCategories(event.target.value)}
								placeholder="Account, Security, Getting Started"
								value={categories}
							/>
							<p className="text-muted-foreground text-xs">
								Separate categories with commas.
							</p>
						</div>
						<div className="space-y-2">
							<Label htmlFor="faq-related-questions">Related questions</Label>
							<Input
								disabled={isSaving || isLoadingKnowledge}
								id="faq-related-questions"
								onChange={(event) => setRelatedQuestions(event.target.value)}
								placeholder="How can I change my email?, Where do I update my login?"
								value={relatedQuestions}
							/>
							<p className="text-muted-foreground text-xs">
								Optional extra questions this FAQ should help cover.
							</p>
						</div>
						<div className="space-y-2">
							<Label htmlFor="faq-answer">Answer</Label>
							<Textarea
								className="min-h-[320px] font-mono text-sm"
								disabled={isSaving || isLoadingKnowledge}
								id="faq-answer"
								onChange={(event) => setAnswer(event.target.value)}
								placeholder="To reset your password, go to Settings &gt; Security and click Reset Password..."
								rows={14}
								value={answer}
							/>
							<p className="text-muted-foreground text-xs">
								Markdown is supported, but plain text works well too.
							</p>
						</div>
					</form>
				)}
			</TrainingEntryDetailLayout>
			{pageState.upgradeModal}
		</>
	);
}

export type { FaqEditorPageProps };
