"use client";

import type { GetBehaviorSettingsResponse } from "@plasma/types";
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
import { Input } from "@/components/ui/input";
import { SettingsRowFooter } from "@/components/ui/layout/settings-layout";
import { useTRPC } from "@/lib/trpc/client";

const MIN_TOOL_INVOCATIONS = 10;
const MAX_TOOL_INVOCATIONS = 50;

type ToolInvocationBudgetFormData = {
	maxToolInvocationsPerRun: number;
};

type ToolInvocationBudgetFormProps = {
	websiteSlug: string;
	aiAgentId: string;
	initialData: GetBehaviorSettingsResponse;
};

function clampToolBudget(value: number): number {
	if (!Number.isFinite(value)) {
		return MIN_TOOL_INVOCATIONS;
	}

	return Math.min(
		MAX_TOOL_INVOCATIONS,
		Math.max(MIN_TOOL_INVOCATIONS, Math.floor(value))
	);
}

export function ToolInvocationBudgetForm({
	websiteSlug,
	aiAgentId,
	initialData,
}: ToolInvocationBudgetFormProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const form = useForm<ToolInvocationBudgetFormData>({
		defaultValues: {
			maxToolInvocationsPerRun: clampToolBudget(
				initialData.maxToolInvocationsPerRun
			),
		},
	});

	useEffect(() => {
		form.reset({
			maxToolInvocationsPerRun: clampToolBudget(
				initialData.maxToolInvocationsPerRun
			),
		});
	}, [initialData, form]);

	const { mutate: updateSettings, isPending } = useMutation(
		trpc.aiAgent.updateBehaviorSettings.mutationOptions({
			onSuccess: () => {
				toast.success("Tool invocation budget saved");
				void queryClient.invalidateQueries({
					queryKey: trpc.aiAgent.getBehaviorSettings.queryKey({
						websiteSlug,
					}),
				});
				form.reset(form.getValues());
			},
			onError: (error) => {
				toast.error(error.message || "Failed to save tool budget");
			},
		})
	);

	const onSubmit = (data: ToolInvocationBudgetFormData) => {
		updateSettings({
			websiteSlug,
			aiAgentId,
			settings: {
				maxToolInvocationsPerRun: clampToolBudget(
					data.maxToolInvocationsPerRun
				),
			},
		});
	};

	return (
		<Form {...form}>
			<form className="flex flex-col" onSubmit={form.handleSubmit(onSubmit)}>
				<div className="space-y-4 px-4 py-6">
					<FormField
						control={form.control}
						name="maxToolInvocationsPerRun"
						render={({ field }) => (
							<FormItem className="space-y-2">
								<FormLabel>Max Tool Invocations Per Run</FormLabel>
								<FormControl>
									<Input
										inputMode="numeric"
										max={MAX_TOOL_INVOCATIONS}
										min={MIN_TOOL_INVOCATIONS}
										onBlur={() => field.onChange(clampToolBudget(field.value))}
										onChange={(event) => {
											const parsedValue = Number.parseInt(
												event.target.value,
												10
											);
											field.onChange(
												Number.isNaN(parsedValue)
													? MIN_TOOL_INVOCATIONS
													: parsedValue
											);
										}}
										step={1}
										type="number"
										value={field.value}
									/>
								</FormControl>
								<FormDescription>
									Set your per-run non-finish tool budget (10-50). Higher limits
									allow longer multi-tool reasoning and can increase billed tool
									invocations.
								</FormDescription>
							</FormItem>
						)}
					/>
				</div>
				<SettingsRowFooter className="flex items-center justify-end">
					<BaseSubmitButton
						disabled={!form.formState.isDirty}
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
