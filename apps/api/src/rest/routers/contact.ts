import {
	type ContactOrganizationRecord,
	createContact,
	createContactOrganization,
	deleteContact,
	deleteContactOrganization,
	findContactForWebsite,
	findContactOrganizationForWebsite,
	identifyContact,
	linkVisitorToContact,
	mergeContactMetadata,
	updateContact,
	updateContactOrganization,
	upsertContactByExternalId,
} from "@api/db/queries/contact";
import {
	findVisitorForWebsite,
	getCompleteVisitorWithContact,
} from "@api/db/queries/visitor";
import { realtime } from "@api/realtime/emitter";
import {
	type CompleteVisitorRecord,
	formatContactResponse,
	formatVisitorWithContactResponse,
} from "@api/utils/format-visitor";
import {
	safelyExtractRequestData,
	validateResponse,
} from "@api/utils/validate";
import {
	type ContactOrganizationResponse,
	contactOrganizationResponseSchema,
	contactResponseSchema,
	createContactOrganizationRequestSchema,
	createContactRequestSchema,
	type IdentifyContactResponse,
	identifyContactRequestSchema,
	identifyContactResponseSchema,
	updateContactMetadataRequestSchema,
	updateContactOrganizationRequestSchema,
	updateContactRequestSchema,
} from "@plasma/types";
import { OpenAPIHono, z } from "@hono/zod-openapi";
import { protectedPublicApiKeyMiddleware } from "../middleware";
import type { RestContext } from "../types";

export const contactRouter = new OpenAPIHono<RestContext>();

// Apply middleware to all routes in this router
contactRouter.use("/*", ...protectedPublicApiKeyMiddleware);

function formatContactOrganizationResponse(
	record: ContactOrganizationRecord
): ContactOrganizationResponse {
	return {
		id: record.id,
		name: record.name,
		externalId: record.externalId,
		domain: record.domain,
		description: record.description,
		metadata: (record.metadata ??
			null) as ContactOrganizationResponse["metadata"],
		websiteId: record.websiteId,
		organizationId: record.organizationId,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	};
}

export function normalizeIdentifyContactIdentifiers(params: {
	externalId?: string;
	email?: string;
}) {
	const normalizedExternalId = params.externalId?.trim() || undefined;
	const normalizedEmail = params.email?.trim() || undefined;

	return {
		externalId: normalizedExternalId,
		email: normalizedEmail,
	};
}

// POST /contacts/identify - Identify a visitor and create/update their contact
contactRouter.openapi(
	{
		method: "post",
		path: "/identify",
		summary: "Identify a visitor",
		description:
			"Creates or updates a contact for a visitor. If a contact with the same externalId or email exists, it will be updated. The visitor will be linked to the contact.",
		request: {
			body: {
				content: {
					"application/json": {
						schema: identifyContactRequestSchema,
					},
				},
			},
		},
		responses: {
			200: {
				content: {
					"application/json": {
						schema: identifyContactResponseSchema,
					},
				},
				description: "Contact identified successfully",
			},
			400: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Invalid request data",
			},
			401: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Unauthorized - Invalid API key",
			},
			404: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Visitor not found",
			},
			500: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Internal server error",
			},
		},
		security: [
			{
				"Public API Key": [],
			},
		],
	},
	async (c) => {
		try {
			const { db, website, body } = await safelyExtractRequestData(
				c,
				identifyContactRequestSchema
			);

			if (!website?.id) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "Invalid API key" },
					401
				);
			}

			if (!website.organizationId) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "Invalid API key" },
					401
				);
			}

			const { externalId, email } = normalizeIdentifyContactIdentifiers({
				externalId: body.externalId,
				email: body.email,
			});

			if (!(externalId || email)) {
				return c.json(
					{
						error: "BAD_REQUEST",
						message: "Either externalId or email is required",
					},
					400
				);
			}

			// Verify visitor exists
			const visitor = await findVisitorForWebsite(db, {
				visitorId: body.visitorId,
				websiteId: website.id,
			});

			if (!visitor) {
				return c.json(
					{ error: "NOT_FOUND", message: "Visitor not found" },
					404
				);
			}

			// Create or update contact
			const contact = await identifyContact(db, {
				websiteId: website.id,
				organizationId: website.organizationId,
				externalId,
				email,
				name: body.name,
				image: body.image,
				metadata: body.metadata,
				contactOrganizationId: body.contactOrganizationId,
			});

			// Link visitor to contact
			await linkVisitorToContact(db, {
				visitorId: body.visitorId,
				contactId: contact.id,
				websiteId: website.id,
			});

			const visitorRecord = await getCompleteVisitorWithContact(db, {
				visitorId: body.visitorId,
			});

			if (visitorRecord) {
				try {
					await realtime.emit("visitorIdentified", {
						websiteId: website.id,
						organizationId: website.organizationId,
						visitorId: visitorRecord.id,
						userId: null,
						visitor: formatVisitorWithContactResponse(
							visitorRecord as CompleteVisitorRecord
						),
					});
				} catch (emitError) {
					console.error("Failed to emit visitorIdentified event:", emitError);
				}
			}

			const response: IdentifyContactResponse = {
				contact: formatContactResponse(contact),
				visitorId: body.visitorId,
			};

			return c.json(
				validateResponse(response, identifyContactResponseSchema),
				200
			);
		} catch (error) {
			console.error("Error identifying contact:", error);
			return c.json(
				{
					error: "INTERNAL_SERVER_ERROR",
					message: "Failed to identify contact",
				},
				500
			);
		}
	}
);

