"use client";

import {
	APIKeyType,
	type CreateWebsiteResponse,
	type WebsiteInstallationTarget,
} from "@plasma/types";
import { useMutation } from "@tanstack/react-query";
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CodeBlockCommand } from "@/components/code-block-command";
import { copyToClipboardWithMeta } from "@/components/copy-button";
import { DashboardCodeBlock } from "@/components/dashboard-code-block";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Step, Steps } from "@/components/ui/steps";
import { useConfig } from "@/hooks/use-config";
import {
	buildSupportAiSetupPrompt,
	getSupportInstallCommand,
	getSupportInstallCommands,
	getSupportIntegrationGuide,
} from "@/lib/support-integration-guide";
import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import WebsiteCreationForm from "./website-creation-form";

type CreationFlowWrapperProps = {
	organizationId: string;
};

type WebsiteSetupState = {
	website: CreateWebsiteResponse;
	installationTarget: WebsiteInstallationTarget;
};

type IntegrationMode = "aiPrompt" | "manual";

const INTEGRATION_MODE_OPTIONS: {
	description: string;
	label: string;
	recommended?: boolean;
	value: IntegrationMode;
}[] = [
	{
		description:
			"Copy one prompt, paste it into ChatGPT/Claude/Cursor, and let AI wire everything for you.",
		label: "Copy prompt to setup with AI",
		recommended: true,
		value: "aiPrompt",
	},
	{
		description:
			"Follow the manual code steps if you prefer to integrate by hand.",
		label: "Manual integration",
		value: "manual",
	},
];

