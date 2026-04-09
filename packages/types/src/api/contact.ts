import { z } from "@hono/zod-openapi";
import { apiTimestampSchema, nullableApiTimestampSchema } from "./common";

/**
 * Contact metadata are stored as key value pairs
 * Values can be strings, numbers, booleans, or null
 */
export const contactMetadataSchema = z.record(
	z.string(),
	z.string().or(z.number()).or(z.boolean()).or(z.null())
);

export type ContactMetadata = z.infer<typeof contactMetadataSchema>;

/**
 * Create contact request schema
 */
export const createContactRequestSchema = z.object({
	externalId: z
		.string()
		.openapi({
			description: "External identifier for the contact (e.g. from your CRM).",
			example: "user_12345",
		})
		.optional(),
	name: z
		.string()
		.openapi({
			description: "The contact's name.",
			example: "John Doe",
		})
		.optional(),
	email: z
		.string()
		.email()
		.openapi({
			description: "The contact's email address.",
			example: "john.doe@example.com",
		})
		.optional(),
	image: z
		.string()
		.url()
		.openapi({
			description: "The contact's avatar/image URL.",
			example: "https://example.com/avatar.png",
		})
		.optional(),
	metadata: contactMetadataSchema
		.openapi({
			description: "Additional custom metadata for the contact.",
			example: { plan: "premium", role: "admin" },
		})
		.optional(),
	contactOrganizationId: z
		.string()
		.ulid()
		.openapi({
			description: "The contact organization ID this contact belongs to.",
			example: "01JG000000000000000000000",
		})
		.optional(),
});

export type CreateContactRequest = z.infer<typeof createContactRequestSchema>;

/**
 * Update contact request schema
 */
export const updateContactRequestSchema = z.object({
	externalId: z
		.string()
		.openapi({
			description: "External identifier for the contact.",
			example: "user_12345",
		})
		.optional(),
	name: z
		.string()
		.openapi({
			description: "The contact's name.",
			example: "John Doe",
		})
		.optional(),
	email: z
		.string()
		.email()
		.openapi({
			description: "The contact's email address.",
			example: "john.doe@example.com",
		})
		.optional(),
	image: z
		.string()
		.url()
		.openapi({
			description: "The contact's avatar/image URL.",
			example: "https://example.com/avatar.png",
		})
		.optional(),
	metadata: contactMetadataSchema
		.openapi({
			description: "Additional custom metadata for the contact.",
			example: { plan: "premium", role: "admin" },
		})
		.optional(),
	contactOrganizationId: z
		.string()
		.ulid()
		.openapi({
			description: "The contact organization ID this contact belongs to.",
			example: "01JG000000000000000000000",
		})
		.optional()
		.nullable(),
});

export type UpdateContactRequest = z.infer<typeof updateContactRequestSchema>;

/**
 * Update contact metadata request schema
 */
export const updateContactMetadataRequestSchema = z.object({
	metadata: contactMetadataSchema.openapi({
		description: "Metadata payload to merge into the contact's profile.",
		example: { plan: "premium", role: "admin" },
	}),
});

export type UpdateContactMetadataRequest = z.infer<
	typeof updateContactMetadataRequestSchema
>;

/**
 * Identify contact request schema
 * This is used to create or update a contact and link it to a visitor
 */
export const identifyContactRequestSchema = z.object({
	id: z.ulid().optional().openapi({
		description:
			"Optional contact ID to update when linking the visitor to an existing contact.",
		example: "01JG000000000000000000000",
	}),
	visitorId: z.ulid().openapi({
		description: "The visitor ID to link to the contact.",
		example: "01JG000000000000000000000",
	}),
	externalId: z
		.string()
		.openapi({
			description:
				"External identifier for the contact. Used to find existing contacts.",
			example: "user_12345",
		})
		.optional(),
	name: z
		.string()
		.openapi({
			description: "The contact's name.",
			example: "John Doe",
		})
		.optional(),
	email: z
		.string()
		.email()
		.openapi({
			description:
				"The contact's email address. Used to find existing contacts.",
			example: "john.doe@example.com",
		})
		.optional(),
	image: z
		.string()
		.url()
		.openapi({
			description: "The contact's avatar/image URL.",
			example: "https://example.com/avatar.png",
		})
		.optional(),
	metadata: contactMetadataSchema
		.openapi({
			description: "Additional custom metadata for the contact.",
			example: { plan: "premium", role: "admin" },
		})
		.optional(),
	contactOrganizationId: z
		.string()
		.ulid()
		.openapi({
			description: "The contact organization ID this contact belongs to.",
			example: "01JG000000000000000000000",
		})
		.optional(),
});

export type IdentifyContactRequest = z.infer<
	typeof identifyContactRequestSchema
>;

/**
 * Contact response schema
 */
