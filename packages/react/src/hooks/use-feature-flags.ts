"use client";

import {
	isSupportFeatureFlagEnabled,
	type RegisteredFeatureFlagName,
	type SupportState,
} from "@cossistant/core";
import { useCallback } from "react";
import { useSupportState } from "./private/use-support-state";

export type UseFeatureFlagsReturn = {
	/**
	 * Resolved feature flags enabled for the current visitor/contact.
	 */
	flags: string[];
	/**
	 * Loading status for the support state request.
	 */
	isLoading: boolean;
	/**
	 * Whether the state has been fetched successfully.
	 */
	status: SupportState["status"];
	/**
	 * Last support state error, if any.
	 */
	error: SupportState["error"];
	/**
	 * Check whether a configured flag is enabled.
	 */
	isEnabled: (flag: RegisteredFeatureFlagName) => boolean;
	/**
	 * Refetch support state from the Cossistant API.
	 */
	refetch: () => Promise<void>;
};

export function useFeatureFlags(): UseFeatureFlagsReturn {
	const { supportState, isLoading, status, error, refetch } = useSupportState();

	const flags = supportState?.featureFlags ?? [];

	const isEnabled = useCallback(
		(flag: RegisteredFeatureFlagName) =>
			isSupportFeatureFlagEnabled(flags, flag),
		[flags]
	);

	return {
		flags,
		isLoading,
		status,
		error,
		isEnabled,
		refetch,
	};
}

export function useFeatureFlag(flag: RegisteredFeatureFlagName): boolean {
	return useFeatureFlags().isEnabled(flag);
}
