"use client";

import {
	AI_AGENT_TOOL_CATALOG,
	type AiAgentResponse,
	DEFAULT_AGENT_BASE_PROMPT,
} from "@cossistant/types";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ModelSelect } from "@/components/agents/model-select";
import { copyToClipboardWithMeta } from "@/components/copy-button";
import { UpgradeModal } from "@/components/plan/upgrade-modal";
import {
	AvatarInput,
	type AvatarInputValue,
	uploadToPresignedUrl,
} from "@/components/ui/avatar-input";
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
import { Label } from "@/components/ui/label";
import { SettingsRowFooter } from "@/components/ui/layout/settings-layout";
import { PromptInputWithMentions } from "@/components/ui/prompt-input-with-mentions";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { TooltipOnHover } from "@/components/ui/tooltip";
import { useTRPC } from "@/lib/trpc/client";
import { buildUniqueUploadIdentity } from "@/lib/uploads/avatar-upload-key";

const AGENT_IMAGE_ACCEPT =
	"image/png,image/jpeg,image/webp,image/avif,image/gif,image/svg+xml";

const imageModeSchema = z.enum(["default", "custom"]);

const imageValueSchema = z
	.union([
		z.string().min(1),
		z
			.object({
				previewUrl: z.string().min(1),
				url: z.string().optional(),
				mimeType: z.string(),
				name: z.string().optional(),
				size: z.number().optional(),
				file: z.instanceof(File).optional(),
			})
			.passthrough(),
	])
	.nullable();

