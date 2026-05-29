import { z } from "@hono/zod-openapi";

/**
 * Organization API response schema
 */
export const organizationResponseSchema = z.object({
	id: z.ulid().openapi({
		description: "The organization's unique identifier.",
		example: "01JG000000000000000000000",
	}),
	name: z.string().openapi({
		description: "The organization's name.",
		example: "Acme Corp",
	}),
});

export type OrganizationResponse = z.infer<typeof organizationResponseSchema>;

export const organizationSettingsResponseSchema = z.object({
	id: z.ulid().openapi({
		description: "The organization's unique identifier.",
		example: "01JG000000000000000000000",
	}),
	name: z.string().openapi({
		description: "The organization's name.",
		example: "Acme Corp",
	}),
	slug: z.string().openapi({
		description: "The organization's slug.",
		example: "acme",
	}),
	timezone: z.string().min(1).max(100).openapi({
		description: "The IANA timezone used for organization scheduling.",
		example: "Europe/Paris",
	}),
	weeklyDigestEnabled: z.boolean().openapi({
		description: "Whether the organization receives weekly digest emails.",
		example: true,
	}),
});

export const updateOrganizationSettingsRequestSchema = z.object({
	organizationId: z.ulid().openapi({
		description: "The organization's unique identifier.",
		example: "01JG000000000000000000000",
	}),
	timezone: z.string().min(1).max(100).openapi({
		description: "The IANA timezone used for organization scheduling.",
		example: "Europe/Paris",
	}),
	weeklyDigestEnabled: z.boolean().openapi({
		description: "Whether the organization receives weekly digest emails.",
		example: true,
	}),
});

export type OrganizationSettingsResponse = z.infer<
	typeof organizationSettingsResponseSchema
>;
export type UpdateOrganizationSettingsRequest = z.infer<
	typeof updateOrganizationSettingsRequestSchema
>;