export const contactResponseSchema = z.object({
	id: z.ulid().openapi({
		description: "The contact's unique identifier (ULID).",
		example: "01JG000000000000000000000",
	}),
	externalId: z.string().nullable().openapi({
		description: "External identifier for the contact.",
		example: "user_12345",
	}),
	name: z.string().nullable().openapi({
		description: "The contact's name.",
		example: "John Doe",
	}),
	email: z.email().nullable().openapi({
		description: "The contact's email address.",
		example: "john.doe@example.com",
	}),
	image: z.url().nullable().openapi({
		description: "The contact's avatar/image URL.",
		example: "https://example.com/avatar.png",
	}),
	metadata: contactMetadataSchema.nullable().openapi({
		description: "Additional custom metadata for the contact.",
		example: { plan: "premium", role: "admin" },
	}),
	contactOrganizationId: z.ulid().nullable().openapi({
		description: "The contact organization ID this contact belongs to.",
		example: "01JG000000000000000000000",
	}),
	websiteId: z.ulid().openapi({
		description: "The website's unique identifier that the contact belongs to.",
		example: "01JG000000000000000000000",
	}),
	organizationId: z.ulid().openapi({
		description:
			"The organization's unique identifier that the contact belongs to.",
		example: "01JG000000000000000000000",
	}),
	userId: z.ulid().nullable().openapi({
		description: "The user ID if the contact is linked to a registered user.",
		example: "01JG000000000000000000000",
	}),
	createdAt: apiTimestampSchema.openapi({
		description: "When the contact was first created.",
		example: "2021-01-01T00:00:00.000Z",
	}),
	updatedAt: apiTimestampSchema.openapi({
		description: "When the contact record was last updated.",
		example: "2021-01-01T00:00:00.000Z",
	}),
});

export type Contact = z.infer<typeof contactResponseSchema>;
export type ContactResponse = Contact;

export const contactListSortBySchema = z.enum([
	"name",
	"email",
	"createdAt",
	"updatedAt",
	"visitorCount",
	"lastSeenAt",
]);

export const contactListSortOrderSchema = z.enum(["asc", "desc"]);

export const contactRestListVisitorStatusSchema = z.enum([
	"all",
	"withVisitors",
	"withoutVisitors",
]);

export const listContactsRequestSchema = z
	.object({
		page: z.coerce.number().int().min(1).default(1).openapi({
			description: "Page number for pagination.",
			default: 1,
		}),
		limit: z.coerce.number().int().min(1).max(100).default(20).openapi({
			description: "Maximum number of contacts to return.",
			default: 20,
		}),
		search: z.string().optional().openapi({
			description:
				"Optional case-insensitive search against contact name/email.",
			example: "alice",
		}),
		sortBy: contactListSortBySchema.optional().openapi({
			description: "Field used to sort the result set.",
			example: "updatedAt",
		}),
		sortOrder: contactListSortOrderSchema.optional().openapi({
			description: "Sort direction.",
			example: "desc",
		}),
		visitorStatus: contactRestListVisitorStatusSchema
			.optional()
			.default("all")
			.openapi({
				description:
					"Optional filter based on whether a contact has linked visitors.",
				example: "all",
				default: "all",
			}),
	})
	.openapi({
		description: "Query parameters for listing contacts.",
	});

export type ListContactsRequest = z.infer<typeof listContactsRequestSchema>;

export const contactRestListItemSchema = z
	.object({
		id: z.ulid().openapi({
			description: "The contact's unique identifier.",
			example: "01JG000000000000000000000",
		}),
		name: z.string().nullable().openapi({
			description: "The contact's name.",
			example: "Alice Doe",
		}),
		email: z.string().email().nullable().openapi({
			description: "The contact's email address.",
			example: "alice@example.com",
		}),
		image: z.string().url().nullable().openapi({
			description: "The contact's avatar URL.",
			example: "https://example.com/avatar.png",
		}),
		createdAt: apiTimestampSchema.openapi({
			description: "When the contact was created.",
			example: "2026-04-07T10:00:00.000Z",
		}),
		updatedAt: apiTimestampSchema.openapi({
			description: "When the contact was last updated.",
			example: "2026-04-07T10:00:00.000Z",
		}),
		visitorCount: z.number().int().min(0).openapi({
			description: "How many visitors are linked to this contact.",
			example: 3,
		}),
		lastSeenAt: nullableApiTimestampSchema.openapi({
			description: "The latest last-seen timestamp across linked visitors.",
			example: "2026-04-07T10:00:00.000Z",
		}),
		contactOrganizationId: z.string().nullable().openapi({
			description: "The linked contact organization identifier, if any.",
			example: "01JG000000000000000000000",
		}),
		contactOrganizationName: z.string().nullable().openapi({
			description: "The linked contact organization name, if any.",
			example: "Acme Corp",
		}),
	})
	.openapi({
		description: "Summary row returned when listing contacts.",
	});

