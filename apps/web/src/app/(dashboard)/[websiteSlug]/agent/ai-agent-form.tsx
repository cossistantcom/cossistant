"use client";

import {
	AI_AGENT_TOOL_CATALOG,
	type AiAgentResponse,
	DEFAULT_AGENT_BASE_PROMPT,
} from "@plasma/types";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ModelSelect } from "@/components/agents/model-select";
import { copyToClipboardWithMeta } from "@/components/copy-button";
import { BaseSubmitButton } from "@/components/ui/base-submit-button";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import Icon from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { SettingsRowFooter } from "@/components/ui/layout/settings-layout";
import { PromptInputWithMentions } from "@/components/ui/prompt-input-with-mentions";
import { Switch } from "@/components/ui/switch";
import { TooltipOnHover } from "@/components/ui/tooltip";
import { useTRPC } from "@/lib/trpc/client";

const aiAgentFormSchema = z.object({
	name: z
		.string({ message: "Enter the agent name." })
		.trim()
		.min(1, { message: "Enter the agent name." })
		.max(100, { message: "Name must be 100 characters or fewer." }),
	description: z
		.string()
		.max(500, { message: "Description must be 500 characters or fewer." })
		.optional(),
	basePrompt: z
		.string({ message: "Enter the base prompt." })
		.trim()
		.min(1, { message: "Enter the base prompt." })
		.max(10_000, {
			message: "Base prompt must be 10,000 characters or fewer.",
		}),
	model: z.string().min(1, { message: "Select a model." }),
	temperature: z
		.number()
		.min(0, { message: "Temperature must be at least 0." })
		.max(2, { message: "Temperature must be at most 2." })
		.optional(),
	maxOutputTokens: z
		.number()
		.min(100, { message: "Max tokens must be at least 100." })
		.max(16_000, { message: "Max tokens must be at most 16,000." })
		.optional(),
});

type AIAgentFormValues = z.infer<typeof aiAgentFormSchema>;

type AIAgentFormProps = {
	websiteName: string;
	websiteSlug: string;
	initialData: AiAgentResponse | null;
};

