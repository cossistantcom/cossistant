"use client";

import type { KnowledgeClarificationDraftFaq } from "@plasma/types";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type KnowledgeClarificationDraftReviewProps = {
	draft: KnowledgeClarificationDraftFaq;
	onApprove: (draft: KnowledgeClarificationDraftFaq) => void | Promise<void>;
	onDismiss?: () => void | Promise<void>;
	isSubmitting?: boolean;
	title?: string;
	description?: string;
	variant?: "dialog" | "page";
};

type KnowledgeClarificationDraftReviewState = {
	draftTitle: string;
	question: string;
	answer: string;
	categories: string;
	relatedQuestions: string;
	setDraftTitle: Dispatch<SetStateAction<string>>;
	setQuestion: Dispatch<SetStateAction<string>>;
	setAnswer: Dispatch<SetStateAction<string>>;
	setCategories: Dispatch<SetStateAction<string>>;
	setRelatedQuestions: Dispatch<SetStateAction<string>>;
	parsedDraft: KnowledgeClarificationDraftFaq;
	canApprove: boolean;
};

type KnowledgeClarificationDraftReviewBodyProps = {
	state: KnowledgeClarificationDraftReviewState;
	title?: string;
	description?: string;
	disabled?: boolean;
	notice?: ReactNode;
};

type KnowledgeClarificationDraftPreviewCardProps = {
	draft: KnowledgeClarificationDraftFaq;
	className?: string;
	title?: string;
	description?: string;
	badgeLabel?: string;
	variant?: "default" | "minimal";
	minimalPills?: string[];
};

function runDraftReviewAction(action: () => void | Promise<void>) {
	const result = action();

	if (result && typeof result.catch === "function") {
		void result.catch(() => {});
	}
}

export function useKnowledgeClarificationDraftReviewState(
	draft: KnowledgeClarificationDraftFaq | null
): KnowledgeClarificationDraftReviewState {
	const [draftTitle, setDraftTitle] = useState(draft?.title ?? "");
	const [question, setQuestion] = useState(draft?.question ?? "");
	const [answer, setAnswer] = useState(draft?.answer ?? "");
	const [categories, setCategories] = useState(
		draft?.categories.join(", ") ?? ""
	);
	const [relatedQuestions, setRelatedQuestions] = useState(
		draft?.relatedQuestions.join(", ") ?? ""
	);

	useEffect(() => {
		setDraftTitle(draft?.title ?? "");
		setQuestion(draft?.question ?? "");
		setAnswer(draft?.answer ?? "");
		setCategories(draft?.categories.join(", ") ?? "");
		setRelatedQuestions(draft?.relatedQuestions.join(", ") ?? "");
	}, [draft]);

	const canApprove = Boolean(question.trim() && answer.trim());
	const parsedDraft = {
		title: draftTitle.trim() || null,
		question: question.trim(),
		answer: answer.trim(),
		categories: categories
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
		relatedQuestions: relatedQuestions
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
	};

	return {
		answer,
		categories,
		canApprove,
		draftTitle,
		parsedDraft,
		question,
		relatedQuestions,
		setAnswer,
		setCategories,
		setDraftTitle,
		setQuestion,
		setRelatedQuestions,
	};
}

export function KnowledgeClarificationDraftReviewBody({
	state,
	title = "Review FAQ draft",
	description = "Tweak the proposed FAQ before adding it to the knowledge base.",
	disabled = false,
	notice,
}: KnowledgeClarificationDraftReviewBodyProps) {
	return (
		<div aria-busy={disabled || undefined} className="space-y-4">
			<div className="space-y-1">
				<div className="font-medium text-base">{title}</div>
				<p className="text-muted-foreground text-sm">{description}</p>
			</div>
			{notice ? <div>{notice}</div> : null}
			<div className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="clarification-draft-title">Proposal title</Label>
					<Input
						disabled={disabled}
						id="clarification-draft-title"
						onChange={(event) => state.setDraftTitle(event.target.value)}
						placeholder="Optional internal title"
						value={state.draftTitle}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="clarification-draft-question">FAQ question</Label>
					<Input
						disabled={disabled}
						id="clarification-draft-question"
						onChange={(event) => state.setQuestion(event.target.value)}
						placeholder="How does this work?"
						value={state.question}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="clarification-draft-answer">FAQ answer</Label>
					<Textarea
						className="min-h-[320px] font-mono text-sm"
						disabled={disabled}
						id="clarification-draft-answer"
						onChange={(event) => state.setAnswer(event.target.value)}
						rows={14}
						value={state.answer}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="clarification-draft-categories">Categories</Label>
					<Input
						disabled={disabled}
						id="clarification-draft-categories"
						onChange={(event) => state.setCategories(event.target.value)}
						placeholder="Billing, Plans, Limits"
						value={state.categories}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="clarification-draft-related">Related questions</Label>
					<Input
						disabled={disabled}
						id="clarification-draft-related"
						onChange={(event) => state.setRelatedQuestions(event.target.value)}
						placeholder="Comma-separated related questions"
						value={state.relatedQuestions}
					/>
				</div>
			</div>
		</div>
	);
}