// POST /contacts - Create a new contact
contactRouter.openapi(
	{
		method: "post",
		path: "/",
		summary: "Create a contact",
		description:
			"Creates a new contact for the website. If externalId is provided and already exists for the website, the contact is updated and returned.",
		request: {
			body: {
				content: {
					"application/json": {
						schema: createContactRequestSchema,
					},
				},
			},
		},
		responses: {
			200: {
				content: {
					"application/json": {
						schema: contactResponseSchema,
					},
				},
				description: "Contact updated successfully via externalId upsert",
			},
			201: {
				content: {
					"application/json": {
						schema: contactResponseSchema,
					},
				},
				description: "Contact created successfully",
			},
			400: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Invalid request data",
			},
			401: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Unauthorized - Invalid API key",
			},
			500: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Internal server error",
			},
		},
		security: [
			{
				"Public API Key": [],
			},
		],
	},
	async (c) => {
		try {
			const { db, website, body } = await safelyExtractRequestData(
				c,
				createContactRequestSchema
			);

			if (!website?.id) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "Invalid API key" },
					401
				);
			}

			if (!website.organizationId) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "Invalid API key" },
					401
				);
			}

			const { externalId } = normalizeIdentifyContactIdentifiers({
				externalId: body.externalId,
			});

			if (externalId) {
				const upsertResult = await upsertContactByExternalId(db, {
					websiteId: website.id,
					organizationId: website.organizationId,
					externalId,
					email: body.email,
					name: body.name,
					image: body.image,
					metadata: body.metadata,
					contactOrganizationId: body.contactOrganizationId,
				});

				const response = formatContactResponse(upsertResult.contact);
				const statusCode = upsertResult.status === "created" ? 201 : 200;

				return c.json(
					validateResponse(response, contactResponseSchema),
					statusCode
				);
			}

			const newContact = await createContact(db, {
				websiteId: website.id,
				organizationId: website.organizationId,
				data: {
					...body,
					externalId,
				},
			});

			const response = formatContactResponse(newContact);

			return c.json(validateResponse(response, contactResponseSchema), 201);
		} catch (error) {
			console.error("Error creating contact:", error);
			return c.json(
				{
					error: "INTERNAL_SERVER_ERROR",
					message: "Failed to create contact",
				},
				500
			);
		}
	}
);

// GET /contacts/:id - Get contact by ID
contactRouter.openapi(
	{
		method: "get",
		path: "/:id",
		summary: "Get a contact",
		description: "Retrieves a contact by ID",
		inputSchema: [
			{
				name: "id",
				in: "path",
				required: true,
				description: "The contact ID",
				schema: {
					type: "string",
				},
			},
		],
		responses: {
			200: {
				content: {
					"application/json": {
						schema: contactResponseSchema,
					},
				},
				description: "Contact retrieved successfully",
			},
			401: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Unauthorized - Invalid API key",
			},
			404: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Contact not found",
			},
			500: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Internal server error",
			},
		},
		security: [
			{
				"Public API Key": [],
			},
		],
	},
	async (c) => {
		try {
			const { db, website } = await safelyExtractRequestData(c);
			const contactId = c.req.param("id");

			if (!contactId) {
				return c.json(
					{ error: "NOT_FOUND", message: "Contact not found" },
					404
				);
			}

			if (!website?.id) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "Invalid API key" },
					401
				);
			}

			const contact = await findContactForWebsite(db, {
				contactId,
				websiteId: website.id,
			});

			if (!contact) {
				return c.json(
					{ error: "NOT_FOUND", message: "Contact not found" },
					404
				);
			}

			const response = formatContactResponse(contact);

			return c.json(validateResponse(response, contactResponseSchema), 200);
		} catch (error) {
			console.error("Error fetching contact:", error);
			return c.json(
				{
					error: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch contact",
				},
				500
			);
		}
	}
);

