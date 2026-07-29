import {
	contactOrganizationResponseSchema,
	contactResponseSchema,
	createContactOrganizationRequestSchema,
	createContactRequestSchema,
	identifyContactRequestSchema,
	identifyContactResponseSchema,
	listContactsRequestSchema,
	listContactsRestResponseSchema,
	updateContactMetadataRequestSchema,
	updateContactOrganizationRequestSchema,
	updateContactRequestSchema,
} from "@cossistant/types";
import { createRoute } from "@hono/zod-openapi";
import { privateControlAuth, runtimeDualAuth } from "../auth";
import { errorJsonResponse } from "../errors";

export const contactIdPathParameter = {
	name: "id",
	in: "path",
	required: true,
	description: "The contact ID",
	schema: { type: "string" },
} as const;

export const contactOrganizationIdPathParameter = {
	name: "id",
	in: "path",
	required: true,
	description: "The contact organization ID",
	schema: { type: "string" },
} as const;

export const identifyContactRoute = createRoute({
	method: "post",
	path: "/identify",
	summary: "Identify a visitor",
	description:
		"Creates or updates a contact for a visitor. If a contact with the same externalId or email exists, it will be updated. The visitor will be linked to the contact. Public callers may pass the visitor ID in the request body or via X-Visitor-Id; when both are provided they must match.",
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
		400: errorJsonResponse("Invalid request data"),
		401: errorJsonResponse("Unauthorized - Invalid API key"),
		404: errorJsonResponse("Visitor not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...runtimeDualAuth({ includeVisitorIdHeader: true }),
});

export const listContactsRoute = createRoute({
	method: "get",
	path: "/",
	summary: "List contacts",
	description:
		"Returns a paginated list of contacts for the authenticated website.",
	request: {
		query: listContactsRequestSchema,
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: listContactsRestResponseSchema,
				},
			},
			description: "Contact list retrieved successfully",
		},
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse("Forbidden - Private API key required"),
		500: errorJsonResponse("Internal server error"),
	},
	...privateControlAuth(),
});

export const createContactRoute = createRoute({
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
		400: errorJsonResponse("Invalid request data"),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse("Forbidden - Private API key required"),
		500: errorJsonResponse("Internal server error"),
	},
	...privateControlAuth(),
});

export const getContactRoute = createRoute({
	method: "get",
	path: "/{id}",
	summary: "Get a contact",
	description: "Retrieves a contact by ID.",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: contactResponseSchema,
				},
			},
			description: "Contact retrieved successfully",
		},
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse("Forbidden - Private API key required"),
		404: errorJsonResponse("Contact not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...privateControlAuth({ parameters: [contactIdPathParameter] }),
});

export const updateContactRoute = createRoute({
	method: "patch",
	path: "/{id}",
	summary: "Update a contact",
	description: "Updates an existing contact.",
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
		400: errorJsonResponse("Invalid request data"),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse("Forbidden - Private API key required"),
		404: errorJsonResponse("Contact not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...privateControlAuth({ parameters: [contactIdPathParameter] }),
});

export const updateContactMetadataRoute = createRoute({
	method: "patch",
	path: "/{id}/metadata",
	summary: "Update contact metadata",
	description: "Merges the provided metadata into the contact profile.",
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
		400: errorJsonResponse("Invalid request data"),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse("Forbidden - Private API key required"),
		404: errorJsonResponse("Contact not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...privateControlAuth({ parameters: [contactIdPathParameter] }),
});

export const deleteContactRoute = createRoute({
	method: "delete",
	path: "/{id}",
	summary: "Delete a contact",
	description: "Soft deletes a contact.",
	responses: {
		204: {
			description: "Contact deleted successfully",
		},
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse("Forbidden - Private API key required"),
		404: errorJsonResponse("Contact not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...privateControlAuth({ parameters: [contactIdPathParameter] }),
});

export const createContactOrganizationRoute = createRoute({
	method: "post",
	path: "/organizations",
	summary: "Create a contact organization",
	description: "Creates a new contact organization for the website.",
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
		400: errorJsonResponse("Invalid request data"),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse("Forbidden - Private API key required"),
		500: errorJsonResponse("Internal server error"),
	},
	...privateControlAuth(),
});

export const getContactOrganizationRoute = createRoute({
	method: "get",
	path: "/organizations/{id}",
	summary: "Get a contact organization",
	description: "Retrieves a contact organization by ID.",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: contactOrganizationResponseSchema,
				},
			},
			description: "Contact organization retrieved successfully",
		},
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse("Forbidden - Private API key required"),
		404: errorJsonResponse("Contact organization not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...privateControlAuth({ parameters: [contactOrganizationIdPathParameter] }),
});

export const updateContactOrganizationRoute = createRoute({
	method: "patch",
	path: "/organizations/{id}",
	summary: "Update a contact organization",
	description: "Updates an existing contact organization.",
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
		400: errorJsonResponse("Invalid request data"),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse("Forbidden - Private API key required"),
		404: errorJsonResponse("Contact organization not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...privateControlAuth({ parameters: [contactOrganizationIdPathParameter] }),
});

export const deleteContactOrganizationRoute = createRoute({
	method: "delete",
	path: "/organizations/{id}",
	summary: "Delete a contact organization",
	description: "Soft deletes a contact organization.",
	responses: {
		204: {
			description: "Contact organization deleted successfully",
		},
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse("Forbidden - Private API key required"),
		404: errorJsonResponse("Contact organization not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...privateControlAuth({ parameters: [contactOrganizationIdPathParameter] }),
});

/**
 * Public-key runtime routes (`contactRuntimeRouter` in apps/api).
 *
 * Mounted first so POST /contacts/identify is not swallowed by the private
 * middleware on the control router.
 */
export const CONTACT_RUNTIME_ROUTES = [identifyContactRoute] as const;

/** Private-key control routes (`contactControlRouter` in apps/api). */
export const CONTACT_CONTROL_ROUTES = [
	listContactsRoute,
	createContactRoute,
	getContactRoute,
	updateContactRoute,
	updateContactMetadataRoute,
	deleteContactRoute,
	createContactOrganizationRoute,
	getContactOrganizationRoute,
	updateContactOrganizationRoute,
	deleteContactOrganizationRoute,
] as const;
