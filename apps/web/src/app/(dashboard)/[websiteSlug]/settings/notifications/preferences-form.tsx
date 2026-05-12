"use client";

import {
	MEMBER_NOTIFICATION_DEFINITION_MAP,
	MemberNotificationChannel,
	type MemberNotificationSettingsResponse,
} from "@cossistant/types";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

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
import { SettingsRowFooter } from "@/components/ui/layout/settings-layout";
import { Switch } from "@/components/ui/switch";
import { useTRPC } from "@/lib/trpc/client";

/**
 * Convert a base64 string to Uint8Array for VAPID key
 * Used as applicationServerKey for push subscription
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
	const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

	const rawData = window.atob(base64);
	const outputArray = new Uint8Array(rawData.length);

	for (let i = 0; i < rawData.length; ++i) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
}

/**
 * Get the application server key for push subscription
 * Returns an ArrayBuffer which is a valid BufferSource
 */
function getApplicationServerKey(vapidPublicKey: string): ArrayBuffer {
	const uint8Array = urlBase64ToUint8Array(vapidPublicKey);
	// Create a new ArrayBuffer with the exact size needed
	const buffer = new ArrayBuffer(uint8Array.length);
	const view = new Uint8Array(buffer);
	view.set(uint8Array);
	return buffer;
}

const notificationFormSchema = z.object({
	[MemberNotificationChannel.EMAIL_MARKETING]: z.object({
		enabled: z.boolean(),
	}),
	[MemberNotificationChannel.EMAIL_NEW_MESSAGE]: z.object({
		enabled: z.boolean(),
	}),
	[MemberNotificationChannel.EMAIL_ESCALATION]: z.object({
		enabled: z.boolean(),
	}),
	[MemberNotificationChannel.BROWSER_PUSH_NEW_MESSAGE]: z.object({
		enabled: z.boolean(),
	}),
	[MemberNotificationChannel.SOUND_NEW_MESSAGE]: z.object({
		enabled: z.boolean(),
	}),
	[MemberNotificationChannel.SOUND_TYPING]: z.object({
		enabled: z.boolean(),
	}),
});

type NotificationFormValues = z.infer<typeof notificationFormSchema>;

type MemberNotificationSettingsFormProps = {
	websiteSlug: string;
};

type PushNotificationFieldProps = {
	data: MemberNotificationSettingsResponse | undefined;
	isPushSupported: boolean;
	isPushSubscribing: boolean;
	isDisabled: boolean;
	pushPermission: NotificationPermission | null;
	onEnable: () => Promise<void>;
	onDisable: () => Promise<void>;
	renderDescription: (channel: MemberNotificationChannel) => React.ReactNode;
};

function PushNotificationField({
	data,
	isPushSupported,
	isPushSubscribing,
	isDisabled,
	pushPermission,
	onEnable,
	onDisable,
	renderDescription,
}: PushNotificationFieldProps) {
	const pushSetting = data?.settings.find(
		(s) => s.channel === MemberNotificationChannel.BROWSER_PUSH_NEW_MESSAGE
	);
	const isEnabled = pushSetting?.enabled ?? false;
	const hasSubscription = Boolean(pushSetting?.config?.subscription);

	// Determine the current state
	const isFullyEnabled = isEnabled && hasSubscription;

	// Show unsupported message if browser doesn't support push
	if (!isPushSupported) {
		return (
			<FormItem className="space-y-3">
				<div className="flex items-center justify-between gap-6">
					<div>
						<FormLabel className="text-base">
							Browser push notifications
						</FormLabel>
						<FormDescription>
							Push notifications are not supported in this browser.
						</FormDescription>
					</div>
					<Switch checked={false} disabled />
				</div>
			</FormItem>
		);
	}

	// Show permission denied message
	if (pushPermission === "denied") {
		return (
			<FormItem className="space-y-3">
				<div className="flex items-center justify-between gap-6">
					<div>
						<FormLabel className="text-base">
							Browser push notifications
						</FormLabel>
						<FormDescription>
							Notifications are blocked. Please enable them in your browser
							settings.
						</FormDescription>
					</div>
					<Switch checked={false} disabled />
				</div>
			</FormItem>
		);
	}

	return (
		<FormItem className="space-y-3">
			<div className="flex items-center justify-between gap-6">
				<div>
					<FormLabel className="text-base">
						Browser push notifications
					</FormLabel>
					<FormDescription>
						{renderDescription(
							MemberNotificationChannel.BROWSER_PUSH_NEW_MESSAGE
						)}
					</FormDescription>
				</div>
				{isFullyEnabled ? (
					<Button
						disabled={isDisabled || isPushSubscribing}
						onClick={onDisable}
						size="sm"
						type="button"
						variant="outline"
					>
						{isPushSubscribing ? "Disabling..." : "Disable"}
					</Button>
				) : (
					<Button
						disabled={isDisabled || isPushSubscribing}
						onClick={onEnable}
						size="sm"
						type="button"
						variant="default"
					>
						{isPushSubscribing ? "Enabling..." : "Enable"}
					</Button>
				)}
			</div>
		</FormItem>
	);
}

