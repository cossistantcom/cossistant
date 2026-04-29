export type SupportJsonPrimitive = string | number | boolean | null;
export type SupportJsonValue =
	| SupportJsonPrimitive
	| SupportJsonObject
	| SupportJsonValue[];
export type SupportJsonObject = {
	[key: string]: SupportJsonValue;
};

export type SupportOnboardingStepDefinition<TId extends string = string> = {
	id: TId;
	isFirst?: boolean;
	isLast?: boolean;
};

export type SupportOnboardingConfig<
	TSteps extends
		readonly SupportOnboardingStepDefinition[] = readonly SupportOnboardingStepDefinition[],
> = {
	steps: TSteps;
};

export type SupportConfigDefinition<
	TFeatureFlags extends readonly string[] = readonly string[],
	TSteps extends
		readonly SupportOnboardingStepDefinition[] = readonly SupportOnboardingStepDefinition[],
> = {
	featureFlags?: TFeatureFlags;
	onboarding?: SupportOnboardingConfig<TSteps>;
};

export type AnySupportConfig = SupportConfigDefinition;

export function createSupport<const TConfig extends AnySupportConfig>(
	config: TConfig
): TConfig {
	validateFeatureFlags(config.featureFlags ?? []);
	validateOnboarding(config.onboarding?.steps ?? null);
	return config;
}

export type SupportFeatureFlagName<TSupport extends AnySupportConfig> =
	TSupport extends { featureFlags: infer TFlags extends readonly string[] }
		? TFlags[number]
		: string;

export type SupportOnboardingStepId<TSupport extends AnySupportConfig> =
	TSupport extends {
		onboarding: { steps: infer TSteps extends readonly { id: string }[] };
	}
		? TSteps[number]["id"]
		: never;

export type SupportOnboardingMetadata<
	TSupport extends AnySupportConfig,
	TMetadata extends {
		[K in keyof TMetadata]: K extends SupportOnboardingStepId<TSupport>
			? SupportJsonObject
			: never;
	},
> = TMetadata;

// biome-ignore lint/nursery/useConsistentTypeDefinitions: interface required for module augmentation.
// biome-ignore lint/suspicious/noEmptyInterface: empty register is extended by users in support.ts.
export interface SupportRegister {}

export type RegisteredSupportConfig = SupportRegister extends {
	config: infer TConfig extends AnySupportConfig;
}
	? TConfig
	: AnySupportConfig;

export type RegisteredFeatureFlagName =
	SupportFeatureFlagName<RegisteredSupportConfig>;

type RegisteredStepIdFromConfig =
	SupportOnboardingStepId<RegisteredSupportConfig>;

export type RegisteredOnboardingStepId = [RegisteredStepIdFromConfig] extends [
	never,
]
	? string
	: RegisteredStepIdFromConfig;

export type RegisteredOnboardingMetadata = SupportRegister extends {
	onboardingMetadata: infer TMetadata extends Record<string, SupportJsonObject>;
}
	? TMetadata
	: Record<string, SupportJsonObject>;

export type OnboardingMetadataForStep<TStepId extends string> =
	TStepId extends keyof RegisteredOnboardingMetadata
		? RegisteredOnboardingMetadata[TStepId]
		: SupportJsonObject;

export function getSupportFeatureFlags(
	support: AnySupportConfig | null | undefined
): readonly string[] {
	return support?.featureFlags ?? [];
}

export function getSupportOnboardingSteps(
	support: AnySupportConfig | null | undefined
): readonly SupportOnboardingStepDefinition[] {
	return support?.onboarding?.steps ?? [];
}

function validateFeatureFlags(flags: readonly string[]): void {
	const seen = new Set<string>();

	for (const flag of flags) {
		if (!flag.trim()) {
			throw new Error("Feature flag names must be non-empty strings.");
		}

		if (flag.includes(",")) {
			throw new Error(`Feature flag "${flag}" cannot contain commas.`);
		}

		if (seen.has(flag)) {
			throw new Error(`Feature flag "${flag}" is defined more than once.`);
		}

		seen.add(flag);
	}
}

function validateOnboarding(
	steps: readonly SupportOnboardingStepDefinition[] | null
): void {
	if (!steps) {
		return;
	}

	if (steps.length < 2) {
		throw new Error(
			"Onboarding config requires at least two steps: one first step and one last step."
		);
	}

	const seen = new Set<string>();
	const firstSteps = steps.filter((step) => step.isFirst === true);
	const lastSteps = steps.filter((step) => step.isLast === true);

	for (const step of steps) {
		if (!step.id.trim()) {
			throw new Error("Onboarding step IDs must be non-empty strings.");
		}

		if (seen.has(step.id)) {
			throw new Error(
				`Onboarding step "${step.id}" is defined more than once.`
			);
		}

		seen.add(step.id);
	}

	if (firstSteps.length !== 1) {
		throw new Error("Onboarding config requires exactly one isFirst step.");
	}

	if (lastSteps.length !== 1) {
		throw new Error("Onboarding config requires exactly one isLast step.");
	}

	if (firstSteps[0]?.id === lastSteps[0]?.id) {
		throw new Error("Onboarding first and last steps must be different steps.");
	}
}
