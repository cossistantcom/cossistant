import { z } from "@hono/zod-openapi";
import { apiTimestampSchema, nullableApiTimestampSchema } from "./common";

/**
 * Visitor data update request schema
 */
export const userResponseSchema = z.object({
	id: z.ulid().openapi({
		description: "The user's unique identifier.",
		example: "01JG000000000000000000000",
	}),
	name: z.string().nullable().openapi({
		description: "The user's name.",
		example: "John Doe",
	}),
	email: z.email().openapi({
		description: "The user's email address.",
		example: "john.doe@example.com",
	}),
	role: z.string().nullable().openapi({
		description: "The user's role.",
		example: "admin",
	}),
	image: z.url().nullable().openapi({
		description: "The user's image URL.",
		example: "https://example.com/image.png",
	}),
	createdAt: apiTimestampSchema.openapi({
		description: "The user's creation date.",
		example: "2021-01-01T00:00:00.000Z",
	}),
	updatedAt: apiTimestampSchema.openapi({
		description: "The user's last update date.",
		example: "2021-01-01T00:00:00.000Z",
	}),
	lastSeenAt: nullableApiTimestampSchema.openapi({
		description: "The user's last seen date.",
		example: "2021-01-01T00:00:00.000Z",
	}),
});

export const updateUserProfileRequestSchema = z
	.object({
		userId: z.ulid({ message: "Missing user identifier." }).openapi({
			description: "The identifier of the user that should be updated.",
			example: "01JG000000000000000000000",
		}),
		name: z
			.string({ message: "Enter your name." })
			.trim()
			.min(1, { message: "Enter your name." })
			.max(120, {
				message: "Name must be 120 characters or fewer.",
			}),
		image: z
			.string()
			.url({ message: "Provide a valid image URL." })
			.nullable()
			.optional(),
	})
	.openapi({
		description: "Payload used to update the current user's profile details.",
	});

export type UserResponse = z.infer<typeof userResponseSchema>;
export type UpdateUserProfileRequest = z.infer<
	typeof updateUserProfileRequestSchema
>;
