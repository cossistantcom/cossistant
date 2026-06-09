"use client";

import type { RouterOutputs } from "@cossistant/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { UpgradeModal } from "@/components/plan/upgrade-modal";
import { Badge } from "@/components/ui/badge";
import { BaseSubmitButton } from "@/components/ui/base-submit-button";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsRowFooter } from "@/components/ui/layout/settings-layout";
import { Switch } from "@/components/ui/switch";
import { useTRPC } from "@/lib/trpc/client";

type CurrentPlan = RouterOutputs["plan"]["getPlanInfo"]["plan"];
type OpenRouterByokSettings =
	RouterOutputs["website"]["developerSettings"]["openRouterByok"];

type OpenRouterByokSectionProps = {
	currentPlan: CurrentPlan;
	organizationId: string;
	websiteId: string;
	websiteSlug: string;
};

function getStatusLabel(settings?: OpenRouterByokSettings) {
	if (!settings?.hasKey) {
		return "No key saved";
	}

	if (!settings.enabled) {
		return "Saved, off";
	}

	switch (settings.lastConnectionStatus) {
		case "valid":
			return "Connected";
		case "invalid":
			return "Needs attention";
		default:
			return "Not checked yet";
	}
}

function getStatusVariant(settings?: OpenRouterByokSettings) {
	if (settings?.lastConnectionStatus === "invalid") {
		return "destructive" as const;
	}

	return "outline" as const;
}

