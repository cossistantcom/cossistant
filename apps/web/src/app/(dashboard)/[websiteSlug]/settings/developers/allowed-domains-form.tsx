"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { BaseSubmitButton } from "@/components/ui/base-submit-button";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import Icon from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { SettingsRowFooter } from "@/components/ui/layout/settings-layout";
import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

type AllowedDomainsFormProps = {
	initialDomains: string[];
	organizationId: string;
	websiteId: string;
	websiteSlug: string;
};

const allowedProtocols = new Set(["http:", "https:"]);
const protocolPattern = /^[a-z][a-z\d+\-.]*:\/\//i;

export const normalizeDomainOrigin = (value: string) => {
	const trimmedValue = value.trim();
	let parsed: URL;

	try {
		parsed = new URL(
			protocolPattern.test(trimmedValue)
				? trimmedValue
				: `https://${trimmedValue}`
		);
	} catch {
		throw new Error("Invalid domain.");
	}

	if (!allowedProtocols.has(parsed.protocol)) {
		throw new Error("Only http:// or https:// URLs are allowed.");
	}

	return parsed.origin;
};

const allowedDomainsSchema = z.object({
	domains: z
		.array(
			z
				.string({ message: "Enter a domain." })
				.trim()
				.min(1, { message: "Domains cannot be empty." })
				.superRefine((value, ctx) => {
					try {
						normalizeDomainOrigin(value);
					} catch (error) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message:
								error instanceof Error
									? error.message
									: "Enter a valid URL including http:// or https://.",
						});
					}
				})
		)
		.min(1, { message: "Add at least one domain." }),
});

type AllowedDomainsFormValues = z.infer<typeof allowedDomainsSchema>;

type DomainsInputProps = {
	form: UseFormReturn<AllowedDomainsFormValues>;
	isSubmitting: boolean;
};

function DomainsInput({ form, isSubmitting }: DomainsInputProps) {
	const { fields, append, remove } = useFieldArray({
		control: form.control,
		// @ts-expect-error - TypeScript inference issue with useFieldArray
		name: "domains",
	});

	return (
		<div className="space-y-2 px-1.5 py-4">
			{fields.map((fieldItem, index) => (
				<FormField
					control={form.control}
					key={fieldItem.id}
					name={`domains.${index}` as const}
					render={({ field }) => (
						<FormItem className="flex flex-row items-center">
							<FormLabel className="flex items-center justify-between">
								<span />
							</FormLabel>
							<FormControl className="flex items-center">
								<Input
									placeholder="example.com"
									{...field}
									append={
										field.value.includes("http://") && (
											<Badge className="text-xs" variant="outline">
												Test
											</Badge>
										)
									}
									className={cn({ "pr-12": fields.length > 1 })}
									containerClassName="max-w-[400px]"
									onBlur={(event) => {
										field.onChange(event.target.value.trim());
									}}
								/>
							</FormControl>
							{fields.length > 1 ? (
								<Button
									disabled={isSubmitting}
									onClick={() => remove(index)}
									size="icon-small"
									type="button"
									variant="ghost"
								>
									<Icon className="size-4" name="x" />
									<span className="sr-only">Remove</span>
								</Button>
							) : null}
							<FormMessage />
						</FormItem>
					)}
				/>
			))}
			<Button
				className="ml-2"
				disabled={isSubmitting}
				onClick={() => append("")}
				size="sm"
				type="button"
				variant="outline"
			>
				<Icon className="size-3" name="plus" />
				<span>Add domain</span>
			</Button>
		</div>
	);
}

export function AllowedDomainsForm({
	initialDomains,
	organizationId,
	websiteId,
	websiteSlug,
}: AllowedDomainsFormProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const normalizedInitialDomains = useMemo(
		() =>
			initialDomains.map((domain) => {
				try {
					return normalizeDomainOrigin(domain);
				} catch {
					return domain;
				}
			}),
		[initialDomains]
	);
	const form = useForm<AllowedDomainsFormValues>({
		resolver: standardSchemaResolver(allowedDomainsSchema),
		mode: "onChange",
		defaultValues: {
			domains: normalizedInitialDomains.length
				? normalizedInitialDomains
				: [""],
		},
	});
	const { reset } = form;

	useEffect(() => {
		reset({
			domains: normalizedInitialDomains.length
				? normalizedInitialDomains
				: [""],
		});
	}, [reset, normalizedInitialDomains]);

	const invalidateDeveloperSettings = async () =>
		await queryClient.invalidateQueries({
			queryKey: trpc.website.developerSettings.queryKey({ slug: websiteSlug }),
		});

	const { mutateAsync: updateWebsite, isPending: isUpdatingWebsite } =
		useMutation(
			trpc.website.update.mutationOptions({
				onSuccess: async () => {
					await invalidateDeveloperSettings();
					toast.success("Allowed domains updated.");
				},
				onError: () => {
					toast.error("Failed to update allowed domains. Please try again.");
				},
			})
		);

	const isSubmitting = isUpdatingWebsite;

	const handleSubmit = async (values: AllowedDomainsFormValues) => {
		const sanitized = values.domains
			.map((domain) => domain.trim())
			.filter(Boolean);

		let normalizedOrigins: string[];

		try {
			normalizedOrigins = sanitized.map((domain) =>
				normalizeDomainOrigin(domain)
			);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "One or more domains are invalid."
			);
			return;
		}

		const uniqueDomains = Array.from(new Set(normalizedOrigins));
		await updateWebsite({
			organizationId,
			websiteId,
			data: { whitelistedDomains: uniqueDomains },
		});

		reset({ domains: uniqueDomains });
	};

	return (
		<Form {...form}>
			<form className="space-y-6" onSubmit={form.handleSubmit(handleSubmit)}>
				<DomainsInput form={form} isSubmitting={isSubmitting} />
				<SettingsRowFooter>
					<BaseSubmitButton
						disabled={!form.formState.isDirty}
						isSubmitting={isSubmitting}
						size="sm"
						type="submit"
						variant="default"
					>
						Save allowed domains
					</BaseSubmitButton>
				</SettingsRowFooter>
			</form>
		</Form>
	);
}