function parseDomainCandidate(domain: string): string | null {
	const value = domain.trim();
	if (!value) {
		return null;
	}

	try {
		const parsed = new URL(value.includes("://") ? value : `https://${value}`);
		return parsed.hostname.replace(/^www\./, "");
	} catch {
		const fallback = value
			.replace(/^https?:\/\//, "")
			.replace(/^www\./, "")
			.split("/")[0]
			?.trim();

		return fallback || null;
	}
}

function isLocalDomain(domain: string): boolean {
	const normalized = domain.toLowerCase();

	return (
		normalized === "localhost" ||
		normalized.startsWith("localhost:") ||
		normalized === "127.0.0.1" ||
		normalized.startsWith("127.0.0.1:") ||
		normalized === "0.0.0.0" ||
		normalized.startsWith("0.0.0.0:") ||
		normalized.endsWith(".localhost")
	);
}

function resolveWebsiteDomain(website: CreateWebsiteResponse): string {
	const domains = website.whitelistedDomains
		.map(parseDomainCandidate)
		.filter((domain): domain is string => Boolean(domain));

	const nonLocalDomain = domains.find((domain) => !isLocalDomain(domain));

	return nonLocalDomain ?? domains[0] ?? "your-domain.com";
}

export default function CreationFlowWrapper({
	organizationId,
}: CreationFlowWrapperProps) {
	const trpc = useTRPC();
	const [config] = useConfig();
	const [websiteSetup, setWebsiteSetup] = useState<WebsiteSetupState | null>(
		null
	);
	const [integrationMode, setIntegrationMode] =
		useState<IntegrationMode>("aiPrompt");

	const { mutate: createWebsite, isPending: isSubmitting } = useMutation(
		trpc.website.create.mutationOptions({
			onSuccess: (data, variables) => {
				setWebsiteSetup({
					website: data,
					installationTarget: variables.installationTarget,
				});
				setIntegrationMode("aiPrompt");
			},
			onError: (error) => {
				toast.error(error.message || "Failed to create website");
			},
		})
	);

	const publicApiKey = useMemo(() => {
		if (!websiteSetup) {
			return null;
		}

		return (
			websiteSetup.website.apiKeys.find(
				(key) => key.keyType === APIKeyType.PUBLIC && key.isTest
			)?.key ?? null
		);
	}, [websiteSetup]);

	const guide = useMemo(
		() => getSupportIntegrationGuide(websiteSetup?.installationTarget),
		[websiteSetup?.installationTarget]
	);

	const installCommands = useMemo(
		() => getSupportInstallCommands(websiteSetup?.installationTarget),
		[websiteSetup?.installationTarget]
	);

	const installCommand = useMemo(
		() =>
			getSupportInstallCommand({
				installationTarget: websiteSetup?.installationTarget,
				packageManager: config.packageManager,
			}),
		[config.packageManager, websiteSetup?.installationTarget]
	);

	const websiteDomain = useMemo(() => {
		if (!websiteSetup) {
			return "your-domain.com";
		}

		return resolveWebsiteDomain(websiteSetup.website);
	}, [websiteSetup]);

	const aiSetupPrompt = useMemo(() => {
		if (!websiteSetup) {
			return "";
		}

		return buildSupportAiSetupPrompt({
			installCommand,
			installationTarget: websiteSetup.installationTarget,
			publicApiKey,
			websiteDomain,
			websiteName: websiteSetup.website.name,
		});
	}, [installCommand, publicApiKey, websiteDomain, websiteSetup]);

	const handleCopySetupPrompt = async () => {
		if (!aiSetupPrompt) {
			toast.error("Prompt is not ready yet.");
			return;
		}

		try {
			await copyToClipboardWithMeta(aiSetupPrompt);
			toast.success("Setup prompt copied. Paste it in your AI assistant.");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to copy setup prompt."
			);
		}
	};

	return (
		<Steps className="mt-10 pb-20">
			<Step completed={Boolean(websiteSetup)}>
				<div className="font-semibold text-lg">Create your website</div>
				<div className="mt-3 space-y-4">
					{websiteSetup ? (
						<div className="rounded border bg-background-200 px-4 py-3 text-sm">
							<p className="font-medium text-primary">
								{websiteSetup.website.name} is ready.
							</p>
							<p className="mt-2 text-muted-foreground">
								We generated your default API keys and allowed localhost so you
								can start building immediately.
							</p>
						</div>
					) : (
						<WebsiteCreationForm
							isSubmitting={isSubmitting}
							onSubmit={createWebsite}
							organizationId={organizationId}
						/>
					)}
				</div>
			</Step>

			<Step enabled={Boolean(websiteSetup)}>
				<div className="font-semibold text-lg">Install Cossistant locally</div>
				<motion.div
					animate={{ opacity: 1, y: 0 }}
					className="mt-3 space-y-6"
					initial={{ opacity: 0, y: 10 }}
					transition={{ duration: 0.5, delay: 0.7 }}
				>
					{websiteSetup ? (
						<>
							<div className="space-y-4">
								<p className="text-muted-foreground text-sm">
									You selected {guide.frameworkLabel}. Choose the setup path you
									prefer. AI mode is the fastest way to go from zero to running
									widget in minutes.
								</p>

								<RadioGroup
									className="grid gap-3 sm:grid-cols-2"
									onValueChange={(value) =>
										setIntegrationMode(value as IntegrationMode)
									}
									value={integrationMode}
								>
									{INTEGRATION_MODE_OPTIONS.map((option) => (
										<Label
											className={cn(
												"flex h-full cursor-pointer flex-col items-start gap-2 rounded-md border p-4 text-left",
												integrationMode === option.value
													? "border-primary/30 bg-background-200"
													: ""
											)}
											htmlFor={`integration-mode-${option.value}`}
											key={option.value}
										>
											<RadioGroupItem
												className="sr-only"
												id={`integration-mode-${option.value}`}
												value={option.value}
											/>
											<div className="flex items-center gap-2">
												<span className="font-medium text-sm">
													{option.label}
												</span>
												{option.recommended ? (
													<span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 font-medium text-[11px] text-primary">
														Recommended
													</span>
												) : null}
											</div>
											<span className="text-muted-foreground text-xs">
												{option.description}
											</span>
										</Label>
									))}
								</RadioGroup>
							</div>

							{integrationMode === "aiPrompt" ? (
								<div className="space-y-4">
									<div className="flex flex-wrap items-center gap-2">
										<Button onClick={handleCopySetupPrompt} type="button">
											Copy setup prompt
										</Button>
									</div>

									<DashboardCodeBlock
										code={aiSetupPrompt}
										fileName={"plasma-prompt.md"}
										language="md"
									/>
									{publicApiKey ? null : (
										<p className="text-destructive text-xs">
											We could not load your key automatically. The prompt uses
											a placeholder key. Replace it from Settings → Developers.
										</p>
									)}
								</div>
							) : (
								<>
									<p className="text-muted-foreground text-sm">
										Prefer manual setup? Follow the exact {guide.frameworkLabel}
										steps below.
									</p>

									<div className="space-y-3">
										<h4 className="font-medium text-primary text-sm tracking-wide">
											[Install the package]
										</h4>
										<div className="relative overflow-clip rounded border bg-background-200 pt-0">
											<CodeBlockCommand
												__bun__={installCommands.bun}
												__npm__={installCommands.npm}
												__pnpm__={installCommands.pnpm}
												__yarn__={installCommands.yarn}
											/>
										</div>
									</div>

									<div className="space-y-3">
										<h4 className="font-medium text-primary text-sm tracking-wide">
											[Add your public key]
										</h4>
										<DashboardCodeBlock
											code={`${guide.envVarName}=${publicApiKey ?? "pk_test_replace_me"}`}
											fileName={guide.envFileName}
											highlightLines="1"
											language="bash"
										/>
										{publicApiKey ? null : (
											<p className="text-destructive text-xs">
												We could not load your key automatically. Grab it from
												Settings → Developers.
											</p>
										)}
									</div>

									<div className="space-y-3">
										<h4 className="font-medium text-primary text-sm tracking-wide">
											[Import CSS - Tailwind v4]
										</h4>
										<DashboardCodeBlock
											code={guide.cssTailwindCode}
											fileName={guide.cssTailwindFileName}
										/>
									</div>

									<div className="space-y-3">
										<h4 className="font-medium text-primary text-sm tracking-wide">
											[Import CSS - plain stylesheet fallback]
										</h4>
										<DashboardCodeBlock
											code={guide.cssPlainCode}
											fileName={guide.cssPlainFileName}
										/>
									</div>

									<div className="space-y-3">
										<h4 className="font-medium text-primary text-sm tracking-wide">
											[Wrap your app with SupportProvider]
										</h4>
										<DashboardCodeBlock
											code={guide.providerCode}
											fileName={guide.providerFileName}
										/>
									</div>

									<div className="space-y-3">
										<h4 className="font-medium text-primary text-sm tracking-wide">
											[Drop the widget anywhere]
										</h4>
										<DashboardCodeBlock
											code={guide.widgetCode}
											fileName={guide.widgetFileName}
										/>
									</div>

									<div className="space-y-3">
										<h4 className="font-medium text-primary text-sm tracking-wide">
											[Identify logged-in visitors (optional)]
										</h4>
										<DashboardCodeBlock
											code={guide.identifyVisitorCode}
											fileName={guide.identifyVisitorFileName}
										/>
									</div>

									<div className="space-y-3">
										<h4 className="font-medium text-primary text-sm tracking-wide">
											[Display custom messages]
										</h4>
										<DashboardCodeBlock
											code={guide.defaultMessageCode}
											fileName={guide.defaultMessageFileName}
										/>
									</div>

									<p className="text-muted-foreground">
										You are ready to ship.
									</p>
								</>
							)}

							<div className="fixed right-0 bottom-0 left-0 flex items-center justify-center py-3">
								<div className="flex w-full max-w-3xl items-center justify-center gap-2 rounded border bg-background px-6 py-3 shadow dark:bg-background-300">
									<Button asChild>
										<Link href={`/${websiteSetup.website.slug}/inbox`}>
											Open dashboard now
										</Link>
									</Button>
									<Button asChild variant="outline">
										<Link href={guide.docsQuickstartPath} target="_blank">
											Read the documentation
										</Link>
									</Button>
								</div>
							</div>
						</>
					) : null}
				</motion.div>
			</Step>
		</Steps>
	);
}
