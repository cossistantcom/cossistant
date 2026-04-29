"use client";

import {
	getSupportOnboardingSnapshot,
	type OnboardingMetadataForStep,
	type RegisteredOnboardingStepId,
	type SupportOnboardingSnapshot,
	type SupportState,
} from "@cossistant/core";
import type { SupportStateResponse } from "@cossistant/types/api/support";
import { useCallback, useMemo } from "react";
import { useSupportState } from "./private/use-support-state";

export type UseOnboardingReturn =
	SupportOnboardingSnapshot<RegisteredOnboardingStepId> & {
		/**
		 * Loading status for the support state request.
		 */
		isLoading: boolean;
		/**
		 * Current support state request status.
		 */
		status: SupportState["status"];
		/**
		 * Last support state error, if any.
		 */
		error: SupportState["error"];
		completeStep: (
			stepId: RegisteredOnboardingStepId
		) => Promise<SupportStateResponse | null>;
		uncompleteStep: (
			stepId: RegisteredOnboardingStepId
		) => Promise<SupportStateResponse | null>;
		setMetadata: <TStepId extends RegisteredOnboardingStepId>(
			stepId: TStepId,
			metadata: OnboardingMetadataForStep<TStepId> | null
		) => Promise<SupportStateResponse | null>;
		reset: () => Promise<SupportStateResponse | null>;
		refetch: () => Promise<void>;
	};

export function useOnboarding(): UseOnboardingReturn {
	const {
		client,
		supportState,
		supportConfig,
		isLoading,
		status,
		error,
		refetch,
	} = useSupportState();

	const snapshot = useMemo(
		() =>
			getSupportOnboardingSnapshot(
				supportConfig,
				supportState?.onboarding ?? { steps: {} }
			) as SupportOnboardingSnapshot<RegisteredOnboardingStepId>,
		[supportConfig, supportState?.onboarding]
	);

	const completeStep = useCallback(
		(stepId: RegisteredOnboardingStepId) =>
			client?.completeOnboardingStep(stepId) ?? Promise.resolve(null),
		[client]
	);

	const uncompleteStep = useCallback(
		(stepId: RegisteredOnboardingStepId) =>
			client?.uncompleteOnboardingStep(stepId) ?? Promise.resolve(null),
		[client]
	);

	const setMetadata = useCallback(
		<TStepId extends RegisteredOnboardingStepId>(
			stepId: TStepId,
			metadata: OnboardingMetadataForStep<TStepId> | null
		) =>
			client?.setOnboardingMetadata(stepId, metadata) ?? Promise.resolve(null),
		[client]
	);

	const reset = useCallback(
		() => client?.resetOnboarding() ?? Promise.resolve(null),
		[client]
	);

	return {
		...snapshot,
		isLoading,
		status,
		error,
		completeStep,
		uncompleteStep,
		setMetadata,
		reset,
		refetch,
	};
}