// PATCH /contacts/:id - Update contact
contactRouter.openapi(
	{
		method: "patch",
		path: "/:id",
		summary: "Update a contact",
		description: "Updates an existing contact",
		inputSchema: [
			{
				name: "id",
				in: "path",
				required: true,
				description: "The contact ID",
				schema: {
					type: "string",
				},
			},
		],
		request: {
			body: {
				content: {
					"application/json": {
						schema: updateContactRequestSchema,
					},
				},
			},
		},
		responses: {
			200: {
				content: {
					"application/json": {
						schema: contactResponseSchema,
					},
				},
				description: "Contact updated successfully",
			},
			400: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Invalid request data",
			},
			401: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Unauthorized - Invalid API key",
			},
			404: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Contact not found",
			},
			500: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Internal server error",
			},
		},
		security: [
			{
				"Public API Key": [],
			},
		],
	},
	async (c) => {
		try {
			const { db, website, body } = await safelyExtractRequestData(
				c,
				updateContactRequestSchema
			);
			const contactId = c.req.param("id");

			if (!contactId) {
				return c.json(
					{ error: "NOT_FOUND", message: "Contact not found" },
					404
				);
			}

			if (!website?.id) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "Invalid API key" },
					401
				);
			}

			const updatedContact = await updateContact(db, {
				contactId,
				websiteId: website.id,
				data: body,
			});

			if (!updatedContact) {
				return c.json(
					{ error: "NOT_FOUND", message: "Contact not found" },
					404
				);
			}

			const response = formatContactResponse(updatedContact);

			return c.json(validateResponse(response, contactResponseSchema), 200);
		} catch (error) {
			console.error("Error updating contact:", error);
			return c.json(
				{
					error: "INTERNAL_SERVER_ERROR",
					message: "Failed to update contact",
				},
				500
			);
		}
	}
);

// PATCH /contacts/:id/metadata - Update contact metadata
contactRouter.openapi(
	{
		method: "patch",
		path: "/:id/metadata",
		summary: "Update contact metadata",
		description: "Merges the provided metadata into the contact profile",
		inputSchema: [
			{
				name: "id",
				in: "path",
				required: true,
				description: "The contact ID",
				schema: {
					type: "string",
				},
			},
		],
		request: {
			body: {
				content: {
					"application/json": {
						schema: updateContactMetadataRequestSchema,
					},
				},
			},
		},
		responses: {
			200: {
				content: {
					"application/json": {
						schema: contactResponseSchema,
					},
				},
				description: "Contact metadata updated successfully",
			},
			400: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Invalid request data",
			},
			401: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Unauthorized - Invalid API key",
			},
			404: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Contact not found",
			},
			500: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Internal server error",
			},
		},
		security: [
			{
				"Public API Key": [],
			},
		],
	},
	async (c) => {
		try {
			const { db, website, body } = await safelyExtractRequestData(
				c,
				updateContactMetadataRequestSchema
			);
			const contactId = c.req.param("id");

			if (!contactId) {
				return c.json(
					{ error: "NOT_FOUND", message: "Contact not found" },
					404
				);
			}

			if (!website?.id) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "Invalid API key" },
					401
				);
			}

			const updatedContact = await mergeContactMetadata(db, {
				contactId,
				websiteId: website.id,
				metadata: body.metadata,
			});

			if (!updatedContact) {
				return c.json(
					{ error: "NOT_FOUND", message: "Contact not found" },
					404
				);
			}

			const response = formatContactResponse(updatedContact);

			return c.json(validateResponse(response, contactResponseSchema), 200);
		} catch (error) {
			console.error("Error updating contact metadata:", error);
			return c.json(
				{
					error: "INTERNAL_SERVER_ERROR",
					message: "Failed to update contact metadata",
				},
				500
			);
		}
	}
);

