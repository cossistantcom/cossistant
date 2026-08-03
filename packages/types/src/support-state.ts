import type {
	SupportOnboardingState,
	SupportOnboardingStepState,
	SupportOnboardingUpdateRequest,
} from "./api/support";

export const EMPTY_SUPPORT_ONBOARDING_STATE: SupportOnboardingState = {
	steps: {},
};

export function normalizeSupportFeatureFlags(
	flags: readonly string[]
): string[] {
	return Array.from(
		new Set(
			flags
				.map((flag) => flag.trim())
				.filter((flag) => flag.length > 0 && !flag.includes(","))
		)
	).sort();
}

export function normalizeSupportOnboardingState(
	onboarding: SupportOnboardingState | null | undefined
): SupportOnboardingState {
	if (!onboarding?.steps || typeof onboarding.steps !== "object") {
		return { steps: {} };
	}

	const steps: Record<string, SupportOnboardingStepState> = {};

	for (const [stepId, step] of Object.entries(onboarding.steps)) {
		if (!step || typeof step !== "object") {
			continue;
		}

		steps[stepId] = {
			completed: Boolean(step.completed),
			metadata:
				step.metadata &&
				typeof step.metadata === "object" &&
				!Array.isArray(step.metadata)
					? step.metadata
					: null,
		};
	}

	return { steps };
}

export function applySupportOnboardingUpdate(
	current: SupportOnboardingState,
	update: SupportOnboardingUpdateRequest
): SupportOnboardingState {
	if (update.reset === true) {
		return EMPTY_SUPPORT_ONBOARDING_STATE;
	}

	if (!update.stepId) {
		return current;
	}

	const existing = current.steps[update.stepId] ?? {
		completed: false,
		metadata: null,
	};

	return {
		steps: {
			...current.steps,
			[update.stepId]: {
				completed: update.completed ?? existing.completed,
				metadata:
					"metadata" in update ? (update.metadata ?? null) : existing.metadata,
			},
		},
	};
}
