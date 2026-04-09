"use client";

import type { ArticleKnowledgePayload } from "@plasma/types";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTRPC } from "@/lib/trpc/client";
import {
	TrainingEntryDetailLayout,
	useTrainingPageState,
} from "../training-entries";
import { FileManualEntryFields } from "./file-manual-entry-fields";
import { FileUploadZone } from "./file-upload-zone";
import { useFileMutations } from "./hooks/use-file-mutations";

type FileEditorPageProps = {
	knowledgeId?: string;
};

type NormalizedFileDraft = {
	title: string;
	summary: string;
	markdown: string;
};

const EMPTY_FILE_DRAFT: NormalizedFileDraft = {
	title: "",
	summary: "",
	markdown: "",
};

function normalizeFileDraft(input: {
	title: string;
	summary: string;
	markdown: string;
}): NormalizedFileDraft {
	return {
		title: input.title.trim(),
		summary: input.summary.trim(),
		markdown: input.markdown.trim(),
	};
}

function areFileDraftsEqual(
	left: NormalizedFileDraft,
	right: NormalizedFileDraft
): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

export function FileEditorPage({ knowledgeId }: FileEditorPageProps) {
	const router = useRouter();
	const trpc = useTRPC();
	const [activeTab, setActiveTab] = useState<"manual" | "upload">("manual");
	const pageState = useTrainingPageState({
		highlightedFeatureKey: "ai-agent-training-files",
	});

	const isCreateMode = !knowledgeId;
	const listHref = `/${pageState.websiteSlug}/agent/training/files`;
	const { data: knowledge, isLoading: isLoadingKnowledge } = useQuery({
		...trpc.knowledge.get.queryOptions({
			websiteSlug: pageState.websiteSlug,
			id: knowledgeId ?? "",
		}),
		enabled: Boolean(knowledgeId),
	});
	const initialDraftFromKnowledge = useMemo(() => {
		if (!knowledge || knowledge.type !== "article") {
			return EMPTY_FILE_DRAFT;
		}

		const payload = knowledge.payload as ArticleKnowledgePayload;
		return normalizeFileDraft({
			title: payload.title,
			summary: payload.summary ?? "",
			markdown: payload.markdown,
		});
	}, [knowledge]);
	const [title, setTitle] = useState(() => initialDraftFromKnowledge.title);
	const [summary, setSummary] = useState(
		() => initialDraftFromKnowledge.summary
	);
	const [markdown, setMarkdown] = useState(
		() => initialDraftFromKnowledge.markdown
	);
	const [initialDraft, setInitialDraft] = useState<NormalizedFileDraft>(
		() => initialDraftFromKnowledge
	);

	const {
		handleCreate,
		handleDelete,
		handleToggleIncluded,
		handleUpdate,
		handleUpload,
		isCreating,
		isDeleting,
		isToggling,
		isUpdating,
		isUploading,
	} = useFileMutations({
		websiteSlug: pageState.websiteSlug,
		aiAgentId: pageState.aiAgentId,
		trainingControls: pageState.trainingControls,
	});

	useEffect(() => {
		if (!knowledge || knowledge.type !== "article") {
			return;
		}

		setTitle(initialDraftFromKnowledge.title);
		setSummary(initialDraftFromKnowledge.summary);
		setMarkdown(initialDraftFromKnowledge.markdown);
		setInitialDraft(initialDraftFromKnowledge);
	}, [initialDraftFromKnowledge, knowledge]);

	const isAtFileLimit =
		pageState.stats?.planLimitFiles !== null &&
		pageState.stats?.articleKnowledgeCount !== undefined &&
		pageState.stats.articleKnowledgeCount >=
			(pageState.stats.planLimitFiles ?? 0);
	const isSaving = isCreateMode ? isCreating : isUpdating;
	const currentDraft = useMemo(
		() =>
			normalizeFileDraft({
				title,
				summary,
				markdown,
			}),
		[markdown, summary, title]
	);
	const isDirty = !areFileDraftsEqual(currentDraft, initialDraft);
	const isValid = title.trim().length > 0 && markdown.trim().length > 0;
	const isUnavailable =
		!(isCreateMode || isLoadingKnowledge) &&
		(!knowledge || knowledge.type !== "article");
	const headerTitle = useMemo(() => {
		if (title.trim()) {
			return title.trim();
		}

		return isCreateMode ? "New file" : "Untitled file";
	}, [isCreateMode, title]);

	const handleSave = async () => {
		if (!isValid) {
			return;
		}

		if (isCreateMode && isAtFileLimit) {
			pageState.openUpgradeModal();
			return;
		}

		if (isCreateMode) {
			const created = await handleCreate({
				title: currentDraft.title,
				summary: currentDraft.summary || undefined,
				markdown: currentDraft.markdown,
			});
			router.push(
				`/${pageState.websiteSlug}/agent/training/files/${created.id}`
			);
			return;
		}

		if (!knowledgeId) {
			return;
		}

		await handleUpdate(knowledgeId, {
			title: currentDraft.title,
			summary: currentDraft.summary || undefined,
			markdown: currentDraft.markdown,
		});
		setInitialDraft(currentDraft);
	};

	const handleUploadFiles = async (files: File[]) => {
		if (isAtFileLimit) {
			pageState.openUpgradeModal();
			return;
		}

		let lastUploadedId: string | null = null;
		for (const file of files) {
			const uploaded = await handleUpload(file);
			lastUploadedId = uploaded.id;
		}

		if (files.length === 1 && lastUploadedId) {
			router.push(
				`/${pageState.websiteSlug}/agent/training/files/${lastUploadedId}`
			);
			return;
		}

		router.push(listHref);
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

	const canSave =
		activeTab === "manual" &&
		isValid &&
		isDirty &&
		!isSaving &&
		!(isCreateMode && isAtFileLimit);
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
					disabled={isDeleting}
					onClick={handleDeleteEntry}
					size="sm"
					type="button"
					variant="ghost"
				>
					Delete
				</Button>
			)}
			{activeTab === "manual" ? (
				<Button
					disabled={!canSave}
					onClick={handleSave}
					size="sm"
					type="button"
				>
					{isSaving ? "Saving..." : "Save"}
				</Button>
			) : null}
		</>
	);

	return (
		<>
			<TrainingEntryDetailLayout
				backHref={listHref}
				headerActions={headerActions}
				title={headerTitle}
			>
				{isUnavailable ? (
					<div className="space-y-2 py-12 text-center">
						<h2 className="font-medium text-base text-primary">Unavailable</h2>
						<p className="text-muted-foreground text-sm">
							This file no longer exists or cannot be edited.
						</p>
					</div>
				) : isCreateMode ? (
					<Tabs
						onValueChange={(value) =>
							setActiveTab(value as "manual" | "upload")
						}
						value={activeTab}
					>
						<TabsList className="grid w-full grid-cols-2">
							<TabsTrigger value="manual">Manual entry</TabsTrigger>
							<TabsTrigger value="upload">Upload file</TabsTrigger>
						</TabsList>
						<TabsContent className="pt-6" value="manual">
							<FileManualEntryFields
								disabled={isSaving}
								markdown={markdown}
								onMarkdownChange={setMarkdown}
								onSummaryChange={setSummary}
								onTitleChange={setTitle}
								summary={summary}
								title={title}
							/>
						</TabsContent>
						<TabsContent className="space-y-4 pt-6" value="upload">
							<p className="text-muted-foreground text-sm">
								Upload markdown or text files and we will convert them into
								training entries.
							</p>
							<FileUploadZone
								disabled={isAtFileLimit}
								isUploading={isUploading}
								onUpload={handleUploadFiles}
							/>
						</TabsContent>
					</Tabs>
				) : (
					<FileManualEntryFields
						disabled={isSaving || isLoadingKnowledge}
						markdown={markdown}
						onMarkdownChange={setMarkdown}
						onSummaryChange={setSummary}
						onTitleChange={setTitle}
						summary={summary}
						title={title}
					/>
				)}
			</TrainingEntryDetailLayout>
			{pageState.upgradeModal}
		</>
	);
}

export type { FileEditorPageProps };
