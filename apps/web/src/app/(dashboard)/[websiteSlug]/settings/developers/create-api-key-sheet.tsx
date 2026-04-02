"use client";

import type { RouterOutputs } from "@plasma/api/types";
import { APIKeyType } from "@plasma/types";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { copyToClipboardWithMeta } from "@/components/copy-button";
import { DashboardCodeBlock } from "@/components/dashboard-code-block";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { Step, Steps } from "@/components/ui/steps";
import { Switch } from "@/components/ui/switch";
import { useWebsite } from "@/contexts/website";
import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

type WebsiteApiKey =
	RouterOutputs["website"]["developerSettings"]["apiKeys"][number];

type CreateApiKeySheetProps = {
	organizationId: string;
};

const KEY_TYPE_VALUES = [APIKeyType.PUBLIC, APIKeyType.PRIVATE] as const;
const ENVIRONMENT_VALUES = ["production", "test"] as const;

type EnvironmentValue = (typeof ENVIRONMENT_VALUES)[number];

type CreateApiKeyFormValues = {
	name: string;
	keyType: (typeof KEY_TYPE_VALUES)[number];
	environment: EnvironmentValue;
};

const createApiKeyFormSchema = z.object({
	name: z
		.string({ message: "Provide a name for this key." })
		.min(3, { message: "Names must be at least 3 characters." })
		.max(80, { message: "Names must be fewer than 80 characters." }),
	keyType: z.enum(KEY_TYPE_VALUES),
	environment: z.enum(ENVIRONMENT_VALUES),
});

const KEY_TYPE_OPTIONS: Array<{
	value: CreateApiKeyFormValues["keyType"];
	title: string;
	description: string;
}> = [
	{
		value: APIKeyType.PUBLIC,
		title: "Public key",
		description:
			"Use in client-side integrations. Requests are restricted to allowed domains.",
	},
	{
		value: APIKeyType.PRIVATE,
		title: "Private key",
		description:
			"Use for server-to-server communication. The full key is only shown once.",
	},
];

const ENVIRONMENT_OPTIONS: Array<{
	value: EnvironmentValue;
	title: string;
	description: string;
}> = [
	{
		value: "production",
		title: "Production",
		description: "Works on every domain in the allowlist configured below.",
	},
	{
		value: "test",
		title: "Test",
		description: "Only works on localhost. Ideal for local development.",
	},
];

