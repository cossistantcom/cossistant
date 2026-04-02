"use client";

import type { RouterOutputs } from "@plasma/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
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
import { SettingsRowFooter } from "@/components/ui/layout/settings-layout";
import { useTRPC } from "@/lib/trpc/client";
import { ApiKeysTable } from "./api-keys-table";
import { CreateApiKeySheet } from "./create-api-key-sheet";

type WebsiteApiKey =
	RouterOutputs["website"]["developerSettings"]["apiKeys"][number];

type ApiKeysSectionProps = {
	websiteSlug: string;
	websiteId: string;
	organizationId: string;
	websiteName: string;
};

export function ApiKeysSection({
	organizationId,
	websiteId,
	websiteName,
	websiteSlug,
}: ApiKeysSectionProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [revokeTarget, setRevokeTarget] = useState<WebsiteApiKey | null>(null);
	const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);

	const { data, isFetching } = useQuery({
		...trpc.website.developerSettings.queryOptions({ slug: websiteSlug }),
	});

	const invalidateDeveloperSettings = () =>
		queryClient.invalidateQueries({
			queryKey: trpc.website.developerSettings.queryKey({ slug: websiteSlug }),
		});

	const { mutateAsync: revokeApiKey, isPending: isRevoking } = useMutation(
		trpc.website.revokeApiKey.mutationOptions({
			onSuccess: async () => {
				await invalidateDeveloperSettings();
				toast.success("API key revoked.");
			},
			onError: () => {
				toast.error("Failed to revoke API key. Please try again.");
			},
		})
	);

	const handleConfirmRevoke = async () => {
		if (!revokeTarget) {
			return;
		}

		setRevokingKeyId(revokeTarget.id);

		try {
			await revokeApiKey({
				organizationId,
				websiteId,
				apiKeyId: revokeTarget.id,
			});
			setRevokeTarget(null);
		} finally {
			setRevokingKeyId(null);
		}
	};

	return (
		<>
			<ApiKeysTable
				apiKeys={data?.apiKeys}
				isLoading={isFetching}
				onRequestRevoke={setRevokeTarget}
				revokingKeyId={revokingKeyId}
			/>
			<SettingsRowFooter>
				<CreateApiKeySheet organizationId={organizationId} />
			</SettingsRowFooter>
			<Dialog
				onOpenChange={(open) => !open && setRevokeTarget(null)}
				open={Boolean(revokeTarget)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Revoke API key</DialogTitle>
						<DialogDescription>
							Revoking "{revokeTarget?.name}" will immediately disable it. This
							action cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="mt-6">
						<Button
							disabled={isRevoking}
							onClick={() => setRevokeTarget(null)}
							type="button"
							variant="outline"
						>
							Cancel
						</Button>
						<BaseSubmitButton
							disabled={isRevoking}
							isSubmitting={isRevoking}
							onClick={handleConfirmRevoke}
							variant="destructive"
						>
							Revoke key
						</BaseSubmitButton>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