// DELETE /contacts/:id - Delete contact
contactRouter.openapi(
	{
		method: "delete",
		path: "/:id",
		summary: "Delete a contact",
		description: "Soft deletes a contact",
		inputSchema: [
			{
				name: "id",
				in: "path",
				required: true,
				description: "The contact ID",
				schema: {
					type: "string",
				},
			},
		],
		responses: {
			204: {
				description: "Contact deleted successfully",
			},
			401: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Unauthorized - Invalid API key",
			},
			404: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Contact not found",
			},
			500: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Internal server error",
			},
		},
		security: [
			{
				"Public API Key": [],
			},
		],
	},
	async (c) => {
		try {
			const { db, website } = await safelyExtractRequestData(c);
			const contactId = c.req.param("id");

			if (!contactId) {
				return c.json(
					{ error: "NOT_FOUND", message: "Contact not found" },
					404
				);
			}

			if (!website?.id) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "Invalid API key" },
					401
				);
			}

			const deleted = await deleteContact(db, {
				contactId,
				websiteId: website.id,
			});

			if (!deleted) {
				return c.json(
					{ error: "NOT_FOUND", message: "Contact not found" },
					404
				);
			}

			return c.body(null, 204);
		} catch (error) {
			console.error("Error deleting contact:", error);
			return c.json(
				{
					error: "INTERNAL_SERVER_ERROR",
					message: "Failed to delete contact",
				},
				500
			);
		}
	}
);

// Contact Organisation endpoints

// POST /contacts/organizations - Create a new contact organization
contactRouter.openapi(
	{
		method: "post",
		path: "/organizations",
		summary: "Create a contact organization",
		description: "Creates a new contact organization for the website",
		request: {
			body: {
				content: {
					"application/json": {
						schema: createContactOrganizationRequestSchema,
					},
				},
			},
		},
		responses: {
			201: {
				content: {
					"application/json": {
						schema: contactOrganizationResponseSchema,
					},
				},
				description: "Contact organization created successfully",
			},
			400: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Invalid request data",
			},
			401: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Unauthorized - Invalid API key",
			},
			500: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Internal server error",
			},
		},
		security: [
			{
				"Public API Key": [],
			},
		],
	},
	async (c) => {
		try {
			const { db, website, body } = await safelyExtractRequestData(
				c,
				createContactOrganizationRequestSchema
			);

			if (!website?.id) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "Invalid API key" },
					401
				);
			}

			if (!website.organizationId) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "Invalid API key" },
					401
				);
			}

			const newContactOrganization = await createContactOrganization(db, {
				websiteId: website.id,
				organizationId: website.organizationId,
				data: body,
			});

			const response = formatContactOrganizationResponse(
				newContactOrganization
			);

			return c.json(
				validateResponse(response, contactOrganizationResponseSchema),
				201
			);
		} catch (error) {
			console.error("Error creating contact organization:", error);
			return c.json(
				{
					error: "INTERNAL_SERVER_ERROR",
					message: "Failed to create contact organization",
				},
				500
			);
		}
	}
);

// GET /contacts/organizations/:id - Get contact organization by ID
contactRouter.openapi(
	{
		method: "get",
		path: "/organizations/:id",
		summary: "Get a contact organization",
		description: "Retrieves a contact organization by ID",
		inputSchema: [
			{
				name: "id",
				in: "path",
				required: true,
				description: "The contact organization ID",
				schema: {
					type: "string",
				},
			},
		],
		responses: {
			200: {
				content: {
					"application/json": {
						schema: contactOrganizationResponseSchema,
					},
				},
				description: "Contact organization retrieved successfully",
			},
			401: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Unauthorized - Invalid API key",
			},
			404: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Contact organization not found",
			},
			500: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Internal server error",
			},
		},
		security: [
			{
				"Public API Key": [],
			},
		],
	},
	async (c) => {
		try {
			const { db, website } = await safelyExtractRequestData(c);
			const contactOrganizationId = c.req.param("id");

			if (!contactOrganizationId) {
				return c.json(
					{ error: "NOT_FOUND", message: "Contact organization not found" },
					404
				);
			}

			if (!website?.id) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "Invalid API key" },
					401
				);
			}

			const contactOrganization = await findContactOrganizationForWebsite(db, {
				contactOrganizationId,
				websiteId: website.id,
			});

			if (!contactOrganization) {
				return c.json(
					{ error: "NOT_FOUND", message: "Contact organization not found" },
					404
				);
			}

			const response = formatContactOrganizationResponse(contactOrganization);

			return c.json(
				validateResponse(response, contactOrganizationResponseSchema),
				200
			);
		} catch (error) {
			console.error("Error fetching contact organization:", error);
			return c.json(
				{
					error: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch contact organization",
				},
				500
			);
		}
	}
);