function toFormValues(
	data: MemberNotificationSettingsResponse | undefined
): NotificationFormValues {
	const marketing = data?.settings.find(
		(setting) => setting.channel === MemberNotificationChannel.EMAIL_MARKETING
	);
	const emailMessages = data?.settings.find(
		(setting) => setting.channel === MemberNotificationChannel.EMAIL_NEW_MESSAGE
	);
	const emailEscalation = data?.settings.find(
		(setting) => setting.channel === MemberNotificationChannel.EMAIL_ESCALATION
	);
	const browserPush = data?.settings.find(
		(setting) =>
			setting.channel === MemberNotificationChannel.BROWSER_PUSH_NEW_MESSAGE
	);
	const soundNewMessage = data?.settings.find(
		(setting) => setting.channel === MemberNotificationChannel.SOUND_NEW_MESSAGE
	);
	const soundTyping = data?.settings.find(
		(setting) => setting.channel === MemberNotificationChannel.SOUND_TYPING
	);

	return {
		[MemberNotificationChannel.EMAIL_MARKETING]: {
			enabled: marketing?.enabled ?? true,
		},
		[MemberNotificationChannel.EMAIL_NEW_MESSAGE]: {
			enabled: emailMessages?.enabled ?? true,
		},
		[MemberNotificationChannel.EMAIL_ESCALATION]: {
			enabled: emailEscalation?.enabled ?? emailMessages?.enabled ?? true,
		},
		[MemberNotificationChannel.BROWSER_PUSH_NEW_MESSAGE]: {
			enabled: browserPush?.enabled ?? false,
		},
		[MemberNotificationChannel.SOUND_NEW_MESSAGE]: {
			enabled: soundNewMessage?.enabled ?? true,
		},
		[MemberNotificationChannel.SOUND_TYPING]: {
			enabled: soundTyping?.enabled ?? true,
		},
	} satisfies NotificationFormValues;
}

