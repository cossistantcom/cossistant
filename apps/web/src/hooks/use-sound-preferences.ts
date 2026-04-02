import { MemberNotificationChannel } from "@plasma/types";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTRPC } from "@/lib/trpc/client";

type UseSoundPreferencesParams = {
	websiteSlug: string;
};

type SoundPreferences = {
	newMessageEnabled: boolean;
	typingEnabled: boolean;
	isLoading: boolean;
};

/**
 * Hook to fetch the current user's sound notification preferences.
 *
 * @param params - Parameters including websiteSlug
 * @returns Sound preferences with enabled/disabled state for each sound type
 *
 * @example
 * const { newMessageEnabled, typingEnabled, isLoading } = useSoundPreferences({
 *   websiteSlug: 'my-website'
 * });
 */
export function useSoundPreferences({
	websiteSlug,
}: UseSoundPreferencesParams): SoundPreferences {
	const trpc = useTRPC();

	const { data, isLoading } = useQuery({
		...trpc.notification.getMemberSettings.queryOptions({
			websiteSlug,
		}),
	});

	const preferences = useMemo(() => {
		if (!data) {
			// Default to enabled while loading
			return {
				newMessageEnabled: true,
				typingEnabled: true,
			};
		}

		const newMessageSetting = data.settings.find(
			(setting) =>
				setting.channel === MemberNotificationChannel.SOUND_NEW_MESSAGE
		);

		const typingSetting = data.settings.find(
			(setting) => setting.channel === MemberNotificationChannel.SOUND_TYPING
		);

		return {
			newMessageEnabled: newMessageSetting?.enabled ?? true,
			typingEnabled: typingSetting?.enabled ?? true,
		};
	}, [data]);

	return {
		...preferences,
		isLoading,
	};
}