// PATCH /contacts/organizations/:id - Update contact organization
contactRouter.openapi(
	{
		method: "patch",
		path: "/organizations/:id",
		summary: "Update a contact organization",
		description: "Updates an existing contact organization",
		inputSchema: [
			{
				name: "id",
				in: "path",
				required: true,
				description: "The contact organization ID",
				schema: {
					type: "string",
				},
			},
		],
		request: {
			body: {
				content: {
					"application/json": {
						schema: updateContactOrganizationRequestSchema,
					},
				},
			},
		},
		responses: {
			200: {
				content: {
					"application/json": {
						schema: contactOrganizationResponseSchema,
					},
				},
				description: "Contact organization updated successfully",
			},
			400: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Invalid request data",
			},
			401: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Unauthorized - Invalid API key",
			},
			404: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Contact organization not found",
			},
			500: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Internal server error",
			},
		},
		security: [
			{
				"Public API Key": [],
			},
		],
	},
	async (c) => {
		try {
			const { db, website, body } = await safelyExtractRequestData(
				c,
				updateContactOrganizationRequestSchema
			);
			const contactOrganizationId = c.req.param("id");

			if (!contactOrganizationId) {
				return c.json(
					{ error: "NOT_FOUND", message: "Contact organization not found" },
					404
				);
			}

			if (!website?.id) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "Invalid API key" },
					401
				);
			}

			const updatedContactOrganization = await updateContactOrganization(db, {
				contactOrganizationId,
				websiteId: website.id,
				data: body,
			});

			if (!updatedContactOrganization) {
				return c.json(
					{ error: "NOT_FOUND", message: "Contact organization not found" },
					404
				);
			}

			const response = formatContactOrganizationResponse(
				updatedContactOrganization
			);

			return c.json(
				validateResponse(response, contactOrganizationResponseSchema),
				200
			);
		} catch (error) {
			console.error("Error updating contact organization:", error);
			return c.json(
				{
					error: "INTERNAL_SERVER_ERROR",
					message: "Failed to update contact organization",
				},
				500
			);
		}
	}
);

// DELETE /contacts/organizations/:id - Delete contact organization
contactRouter.openapi(
	{
		method: "delete",
		path: "/organizations/:id",
		summary: "Delete a contact organization",
		description: "Soft deletes a contact organization",
		inputSchema: [
			{
				name: "id",
				in: "path",
				required: true,
				description: "The contact organization ID",
				schema: {
					type: "string",
				},
			},
		],
		responses: {
			204: {
				description: "Contact organization deleted successfully",
			},
			401: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Unauthorized - Invalid API key",
			},
			404: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Contact organization not found",
			},
			500: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Internal server error",
			},
		},
		security: [
			{
				"Public API Key": [],
			},
		],
	},
	async (c) => {
		try {
			const { db, website } = await safelyExtractRequestData(c);
			const contactOrganizationId = c.req.param("id");

			if (!contactOrganizationId) {
				return c.json(
					{ error: "NOT_FOUND", message: "Contact organization not found" },
					404
				);
			}

			if (!website?.id) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "Invalid API key" },
					401
				);
			}

			const deleted = await deleteContactOrganization(db, {
				contactOrganizationId,
				websiteId: website.id,
			});

			if (!deleted) {
				return c.json(
					{ error: "NOT_FOUND", message: "Contact organization not found" },
					404
				);
			}

			return c.body(null, 204);
		} catch (error) {
			console.error("Error deleting contact organization:", error);
			return c.json(
				{
					error: "INTERNAL_SERVER_ERROR",
					message: "Failed to delete contact organization",
				},
				500
			);
		}
	}
);