export function MemberNotificationSettingsForm({
	websiteSlug,
}: MemberNotificationSettingsFormProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	// Push notification state
	const [isPushSupported, setIsPushSupported] = useState(false);
	const [pushPermission, setPushPermission] =
		useState<NotificationPermission | null>(null);
	const [isPushSubscribing, setIsPushSubscribing] = useState(false);

	const { data, isFetching } = useQuery({
		...trpc.notification.getMemberSettings.queryOptions({
			websiteSlug,
		}),
	});

	const form = useForm<NotificationFormValues>({
		resolver: standardSchemaResolver(notificationFormSchema),
		defaultValues: toFormValues(data),
	});

	// Check push notification support on mount
	useEffect(() => {
		if (
			typeof window !== "undefined" &&
			"serviceWorker" in navigator &&
			"PushManager" in window
		) {
			setIsPushSupported(true);
			setPushPermission(Notification.permission);
		}
	}, []);

	useEffect(() => {
		if (!data) {
			return;
		}

		form.reset(toFormValues(data));
	}, [data, form]);

	const { mutateAsync: updateSettings, isPending } = useMutation(
		trpc.notification.updateMemberSettings.mutationOptions({
			onSuccess: async (response) => {
				await queryClient.invalidateQueries({
					queryKey: trpc.notification.getMemberSettings.queryKey({
						websiteSlug,
					}),
				});
				form.reset(toFormValues(response));
				toast.success("Notification preferences saved.");
			},
			onError: () => {
				toast.error(
					"We couldn't update your notification preferences. Try again."
				);
			},
		})
	);

	const { mutateAsync: subscribeToPush } = useMutation(
		trpc.notification.subscribeToPush.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.notification.getMemberSettings.queryKey({
						websiteSlug,
					}),
				});
				toast.success("Push notifications enabled!");
			},
			onError: () => {
				toast.error("Failed to enable push notifications. Please try again.");
			},
		})
	);

	const { mutateAsync: unsubscribeFromPush } = useMutation(
		trpc.notification.unsubscribeFromPush.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.notification.getMemberSettings.queryKey({
						websiteSlug,
					}),
				});
				toast.success("Push notifications disabled.");
			},
			onError: () => {
				toast.error("Failed to disable push notifications. Please try again.");
			},
		})
	);

	/**
	 * Handle enabling push notifications
	 */
	const handleEnablePush = useCallback(async () => {
		if (!isPushSupported) {
			toast.error("Push notifications are not supported in this browser.");
			return;
		}

		setIsPushSubscribing(true);

		try {
			// Request notification permission
			const permission = await Notification.requestPermission();
			setPushPermission(permission);

			if (permission !== "granted") {
				toast.error("Please allow notifications in your browser settings.");
				return;
			}

			// Register service worker
			const registration = await navigator.serviceWorker.register("/sw.js", {
				scope: "/",
				updateViaCache: "none",
			});

			// Wait for service worker to be ready
			await navigator.serviceWorker.ready;

			// Get VAPID public key
			const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
			if (!vapidPublicKey) {
				toast.error("Push notifications are not configured.");
				return;
			}

			// Subscribe to push
			const subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: getApplicationServerKey(vapidPublicKey),
			});

			// Send subscription to backend
			const subscriptionJson = subscription.toJSON();
			await subscribeToPush({
				websiteSlug,
				subscription: {
					endpoint: subscriptionJson.endpoint as string,
					keys: {
						p256dh: subscriptionJson.keys?.p256dh as string,
						auth: subscriptionJson.keys?.auth as string,
					},
				},
			});
		} catch (error) {
			console.error("Error enabling push notifications:", error);
			toast.error("Failed to enable push notifications. Please try again.");
		} finally {
			setIsPushSubscribing(false);
		}
	}, [isPushSupported, subscribeToPush, websiteSlug]);

	/**
	 * Handle disabling push notifications
	 */
	const handleDisablePush = useCallback(async () => {
		setIsPushSubscribing(true);

		try {
			// Try to unsubscribe from the browser
			const registration = await navigator.serviceWorker.getRegistration();
			if (registration) {
				const subscription = await registration.pushManager.getSubscription();
				if (subscription) {
					await subscription.unsubscribe();
				}
			}

			// Update backend
			await unsubscribeFromPush({ websiteSlug });
		} catch (error) {
			console.error("Error disabling push notifications:", error);
			toast.error("Failed to disable push notifications. Please try again.");
		} finally {
			setIsPushSubscribing(false);
		}
	}, [unsubscribeFromPush, websiteSlug]);

	const onSubmit = useCallback(
		async (values: NotificationFormValues) => {
			if (!data) {
				return;
			}

			const nextSettings = data.settings.map((setting) => {
				if (setting.channel === MemberNotificationChannel.EMAIL_MARKETING) {
					return {
						...setting,
						enabled: values[MemberNotificationChannel.EMAIL_MARKETING].enabled,
					};
				}

				if (setting.channel === MemberNotificationChannel.EMAIL_NEW_MESSAGE) {
					return {
						...setting,
						enabled:
							values[MemberNotificationChannel.EMAIL_NEW_MESSAGE].enabled,
					};
				}

				if (setting.channel === MemberNotificationChannel.EMAIL_ESCALATION) {
					return {
						...setting,
						enabled: values[MemberNotificationChannel.EMAIL_ESCALATION].enabled,
					};
				}

				if (
					setting.channel === MemberNotificationChannel.BROWSER_PUSH_NEW_MESSAGE
				) {
					return {
						...setting,
						enabled:
							values[MemberNotificationChannel.BROWSER_PUSH_NEW_MESSAGE]
								.enabled,
					};
				}

				if (setting.channel === MemberNotificationChannel.SOUND_NEW_MESSAGE) {
					return {
						...setting,
						enabled:
							values[MemberNotificationChannel.SOUND_NEW_MESSAGE].enabled,
					};
				}

				if (setting.channel === MemberNotificationChannel.SOUND_TYPING) {
					return {
						...setting,
						enabled: values[MemberNotificationChannel.SOUND_TYPING].enabled,
					};
				}

				return setting;
			});

			await updateSettings({
				websiteSlug,
				settings: nextSettings.map((setting) => ({
					channel: setting.channel,
					enabled: setting.enabled,
					delaySeconds: setting.delaySeconds,
					priority: setting.priority,
					config: setting.config,
				})),
			});
		},
		[data, updateSettings, websiteSlug]
	);

	const renderDescription = useCallback(
		(channel: MemberNotificationChannel) => {
			const definition = MEMBER_NOTIFICATION_DEFINITION_MAP.get(channel);
			const current = data?.settings.find(
				(setting) => setting.channel === channel
			);

			if (!definition) {
				return null;
			}

			return (
				<>
					<span className="block">{definition.description}</span>
					{definition.requiresSetup && !current?.config && (
						<span className="block text-cossistant-orange">
							Set up browser push before enabling alerts.
						</span>
					)}
				</>
			);
		},
		[data?.settings]
	);

	const isDisabled = isFetching || isPending || !data;

	return (
		<Form {...form}>
			<form className="space-y-8" onSubmit={form.handleSubmit(onSubmit)}>
				<div className="space-y-6 p-4">
					<FormField
						control={form.control}
						name={
							`${MemberNotificationChannel.EMAIL_MARKETING}.enabled` as const
						}
						render={({ field }) => (
							<FormItem className="space-y-3">
								<div className="flex items-center justify-between gap-6">
									<div>
										<FormLabel className="text-base">
											Marketing emails
										</FormLabel>
										<FormDescription>
											{renderDescription(
												MemberNotificationChannel.EMAIL_MARKETING
											)}
										</FormDescription>
									</div>
									<FormControl>
										<Switch
											checked={field.value}
											disabled={isDisabled}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
								</div>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name={
							`${MemberNotificationChannel.EMAIL_NEW_MESSAGE}.enabled` as const
						}
						render={({ field }) => (
							<FormItem className="space-y-3">
								<div className="flex items-center justify-between gap-6">
									<div>
										<FormLabel className="text-base">
											New message emails
										</FormLabel>
										<FormDescription>
											{renderDescription(
												MemberNotificationChannel.EMAIL_NEW_MESSAGE
											)}
										</FormDescription>
									</div>
									<FormControl>
										<Switch
											checked={field.value}
											disabled={isDisabled}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
								</div>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name={
							`${MemberNotificationChannel.EMAIL_ESCALATION}.enabled` as const
						}
						render={({ field }) => (
							<FormItem className="space-y-3">
								<div className="flex items-center justify-between gap-6">
									<div>
										<FormLabel className="text-base">
											Human help needed emails
										</FormLabel>
										<FormDescription>
											{renderDescription(
												MemberNotificationChannel.EMAIL_ESCALATION
											)}
										</FormDescription>
									</div>
									<FormControl>
										<Switch
											checked={field.value}
											disabled={isDisabled}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
								</div>
								<FormMessage />
							</FormItem>
						)}
					/>

					<PushNotificationField
						data={data}
						isDisabled={isDisabled}
						isPushSubscribing={isPushSubscribing}
						isPushSupported={isPushSupported}
						onDisable={handleDisablePush}
						onEnable={handleEnablePush}
						pushPermission={pushPermission}
						renderDescription={renderDescription}
					/>

					<FormField
						control={form.control}
						name={
							`${MemberNotificationChannel.SOUND_NEW_MESSAGE}.enabled` as const
						}
						render={({ field }) => (
							<FormItem className="space-y-3">
								<div className="flex items-center justify-between gap-6">
									<div>
										<FormLabel className="text-base">
											New message sounds
										</FormLabel>
										<FormDescription>
											{renderDescription(
												MemberNotificationChannel.SOUND_NEW_MESSAGE
											)}
										</FormDescription>
									</div>
									<FormControl>
										<Switch
											checked={field.value}
											disabled={isDisabled}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
								</div>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name={`${MemberNotificationChannel.SOUND_TYPING}.enabled` as const}
						render={({ field }) => (
							<FormItem className="space-y-3">
								<div className="flex items-center justify-between gap-6">
									<div>
										<FormLabel className="text-base">
											Typing indicator sounds
										</FormLabel>
										<FormDescription>
											{renderDescription(
												MemberNotificationChannel.SOUND_TYPING
											)}
										</FormDescription>
									</div>
									<FormControl>
										<Switch
											checked={field.value}
											disabled={isDisabled}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
								</div>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>

				<SettingsRowFooter>
					<BaseSubmitButton
						disabled={isDisabled || !form.formState.isDirty}
						isSubmitting={isPending}
					>
						Save preferences
					</BaseSubmitButton>
				</SettingsRowFooter>
			</form>
		</Form>
	);
}
