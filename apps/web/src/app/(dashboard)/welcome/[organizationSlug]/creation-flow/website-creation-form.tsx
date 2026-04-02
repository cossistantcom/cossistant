"use client";

import {
	type CreateWebsiteRequest,
	createWebsiteRequestSchema,
	WebsiteInstallationTarget,
} from "@plasma/types";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { FrameworkPicker } from "@/components/framework-picker";
import { BaseSubmitButton } from "@/components/ui/base-submit-button";
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
import { Spinner } from "@/components/ui/spinner";
import { useTRPC } from "@/lib/trpc/client";
import { isValidDomain } from "@/lib/utils";

const PROTOCOL_REGEX = /^https?:\/\//;

type WebsiteCreationFormProps = {
	organizationId: string;
	onSubmit?: (data: CreateWebsiteRequest) => void;
	isSubmitting?: boolean;
};

export default function WebsiteCreationForm({
	organizationId,
	onSubmit,
	isSubmitting = false,
}: WebsiteCreationFormProps) {
	const trpc = useTRPC();
	const form = useForm<CreateWebsiteRequest>({
		resolver: standardSchemaResolver(createWebsiteRequestSchema),
		defaultValues: {
			name: "",
			domain: "",
			organizationId,
			installationTarget: WebsiteInstallationTarget.NEXTJS,
		},
	});

	const domainValue = form.watch("domain");

	const shouldCheckDomain =
		!!domainValue &&
		form.formState.isDirty &&
		isValidDomain(domainValue) &&
		!isSubmitting;

	const { data: isDomainTaken, isFetching: isCheckingDomain } = useQuery({
		...trpc.website.checkDomain.queryOptions({
			domain: domainValue,
		}),
		enabled: !!shouldCheckDomain,
	});

	const handleSubmit = (data: CreateWebsiteRequest) => {
		if (isDomainTaken) {
			return;
		}

		onSubmit?.(data);
	};

	return (
		<div className="mt-4 w-full">
			<div className="mb-6">
				<p className="text-muted-foreground">
					Provide your website details and select your framework. In step 2,
					you'll get a one-click AI setup prompt by default, with manual
					integration steps available anytime.
				</p>
			</div>

			<Form {...form}>
				<form
					className="w-full space-y-6"
					onSubmit={form.handleSubmit(handleSubmit)}
				>
					<FormField
						control={form.control}
						name="name"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Website Name</FormLabel>
								<FormControl>
									<Input
										placeholder="Eg. Dub, Midday"
										{...field}
										disabled={isSubmitting}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="domain"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Domain</FormLabel>
								<FormControl>
									<div className="relative">
										<Input
											placeholder="Eg. polar.sh"
											{...field}
											append={
												field.value &&
												shouldCheckDomain && (
													<div className="flex items-center gap-2">
														{isCheckingDomain && <Spinner />}
														{!isCheckingDomain && isDomainTaken && (
															<Icon name="x" />
														)}
														{!(isCheckingDomain || isDomainTaken) &&
															field.value && <Icon name="check" />}
													</div>
												)
											}
											disabled={isSubmitting}
											onBlur={(e) => {
												// Remove protocol if present
												const value = e.target.value;
												const domainWithoutProtocol = value.replace(
													PROTOCOL_REGEX,
													""
												);

												field.onChange(domainWithoutProtocol);

												// Trigger validation
												form.trigger("domain");
											}}
										/>
									</div>
								</FormControl>
								<FormDescription>
									The domain your users will be chatting with you and your AI
									agents.
									{isDomainTaken && (
										<p className="mt-1 text-destructive">
											This domain is already in use. Please choose another one.
										</p>
									)}
								</FormDescription>
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="installationTarget"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Framework</FormLabel>
								<FormControl>
									<FrameworkPicker
										onValueChange={field.onChange}
										value={field.value}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<BaseSubmitButton
						className="w-full"
						disabled={
							isSubmitting ||
							isDomainTaken ||
							!form.formState.isValid ||
							!isValidDomain(domainValue)
						}
						isSubmitting={isSubmitting}
						type="submit"
					>
						Start your integration
					</BaseSubmitButton>
				</form>
			</Form>
		</div>
	);
}