export function OpenRouterByokSection({
	currentPlan,
	organizationId,
	websiteId,
	websiteSlug,
}: OpenRouterByokSectionProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [apiKey, setApiKey] = useState("");
	const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

	const { data, isFetching } = useQuery({
		...trpc.website.developerSettings.queryOptions({ slug: websiteSlug }),
	});
	const settings = data?.openRouterByok;
	const currentPlanSupportsOpenRouterByok =
		currentPlan.features["openrouter-byok"] === true;
	const featureAvailable =
		currentPlanSupportsOpenRouterByok || settings?.featureAvailable === true;
	const hasKey = settings?.hasKey ?? false;
	const canOpenUpgradeModal = currentPlan.name !== "self_hosted";
	const isSubmittingKey = apiKey.trim().length === 0;

	const invalidateDeveloperSettings = () =>
		queryClient.invalidateQueries({
			queryKey: trpc.website.developerSettings.queryKey({ slug: websiteSlug }),
		});

	const { mutateAsync: upsertApiKey, isPending: isSaving } = useMutation(
		trpc.website.upsertOpenRouterApiKey.mutationOptions({
			onSuccess: async () => {
				await invalidateDeveloperSettings();
				setApiKey("");
				toast.success("OpenRouter key saved.");
			},
			onError: (error) => {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to save OpenRouter key."
				);
			},
		})
	);
	const { mutateAsync: setEnabled, isPending: isToggling } = useMutation(
		trpc.website.setOpenRouterByokEnabled.mutationOptions({
			onSuccess: async (_, variables) => {
				await invalidateDeveloperSettings();
				toast.success(
					variables.enabled
						? "OpenRouter BYOK enabled."
						: "OpenRouter BYOK disabled."
				);
			},
			onError: (error) => {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to update OpenRouter BYOK."
				);
			},
		})
	);
	const { mutateAsync: deleteApiKey, isPending: isDeleting } = useMutation(
		trpc.website.deleteOpenRouterApiKey.mutationOptions({
			onSuccess: async () => {
				await invalidateDeveloperSettings();
				setIsDeleteDialogOpen(false);
				toast.success("OpenRouter key deleted.");
			},
			onError: (error) => {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to delete OpenRouter key."
				);
			},
		})
	);

	const isBusy = isFetching || isSaving || isToggling || isDeleting;
	const controlsDisabled = isBusy || !featureAvailable;

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		if (!featureAvailable) {
			setIsUpgradeModalOpen(true);
			return;
		}

		const trimmedApiKey = apiKey.trim();
		if (!trimmedApiKey) {
			return;
		}

		await upsertApiKey({
			organizationId,
			websiteId,
			apiKey: trimmedApiKey,
		});
	};

	const handleEnabledChange = (enabled: boolean) => {
		if (!featureAvailable) {
			setIsUpgradeModalOpen(true);
			return;
		}

		if (!hasKey) {
			toast.error("Save an OpenRouter key before enabling BYOK.");
			return;
		}

		void setEnabled({
			organizationId,
			websiteId,
			enabled,
		});
	};

	return (
		<>
			<form className="space-y-6" onSubmit={handleSubmit}>
				<div className="space-y-6 p-4">
					<div className="flex items-start justify-between gap-6">
						<div className="space-y-1">
							<Label htmlFor="openrouter-byok-enabled">
								Use your OpenRouter key
							</Label>
							<p className="text-muted-foreground text-sm">
								When enabled, AI calls for this website use your OpenRouter key
								first. Successful customer-key calls do not debit Cossistant AI
								usage credits.
							</p>
							<p className="mt-4 text-muted-foreground text-sm">
								Your key is encrypted at rest and only decrypted on the server
								when calling OpenRouter. It is never returned in API responses
								or shown again after you save it.
							</p>
							<p className="text-muted-foreground text-sm">
								If the saved key fails while enabled, organization owners
								receive at most one email alert per website every 24 hours, and
								the request may retry with Cossistant fallback credits.
							</p>
						</div>
						<Switch
							checked={settings?.enabled ?? false}
							disabled={controlsDisabled || !hasKey}
							id="openrouter-byok-enabled"
							onCheckedChange={handleEnabledChange}
						/>
					</div>

					<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
						<div className="space-y-2">
							<Label htmlFor="openrouter-api-key">
								{hasKey ? "Replace key" : "OpenRouter API key"}
							</Label>
							<Input
								autoComplete="off"
								disabled={controlsDisabled}
								id="openrouter-api-key"
								onChange={(event) => setApiKey(event.target.value)}
								placeholder="sk-or-v1-..."
								type="password"
								value={apiKey}
							/>
						</div>
						<div className="flex items-end">
							<BaseSubmitButton
								disabled={controlsDisabled || isSubmittingKey}
								isSubmitting={isSaving}
								size="sm"
								type="submit"
							>
								{hasKey ? "Replace key" : "Save key"}
							</BaseSubmitButton>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-2 text-sm">
						<Badge variant={getStatusVariant(settings)}>
							{getStatusLabel(settings)}
						</Badge>
						{settings?.maskedKey ? (
							<span className="text-muted-foreground">
								Saved key: {settings.maskedKey}
							</span>
						) : null}
						{settings?.lastErrorCode ? (
							<span className="text-destructive text-xs">
								Last error: {settings.lastErrorCode}
							</span>
						) : null}
					</div>

					{featureAvailable ? null : (
						<div className="rounded-lg border border-primary/20 border-dashed bg-background-100 p-3">
							<p className="font-medium text-sm">
								Bring your own OpenRouter key is a Pro feature.
							</p>
							<p className="text-muted-foreground text-xs">
								Upgrade to Pro to save a website-scoped key and run OpenRouter
								calls through your own account.
							</p>
						</div>
					)}
				</div>

				<SettingsRowFooter className="flex items-center justify-end gap-2">
					{hasKey ? (
						<Button
							disabled={controlsDisabled}
							onClick={() => setIsDeleteDialogOpen(true)}
							size="sm"
							type="button"
							variant="outline"
						>
							Delete key
						</Button>
					) : null}
					{!featureAvailable && canOpenUpgradeModal ? (
						<Button
							disabled={isBusy}
							onClick={() => setIsUpgradeModalOpen(true)}
							size="sm"
							type="button"
							variant="outline"
						>
							Upgrade to Pro
						</Button>
					) : null}
				</SettingsRowFooter>
			</form>

			<Dialog onOpenChange={setIsDeleteDialogOpen} open={isDeleteDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete OpenRouter key</DialogTitle>
						<DialogDescription>
							This removes the saved key immediately. This website will use
							Cossistant's OpenRouter key and normal AI credit billing again.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="mt-6">
						<Button
							disabled={isDeleting}
							onClick={() => setIsDeleteDialogOpen(false)}
							type="button"
							variant="outline"
						>
							Cancel
						</Button>
						<BaseSubmitButton
							disabled={isDeleting}
							isSubmitting={isDeleting}
							onClick={() =>
								deleteApiKey({
									organizationId,
									websiteId,
								})
							}
							type="button"
							variant="destructive"
						>
							Delete key
						</BaseSubmitButton>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{canOpenUpgradeModal ? (
				<UpgradeModal
					currentPlan={currentPlan}
					highlightedFeatureKey="openrouter-byok"
					initialPlanName="pro"
					onOpenChange={setIsUpgradeModalOpen}
					open={isUpgradeModalOpen}
					websiteSlug={websiteSlug}
				/>
			) : null}
		</>
	);
}
