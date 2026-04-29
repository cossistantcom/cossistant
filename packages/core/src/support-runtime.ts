import type { SupportOnboardingState } from "@cossistant/types/api/support";
import {
	type AnySupportConfig,
	getSupportOnboardingSteps,
	type OnboardingMetadataForStep,
	type RegisteredOnboardingStepId,
	type SupportOnboardingStepDefinition,
	type SupportOnboardingStepId,
} from "./support-config";

export type SupportOnboardingStepSnapshot<TStepId extends string = string> =
	SupportOnboardingStepDefinition<TStepId> & {
		completed: boolean;
		metadata: OnboardingMetadataForStep<TStepId> | null;
	};

export type SupportOnboardingSnapshot<TStepId extends string = string> = {
	steps: SupportOnboardingStepSnapshot<TStepId>[];
	currentStep: SupportOnboardingStepSnapshot<TStepId> | null;
	currentStepId: TStepId | null;
	isCompleted: boolean;
};

type StepIdForConfig<TSupport extends AnySupportConfig> = [
	SupportOnboardingStepId<TSupport>,
] extends [never]
	? RegisteredOnboardingStepId
	: SupportOnboardingStepId<TSupport>;

export function isSupportFeatureFlagEnabled(
	flags: readonly string[],
	flag: string
): boolean {
	return flags.includes(flag);
}

export function getSupportOnboardingSnapshot<TSupport extends AnySupportConfig>(
	support: TSupport | null | undefined,
	onboarding: SupportOnboardingState
): SupportOnboardingSnapshot<StepIdForConfig<TSupport>> {
	const configuredSteps = getSupportOnboardingSteps(support);
	const stepDefinitions =
		configuredSteps.length > 0
			? configuredSteps
			: Object.keys(onboarding.steps).map((id) => ({ id }));

	const steps = stepDefinitions.map((step) => {
		const state = onboarding.steps[step.id];

		return {
			...step,
			completed: state?.completed ?? false,
			metadata: (state?.metadata ?? null) as OnboardingMetadataForStep<
				StepIdForConfig<TSupport>
			> | null,
		};
	}) as SupportOnboardingStepSnapshot<StepIdForConfig<TSupport>>[];

	const currentStep = steps.find((step) => !step.completed) ?? null;

	return {
		steps,
		currentStep,
		currentStepId: currentStep?.id ?? null,
		isCompleted: steps.length > 0 && currentStep === null,
	};
}