export function KnowledgeClarificationDraftPreviewCard({
	draft,
	className,
	title = "FAQ created",
	description = "Added to your knowledge base from the clarification flow.",
	badgeLabel = "Knowledge base updated",
	variant = "default",
	minimalPills,
}: KnowledgeClarificationDraftPreviewCardProps) {
	if (variant === "minimal") {
		return (
			<div
				className={cn(
					"border border-dashed bg-background px-5 py-5 shadow-none dark:bg-background-50",
					className
				)}
				data-knowledge-clarification-draft-preview="true"
				data-knowledge-clarification-draft-preview-variant="minimal"
			>
				<div className="space-y-3">
					{minimalPills?.length ? (
						<div
							className="flex flex-wrap gap-2"
							data-knowledge-clarification-draft-preview-pills="true"
						>
							{minimalPills.map((pill) => (
								<div
									className="border border-dashed px-2 py-1 font-medium text-[10px] leading-none"
									data-knowledge-clarification-draft-preview-pill={pill}
									key={pill}
								>
									{pill}
								</div>
							))}
						</div>
					) : null}
					<div className="font-medium text-base leading-6">
						{draft.question}
					</div>
					<p className="text-primary/80 text-sm leading-6">{draft.answer}</p>
				</div>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"rounded-[28px] border bg-background p-6 shadow-sm",
				className
			)}
			data-knowledge-clarification-draft-preview="true"
			data-knowledge-clarification-draft-preview-variant="default"
		>
			<div className="space-y-5">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="space-y-1">
						<div className="font-medium text-base">{title}</div>
						<p className="text-muted-foreground text-sm">{description}</p>
					</div>
					<div className="rounded-full border px-3 py-1 font-medium text-xs">
						{badgeLabel}
					</div>
				</div>

				<div className="space-y-4">
					{draft.title ? (
						<div className="space-y-1">
							<div className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
								Title
							</div>
							<div className="font-medium text-sm">{draft.title}</div>
						</div>
					) : null}

					<div className="space-y-1">
						<div className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
							Question
						</div>
						<div className="font-medium text-base">{draft.question}</div>
					</div>

					<div className="space-y-1">
						<div className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
							Answer
						</div>
						<p className="text-sm leading-6">{draft.answer}</p>
					</div>

					{draft.categories.length > 0 ? (
						<div className="space-y-2">
							<div className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
								Categories
							</div>
							<div className="flex flex-wrap gap-2">
								{draft.categories.map((category) => (
									<div
										className="rounded-full border px-3 py-1 text-xs"
										key={category}
									>
										{category}
									</div>
								))}
							</div>
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}

export function KnowledgeClarificationDraftReview({
	draft,
	onApprove,
	onDismiss,
	isSubmitting = false,
	title = "Review FAQ draft",
	description = "Tweak the proposed FAQ before adding it to the knowledge base.",
	variant = "dialog",
}: KnowledgeClarificationDraftReviewProps) {
	const state = useKnowledgeClarificationDraftReviewState(draft);

	const footer = (
		<div className="flex items-center justify-between gap-3">
			<Button
				disabled={isSubmitting}
				onClick={() => {
					if (onDismiss) {
						runDraftReviewAction(onDismiss);
					}
				}}
				type="button"
				variant="ghost"
			>
				Close
			</Button>
			<Button
				disabled={isSubmitting || !state.canApprove}
				onClick={() => {
					runDraftReviewAction(() => onApprove(state.parsedDraft));
				}}
				type="button"
			>
				{isSubmitting ? "Applying..." : "Approve draft"}
			</Button>
		</div>
	);

	if (variant === "page") {
		return (
			<KnowledgeClarificationDraftReviewBody
				description={description}
				state={state}
				title={title}
			/>
		);
	}

	return (
		<div className="space-y-4">
			<div className="rounded-2xl border bg-background p-5 shadow-sm">
				<KnowledgeClarificationDraftReviewBody
					description={description}
					state={state}
					title={title}
				/>
			</div>
			{footer}
		</div>
	);
}

export type { KnowledgeClarificationDraftReviewState };