export type RestContactListItem = z.infer<typeof contactRestListItemSchema>;

export const listContactsRestResponseSchema = z
	.object({
		items: z.array(contactRestListItemSchema).openapi({
			description: "Paginated contact results.",
		}),
		page: z.number().int().min(1).openapi({
			description: "Current page number.",
			example: 1,
		}),
		pageSize: z.number().int().min(1).openapi({
			description: "Number of items returned per page.",
			example: 20,
		}),
		totalCount: z.number().int().min(0).openapi({
			description: "Total number of matching contacts.",
			example: 120,
		}),
	})
	.openapi({
		description: "Paginated list of contacts for a website.",
	});

export type ListContactsRestResponse = z.infer<
	typeof listContactsRestResponseSchema
>;

/**
 * Identify contact response schema
 */
export const identifyContactResponseSchema = z.object({
	contact: contactResponseSchema,
	visitorId: z.ulid().openapi({
		description: "The visitor ID that was linked to the contact.",
		example: "01JG000000000000000000000",
	}),
});

export type IdentifyContactResponse = z.infer<
	typeof identifyContactResponseSchema
>;

// Contact Organisation Schemas

/**
 * Create contact organization request schema
 */
export const createContactOrganizationRequestSchema = z.object({
	name: z.string().openapi({
		description: "The organization name.",
		example: "Acme Corporation",
	}),
	externalId: z
		.string()
		.openapi({
			description:
				"External identifier for the organization (e.g. from your CRM).",
			example: "org_12345",
		})
		.optional(),
	domain: z
		.string()
		.openapi({
			description: "The organization's domain.",
			example: "acme.com",
		})
		.optional(),
	description: z
		.string()
		.openapi({
			description: "Description of the organization.",
			example: "A leading provider of enterprise solutions",
		})
		.optional(),
	metadata: contactMetadataSchema
		.openapi({
			description: "Additional custom metadata for the organization.",
			example: { industry: "technology", employees: 500 },
		})
		.optional(),
});

export type CreateContactOrganizationRequest = z.infer<
	typeof createContactOrganizationRequestSchema
>;

/**
 * Update contact organization request schema
 */
export const updateContactOrganizationRequestSchema = z.object({
	name: z
		.string()
		.openapi({
			description: "The organization name.",
			example: "Acme Corporation",
		})
		.optional(),
	externalId: z
		.string()
		.openapi({
			description: "External identifier for the organization.",
			example: "org_12345",
		})
		.optional(),
	domain: z
		.string()
		.openapi({
			description: "The organization's domain.",
			example: "acme.com",
		})
		.optional(),
	description: z
		.string()
		.openapi({
			description: "Description of the organization.",
			example: "A leading provider of enterprise solutions",
		})
		.optional(),
	metadata: contactMetadataSchema
		.openapi({
			description: "Additional custom metadata for the organization.",
			example: { industry: "technology", employees: 500 },
		})
		.optional(),
});

export type UpdateContactOrganizationRequest = z.infer<
	typeof updateContactOrganizationRequestSchema
>;

/**
 * Contact organization response schema
 */
export const contactOrganizationResponseSchema = z.object({
	id: z.ulid().openapi({
		description: "The organization's unique identifier (ULID).",
		example: "01JG000000000000000000000",
	}),
	name: z.string().openapi({
		description: "The organization name.",
		example: "Acme Corporation",
	}),
	externalId: z.string().nullable().openapi({
		description: "External identifier for the organization.",
		example: "org_12345",
	}),
	domain: z.string().nullable().openapi({
		description: "The organization's domain.",
		example: "acme.com",
	}),
	description: z.string().nullable().openapi({
		description: "Description of the organization.",
		example: "A leading provider of enterprise solutions",
	}),
	metadata: contactMetadataSchema.nullable().openapi({
		description: "Additional custom metadata for the organization.",
		example: { industry: "technology", employees: 500 },
	}),
	websiteId: z.ulid().openapi({
		description:
			"The website's unique identifier that the organization belongs to.",
		example: "01JG000000000000000000000",
	}),
	organizationId: z.ulid().openapi({
		description:
			"The organization's unique identifier that the organization belongs to.",
		example: "01JG000000000000000000000",
	}),
	createdAt: apiTimestampSchema.openapi({
		description: "When the organization was first created.",
		example: "2021-01-01T00:00:00.000Z",
	}),
	updatedAt: apiTimestampSchema.openapi({
		description: "When the organization record was last updated.",
		example: "2021-01-01T00:00:00.000Z",
	}),
});

export type contactOrganization = z.infer<
	typeof contactOrganizationResponseSchema
>;
export type ContactOrganizationResponse = contactOrganization;
