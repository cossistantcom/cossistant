"use client";

import type { GetCapabilitiesStudioResponse } from "@cossistant/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SkillMarkdownEditor } from "@/components/agents/skills/skill-markdown-editor";
import {
	buildBehaviorSettingsPatch,
	buildToolStudioSections,
	normalizeSkillFrontmatterName,
	normalizeStudioTools,
	parseSkillEditorContent,
	serializeSkillEditorContent,
	toCanonicalSkillFileNameFromFrontmatterName,
} from "@/components/agents/skills/tools-studio-utils";
import { BaseSubmitButton } from "@/components/ui/base-submit-button";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageContent } from "@/components/ui/layout";
import {
	SettingsHeader,
	SettingsPage,
} from "@/components/ui/layout/settings-layout";
import { PromptEditModal } from "@/components/ui/prompt-edit-modal";
import { Switch } from "@/components/ui/switch";
import { useWebsite } from "@/contexts/website";
import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

type StudioTool = GetCapabilitiesStudioResponse["tools"][number];

type SkillEditorTarget =
	| { kind: "tool"; toolId: StudioTool["id"] }
	| { kind: "custom"; skillId: string }
	| { kind: "create-custom" }
	| null;

export default function ToolsPage() {
	const website = useWebsite();
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const [newSkillName, setNewSkillName] = useState("");
	const [newSkillDescription, setNewSkillDescription] = useState("");
	const [newSkillBody, setNewSkillBody] = useState(
		"## New Skill\n\nDescribe when and how this skill should be used."
	);
	const [toolSkillDrafts, setToolSkillDrafts] = useState<
		Record<string, string>
	>({});
	const [customSkillDrafts, setCustomSkillDrafts] = useState<
		Record<string, string>
	>({});
	const [editorTarget, setEditorTarget] = useState<SkillEditorTarget>(null);

	const { data: aiAgent } = useQuery(
		trpc.aiAgent.get.queryOptions({
			websiteSlug: website.slug,
		})
	);

	const { data: studio, isError: isStudioError } = useQuery({
		...trpc.aiAgent.getCapabilitiesStudio.queryOptions({
			websiteSlug: website.slug,
			aiAgentId: aiAgent?.id ?? "",
		}),
		enabled: Boolean(aiAgent?.id),
	});

	const normalizedTools = useMemo(
		() => normalizeStudioTools(studio?.tools),
		[studio?.tools]
	);
	const customSkillDocuments = useMemo(
		() => studio?.customSkillDocuments ?? [],
		[studio?.customSkillDocuments]
	);

	useEffect(() => {
		if (!studio) {
			return;
		}
		setToolSkillDrafts(
			Object.fromEntries(
				normalizedTools.map((tool) => [tool.id, tool.skillContent])
			)
		);
		setCustomSkillDrafts(
			Object.fromEntries(
				customSkillDocuments.map((skill) => [skill.id, skill.content])
			)
		);
	}, [customSkillDocuments, normalizedTools, studio]);

	const invalidateStudio = async () => {
		if (!aiAgent) {
			return;
		}

		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: trpc.aiAgent.getCapabilitiesStudio.queryKey({
					websiteSlug: website.slug,
					aiAgentId: aiAgent.id,
				}),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.aiAgent.getBehaviorSettings.queryKey({
					websiteSlug: website.slug,
				}),
			}),
		]);
	};

	const updateBehaviorMutation = useMutation(
		trpc.aiAgent.updateBehaviorSettings.mutationOptions({
			onSuccess: () => {
				void invalidateStudio();
			},
		})
	);
	const upsertToolSkillMutation = useMutation(
		trpc.aiAgent.upsertToolSkillOverride.mutationOptions({
			onSuccess: () => {
				void invalidateStudio();
			},
		})
	);
	const resetToolSkillMutation = useMutation(
		trpc.aiAgent.resetToolSkillOverride.mutationOptions({
			onSuccess: () => {
				void invalidateStudio();
			},
		})
	);
	const createSkillMutation = useMutation(
		trpc.aiAgent.createSkillDocument.mutationOptions({
			onSuccess: () => {
				void invalidateStudio();
			},
		})
	);
	const updateSkillMutation = useMutation(
		trpc.aiAgent.updateSkillDocument.mutationOptions({
			onSuccess: () => {
				void invalidateStudio();
			},
		})
	);
	const toggleSkillMutation = useMutation(
		trpc.aiAgent.toggleSkillDocument.mutationOptions({
			onSuccess: () => {
				void invalidateStudio();
			},
		})
	);
	const deleteSkillMutation = useMutation(
		trpc.aiAgent.deleteSkillDocument.mutationOptions({
			onSuccess: () => {
				void invalidateStudio();
			},
		})
	);

	const isMutating =
		updateBehaviorMutation.isPending ||
		upsertToolSkillMutation.isPending ||
		resetToolSkillMutation.isPending ||
		createSkillMutation.isPending ||
		updateSkillMutation.isPending ||
		toggleSkillMutation.isPending ||
		deleteSkillMutation.isPending;

	const toolMentionOptions = useMemo(
		() =>
			normalizedTools.map((tool) => ({
				id: tool.id,
				name: tool.label,
				description: tool.description,
			})),
		[normalizedTools]
	);

	const toolSections = useMemo(
		() => buildToolStudioSections(normalizedTools),
		[normalizedTools]
	);

	const customSkills = useMemo(
		() =>
			[...customSkillDocuments].sort((a, b) => {
				if (b.priority !== a.priority) {
					return b.priority - a.priority;
				}
				return a.name.localeCompare(b.name);
			}),
		[customSkillDocuments]
	);

	const customSkillPreviewById = useMemo<
		Record<string, ReturnType<typeof parseSkillEditorContent>>
	>(
		() =>
			Object.fromEntries(
				customSkills.map((skill) => [
					skill.id,
					parseSkillEditorContent({
						content: customSkillDrafts[skill.id] ?? skill.content,
						canonicalFileName: skill.name,
					}),
				])
			),
		[customSkillDrafts, customSkills]
	);
	const customSkillDisplayNameById = useMemo<Record<string, string>>(
		() =>
			Object.fromEntries(
				customSkills.map((skill) => [
					skill.id,
					customSkillPreviewById[skill.id]?.name ??
						normalizeSkillFrontmatterName(skill.name),
				])
			),
		[customSkillPreviewById, customSkills]
	);

	const activeTool = useMemo(() => {
		if (editorTarget?.kind !== "tool") {
			return null;
		}
		return (
			normalizedTools.find((tool) => tool.id === editorTarget.toolId) ?? null
		);
	}, [editorTarget, normalizedTools]);

	const activeCustomSkill = useMemo(() => {
		if (editorTarget?.kind !== "custom") {
			return null;
		}
		return (
			customSkillDocuments.find((skill) => skill.id === editorTarget.skillId) ??
			null
		);
	}, [customSkillDocuments, editorTarget]);

	const buildCanonicalSkillContent = (input: {
		content: string;
		canonicalFileName: string;
		fallbackDescription?: string;
	}) => {
		const parsed = parseSkillEditorContent({
			content: input.content,
			canonicalFileName: input.canonicalFileName,
			fallbackDescription: input.fallbackDescription,
		});

		return serializeSkillEditorContent({
			name: normalizeSkillFrontmatterName(input.canonicalFileName),
			description: parsed.description,
			body: parsed.body,
		});
	};

	const handleToggleTool = async (tool: StudioTool, enabled: boolean) => {
		if (!aiAgent) {
			return;
		}
		if (!(tool.behaviorSettingKey && tool.enabled !== enabled)) {
			return;
		}

		await updateBehaviorMutation.mutateAsync({
			websiteSlug: website.slug,
			aiAgentId: aiAgent.id,
			settings: buildBehaviorSettingsPatch(tool.behaviorSettingKey, enabled),
		});
	};

	const handleSaveToolSkill = async (tool: StudioTool) => {
		if (!aiAgent) {
			return;
		}
		const content = buildCanonicalSkillContent({
			content: toolSkillDrafts[tool.id] ?? tool.skillContent,
			canonicalFileName: tool.skillName,
			fallbackDescription: tool.skillDescription,
		});

		await upsertToolSkillMutation.mutateAsync({
			websiteSlug: website.slug,
			aiAgentId: aiAgent.id,
			toolId: tool.id,
			content,
		});
	};

	const handleResetToolSkill = async (tool: StudioTool) => {
		if (!aiAgent) {
			return;
		}
		if (!tool.skillHasOverride) {
			return;
		}

		await resetToolSkillMutation.mutateAsync({
			websiteSlug: website.slug,
			aiAgentId: aiAgent.id,
			toolId: tool.id,
		});
	};

	const handleCreateCustomSkill = async () => {
		if (!aiAgent) {
			return;
		}
		const normalizedName =
			toCanonicalSkillFileNameFromFrontmatterName(newSkillName);
		if (!(normalizedName && newSkillBody.trim())) {
			return;
		}

		const content = serializeSkillEditorContent({
			name: normalizeSkillFrontmatterName(normalizedName),
			description: newSkillDescription,
			body: newSkillBody,
		});

		await createSkillMutation.mutateAsync({
			websiteSlug: website.slug,
			aiAgentId: aiAgent.id,
			name: normalizedName,
			content,
			enabled: true,
			priority: 0,
		});

		setNewSkillName("");
		setNewSkillDescription("");
		setNewSkillBody(
			"## New Skill\n\nDescribe when and how this skill should be used."
		);
		setEditorTarget(null);
	};

	if (!aiAgent) {
		return null;
	}

	if (isStudioError || !studio) {
		return (
			<SettingsPage>
				<SettingsHeader>Tools & Skills</SettingsHeader>
				<PageContent className="py-30">
					<div className="p-6 text-center text-destructive">
						Failed to load behaviour and tools.
					</div>
				</PageContent>
			</SettingsPage>
		);
	}

	const renderToolCard = (tool: StudioTool) => (
		<Card
			className={cn("relative flex flex-col border-border/60", {
				"bg-cossistant-blue/5": tool.enabled,
			})}
			key={tool.id}
		>
			<CardHeader className="space-y-2 p-4 pb-2">
				<div className="flex items-start justify-between gap-3">
					<div>
						<CardTitle className="text-sm">{tool.label}</CardTitle>
					</div>
					{tool.isToggleable ? (
						<Switch
							aria-label={`Toggle ${tool.label}`}
							checked={tool.enabled}
							disabled={isMutating}
							onCheckedChange={(checked) =>
								void handleToggleTool(tool, checked)
							}
						/>
					) : null}
				</div>
			</CardHeader>
			<CardContent className="flex-1 px-4 pt-0">
				<p className="text-muted-foreground text-sm">{tool.description}</p>
			</CardContent>
			<CardFooter className="justify-end gap-2 self-end p-4 pt-2">
				{tool.skillHasOverride ? (
					<Button
						disabled={isMutating}
						onClick={() => void handleResetToolSkill(tool)}
						size="xs"
						type="button"
						variant="ghost"
					>
						Reset
					</Button>
				) : null}
				<Button
					aria-label={`Edit ${tool.label} skill`}
					disabled={isMutating}
					onClick={() => setEditorTarget({ kind: "tool", toolId: tool.id })}
					size="xs"
					type="button"
					variant="outline"
				>
					Edit
				</Button>
			</CardFooter>
		</Card>
	);

	const modalBody = (() => {
		if (editorTarget?.kind === "tool" && activeTool) {
			const toolSkillContent =
				toolSkillDrafts[activeTool.id] ?? activeTool.skillContent;
			const parsedToolContent = parseSkillEditorContent({
				content: toolSkillContent,
				canonicalFileName: activeTool.skillName,
				fallbackDescription: activeTool.skillDescription,
			});

			return (
				<div className="space-y-3 p-2">
					<Input
						aria-label="Tool skill description"
						disabled={isMutating}
						onChange={(event) =>
							setToolSkillDrafts((current) => ({
								...current,
								[activeTool.id]: serializeSkillEditorContent({
									name: normalizeSkillFrontmatterName(activeTool.skillName),
									description: event.target.value,
									body: parsedToolContent.body,
								}),
							}))
						}
						placeholder="Description"
						value={parsedToolContent.description}
					/>
					<SkillMarkdownEditor
						disabled={isMutating}
						onChange={(nextValue) =>
							setToolSkillDrafts((current) => ({
								...current,
								[activeTool.id]: serializeSkillEditorContent({
									name: normalizeSkillFrontmatterName(activeTool.skillName),
									description: parsedToolContent.description,
									body: nextValue,
								}),
							}))
						}
						rows={20}
						toolMentions={toolMentionOptions}
						value={parsedToolContent.body}
					/>
				</div>
			);
		}

		if (editorTarget?.kind === "custom" && activeCustomSkill) {
			const customSkillContent =
				customSkillDrafts[activeCustomSkill.id] ?? activeCustomSkill.content;
			const parsedCustomContent = parseSkillEditorContent({
				content: customSkillContent,
				canonicalFileName: activeCustomSkill.name,
			});

			return (
				<div className="space-y-3 p-2">
					<Input
						aria-label="Custom skill name"
						disabled={isMutating}
						onChange={(event) =>
							setCustomSkillDrafts((current) => ({
								...current,
								[activeCustomSkill.id]: serializeSkillEditorContent({
									name: event.target.value,
									description: parsedCustomContent.description,
									body: parsedCustomContent.body,
								}),
							}))
						}
						placeholder="refund-playbook"
						value={parsedCustomContent.name}
					/>
					<Input
						aria-label="Custom skill description"
						disabled={isMutating}
						onChange={(event) =>
							setCustomSkillDrafts((current) => ({
								...current,
								[activeCustomSkill.id]: serializeSkillEditorContent({
									name: parsedCustomContent.name,
									description: event.target.value,
									body: parsedCustomContent.body,
								}),
							}))
						}
						placeholder="Description"
						value={parsedCustomContent.description}
					/>
					<SkillMarkdownEditor
						disabled={isMutating}
						onChange={(nextValue) =>
							setCustomSkillDrafts((current) => ({
								...current,
								[activeCustomSkill.id]: serializeSkillEditorContent({
									name: parsedCustomContent.name,
									description: parsedCustomContent.description,
									body: nextValue,
								}),
							}))
						}
						rows={20}
						toolMentions={toolMentionOptions}
						value={parsedCustomContent.body}
					/>
				</div>
			);
		}

		if (editorTarget?.kind === "create-custom") {
			return (
				<div className="space-y-3 p-2">
					<Input
						aria-label="New custom skill name"
						disabled={isMutating}
						onChange={(event) => setNewSkillName(event.target.value)}
						placeholder="refund-playbook"
						value={newSkillName}
					/>
					<Input
						aria-label="New custom skill description"
						disabled={isMutating}
						onChange={(event) => setNewSkillDescription(event.target.value)}
						placeholder="Description"
						value={newSkillDescription}
					/>
					<SkillMarkdownEditor
						disabled={isMutating}
						onChange={setNewSkillBody}
						rows={16}
						toolMentions={toolMentionOptions}
						value={newSkillBody}
					/>
				</div>
			);
		}

		return null;
	})();

	const modalTitle = (() => {
		if (editorTarget?.kind === "tool") {
			return activeTool ? `${activeTool.label} skill` : "Tool skill";
		}
		if (editorTarget?.kind === "custom") {
			if (!activeCustomSkill) {
				return "Edit custom skill";
			}

			return (
				customSkillDisplayNameById[activeCustomSkill.id] ?? "Edit custom skill"
			);
		}
		if (editorTarget?.kind === "create-custom") {
			return "Create custom skill";
		}
		return "Skill editor";
	})();

	const modalFooter = (() => {
		if (editorTarget?.kind === "tool" && activeTool) {
			return (
				<div className="flex w-full flex-wrap justify-end gap-2">
					<Button
						onClick={() => setEditorTarget(null)}
						size="sm"
						type="button"
						variant="ghost"
					>
						Close
					</Button>
					<BaseSubmitButton
						isSubmitting={isMutating}
						onClick={() => void handleSaveToolSkill(activeTool)}
						size="sm"
						type="button"
					>
						Save
					</BaseSubmitButton>
					{activeTool.skillHasOverride ? (
						<Button
							disabled={isMutating}
							onClick={() => void handleResetToolSkill(activeTool)}
							size="sm"
							type="button"
							variant="outline"
						>
							Reset
						</Button>
					) : null}
				</div>
			);
		}

		if (editorTarget?.kind === "custom" && activeCustomSkill) {
			const customSkillContent =
				customSkillDrafts[activeCustomSkill.id] ?? activeCustomSkill.content;
			const parsedCustomContent = parseSkillEditorContent({
				content: customSkillContent,
				canonicalFileName: activeCustomSkill.name,
			});
			const canonicalFileName = toCanonicalSkillFileNameFromFrontmatterName(
				parsedCustomContent.name
			);

			return (
				<div className="flex w-full justify-end gap-2">
					<Button
						onClick={() => setEditorTarget(null)}
						size="sm"
						type="button"
						variant="ghost"
					>
						Close
					</Button>
					<BaseSubmitButton
						disabled={!canonicalFileName}
						isSubmitting={isMutating}
						onClick={() =>
							void updateSkillMutation.mutateAsync({
								websiteSlug: website.slug,
								aiAgentId: aiAgent.id,
								skillDocumentId: activeCustomSkill.id,
								name: canonicalFileName,
								content: serializeSkillEditorContent({
									name: normalizeSkillFrontmatterName(canonicalFileName),
									description: parsedCustomContent.description,
									body: parsedCustomContent.body,
								}),
							})
						}
						size="sm"
						type="button"
					>
						Save
					</BaseSubmitButton>
				</div>
			);
		}

		if (editorTarget?.kind === "create-custom") {
			const normalizedNewSkillName =
				toCanonicalSkillFileNameFromFrontmatterName(newSkillName);

			return (
				<div className="flex w-full justify-end gap-2">
					<Button
						onClick={() => setEditorTarget(null)}
						size="sm"
						type="button"
						variant="ghost"
					>
						Close
					</Button>
					<Button
						disabled={
							isMutating || !normalizedNewSkillName || !newSkillBody.trim()
						}
						onClick={() => void handleCreateCustomSkill()}
						size="sm"
						type="button"
					>
						Create
					</Button>
				</div>
			);
		}

		return null;
	})();

	return (
		<SettingsPage>
			<SettingsHeader>
				Tools & Skills
				<div className="flex items-center gap-2 pr-1">
					<Button
						disabled={isMutating}
						onClick={() => setEditorTarget({ kind: "create-custom" })}
						size="sm"
						type="button"
						variant="secondary"
					>
						Create custom tool
					</Button>
				</div>
			</SettingsHeader>
			<PageContent className="py-30">
				<div className="mx-auto w-full max-w-6xl space-y-8 px-4 pb-8">
					<section className="space-y-3">
						<div className="space-y-1">
							<h1 className="font-medium text-base">Custom tools</h1>
							<p className="text-muted-foreground text-sm">
								Add reusable instructions for workflows outside default tools.
							</p>
						</div>

						{customSkills.length === 0 ? (
							<div className="flex h-44 flex-col items-center justify-center gap-2 rounded border border-dashed p-4">
								<p className="text-muted-foreground text-sm">
									No custom tools yet.
								</p>
								<Button
									disabled={isMutating}
									onClick={() => setEditorTarget({ kind: "create-custom" })}
									size="sm"
									type="button"
								>
									Create
								</Button>
							</div>
						) : (
							<div className="grid gap-4 lg:grid-cols-2">
								{customSkills.map((skill) => {
									const preview = customSkillPreviewById[skill.id];
									const displayName =
										customSkillDisplayNameById[skill.id] ??
										normalizeSkillFrontmatterName(skill.name);

									return (
										<Card className="border-border/60" key={skill.id}>
											<CardHeader className="space-y-2 p-4">
												<div className="flex items-start justify-between gap-3">
													<div>
														<CardTitle className="text-base">
															{displayName}
														</CardTitle>
													</div>
													<div className="flex items-center gap-2">
														<Switch
															aria-label={`Toggle ${displayName}`}
															checked={skill.enabled}
															disabled={isMutating}
															onCheckedChange={(checked) =>
																void toggleSkillMutation.mutateAsync({
																	websiteSlug: website.slug,
																	aiAgentId: aiAgent.id,
																	skillDocumentId: skill.id,
																	enabled: checked,
																})
															}
														/>
														<Button
															aria-label={`Edit ${displayName}`}
															disabled={isMutating}
															onClick={() =>
																setEditorTarget({
																	kind: "custom",
																	skillId: skill.id,
																})
															}
															size="icon-small"
															type="button"
															variant="ghost"
														>
															<Pencil className="size-3.5" />
														</Button>
													</div>
												</div>
											</CardHeader>
											<CardContent className="p-4 pt-0">
												<p className="text-muted-foreground text-sm">
													{preview?.description ||
														"Custom markdown behavior skill."}
												</p>
											</CardContent>
											<CardFooter className="justify-between border-border/50 border-t p-4 pt-3">
												<p className="text-muted-foreground text-xs">
													Priority {skill.priority}
												</p>
												<Button
													disabled={isMutating}
													onClick={() =>
														void deleteSkillMutation.mutateAsync({
															websiteSlug: website.slug,
															aiAgentId: aiAgent.id,
															skillDocumentId: skill.id,
														})
													}
													size="sm"
													type="button"
													variant="destructive"
												>
													Delete
												</Button>
											</CardFooter>
										</Card>
									);
								})}
							</div>
						)}
					</section>

					<section className="space-y-3">
						<div className="space-y-1">
							<h2 className="font-medium text-base">Behavior tools</h2>
							<p className="text-muted-foreground text-sm">
								Toggle optional behavior capabilities and edit attached
								guidance.
							</p>
						</div>
						{toolSections.toggleableBehaviorTools.length === 0 ? (
							<Card className="border-border/60">
								<CardContent className="p-4">
									<p className="text-muted-foreground text-sm">
										No toggleable behavior tools.
									</p>
								</CardContent>
							</Card>
						) : (
							<div className="grid gap-4 lg:grid-cols-3">
								{toolSections.toggleableBehaviorTools.map((tool) =>
									renderToolCard(tool)
								)}
							</div>
						)}
					</section>

					<section className="space-y-3">
						<div className="space-y-1">
							<h2 className="font-medium text-base">Action tools</h2>
							<p className="text-muted-foreground text-sm">
								Toggle optional finish actions and edit their attached guidance.
							</p>
						</div>
						{toolSections.toggleableActionTools.length === 0 ? (
							<Card className="border-border/60">
								<CardContent className="p-4">
									<p className="text-muted-foreground text-sm">
										No toggleable action tools.
									</p>
								</CardContent>
							</Card>
						) : (
							<div className="grid gap-4 lg:grid-cols-3">
								{toolSections.toggleableActionTools.map((tool) =>
									renderToolCard(tool)
								)}
							</div>
						)}
					</section>

					{/* <section className="space-y-3">
            <div className="space-y-1">
              <h2 className="font-medium text-base">Always-on tools</h2>
              <p className="text-muted-foreground text-sm">
                Required tools that are always active in agent runs.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {toolSections.alwaysOnTools.map((tool) => renderToolCard(tool))}
            </div>
          </section> */}
				</div>
			</PageContent>

			<PromptEditModal
				footer={modalFooter}
				onOpenChange={(open) => {
					if (!open) {
						setEditorTarget(null);
					}
				}}
				open={editorTarget !== null}
				title={modalTitle}
			>
				{modalBody}
			</PromptEditModal>
		</SettingsPage>
	);
}
