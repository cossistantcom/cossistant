import { z } from "@hono/zod-openapi";
import { apiTimestampSchema } from "./common";

const idSchema = z.string().min(1).max(128);

export const uploadOrganizationIdSchema = idSchema.openapi({
	description: "Identifier of the organization that owns the uploaded file.",
	example: "org_01HZYFG9W5V6YB5R6T6V7N9M2Q",
});

export const uploadWebsiteIdSchema = idSchema.openapi({
	description: "Identifier of the website associated with the uploaded file.",
	example: "site_01HZYFH3KJ3MYHJJ3JJ6Y2RNAV",
});

export const uploadConversationIdSchema = idSchema.openapi({
	description: "Conversation identifier that will scope the uploaded asset.",
	example: "conv_01HZYFJ5P7DQ0VE8F68G5VYBAQ",
});

export const uploadUserIdSchema = idSchema.openapi({
	description: "User identifier that will scope the uploaded asset.",
	example: "user_01HZYFKJS3K0M9W6PQZ0J6G1WR",
});

export const uploadContactIdSchema = idSchema.openapi({
	description: "Contact identifier that will scope the uploaded asset.",
	example: "contact_01HZYFMN7J2J4F2SW3Q2N1H0D9",
});

export const uploadVisitorIdSchema = idSchema.openapi({
	description: "Visitor identifier that will scope the uploaded asset.",
	example: "visitor_01HZYFPQ8R2FK1D9V7ZQ6CG6TN",
});

export const uploadPathSchema = z.string().max(512).openapi({
	description:
		"Optional relative path used to group uploads inside the bucket. Nested paths are supported.",
	example: "assets/avatars",
});

export const uploadFileNameSchema = z
	.string()
	.min(1)
	.max(128)
	.regex(/^[^\\/]+$/)
	.openapi({
		description:
			"Optional file name to use for the object. Invalid characters will be sanitized on the server side.",
		example: "profile-picture.png",
	});

export const uploadFileExtensionSchema = z
	.string()
	.min(1)
	.max(16)
	.regex(/^[a-zA-Z0-9]+$/)
	.openapi({
		description:
			"Optional file extension without the leading dot. Use this when providing a custom file name without an extension.",
		example: "png",
	});

const baseScope = {
	organizationId: uploadOrganizationIdSchema,
	websiteId: uploadWebsiteIdSchema,
};

export const uploadScopeConversationSchema = z
	.object({
		...baseScope,
		type: z.literal("conversation"),
		conversationId: uploadConversationIdSchema,
	})
	.openapi({
		description:
			"Scope uploads to a specific conversation. Files will be placed under /{organizationId}/{websiteId}/{conversationId}.",
	});

export const uploadScopeUserSchema = z
	.object({
		...baseScope,
		type: z.literal("user"),
		userId: uploadUserIdSchema,
	})
	.openapi({
		description:
			"Scope uploads to a specific user. Files will be placed under /{organizationId}/{websiteId}/{userId}.",
	});

export const uploadScopeContactSchema = z
	.object({
		...baseScope,
		type: z.literal("contact"),
		contactId: uploadContactIdSchema,
	})
	.openapi({
		description:
			"Scope uploads to a specific contact. Files will be placed under /{organizationId}/{websiteId}/{contactId}.",
	});

export const uploadScopeVisitorSchema = z
	.object({
		...baseScope,
		type: z.literal("visitor"),
		visitorId: uploadVisitorIdSchema,
	})
	.openapi({
		description:
			"Scope uploads to a specific visitor. Files will be placed under /{organizationId}/{websiteId}/{visitorId}.",
	});

export const uploadScopeSchema = z
	.discriminatedUnion("type", [
		uploadScopeConversationSchema,
		uploadScopeUserSchema,
		uploadScopeContactSchema,
		uploadScopeVisitorSchema,
	])
	.openapi({
		description:
			"Defines how uploaded files should be grouped inside the S3 bucket.",
	});

export const generateUploadUrlRequestSchema = z
	.object({
		contentType: z.string().min(1).max(256).openapi({
			description: "MIME type of the file to upload.",
			example: "image/png",
		}),
		websiteId: z.string(),
		scope: uploadScopeSchema,
		path: uploadPathSchema.optional(),
		fileName: uploadFileNameSchema.optional(),
		fileExtension: uploadFileExtensionSchema.optional(),
		useCdn: z.boolean().optional().openapi({
			description:
				"Set to true to place the file under the /cdn prefix so it is cached by the CDN.",
			example: true,
		}),
		expiresInSeconds: z
			.number()
			.int()
			.min(60)
			.max(3600)
			.openapi({
				description:
					"Number of seconds before the signed URL expires. Defaults to 900 seconds (15 minutes).",
				example: 900,
			})
			.optional(),
	})
	.openapi({
		description: "Request payload to create a signed S3 upload URL.",
	});

export type GenerateUploadUrlRequest = z.infer<
	typeof generateUploadUrlRequestSchema
>;

export const generateUploadUrlResponseSchema = z
	.object({
		uploadUrl: z.url().openapi({
			description:
				"Pre-signed URL that accepts a PUT request to upload the file to S3.",
			example:
				"https://example-bucket.s3.amazonaws.com/org-id/file.png?X-Amz-Signature=...",
		}),
		key: z.string().openapi({
			description:
				"Resolved object key that can be used to reference the uploaded asset.",
			example: "01JG000000000000000000000/assets/file.png",
		}),
		bucket: z.string().openapi({
			description: "Name of the S3 bucket that will receive the upload.",
			example: "plasma-uploads",
		}),
		expiresAt: apiTimestampSchema.openapi({
			description: "ISO timestamp indicating when the signed URL will expire.",
			example: "2024-01-01T12:00:00.000Z",
		}),
		contentType: z.string().openapi({
			description: "MIME type that should be used when uploading the file.",
			example: "image/png",
		}),
		publicUrl: z.url().openapi({
			description:
				"Publicly accessible URL (or CDN URL when requested) that can be used to read the uploaded file.",
			example: "https://cdn.example.com/org-id/file.png",
		}),
	})
	.openapi({
		description: "Response payload containing the signed upload URL.",
	});

export type GenerateUploadUrlResponse = z.infer<
	typeof generateUploadUrlResponseSchema
>;
