"use client";

import type { RouterOutputs } from "@api/trpc/types";
import {
	OPEN_SOURCE_PROGRAM_QUALIFICATION_REASONS,
	type OpenSourceProgramQualificationReason,
	type SubmitOpenSourceProgramApplicationRequest,
	submitOpenSourceProgramApplicationRequestSchema,
} from "@plasma/types";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { type UseFormReturn, useForm } from "react-hook-form";
import { BaseSubmitButton } from "@/components/ui/base-submit-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/auth/client";
import { useTRPC } from "@/lib/trpc/client";

type OrganizationList = RouterOutputs["user"]["getOrganizations"];

type QualificationOption = {
	label: string;
	description: string;
	proofLabel?: string;
	proofPlaceholder?: string;
};

const QUALIFICATION_OPTIONS: Record<
	OpenSourceProgramQualificationReason,
	QualificationOption
> = {
	"github-stars": {
		label: "100+ GitHub stars",
		description:
			"Use this when the repo already has at least 100 GitHub stars.",
	},
	"real-users": {
		label: "Real users or traffic",
		description: "Use this when the project already has real usage or traffic.",
		proofLabel: "Proof of users or traffic",
		proofPlaceholder: "A short summary of users, traffic, or adoption.",
	},
	"saas-product": {
		label: "Legit SaaS product built on top",
		description: "Use this when the repo powers a real SaaS product.",
		proofLabel: "Proof of SaaS product",
		proofPlaceholder:
			"A short summary of the product built on top of the repo.",
	},
};

const CALLBACK_PATH = "/open-source-program/apply";
const LOGIN_HREF = `/login?callback=${encodeURIComponent(CALLBACK_PATH)}`;
const SIGN_UP_HREF = `/sign-up?callback=${encodeURIComponent(CALLBACK_PATH)}`;

const DEFAULT_FORM_VALUES: Omit<
	SubmitOpenSourceProgramApplicationRequest,
	"websiteId"
> = {
	repositoryUrl: "",
	qualificationReasons: [],
	githubStars: undefined,
	realUsersOrTrafficProof: "",
	saasProductProof: "",
	isMonetized: false,
	monthlyRecurringRevenueUsd: undefined,
	notes: "",
	acknowledgePublicRepo: false,
	acknowledgeRecentCommits: false,
	acknowledgeWidgetMention: false,
	acknowledgeReadmeBadge: false,
};

export type OpenSourceProgramWebsiteOption = {
	id: string;
	name: string;
	domain: string;
	logoUrl: string | null;
	organizationName: string;
};

export type OpenSourceProgramApplicationCardState =
	| "loading"
	| "success"
	| "logged-out"
	| "no-websites"
	| "form";

export function flattenWebsiteOptions(
	organizations: OrganizationList | null | undefined
): OpenSourceProgramWebsiteOption[] {
	return (organizations ?? []).flatMap((organization) =>
		organization.websites.map((website) => ({
			id: website.id,
			name: website.name,
			domain: website.domain,
			logoUrl: website.logoUrl ?? null,
			organizationName: organization.organization.name,
		}))
	);
}

export function getDefaultWebsiteId(
	websites: OpenSourceProgramWebsiteOption[]
) {
	return websites.length === 1 ? (websites[0]?.id ?? "") : "";
}

export function getOpenSourceProgramApplicationCardState(params: {
	isSessionPending: boolean;
	hasUser: boolean;
	isOrganizationsLoading: boolean;
	websiteCount: number;
	submissionMessage: string | null;
}): OpenSourceProgramApplicationCardState {
	if (
		params.isSessionPending ||
		(params.hasUser && params.isOrganizationsLoading)
	) {
		return "loading";
	}

	if (params.submissionMessage) {
		return "success";
	}

	if (!params.hasUser) {
		return "logged-out";
	}

	if (params.websiteCount === 0) {
		return "no-websites";
	}

	return "form";
}

function clearQualificationFields(
	form: UseFormReturn<SubmitOpenSourceProgramApplicationRequest>,
	selectedReason: OpenSourceProgramQualificationReason
) {
	if (selectedReason !== "github-stars") {
		form.setValue("githubStars", undefined, {
			shouldDirty: true,
			shouldValidate: true,
		});
	}

	if (selectedReason !== "real-users") {
		form.setValue("realUsersOrTrafficProof", "", {
			shouldDirty: true,
			shouldValidate: true,
		});
	}

	if (selectedReason !== "saas-product") {
		form.setValue("saasProductProof", "", {
			shouldDirty: true,
			shouldValidate: true,
		});
	}
}