const aiAgentFormSchema = z.object({
	name: z
		.string({ message: "Enter the agent name." })
		.trim()
		.min(1, { message: "Enter the agent name." })
		.max(100, { message: "Name must be 100 characters or fewer." }),
	imageMode: imageModeSchema,
	image: imageValueSchema,
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
	organizationId: string;
	websiteId: string;
	websiteName: string;
	websiteSlug: string;
	initialData: AiAgentResponse | null;
};

function createStoredImageValue(
	imageUrl: string | null | undefined
): AvatarInputValue | null {
	if (!imageUrl) {
		return null;
	}

	return {
		previewUrl: imageUrl,
		url: imageUrl,
		mimeType: "image/jpeg",
	};
}

function normalizeImageUrl(url: string | null | undefined): string | null {
	if (!url) {
		return null;
	}

	try {
		const parsedUrl = new URL(url);
		parsedUrl.search = "";
		return parsedUrl.toString();
	} catch {
		return url;
	}
}

function resolveImageUrl(
	value: AvatarInputValue | string | null | undefined
): string | null {
	if (!value) {
		return null;
	}

	if (typeof value === "string") {
		return value;
	}

	return value.url ?? value.previewUrl ?? null;
}

function buildInitialFormValues(
	initialData: AiAgentResponse | null,
	websiteName: string
): AIAgentFormValues {
	return {
		name: initialData?.name ?? `${websiteName} AI`,
		imageMode: initialData?.image ? "custom" : "default",
		image: createStoredImageValue(initialData?.image ?? null),
		description: initialData?.description ?? "",
		basePrompt: initialData?.basePrompt ?? DEFAULT_AGENT_BASE_PROMPT,
		model: initialData?.model ?? "",
		temperature: initialData?.temperature ?? 0.7,
		maxOutputTokens: initialData?.maxOutputTokens ?? 1024,
	};
}

export function AIAgentForm({
	organizationId,
	websiteId,
	websiteSlug,
	initialData,
	websiteName,
}: AIAgentFormProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [isUploadingImage, setIsUploadingImage] = useState(false);
	const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
	const imageProgressToastAtRef = useRef(0);
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
	const initialFormValues = useMemo(
		() => buildInitialFormValues(initialData, websiteName),
		[initialData, websiteName]
	);

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
		defaultValues: initialFormValues,
	});
	const { mutateAsync: createSignedUrl } = useMutation(
		trpc.upload.createSignedUrl.mutationOptions()
	);
	const imageUploadToastId = useMemo(
		() => `ai-agent-image-upload-${initialData?.id ?? websiteId}`,
		[initialData?.id, websiteId]
	);

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

	const handleImageUpload = useCallback(
		async (file: File): Promise<Partial<AvatarInputValue>> => {
			try {
				toast.loading("Uploading profile picture…", {
					id: imageUploadToastId,
				});
				imageProgressToastAtRef.current = Date.now();
				const uploadIdentity = buildUniqueUploadIdentity(file);

				const uploadDetails = await createSignedUrl({
					contentType: file.type,
					fileName: uploadIdentity.fileName,
					fileExtension: uploadIdentity.fileExtension,
					websiteId,
					path: "ai-agents/avatars",
					scope: {
						type: "user",
						userId: initialData?.id ?? websiteId,
						organizationId,
						websiteId,
					},
					useCdn: true,
				});

				await uploadToPresignedUrl({
					file,
					url: uploadDetails.uploadUrl,
					headers: { "Content-Type": file.type },
					onProgress: (progress) => {
						const now = Date.now();
						if (progress >= 1 || now - imageProgressToastAtRef.current >= 150) {
							imageProgressToastAtRef.current = now;
							const percentage = Math.round(progress * 100);
							toast.loading(`Uploading profile picture… ${percentage}%`, {
								id: imageUploadToastId,
							});
						}
					},
				});

				toast.success("Profile picture uploaded. Click Save to apply.", {
					id: imageUploadToastId,
				});

				return {
					url: uploadDetails.publicUrl,
					mimeType: file.type,
					name: file.name,
					size: file.size,
				};
			} catch (error) {
				const uploadError =
					error instanceof Error
						? error
						: new Error("Failed to upload profile picture. Please try again.");

				toast.error(uploadError.message, {
					id: imageUploadToastId,
				});
				(uploadError as Error & { handledByToast?: boolean }).handledByToast =
					true;
				throw uploadError;
			}
		},
		[
			createSignedUrl,
			imageUploadToastId,
			initialData?.id,
			organizationId,
			websiteId,
		]
	);

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
				form.reset(buildInitialFormValues(updatedAgent, websiteName));
				setIsUploadingImage(false);
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
	const isSubmitting = isPending || isUploadingImage;
	const canUseCustomAvatar =
		planInfo?.plan.features["custom-ai-agent-avatar"] === true;
	const canOpenUpgradeModal =
		!!planInfo && planInfo.plan.name !== "self_hosted";
	const shouldShowCustomAvatarUpgrade = !!planInfo && !canUseCustomAvatar;
	const imageModeValue = form.watch("imageMode");
	const imageValue = form.watch("image");
	const nameValue = form.watch("name");
	const descriptionValue = form.watch("description");
	const basePromptValue = form.watch("basePrompt");
	const modelValue = form.watch("model");
	const temperatureValue = form.watch("temperature");
	const maxOutputTokensValue = form.watch("maxOutputTokens");

	const effectiveImageUrl = useMemo(
		() => (imageModeValue === "custom" ? resolveImageUrl(imageValue) : null),
		[imageModeValue, imageValue]
	);
	const handleImageModeChange = useCallback(
		(value: AIAgentFormValues["imageMode"]) => {
			form.setValue("imageMode", value, {
				shouldDirty: true,
				shouldTouch: true,
				shouldValidate: true,
			});
			void form.trigger();
		},
		[form]
	);
	const handleImageChange = useCallback(
		(value: AvatarInputValue | null) => {
			form.setValue("image", value, {
				shouldDirty: true,
				shouldTouch: true,
				shouldValidate: true,
			});
			void form.trigger();
		},
		[form]
	);

	const onSubmit = async (values: AIAgentFormValues) => {
		let imageUrl: string | null = null;

		if (values.imageMode === "custom") {
			const customImageUrl = resolveImageUrl(values.image);

			if (!customImageUrl) {
				toast.error(
					"Upload a custom profile picture or switch back to the Cossistant logo."
				);
				return;
			}

			if (
				typeof values.image === "object" &&
				values.image &&
				!values.image.url
			) {
				toast.error(
					"Please wait for the profile picture upload to finish before saving."
				);
				return;
			}

			imageUrl = normalizeImageUrl(customImageUrl);
		}

		if (isEditing && initialData) {
			await updateAgent({
				websiteSlug,
				aiAgentId: initialData.id,
				name: values.name,
				image: imageUrl,
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
				image: imageUrl,
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

	const hasChanges = useMemo(() => {
		if (!(isEditing && initialData)) {
			return form.formState.isDirty;
		}

		return (
			nameValue !== initialFormValues.name ||
			descriptionValue !== initialFormValues.description ||
			basePromptValue !== initialFormValues.basePrompt ||
			modelValue !== initialFormValues.model ||
			temperatureValue !== initialFormValues.temperature ||
			maxOutputTokensValue !== initialFormValues.maxOutputTokens ||
			normalizeImageUrl(effectiveImageUrl) !==
				normalizeImageUrl(initialData.image ?? null)
		);
	}, [
		basePromptValue,
		descriptionValue,
		effectiveImageUrl,
		form.formState.isDirty,
		initialData,
		initialFormValues,
		isEditing,
		maxOutputTokensValue,
		modelValue,
		nameValue,
		temperatureValue,
	]);

	return (
		<>
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
											disabled={isSubmitting}
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
							name="imageMode"
							render={({ field }) => (
								<FormItem className="flex flex-col gap-3">
									<FormLabel>Profile Picture</FormLabel>
									<FormControl>
										<RadioGroup
											className="space-y-3"
											disabled={isSubmitting}
											onValueChange={handleImageModeChange}
											value={field.value}
										>
											<div className="flex items-start space-x-3">
												<RadioGroupItem
													className="mt-1"
													id="agent-image-mode-default"
													value="default"
												/>
												<div className="space-y-0.5">
													<Label
														className="cursor-pointer font-normal"
														htmlFor="agent-image-mode-default"
													>
														Use Cossistant logo
													</Label>
													<p className="text-muted-foreground text-sm">
														Show the default Cossistant profile picture.
													</p>
												</div>
											</div>

											<div className="flex items-start space-x-3">
												<RadioGroupItem
													className="mt-1"
													id="agent-image-mode-custom"
													value="custom"
												/>
												<div className="space-y-0.5">
													<Label
														className="cursor-pointer font-normal"
														htmlFor="agent-image-mode-custom"
													>
														Upload custom image
													</Label>
													<p className="text-muted-foreground text-sm">
														Use your own avatar or brand mark for the AI agent.
													</p>
												</div>
											</div>
										</RadioGroup>
									</FormControl>
									<FormDescription>
										Choose which profile picture visitors and teammates will see
										for this AI agent.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						{imageModeValue === "custom" && canUseCustomAvatar && (
							<FormField
								control={form.control}
								name="image"
								render={({ field }) => (
									<FormItem className="flex flex-col gap-2">
										<FormControl>
											<AvatarInput
												accept={AGENT_IMAGE_ACCEPT}
												allowSvgUploads
												disabled={isSubmitting}
												name={field.name}
												onBlur={field.onBlur}
												onChange={handleImageChange}
												onError={(error) => {
													if (
														!(
															error as Error & {
																handledByToast?: boolean;
															}
														)?.handledByToast
													) {
														toast.error(error.message);
													}
													setIsUploadingImage(false);
												}}
												onUpload={handleImageUpload}
												onUploadComplete={() => setIsUploadingImage(false)}
												onUploadStart={() => setIsUploadingImage(true)}
												placeholder="Upload a square image at least 256×256px. SVG uploads are allowed."
												ref={field.ref}
												uploadLabel="Upload image"
												value={field.value}
											/>
										</FormControl>
										<FormDescription>
											We&apos;ll use this image everywhere the AI agent appears
											in the dashboard and support widget.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}

						{shouldShowCustomAvatarUpgrade && (
							<div className="rounded-lg border border-primary/20 border-dashed bg-background-100 p-3">
								<p className="font-medium text-sm">
									Custom AI agent avatars are a Pro feature.
								</p>
								<p className="text-muted-foreground text-xs">
									Upgrade to Pro to upload or change this agent&apos;s profile
									picture. Existing custom avatars will keep appearing until you
									switch back to the default logo.
								</p>
								{canOpenUpgradeModal ? (
									<Button
										className="mt-3"
										disabled={isSubmitting}
										onClick={() => setIsUpgradeModalOpen(true)}
										size="sm"
										type="button"
										variant="outline"
									>
										Upgrade to Pro
									</Button>
								) : null}
							</div>
						)}

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
											disabled={isSubmitting}
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
										disabled={isSubmitting}
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
										disabled={isSubmitting}
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
												disabled={isSubmitting}
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
												disabled={isSubmitting}
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
								disabled={
									isEditing
										? !(hasChanges && form.formState.isValid) || isSubmitting
										: isSubmitting || !form.formState.isValid
								}
								isSubmitting={isSubmitting}
							>
								{isEditing ? "Save changes" : "Create agent"}
							</BaseSubmitButton>
						</div>
					</SettingsRowFooter>
				</form>
			</Form>

			{canOpenUpgradeModal && planInfo ? (
				<UpgradeModal
					currentPlan={planInfo.plan}
					highlightedFeatureKey="custom-ai-agent-avatar"
					initialPlanName="pro"
					onOpenChange={setIsUpgradeModalOpen}
					open={isUpgradeModalOpen}
					websiteSlug={websiteSlug}
				/>
			) : null}
		</>
	);
}