export function CreateApiKeySheet({ organizationId }: CreateApiKeySheetProps) {
	const website = useWebsite();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [isOpen, setIsOpen] = useState(false);
	const [lastCreatedKey, setLastCreatedKey] = useState<WebsiteApiKey | null>(
		null
	);

	const form = useForm<CreateApiKeyFormValues>({
		resolver: standardSchemaResolver(createApiKeyFormSchema),
		defaultValues: {
			name: "",
			keyType: APIKeyType.PUBLIC,
			environment: "production",
		},
	});

	const invalidateDeveloperSettings = () =>
		queryClient.invalidateQueries({
			queryKey: trpc.website.developerSettings.queryKey({ slug: website.slug }),
		});

	const { mutateAsync: createApiKey, isPending: isCreating } = useMutation(
		trpc.website.createApiKey.mutationOptions({
			onSuccess: async (createdKey) => {
				await invalidateDeveloperSettings();
				setLastCreatedKey(createdKey);
				toast.success("API key created successfully.");
			},
			onError: () => {
				toast.error("Failed to create API key. Please try again.");
			},
		})
	);

	const handleCreateApiKey = async (values: CreateApiKeyFormValues) => {
		await createApiKey({
			organizationId,
			websiteId: website.id,
			name: values.name.trim(),
			keyType: values.keyType,
			isTest: values.environment === "test",
		});

		form.reset({
			name: "",
			keyType: values.keyType,
			environment: values.environment,
		});
	};

	const handleCopyCreatedKey = async (keyValue: string) => {
		try {
			await copyToClipboardWithMeta(keyValue);
			toast.success(
				`${lastCreatedKey?.keyType === APIKeyType.PRIVATE ? "Private" : "Public"} key copied to clipboard`
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to copy API key."
			);
		}
	};

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			setLastCreatedKey(null);
		}
		setIsOpen(open);
	};

	const keyCreated = Boolean(lastCreatedKey?.key);

	return (
		<Sheet onOpenChange={handleOpenChange} open={isOpen}>
			<SheetTrigger asChild>
				<Button size="sm" type="button" variant="default">
					New API key
				</Button>
			</SheetTrigger>
			<SheetContent className="w-full sm:max-w-xl">
				<SheetHeader>
					<SheetTitle>Create a new API key</SheetTitle>
					<SheetDescription>
						Choose the key type and environment that matches your integration.
					</SheetDescription>
				</SheetHeader>

				<div className="space-y-6 p-4">
					<Steps>
						<Step completed={keyCreated}>
							Create the key
							{!keyCreated && (
								<Form {...form}>
									<form
										className="space-y-10"
										onSubmit={form.handleSubmit(handleCreateApiKey)}
									>
										<FormField
											control={form.control}
											name="keyType"
											render={({ field }) => (
												<FormItem>
													<FormControl>
														<RadioGroup
															className="flex gap-3"
															onValueChange={field.onChange}
															value={field.value}
														>
															{KEY_TYPE_OPTIONS.map((option) => (
																<Label
																	className={cn(
																		"flex w-full cursor-pointer flex-col items-start gap-3 rounded-md border bg-background p-3 text-sm",
																		field.value === option.value
																			? "border-primary/30 bg-background-200"
																			: ""
																	)}
																	htmlFor={`key-type-${option.value}`}
																	key={option.value}
																>
																	<RadioGroupItem
																		className="sr-only"
																		id={`key-type-${option.value}`}
																		value={option.value}
																	/>
																	<span className="font-medium">
																		{option.title}
																	</span>
																	<span className="text-muted-foreground text-xs">
																		{option.description}
																	</span>
																</Label>
															))}
														</RadioGroup>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>

										<FormField
											control={form.control}
											name="name"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Key name</FormLabel>
													<FormControl>
														<Input
															autoComplete="off"
															autoFocus
															data-1p-ignore
															data-lpignore="true"
															placeholder={`Eg. Production ${website.name}`}
															{...field}
														/>
													</FormControl>
													<FormDescription>
														The label shown in your dashboard to help identify
														this key.
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>

										<FormField
											control={form.control}
											name="environment"
											render={({ field }) => (
												<FormItem>
													<FormControl>
														<div className="flex items-center justify-between rounded-md border bg-background-100 p-3">
															<div className="flex flex-col gap-1">
																<span className="font-medium text-sm">
																	{field.value === "production"
																		? "Production"
																		: "Test"}
																</span>
																<span className="text-muted-foreground text-xs">
																	{field.value === "production"
																		? "Works on every secured domain in the allowlist configured below."
																		: "Only works on localhost. Ideal for local development."}
																</span>
															</div>
															<Switch
																checked={field.value === "production"}
																onCheckedChange={(checked) => {
																	field.onChange(
																		checked ? "production" : "test"
																	);
																}}
															/>
														</div>
													</FormControl>
													<FormDescription>
														Switch between production and test environments.
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>

										<BaseSubmitButton isSubmitting={isCreating} type="submit">
											Generate API key
										</BaseSubmitButton>
									</form>
								</Form>
							)}
						</Step>
						<Step enabled={keyCreated}>
							Use the key
							{keyCreated && lastCreatedKey && (
								<div className="flex flex-col gap-2">
									<p className="text-muted-foreground text-sm">
										Please add this to your environment variables and keep it
										secure.
									</p>
									<DashboardCodeBlock
										className="mt-4"
										code={
											lastCreatedKey.keyType === APIKeyType.PUBLIC
												? {
														nextjs: {
															code: `NEXT_PUBLIC_COSSISTANT_API_KEY=${lastCreatedKey.key}`,
															comment:
																"This is the public key for your website.",
														},
														react: {
															code: `COSSISTANT_API_KEY=${lastCreatedKey.key}`,
															comment:
																"This is the public key for your website.",
														},
													}
												: {
														nextjs: {
															code: `COSSISTANT_PRIVATE_KEY=${lastCreatedKey.key}`,
															comment:
																"This is the private key to use in server-to-server communication, never expose it to the client side.",
														},
														react: {
															code: `COSSISTANT_PRIVATE_KEY=${lastCreatedKey.key}`,
															comment:
																"Please note: NEVER expose this key to the client side, this is a private key to access the API.",
															commentClassName: "text-destructive",
														},
													}
										}
										fileName=".env"
										language="ansi"
									/>
									<div className="mt-6 flex gap-2">
										<Button
											onClick={() =>
												handleCopyCreatedKey(lastCreatedKey.key ?? "")
											}
										>
											Copy{" "}
											{lastCreatedKey.keyType === APIKeyType.PRIVATE
												? "private"
												: "public"}{" "}
											key
										</Button>
										<Button
											onClick={() => handleOpenChange(false)}
											variant="outline"
										>
											Close
										</Button>
									</div>
									{lastCreatedKey.keyType === APIKeyType.PRIVATE && (
										<Alert className="mt-14" variant="info">
											<AlertTitle>
												[Psss, don't forget to copy your key now]
											</AlertTitle>
											<AlertDescription className="space-y-3">
												<p>
													This key will not be shown again. Keep it secure and
													store it in your secret manager before closing this
													sheet. If you lose it, you'll need to create a new
													key.
												</p>
											</AlertDescription>
										</Alert>
									)}
								</div>
							)}
						</Step>
					</Steps>
				</div>
			</SheetContent>
		</Sheet>
	);
}