export function OpenSourceProgramApplicationCard() {
	const trpc = useTRPC();
	const { data: session, isPending: isSessionPending } =
		authClient.useSession();
	const [submissionMessage, setSubmissionMessage] = useState<string | null>(
		null
	);
	const [submitError, setSubmitError] = useState<string | null>(null);

	const { data: organizations, isLoading: isOrganizationsLoading } = useQuery({
		...trpc.user.getOrganizations.queryOptions(),
		enabled: Boolean(session?.user),
	});

	const websites = useMemo(
		() => flattenWebsiteOptions(organizations),
		[organizations]
	);
	const defaultWebsiteId = useMemo(
		() => getDefaultWebsiteId(websites),
		[websites]
	);

	const form = useForm<SubmitOpenSourceProgramApplicationRequest>({
		resolver: standardSchemaResolver(
			submitOpenSourceProgramApplicationRequestSchema
		),
		defaultValues: {
			websiteId: defaultWebsiteId,
			...DEFAULT_FORM_VALUES,
		},
	});

	useEffect(() => {
		if (defaultWebsiteId && !form.getValues("websiteId")) {
			form.setValue("websiteId", defaultWebsiteId, {
				shouldDirty: false,
				shouldTouch: true,
				shouldValidate: true,
			});
		}
	}, [defaultWebsiteId, form]);

	const qualificationReasons = form.watch("qualificationReasons");
	const selectedQualificationReason = qualificationReasons[0];
	const isMonetized = form.watch("isMonetized");

	const cardState = getOpenSourceProgramApplicationCardState({
		isSessionPending,
		hasUser: Boolean(session?.user),
		isOrganizationsLoading,
		websiteCount: websites.length,
		submissionMessage,
	});

	const { mutate: submitApplication, isPending: isSubmitting } = useMutation(
		trpc.openSourceProgram.submitApplication.mutationOptions({
			onSuccess: (result) => {
				setSubmitError(null);
				setSubmissionMessage(result.message);
			},
			onError: (error) => {
				setSubmitError(error.message || "Failed to submit application.");
			},
		})
	);

	if (cardState === "loading") {
		return (
			<div className="flex items-center gap-3 text-muted-foreground text-sm">
				<Spinner />
				<p>Loading your websites.</p>
			</div>
		);
	}

	if (cardState === "success") {
		return (
			<div className="flex flex-col gap-2">
				<h3 className="font-medium text-xl">Application received</h3>
				<p className="max-w-2xl text-muted-foreground leading-7">
					{submissionMessage}
				</p>
			</div>
		);
	}

	if (cardState === "logged-out") {
		return (
			<div className="flex max-w-2xl flex-col gap-4">
				<p className="text-muted-foreground leading-7">
					You need to be logged in with a website already created in Cossistant
					to apply to the OSS program.
				</p>
				<div className="flex flex-col gap-3 sm:flex-row">
					<Button asChild className="h-11 px-5">
						<Link href={LOGIN_HREF}>Log in</Link>
					</Button>
					<Button asChild className="h-11 px-5" variant="outline">
						<Link href={SIGN_UP_HREF}>Create account</Link>
					</Button>
				</div>
			</div>
		);
	}

	if (cardState === "no-websites") {
		return (
			<div className="flex max-w-2xl flex-col gap-4">
				<p className="text-muted-foreground leading-7">
					You are logged in, but you still need to create a website before you
					can send an OSS request.
				</p>
				<div>
					<Button asChild className="h-11 px-5">
						<Link href="/select">Create a website</Link>
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="max-w-2xl">
			<Form {...form}>
				<form
					className="flex flex-col gap-5"
					onSubmit={form.handleSubmit((values) => {
						setSubmitError(null);
						submitApplication(values);
					})}
				>
					<FormField
						control={form.control}
						name="websiteId"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Website</FormLabel>
								<Select
									disabled={isSubmitting}
									onValueChange={field.onChange}
									value={field.value || undefined}
								>
									<FormControl>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Select a website" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{websites.map((website) => (
											<SelectItem key={website.id} value={website.id}>
												{website.name} ({website.domain})
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<FormDescription>
									Choose the website this request should be attached to.
								</FormDescription>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="repositoryUrl"
						render={({ field }) => (
							<FormItem>
								<FormLabel>GitHub repository</FormLabel>
								<FormControl>
									<Input
										{...field}
										autoComplete="url"
										disabled={isSubmitting}
										placeholder="https://github.com/owner/repo"
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="qualificationReasons"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Why does this project qualify?</FormLabel>
								<Select
									disabled={isSubmitting}
									onValueChange={(value) => {
										const reason =
											value as OpenSourceProgramQualificationReason;
										field.onChange([reason]);
										clearQualificationFields(form, reason);
									}}
									value={field.value[0] || undefined}
								>
									<FormControl>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Select one reason" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{OPEN_SOURCE_PROGRAM_QUALIFICATION_REASONS.map((reason) => (
											<SelectItem key={reason} value={reason}>
												{QUALIFICATION_OPTIONS[reason].label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<FormDescription>
									{selectedQualificationReason
										? QUALIFICATION_OPTIONS[selectedQualificationReason]
												.description
										: "Pick the clearest signal that this project is real and active."}
								</FormDescription>
								<FormMessage />
							</FormItem>
						)}
					/>

					{selectedQualificationReason === "github-stars" ? (
						<FormField
							control={form.control}
							name="githubStars"
							render={({ field }) => (
								<FormItem>
									<FormLabel>GitHub stars</FormLabel>
									<FormControl>
										<Input
											disabled={isSubmitting}
											min={100}
											onChange={(event) => {
												const value = event.target.value;
												field.onChange(value ? Number(value) : undefined);
											}}
											placeholder="100"
											type="number"
											value={field.value ?? ""}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					) : null}

					{selectedQualificationReason === "real-users" ? (
						<FormField
							control={form.control}
							name="realUsersOrTrafficProof"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										{QUALIFICATION_OPTIONS["real-users"].proofLabel}
									</FormLabel>
									<FormControl>
										<Textarea
											{...field}
											disabled={isSubmitting}
											placeholder={
												QUALIFICATION_OPTIONS["real-users"].proofPlaceholder
											}
											rows={4}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					) : null}

					{selectedQualificationReason === "saas-product" ? (
						<FormField
							control={form.control}
							name="saasProductProof"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										{QUALIFICATION_OPTIONS["saas-product"].proofLabel}
									</FormLabel>
									<FormControl>
										<Textarea
											{...field}
											disabled={isSubmitting}
											placeholder={
												QUALIFICATION_OPTIONS["saas-product"].proofPlaceholder
											}
											rows={4}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					) : null}

					<FormField
						control={form.control}
						name="isMonetized"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Are you profitable?</FormLabel>
								<Select
									disabled={isSubmitting}
									onValueChange={(value) => {
										const nextValue = value === "yes";
										field.onChange(nextValue);
										if (!nextValue) {
											form.setValue("monthlyRecurringRevenueUsd", undefined, {
												shouldDirty: true,
												shouldValidate: true,
											});
										}
									}}
									value={field.value ? "yes" : "no"}
								>
									<FormControl>
										<SelectTrigger className="w-full">
											<SelectValue />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										<SelectItem value="no">No</SelectItem>
										<SelectItem value="yes">Yes</SelectItem>
									</SelectContent>
								</Select>
								<FormDescription>
									Select yes or no. If yes, you can share MRR for context.
								</FormDescription>
								<FormMessage />
							</FormItem>
						)}
					/>

					{isMonetized ? (
						<FormField
							control={form.control}
							name="monthlyRecurringRevenueUsd"
							render={({ field }) => (
								<FormItem>
									<FormLabel>MRR in USD (optional)</FormLabel>
									<FormControl>
										<Input
											disabled={isSubmitting}
											min={0}
											onChange={(event) => {
												const value = event.target.value;
												field.onChange(value ? Number(value) : undefined);
											}}
											placeholder="2500"
											type="number"
											value={field.value ?? ""}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					) : null}

					<FormField
						control={form.control}
						name="notes"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Anything else we should know?</FormLabel>
								<FormControl>
									<Textarea
										{...field}
										disabled={isSubmitting}
										placeholder="Anything useful for review."
										rows={4}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<div className="flex flex-col gap-3">
						<FormField
							control={form.control}
							name="acknowledgePublicRepo"
							render={({ field }) => (
								<FormItem className="flex flex-row items-start gap-3 space-y-0">
									<FormControl>
										<Checkbox
											checked={field.value}
											disabled={isSubmitting}
											onCheckedChange={(checked) =>
												field.onChange(checked === true)
											}
										/>
									</FormControl>
									<div className="space-y-1">
										<FormLabel>The repository is public.</FormLabel>
										<FormMessage />
									</div>
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="acknowledgeRecentCommits"
							render={({ field }) => (
								<FormItem className="flex flex-row items-start gap-3 space-y-0">
									<FormControl>
										<Checkbox
											checked={field.value}
											disabled={isSubmitting}
											onCheckedChange={(checked) =>
												field.onChange(checked === true)
											}
										/>
									</FormControl>
									<div className="space-y-1">
										<FormLabel>The project has recent commits.</FormLabel>
										<FormMessage />
									</div>
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="acknowledgeWidgetMention"
							render={({ field }) => (
								<FormItem className="flex flex-row items-start gap-3 space-y-0">
									<FormControl>
										<Checkbox
											checked={field.value}
											disabled={isSubmitting}
											onCheckedChange={(checked) =>
												field.onChange(checked === true)
											}
										/>
									</FormControl>
									<div className="space-y-1">
										<FormLabel>
											I will keep the Cossistant mention in the widget.
										</FormLabel>
										<FormMessage />
									</div>
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="acknowledgeReadmeBadge"
							render={({ field }) => (
								<FormItem className="flex flex-row items-start gap-3 space-y-0">
									<FormControl>
										<Checkbox
											checked={field.value}
											disabled={isSubmitting}
											onCheckedChange={(checked) =>
												field.onChange(checked === true)
											}
										/>
									</FormControl>
									<div className="space-y-1">
										<FormLabel>
											I will add the README badge and support mention.
										</FormLabel>
										<FormMessage />
									</div>
								</FormItem>
							)}
						/>
					</div>

					{submitError ? (
						<p className="text-destructive text-sm">{submitError}</p>
					) : null}

					<BaseSubmitButton
						className="h-11 w-full sm:w-auto"
						isSubmitting={isSubmitting}
						type="submit"
					>
						Send application
					</BaseSubmitButton>
				</form>
			</Form>
		</div>
	);
}
