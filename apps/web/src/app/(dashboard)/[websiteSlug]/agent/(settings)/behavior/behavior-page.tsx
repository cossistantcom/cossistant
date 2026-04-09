"use client";

import type { GetPromptStudioResponse } from "@cossistant/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BaseSubmitButton } from "@/components/ui/base-submit-button";
import { Button } from "@/components/ui/button";
import { PageContent } from "@/components/ui/layout";
import {
	SettingsHeader,
	SettingsPage,
	SettingsRow,
	SettingsRowFooter,
} from "@/components/ui/layout/settings-layout";
import { PromptInput } from "@/components/ui/prompt-input";
import { useWebsite } from "@/contexts/website";
import { useTRPC } from "@/lib/trpc/client";

type CorePromptEntry = GetPromptStudioResponse["corePrompts"][number];

export default function BehaviorPage() {
	const website = useWebsite();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [drafts, setDrafts] = useState<Record<string, string>>({});

	const { data: aiAgent } = useQuery(
		trpc.aiAgent.get.queryOptions({
			websiteSlug: website.slug,
		})
	);

	const { data: studio, isError: isStudioError } = useQuery({
		...trpc.aiAgent.getPromptStudio.queryOptions({
			websiteSlug: website.slug,
			aiAgentId: aiAgent?.id ?? "",
		}),
		enabled: Boolean(aiAgent?.id),
	});

	useEffect(() => {
		if (!studio) {
			return;
		}

		setDrafts(
			Object.fromEntries(
				studio.corePrompts.map((prompt) => [
					prompt.documentName,
					prompt.content,
				])
			)
		);
	}, [studio]);

	const invalidateBehaviorStudio = async () => {
		if (!aiAgent) {
			return;
		}

		await queryClient.invalidateQueries({
			queryKey: trpc.aiAgent.getPromptStudio.queryKey({
				websiteSlug: website.slug,
				aiAgentId: aiAgent.id,
			}),
		});
	};

	const upsertCorePromptMutation = useMutation(
		trpc.aiAgent.upsertCorePrompt.mutationOptions({
			onSuccess: () => {
				toast.success("Behaviour saved");
				void invalidateBehaviorStudio();
			},
			onError: (error) => {
				toast.error(error.message || "Failed to save behaviour");
			},
		})
	);

	const resetCorePromptMutation = useMutation(
		trpc.aiAgent.resetCorePrompt.mutationOptions({
			onSuccess: () => {
				toast.success("Behaviour reset to default");
				void invalidateBehaviorStudio();
			},
			onError: (error) => {
				toast.error(error.message || "Failed to reset behaviour");
			},
		})
	);

	const isMutating =
		upsertCorePromptMutation.isPending || resetCorePromptMutation.isPending;

	const corePrompts = useMemo(
		() => studio?.corePrompts ?? [],
		[studio?.corePrompts]
	);

	const getDraft = (prompt: CorePromptEntry) =>
		drafts[prompt.documentName] ?? prompt.content;

	const handleApplyPreset = (
		prompt: CorePromptEntry,
		presetContent: string
	): void => {
		setDrafts((current) => ({
			...current,
			[prompt.documentName]: presetContent,
		}));
	};

	const handleSave = async (prompt: CorePromptEntry) => {
		if (!aiAgent) {
			return;
		}

		const draft = getDraft(prompt).trim();
		if (!draft) {
			toast.error("Behaviour content cannot be empty");
			return;
		}

		await upsertCorePromptMutation.mutateAsync({
			websiteSlug: website.slug,
			aiAgentId: aiAgent.id,
			documentName: prompt.documentName,
			content: draft,
		});
	};

	const handleReset = async (prompt: CorePromptEntry) => {
		if (!aiAgent) {
			return;
		}

		setDrafts((current) => ({
			...current,
			[prompt.documentName]: prompt.defaultContent,
		}));

		if (!prompt.hasOverride) {
			return;
		}

		await resetCorePromptMutation.mutateAsync({
			websiteSlug: website.slug,
			aiAgentId: aiAgent.id,
			documentName: prompt.documentName,
		});
	};

	if (!aiAgent) {
		return null;
	}

	if (isStudioError || !studio) {
		return (
			<SettingsPage>
				<SettingsHeader>Behaviour</SettingsHeader>
				<PageContent className="py-30">
					<SettingsRow
						description="Something went wrong while loading behavior prompts."
						title="Unable to load"
					>
						<div className="p-4">
							<p className="text-destructive text-sm">
								Failed to load behaviour studio.
							</p>
						</div>
					</SettingsRow>
				</PageContent>
			</SettingsPage>
		);
	}

	return (
		<SettingsPage>
			<SettingsHeader>Behaviour</SettingsHeader>
			<PageContent className="py-30">
				{corePrompts.map((prompt) => {
					const draft = getDraft(prompt);
					const isDirty = draft !== prompt.content;

					return (
						<SettingsRow
							description={prompt.description}
							key={prompt.documentName}
							title={prompt.label}
						>
							<PromptInput
								className="border-none py-6"
								disabled={isMutating}
								maxLength={50_000}
								onChange={(value) =>
									setDrafts((current) => ({
										...current,
										[prompt.documentName]: value,
									}))
								}
								rows={12}
								value={draft}
							/>

							<SettingsRowFooter className="flex items-center justify-between gap-2">
								<div>
									{prompt.presets.length > 0 ? (
										<div className="flex items-center gap-2">
											<p className="text-muted-foreground text-xs">Presets:</p>
											<div className="flex flex-wrap gap-1">
												{prompt.presets.map((preset) => {
													const isActivePreset =
														draft.trim() === preset.content.trim();

													return (
														<Button
															className={
																isActivePreset
																	? "h-7 px-2 text-foreground text-xs"
																	: "h-7 px-2 text-muted-foreground text-xs hover:text-foreground"
															}
															disabled={isMutating}
															key={preset.id}
															onClick={() =>
																handleApplyPreset(prompt, preset.content)
															}
															size="sm"
															title={preset.description}
															type="button"
															variant="ghost"
														>
															{preset.label}
														</Button>
													);
												})}
											</div>
										</div>
									) : null}
								</div>
								<div className="flex items-center gap-2">
									<Button
										disabled={isMutating}
										onClick={() => void handleReset(prompt)}
										size="sm"
										type="button"
										variant="outline"
									>
										Reset
									</Button>
									<BaseSubmitButton
										disabled={!(isDirty && draft.trim())}
										isSubmitting={isMutating}
										onClick={() => void handleSave(prompt)}
										size="sm"
										type="button"
									>
										Save
									</BaseSubmitButton>
								</div>
							</SettingsRowFooter>
						</SettingsRow>
					);
				})}
			</PageContent>
		</SettingsPage>
	);
}
