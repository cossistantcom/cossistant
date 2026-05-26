"use client";

import type { RouterOutputs } from "@api/trpc/types";
import type { GetBehaviorSettingsResponse } from "@cossistant/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { BaseSubmitButton } from "@/components/ui/base-submit-button";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
} from "@/components/ui/form";
import { SettingsRowFooter } from "@/components/ui/layout/settings-layout";
import { Switch } from "@/components/ui/switch";
import { useTRPC } from "@/lib/trpc/client";

type AiThinkingFormData = {
	aiThinkingEnabled: boolean;
};

type AiThinkingFormProps = {
	websiteSlug: string;
	aiAgentId: string;
	modelId: string;
	initialData: GetBehaviorSettingsResponse;
	planInfo: RouterOutputs["plan"]["getPlanInfo"] | undefined;
};

function formatCreditLabel(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function AiThinkingForm({
	websiteSlug,
	aiAgentId,
	modelId,
	initialData,
	planInfo,
}: AiThinkingFormProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const selectedModel = planInfo?.aiModels.items.find(
		(model) => model.id === modelId
	);
	const selectedModelLabel = selectedModel?.label ?? modelId;
	const modelIsLocked = selectedModel
		? !selectedModel.selectableForCurrentPlan
		: false;
	const thinkingSupported =
		selectedModel?.thinkingSupported === true && !modelIsLocked;
	const disabled = !selectedModel || modelIsLocked || !thinkingSupported;
	const helperText = (() => {
		if (!selectedModel) {
			return "AI Thinking availability is loading for this model.";
		}

		if (modelIsLocked) {
			return "AI Thinking is unavailable until this model is available on your plan.";
		}

		if (!selectedModel.thinkingSupported) {
			return "AI Thinking is not available for this model.";
		}

		return `Adds ${formatCreditLabel(
			selectedModel.thinkingSurchargeCredits
		)} credits per primary AI answer on ${selectedModelLabel}.`;
	})();

	const form = useForm<AiThinkingFormData>({
		defaultValues: {
			aiThinkingEnabled: initialData.aiThinkingEnabled,
		},
	});

	useEffect(() => {
		form.reset({
			aiThinkingEnabled: initialData.aiThinkingEnabled,
		});
	}, [initialData, form]);

	const { mutate: updateSettings, isPending } = useMutation(
		trpc.aiAgent.updateBehaviorSettings.mutationOptions({
			onSuccess: () => {
				toast.success("AI Thinking settings saved");
				void queryClient.invalidateQueries({
					queryKey: trpc.aiAgent.getBehaviorSettings.queryKey({
						websiteSlug,
					}),
				});
				form.reset(form.getValues());
			},
			onError: (error) => {
				toast.error(error.message || "Failed to save AI Thinking settings");
			},
		})
	);

	const onSubmit = (data: AiThinkingFormData) => {
		updateSettings({
			websiteSlug,
			aiAgentId,
			settings: {
				aiThinkingEnabled: data.aiThinkingEnabled,
			},
		});
	};

	return (
		<Form {...form}>
			<form className="flex flex-col" onSubmit={form.handleSubmit(onSubmit)}>
				<div className="space-y-4 px-4 py-6">
					<FormField
						control={form.control}
						name="aiThinkingEnabled"
						render={({ field }) => (
							<FormItem className="flex items-start justify-between gap-4 rounded-md border border-border/60 bg-background/40 p-3">
								<div className="space-y-1">
									<FormLabel>AI Thinking</FormLabel>
									<FormDescription>{helperText}</FormDescription>
									{initialData.aiThinkingEnabled && disabled ? (
										<p className="text-muted-foreground text-xs">
											Your saved preference will become active again when you
											select a supported model.
										</p>
									) : null}
								</div>
								<FormControl>
									<Switch
										checked={disabled ? false : field.value}
										disabled={disabled || isPending}
										onCheckedChange={field.onChange}
									/>
								</FormControl>
							</FormItem>
						)}
					/>
				</div>
				<SettingsRowFooter className="flex items-center justify-end">
					<BaseSubmitButton
						disabled={disabled || !form.formState.isDirty}
						isSubmitting={isPending}
						size="sm"
					>
						Save settings
					</BaseSubmitButton>
				</SettingsRowFooter>
			</form>
		</Form>
	);
}
