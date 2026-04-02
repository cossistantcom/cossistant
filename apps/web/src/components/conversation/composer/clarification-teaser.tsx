"use client";

import type { ConversationClarificationSummary } from "@plasma/types";
import { useMutation } from "@tanstack/react-query";
import type React from "react";
import { toast } from "sonner";
import { useKnowledgeClarificationQueryInvalidation } from "@/components/knowledge-clarification/use-query-invalidation";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import Icon from "../../ui/icons";

export type ClarificationPromptProps = {
	websiteSlug: string;
	summary: ConversationClarificationSummary;
	onClarify: () => void;
	className?: string;
};

export type ClarificationPromptCardProps = {
	topicSummary: string;
	onClarify: () => void;
	onDismiss?: () => void;
	onLater?: () => void;
	isPending?: boolean;
	className?: string;
	clarifyButtonRef?: React.RefObject<HTMLButtonElement | null>;
};

export function ClarificationPromptCard({
	topicSummary,
	onClarify,
	onDismiss,
	onLater,
	isPending = false,
	className,
	clarifyButtonRef,
}: ClarificationPromptCardProps) {
	return (
		<div className={cn("px-2 pt-2 pb-2", className)}>
			<div className="flex w-full flex-col gap-1">
				<div className="flex w-full items-center justify-between gap-2">
					<div className="font-medium text-sm">Clarification</div>
					{onDismiss ? (
						<Button
							disabled={isPending}
							onClick={onDismiss}
							size="icon-small"
							type="button"
							variant="ghost"
						>
							<Icon className="size-3.5" name="x" variant="filled" />
						</Button>
					) : null}
				</div>
				<p className="max-w-[90%] text-balance text-muted-foreground text-sm">
					{topicSummary}
				</p>
			</div>

			<div className="mt-6 flex flex-wrap items-center justify-end gap-2">
				{onLater ? (
					<Button
						disabled={isPending}
						onClick={onLater}
						size="xs"
						type="button"
						variant="ghost"
					>
						Later
					</Button>
				) : null}
				<Button
					disabled={isPending}
					onClick={onClarify}
					ref={clarifyButtonRef}
					size="xs"
					type="button"
				>
					Clarify
				</Button>
			</div>
		</div>
	);
}

export function ClarificationPrompt({
	websiteSlug,
	summary,
	onClarify,
	className,
}: ClarificationPromptProps) {
	const trpc = useTRPC();
	const invalidateClarificationQueries =
		useKnowledgeClarificationQueryInvalidation(websiteSlug);
	const deferMutation = useMutation(
		trpc.knowledgeClarification.defer.mutationOptions({
			retry: false,
			onSuccess: async (request) => {
				await invalidateClarificationQueries({ request });
			},
			onError: (error) => {
				toast.error(error.message || "Failed to save clarification for later");
			},
		})
	);
	const dismissMutation = useMutation(
		trpc.knowledgeClarification.dismiss.mutationOptions({
			retry: false,
			onSuccess: async (request) => {
				await invalidateClarificationQueries({ request });
			},
			onError: (error) => {
				toast.error(error.message || "Failed to remove clarification");
			},
		})
	);
	const isPending = deferMutation.isPending || dismissMutation.isPending;

	return (
		<ClarificationPromptCard
			className={className}
			isPending={isPending}
			onClarify={onClarify}
			onDismiss={() => {
				dismissMutation.mutate({
					websiteSlug,
					requestId: summary.requestId,
				});
			}}
			onLater={() => {
				deferMutation.mutate({
					websiteSlug,
					requestId: summary.requestId,
				});
			}}
			topicSummary={summary.topicSummary}
		/>
	);
}
