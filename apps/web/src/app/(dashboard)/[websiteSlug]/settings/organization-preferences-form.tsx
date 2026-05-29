"use client";

import { timezones } from "@cossistant/location/timezones";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { BaseSubmitButton } from "@/components/ui/base-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsRowFooter } from "@/components/ui/layout/settings-layout";
import { Switch } from "@/components/ui/switch";
import { useTRPC } from "@/lib/trpc/client";

type OrganizationPreferencesFormProps = {
	canUpdate: boolean;
	initialTimezone: string;
	initialWeeklyDigestEnabled: boolean;
	organizationId: string;
};

export function OrganizationPreferencesForm({
	canUpdate,
	initialTimezone,
	initialWeeklyDigestEnabled,
	organizationId,
}: OrganizationPreferencesFormProps) {
	const router = useRouter();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const timezoneListId = useId();
	const [timezone, setTimezone] = useState(initialTimezone);
	const [savedTimezone, setSavedTimezone] = useState(initialTimezone);
	const [weeklyDigestEnabled, setWeeklyDigestEnabled] = useState(
		initialWeeklyDigestEnabled
	);
	const [savedWeeklyDigestEnabled, setSavedWeeklyDigestEnabled] = useState(
		initialWeeklyDigestEnabled
	);

	useEffect(() => {
		setTimezone(initialTimezone);
		setSavedTimezone(initialTimezone);
		setWeeklyDigestEnabled(initialWeeklyDigestEnabled);
		setSavedWeeklyDigestEnabled(initialWeeklyDigestEnabled);
	}, [initialTimezone, initialWeeklyDigestEnabled]);

	const timezoneOptions = useMemo(
		() =>
			timezones.map((entry) => ({
				label: entry.label,
				value: entry.tzCode,
			})),
		[]
	);
	const trimmedTimezone = timezone.trim();
	const isDirty =
		trimmedTimezone !== savedTimezone ||
		weeklyDigestEnabled !== savedWeeklyDigestEnabled;

	const { mutateAsync: updateSettings, isPending } = useMutation(
		trpc.organization.updateSettings.mutationOptions({
			onSuccess: async (settings) => {
				setTimezone(settings.timezone);
				setSavedTimezone(settings.timezone);
				setWeeklyDigestEnabled(settings.weeklyDigestEnabled);
				setSavedWeeklyDigestEnabled(settings.weeklyDigestEnabled);

				await queryClient.invalidateQueries({
					queryKey: trpc.organization.getSettings.queryKey({
						organizationId,
					}),
				});

				toast.success("Organization preferences updated.");
				router.refresh();
			},
			onError: (error) => {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to update organization preferences."
				);
			},
		})
	);

	return (
		<form
			className="space-y-6"
			onSubmit={(event) => {
				event.preventDefault();

				if (!(canUpdate && isDirty && trimmedTimezone)) {
					return;
				}

				void updateSettings({
					organizationId,
					timezone: trimmedTimezone,
					weeklyDigestEnabled,
				});
			}}
		>
			<div className="space-y-6 p-4">
				<div className="space-y-2">
					<Label htmlFor="organization-timezone">Timezone</Label>
					<Input
						disabled={isPending || !canUpdate}
						id="organization-timezone"
						list={timezoneListId}
						onChange={(event) => setTimezone(event.target.value)}
						placeholder="Europe/Paris"
						value={timezone}
					/>
					<datalist id={timezoneListId}>
						{timezoneOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</datalist>
					<p className="text-muted-foreground text-sm">
						Used to send weekly digests at the right local time.
					</p>
				</div>

				<div className="flex items-center justify-between gap-6">
					<div className="space-y-1">
						<Label htmlFor="weekly-digest-enabled">Weekly email digest</Label>
						<p className="text-muted-foreground text-sm">
							Receive a short weekly account recap. Welcome, setup, activation,
							and limit emails are controlled by your marketing email
							preference.
						</p>
					</div>
					<Switch
						checked={weeklyDigestEnabled}
						disabled={isPending || !canUpdate}
						id="weekly-digest-enabled"
						onCheckedChange={setWeeklyDigestEnabled}
					/>
				</div>

				{canUpdate ? null : (
					<p className="text-muted-foreground text-sm">
						Only organization owners and admins can change these preferences.
					</p>
				)}
			</div>

			<SettingsRowFooter className="flex items-center justify-end gap-2">
				<BaseSubmitButton
					disabled={!(canUpdate && isDirty) || isPending || !trimmedTimezone}
					isSubmitting={isPending}
					size="sm"
					type="submit"
				>
					Save organization preferences
				</BaseSubmitButton>
			</SettingsRowFooter>
		</form>
	);
}
