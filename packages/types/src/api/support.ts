import { z } from "@hono/zod-openapi";

const supportMetadataSchema = z.record(z.string(), z.unknown());

export const supportFeatureFlagNameSchema = z
	.string()
	.refine((flag) => flag.trim().length > 0, {
		message: "Feature flag names must be non-empty strings.",
	})
	.refine((flag) => !flag.includes(","), {
		message: "Feature flag names cannot contain commas.",
	})
	.openapi({
		description: "Feature flag name. Commas are reserved for storage.",
		example: "new-message",
	});

export const supportOnboardingStepStateSchema = z.object({
	completed: z.boolean().openapi({
		description: "Whether the onboarding step is completed.",
		example: false,
	}),
	metadata: supportMetadataSchema.nullable().openapi({
		description: "Step-scoped onboarding metadata persisted for this user.",
		example: { invitedEmails: ["team@example.com"] },
	}),
});

export const supportOnboardingStateSchema = z.object({
	steps: z.record(z.string(), supportOnboardingStepStateSchema).openapi({
		description: "Onboarding state keyed by configured step ID.",
	}),
});

export const supportStateResponseSchema = z.object({
	featureFlags: z.array(z.string()).openapi({
		description:
			"Resolved feature flags enabled for the current visitor/contact.",
		example: ["new-message", "billing-v2"],
	}),
	onboarding: supportOnboardingStateSchema.openapi({
		description:
			"Persisted onboarding progress for the current visitor/contact.",
	}),
});

export const supportOnboardingUpdateRequestSchema = z
	.object({
		stepId: z.string().min(1).optional().openapi({
			description: "Configured onboarding step ID to update.",
			example: "invite-team",
		}),
		completed: z.boolean().optional().openapi({
			description: "Optional completed state for the step.",
			example: true,
		}),
		metadata: supportMetadataSchema
			.nullable()
			.optional()
			.openapi({
				description:
					"Optional metadata replacement for the step. null clears metadata.",
				example: { invitedEmails: ["team@example.com"] },
			}),
		reset: z.boolean().optional().openapi({
			description: "When true, clears all onboarding progress.",
			example: false,
		}),
	})
	.refine(
		(value) =>
			value.reset === true ||
			(Boolean(value.stepId) &&
				(value.completed !== undefined || value.metadata !== undefined)),
		{
			message:
				"Provide reset: true or a stepId with completed and/or metadata.",
		}
	);

export const supportFeatureFlagTargetSchema = z.object({
	type: z.enum(["visitor", "contact", "contactOrganization"]).openapi({
		description: "The entity level where feature flags should be stored.",
		example: "contact",
	}),
	id: z.string().min(1).openapi({
		description: "The target entity ID.",
		example: "01JG000000000000000000000",
	}),
});

export const supportFeatureFlagMutationRequestSchema = z.object({
	target: supportFeatureFlagTargetSchema,
	operation: z.enum(["add", "remove", "set"]).openapi({
		description: "How to apply the provided flags to the target.",
		example: "add",
	}),
	flags: z.array(supportFeatureFlagNameSchema).openapi({
		description: "Feature flag names to add, remove, or set.",
		example: ["new-message"],
	}),
});

export const supportFeatureFlagMutationResponseSchema = z.object({
	target: supportFeatureFlagTargetSchema,
	flags: z.array(z.string()).openapi({
		description: "The target entity's stored feature flags after mutation.",
		example: ["new-message"],
	}),
});

export type SupportOnboardingStepState = z.infer<
	typeof supportOnboardingStepStateSchema
>;
export type SupportOnboardingState = z.infer<
	typeof supportOnboardingStateSchema
>;
export type SupportStateResponse = z.infer<typeof supportStateResponseSchema>;
export type SupportOnboardingUpdateRequest = z.infer<
	typeof supportOnboardingUpdateRequestSchema
>;
export type SupportFeatureFlagTarget = z.infer<
	typeof supportFeatureFlagTargetSchema
>;
export type SupportFeatureFlagMutationRequest = z.infer<
	typeof supportFeatureFlagMutationRequestSchema
>;
export type SupportFeatureFlagMutationResponse = z.infer<
	typeof supportFeatureFlagMutationResponseSchema
>;

export {
	applySupportOnboardingUpdate,
	EMPTY_SUPPORT_ONBOARDING_STATE,
	normalizeSupportFeatureFlags,
	normalizeSupportOnboardingState,
} from "../support-state";