export function AIAgentForm({
	websiteSlug,
	initialData,
	websiteName,
}: AIAgentFormProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const toolMentionOptions = useMemo(
		() =>
			(AI_AGENT_TOOL_CATALOG ?? []).map((tool) => ({
				id: tool.id,
				name: tool.label,
				description: tool.description,
			})),
		[]
	);

	// Fetch plan info for model restrictions
	const { data: planInfo } = useQuery(
		trpc.plan.getPlanInfo.queryOptions({ websiteSlug })
	);

	// Copy agent ID state
	const [hasCopied, setHasCopied] = useState(false);

	const handleCopyAgentId = async () => {
		if (!initialData?.id) {
			return;
		}

		try {
			await copyToClipboardWithMeta(initialData.id);
			setHasCopied(true);
			toast.success("Agent ID copied to clipboard");
			setTimeout(() => setHasCopied(false), 2000);
		} catch {
			toast.error("Failed to copy agent ID");
		}
	};

	const isEditing = initialData !== null;

	const form = useForm<AIAgentFormValues>({
		resolver: standardSchemaResolver(aiAgentFormSchema),
		mode: "onChange",
		defaultValues: {
			name: initialData?.name ?? `${websiteName} AI`,
			description: initialData?.description ?? "",
			basePrompt: initialData?.basePrompt ?? DEFAULT_AGENT_BASE_PROMPT,
			model: initialData?.model ?? "",
			temperature: initialData?.temperature ?? 0.7,
			maxOutputTokens: initialData?.maxOutputTokens ?? 1024,
		},
	});

	useEffect(() => {
		if (initialData) {
			return;
		}

		const defaultModelId = planInfo?.aiModels.defaultModelId;
		const knownModels = planInfo?.aiModels.items;
		if (!(defaultModelId && knownModels)) {
			return;
		}

		const currentModel = form.getValues("model");
		const isKnownCurrent = knownModels.some(
			(modelItem) => modelItem.id === currentModel
		);
		if (!isKnownCurrent) {
			form.setValue("model", defaultModelId, {
				shouldDirty: false,
				shouldTouch: false,
				shouldValidate: true,
			});
		}
	}, [
		form,
		initialData,
		planInfo?.aiModels.defaultModelId,
		planInfo?.aiModels.items,
	]);

	const { mutateAsync: createAgent, isPending: isCreating } = useMutation(
		trpc.aiAgent.create.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.aiAgent.get.queryKey({ websiteSlug }),
				});
				toast.success("AI agent created successfully.");
			},
			onError: (error) => {
				toast.error(error.message || "Failed to create AI agent.");
			},
		})
	);

	const { mutateAsync: updateAgent, isPending: isUpdating } = useMutation(
		trpc.aiAgent.update.mutationOptions({
			onSuccess: async (updatedAgent) => {
				await queryClient.invalidateQueries({
					queryKey: trpc.aiAgent.get.queryKey({ websiteSlug }),
				});
				form.reset({
					name: updatedAgent.name ?? `${websiteName} AI`,
					description: updatedAgent.description ?? "",
					basePrompt: updatedAgent.basePrompt,
					model: updatedAgent.model,
					temperature: updatedAgent.temperature ?? 0.7,
					maxOutputTokens: updatedAgent.maxOutputTokens ?? 1024,
				});
				toast.success("AI agent updated successfully.");
			},
			onError: (error) => {
				toast.error(error.message || "Failed to update AI agent.");
			},
		})
	);

	const { mutateAsync: toggleActive, isPending: isTogglingActive } =
		useMutation(
			trpc.aiAgent.toggleActive.mutationOptions({
				onSuccess: async (agent) => {
					await queryClient.invalidateQueries({
						queryKey: trpc.aiAgent.get.queryKey({ websiteSlug }),
					});
					toast.success(
						agent.isActive ? "AI agent enabled." : "AI agent disabled."
					);
				},
				onError: (error) => {
					toast.error(error.message || "Failed to toggle AI agent status.");
				},
			})
		);

	const isPending = isCreating || isUpdating;

	const onSubmit = async (values: AIAgentFormValues) => {
		if (isEditing && initialData) {
			await updateAgent({
				websiteSlug,
				aiAgentId: initialData.id,
				name: values.name,
				description: values.description ?? null,
				basePrompt: values.basePrompt,
				model: values.model,
				temperature: values.temperature ?? null,
				maxOutputTokens: values.maxOutputTokens ?? null,
			});
		} else {
			await createAgent({
				websiteSlug,
				name: values.name,
				description: values.description,
				basePrompt: values.basePrompt,
				model: values.model,
				temperature: values.temperature,
				maxOutputTokens: values.maxOutputTokens,
			});
		}
	};

	const handleToggleActive = async () => {
		if (!initialData) {
			return;
		}

		await toggleActive({
			websiteSlug,
			aiAgentId: initialData.id,
			isActive: !initialData.isActive,
		});
	};

	const hasChanges = form.formState.isDirty;

	return (
		<Form {...form}>
			<form className="flex flex-col" onSubmit={form.handleSubmit(onSubmit)}>
				{/* Enable/Disable toggle at the top when editing */}
				{isEditing && initialData && (
					<>
						<div className="flex items-center justify-between border-b px-4 py-4">
							<div className="flex flex-col gap-1">
								<span className="font-medium text-sm">Agent Status</span>
								<span className="text-muted-foreground text-xs">
									{initialData.isActive
										? "Agent is active and responding to visitors"
										: "Agent is disabled and not responding"}
								</span>
							</div>
							<Switch
								checked={initialData.isActive}
								disabled={isTogglingActive}
								onCheckedChange={handleToggleActive}
							/>
						</div>

						{/* Agent ID - copiable only */}
						<div className="flex items-center justify-between border-b px-4 py-4">
							<div className="flex flex-col gap-1">
								<span className="font-medium text-sm">Agent ID</span>
								<span className="text-muted-foreground text-xs">
									Unique identifier for API integrations
								</span>
							</div>
							<div className="flex items-center gap-2">
								<code className="rounded bg-background-200 px-2 py-0.5 font-mono text-xs dark:bg-background-300">
									{initialData.id}
								</code>
								<TooltipOnHover content="Copy agent ID">
									<Button
										onClick={handleCopyAgentId}
										size="icon-small"
										type="button"
										variant="secondary"
									>
										<Icon
											className="size-3.5"
											filledOnHover
											name={hasCopied ? "check" : "clipboard"}
										/>
									</Button>
								</TooltipOnHover>
							</div>
						</div>
					</>
				)}

				<div className="space-y-6 px-4 py-6">
					<FormField
						control={form.control}
						name="name"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Name</FormLabel>
								<FormControl>
									<Input
										placeholder={`${websiteName} AI`}
										{...field}
										disabled={isPending}
									/>
								</FormControl>
								<FormDescription>
									A friendly name for your AI agent.
								</FormDescription>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="description"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Description (optional)</FormLabel>
								<FormControl>
									<Input
										placeholder="Helps users with common support questions"
										{...field}
										disabled={isPending}
									/>
								</FormControl>
								<FormDescription>
									A brief description of what this agent does.
								</FormDescription>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="model"
						render={({ field }) => (
							<FormItem>
								<ModelSelect
									description="The AI model to use for generating responses."
									disabled={isPending}
									label="Model"
									onChange={field.onChange}
									planInfo={planInfo}
									value={field.value}
									websiteSlug={websiteSlug}
								/>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="basePrompt"
						render={({ field, fieldState }) => (
							<FormItem>
								<PromptInputWithMentions
									description="The system prompt that defines how your AI agent behaves."
									disabled={isPending}
									error={fieldState.error?.message}
									label="Base Prompt"
									maxLength={10_000}
									onChange={field.onChange}
									placeholder="You are a helpful support assistant..."
									rows={10}
									toolMentions={toolMentionOptions}
									value={field.value}
								/>
							</FormItem>
						)}
					/>

					<div className="grid grid-cols-2 gap-4">
						<FormField
							control={form.control}
							name="temperature"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Temperature</FormLabel>
									<FormControl>
										<Input
											disabled={isPending}
											max={2}
											min={0}
											placeholder="0.7"
											step={0.1}
											type="number"
											{...field}
											onChange={(e) =>
												field.onChange(
													e.target.value === ""
														? undefined
														: Number.parseFloat(e.target.value)
												)
											}
											value={field.value ?? ""}
										/>
									</FormControl>
									<FormDescription>
										Controls randomness (0 = focused, 2 = creative).
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="maxOutputTokens"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Max Tokens</FormLabel>
									<FormControl>
										<Input
											disabled={isPending}
											max={16_000}
											min={100}
											placeholder="1024"
											step={100}
											type="number"
											{...field}
											onChange={(e) =>
												field.onChange(
													e.target.value === ""
														? undefined
														: Number.parseInt(e.target.value, 10)
												)
											}
											value={field.value ?? ""}
										/>
									</FormControl>
									<FormDescription>
										Maximum response length (100-16,000).
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>
				</div>

				<SettingsRowFooter className="flex items-center justify-between gap-2">
					{isEditing && initialData && (
						<div className="text-muted-foreground text-xs">
							Used {initialData.usageCount} times
							{initialData.lastUsedAt && (
								<>
									{" "}
									&middot; Last used{" "}
									{new Date(initialData.lastUsedAt).toLocaleDateString()}
								</>
							)}
						</div>
					)}
					<div className="flex flex-1 items-center justify-end gap-2">
						<BaseSubmitButton
							className="w-auto"
							disabled={isEditing ? !hasChanges : false}
							isSubmitting={isPending}
						>
							{isEditing ? "Save changes" : "Create agent"}
						</BaseSubmitButton>
					</div>
				</SettingsRowFooter>
			</form>
		</Form>
	);
}
