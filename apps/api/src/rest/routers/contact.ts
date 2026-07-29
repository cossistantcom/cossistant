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
	listContacts,
	mergeContactMetadata,
	updateContact,
	updateContactOrganization,
	upsertContactByExternalId,
} from "@api/db/queries/contact";
import { copyVisitorOnboardingToContactIfEmpty } from "@api/db/queries/support";
import { getCompleteVisitorWithContact } from "@api/db/queries/visitor";
import { realtime } from "@api/realtime/emitter";
import { emitSupportStateUpdated } from "@api/realtime/support-state";
import {
	type CompleteVisitorRecord,
	formatContactResponse,
	formatVisitorWithContactResponse,
} from "@api/utils/format-visitor";
import {
	safelyExtractRequestData,
	safelyExtractRequestQuery,
	validateResponse,
} from "@api/utils/validate";
import {
	createContactOrganizationRoute,
	createContactRoute,
	deleteContactOrganizationRoute,
	deleteContactRoute,
	getContactOrganizationRoute,
	getContactRoute,
	identifyContactRoute,
	listContactsRoute,
	updateContactMetadataRoute,
	updateContactOrganizationRoute,
	updateContactRoute,
} from "@cossistant/protocol/routes";
import {
	type ContactOrganizationResponse,
	contactOrganizationResponseSchema,
	contactResponseSchema,
	contactRestListItemSchema,
	createContactOrganizationRequestSchema,
	createContactRequestSchema,
	type IdentifyContactResponse,
	identifyContactRequestSchema,
	identifyContactResponseSchema,
	listContactsRequestSchema,
	listContactsRestResponseSchema,
	type RestContactListItem,
	updateContactMetadataRequestSchema,
	updateContactOrganizationRequestSchema,
	updateContactRequestSchema,
} from "@cossistant/types";
import { OpenAPIHono } from "@hono/zod-openapi";
import {
	protectedPrivateApiKeyMiddleware,
	protectedPublicApiKeyMiddleware,
} from "../middleware";
import {
	errorJsonResponse,
	privateControlAuth,
	requirePrivateControlContext,
	runtimeDualAuth,
} from "../openapi";
import { resolveRuntimeVisitorIdentity } from "../runtime-visitor";
import type { RestContext } from "../types";

const contactRuntimeRouter = new OpenAPIHono<RestContext>();
const contactControlRouter = new OpenAPIHono<RestContext>();

contactRuntimeRouter.use("/*", ...protectedPublicApiKeyMiddleware);
contactControlRouter.use("/*", ...protectedPrivateApiKeyMiddleware);

const contactIdPathParameter = {
	name: "id",
	in: "path",
	required: true,
	description: "The contact ID",
	schema: { type: "string" },
} as const;

const contactOrganizationIdPathParameter = {
	name: "id",
	in: "path",
	required: true,
	description: "The contact organization ID",
	schema: { type: "string" },
} as const;

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

function formatContactListItem(item: RestContactListItem): RestContactListItem {
	return contactRestListItemSchema.parse(item);
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

contactRuntimeRouter.openapi(identifyContactRoute, async (c) => {
	try {
		const { db, website, body, visitorIdHeader } =
			await safelyExtractRequestData(c, identifyContactRequestSchema);

		if (!(website?.id && website.organizationId)) {
			return c.json({ error: "UNAUTHORIZED", message: "Invalid API key" }, 401);
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

		const visitorIdentity = await resolveRuntimeVisitorIdentity({
			c,
			db,
			organizationId: website.organizationId,
			websiteId: website.id,
			headerVisitorId: visitorIdHeader,
			requestVisitorId: body.visitorId,
		});

		if (visitorIdentity.error) {
			return visitorIdentity.error;
		}

		const visitor = visitorIdentity.visitor;
		if (!visitor) {
			return c.json(
				{
					error: "BAD_REQUEST",
					message: "Visitor not found, please pass a valid visitorId",
				},
				400
			);
		}

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

		await linkVisitorToContact(db, {
			visitorId: visitor.id,
			contactId: contact.id,
			websiteId: website.id,
		});

		await copyVisitorOnboardingToContactIfEmpty(db, {
			visitorId: visitor.id,
			contactId: contact.id,
			websiteId: website.id,
		});

		const visitorRecord = await getCompleteVisitorWithContact(db, {
			visitorId: visitor.id,
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

		try {
			await emitSupportStateUpdated({
				db,
				visitorId: visitor.id,
				websiteId: website.id,
				organizationId: website.organizationId,
			});
		} catch (emitError) {
			console.error("Failed to emit supportStateUpdated event:", emitError);
		}

		const response: IdentifyContactResponse = {
			contact: formatContactResponse(contact),
			visitorId: visitor.id,
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
});

contactControlRouter.openapi(listContactsRoute, async (c) => {
	try {
		const extracted = await safelyExtractRequestQuery(
			c,
			listContactsRequestSchema
		);
		const privateContext = requirePrivateControlContext(c, extracted);

		if (privateContext instanceof Response) {
			return privateContext;
		}

		const result = await listContacts(extracted.db, {
			websiteId: privateContext.website.id,
			organizationId: privateContext.organization.id,
			page: extracted.query.page,
			limit: extracted.query.limit,
			search: extracted.query.search,
			sortBy: extracted.query.sortBy,
			sortOrder: extracted.query.sortOrder,
			visitorStatus:
				extracted.query.visitorStatus === "all"
					? undefined
					: extracted.query.visitorStatus,
		});

		return c.json(
			validateResponse(
				{
					...result,
					items: result.items.map((item) =>
						formatContactListItem(item as RestContactListItem)
					),
				},
				listContactsRestResponseSchema
			),
			200
		);
	} catch (error) {
		console.error("Error listing contacts:", error);
		return c.json(
			{
				error: "INTERNAL_SERVER_ERROR",
				message: "Failed to list contacts",
			},
			500
		);
	}
});

contactControlRouter.openapi(createContactRoute, async (c) => {
	try {
		const extracted = await safelyExtractRequestData(
			c,
			createContactRequestSchema
		);
		const privateContext = requirePrivateControlContext(c, extracted);

		if (privateContext instanceof Response) {
			return privateContext;
		}

		const { externalId } = normalizeIdentifyContactIdentifiers({
			externalId: extracted.body.externalId,
		});

		if (externalId) {
			const upsertResult = await upsertContactByExternalId(extracted.db, {
				websiteId: privateContext.website.id,
				organizationId: privateContext.organization.id,
				externalId,
				email: extracted.body.email,
				name: extracted.body.name,
				image: extracted.body.image,
				metadata: extracted.body.metadata,
				contactOrganizationId: extracted.body.contactOrganizationId,
			});

			const response = formatContactResponse(upsertResult.contact);
			const statusCode = upsertResult.status === "created" ? 201 : 200;

			return c.json(
				validateResponse(response, contactResponseSchema),
				statusCode
			);
		}

		const newContact = await createContact(extracted.db, {
			websiteId: privateContext.website.id,
			organizationId: privateContext.organization.id,
			data: {
				...extracted.body,
				externalId,
			},
		});

		return c.json(
			validateResponse(
				formatContactResponse(newContact),
				contactResponseSchema
			),
			201
		);
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
});

contactControlRouter.openapi(getContactRoute, async (c) => {
	try {
		const extracted = await safelyExtractRequestData(c);
		const privateContext = requirePrivateControlContext(c, extracted);
		const contactId = c.req.param("id");

		if (privateContext instanceof Response) {
			return privateContext;
		}

		if (!contactId) {
			return c.json({ error: "NOT_FOUND", message: "Contact not found" }, 404);
		}

		const contact = await findContactForWebsite(extracted.db, {
			contactId,
			websiteId: privateContext.website.id,
		});

		if (!contact) {
			return c.json({ error: "NOT_FOUND", message: "Contact not found" }, 404);
		}

		return c.json(
			validateResponse(formatContactResponse(contact), contactResponseSchema),
			200
		);
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
});

contactControlRouter.openapi(updateContactRoute, async (c) => {
	try {
		const extracted = await safelyExtractRequestData(
			c,
			updateContactRequestSchema
		);
		const privateContext = requirePrivateControlContext(c, extracted);
		const contactId = c.req.param("id");

		if (privateContext instanceof Response) {
			return privateContext;
		}

		if (!contactId) {
			return c.json({ error: "NOT_FOUND", message: "Contact not found" }, 404);
		}

		const updatedContact = await updateContact(extracted.db, {
			contactId,
			websiteId: privateContext.website.id,
			data: extracted.body,
		});

		if (!updatedContact) {
			return c.json({ error: "NOT_FOUND", message: "Contact not found" }, 404);
		}

		return c.json(
			validateResponse(
				formatContactResponse(updatedContact),
				contactResponseSchema
			),
			200
		);
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
});

contactControlRouter.openapi(updateContactMetadataRoute, async (c) => {
	try {
		const extracted = await safelyExtractRequestData(
			c,
			updateContactMetadataRequestSchema
		);
		const privateContext = requirePrivateControlContext(c, extracted);
		const contactId = c.req.param("id");

		if (privateContext instanceof Response) {
			return privateContext;
		}

		if (!contactId) {
			return c.json({ error: "NOT_FOUND", message: "Contact not found" }, 404);
		}

		const updatedContact = await mergeContactMetadata(extracted.db, {
			contactId,
			websiteId: privateContext.website.id,
			metadata: extracted.body.metadata,
		});

		if (!updatedContact) {
			return c.json({ error: "NOT_FOUND", message: "Contact not found" }, 404);
		}

		return c.json(
			validateResponse(
				formatContactResponse(updatedContact),
				contactResponseSchema
			),
			200
		);
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
});

contactControlRouter.openapi(deleteContactRoute, async (c) => {
	try {
		const extracted = await safelyExtractRequestData(c);
		const privateContext = requirePrivateControlContext(c, extracted);
		const contactId = c.req.param("id");

		if (privateContext instanceof Response) {
			return privateContext;
		}

		if (!contactId) {
			return c.json({ error: "NOT_FOUND", message: "Contact not found" }, 404);
		}

		const deleted = await deleteContact(extracted.db, {
			contactId,
			websiteId: privateContext.website.id,
		});

		if (!deleted) {
			return c.json({ error: "NOT_FOUND", message: "Contact not found" }, 404);
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
});

contactControlRouter.openapi(createContactOrganizationRoute, async (c) => {
	try {
		const extracted = await safelyExtractRequestData(
			c,
			createContactOrganizationRequestSchema
		);
		const privateContext = requirePrivateControlContext(c, extracted);

		if (privateContext instanceof Response) {
			return privateContext;
		}

		const created = await createContactOrganization(extracted.db, {
			websiteId: privateContext.website.id,
			organizationId: privateContext.organization.id,
			data: extracted.body,
		});

		return c.json(
			validateResponse(
				formatContactOrganizationResponse(created),
				contactOrganizationResponseSchema
			),
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
});

contactControlRouter.openapi(getContactOrganizationRoute, async (c) => {
	try {
		const extracted = await safelyExtractRequestData(c);
		const privateContext = requirePrivateControlContext(c, extracted);
		const contactOrganizationId = c.req.param("id");

		if (privateContext instanceof Response) {
			return privateContext;
		}

		if (!contactOrganizationId) {
			return c.json(
				{
					error: "NOT_FOUND",
					message: "Contact organization not found",
				},
				404
			);
		}

		const organization = await findContactOrganizationForWebsite(extracted.db, {
			contactOrganizationId,
			websiteId: privateContext.website.id,
		});

		if (!organization) {
			return c.json(
				{
					error: "NOT_FOUND",
					message: "Contact organization not found",
				},
				404
			);
		}

		return c.json(
			validateResponse(
				formatContactOrganizationResponse(organization),
				contactOrganizationResponseSchema
			),
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
});

contactControlRouter.openapi(updateContactOrganizationRoute, async (c) => {
	try {
		const extracted = await safelyExtractRequestData(
			c,
			updateContactOrganizationRequestSchema
		);
		const privateContext = requirePrivateControlContext(c, extracted);
		const contactOrganizationId = c.req.param("id");

		if (privateContext instanceof Response) {
			return privateContext;
		}

		if (!contactOrganizationId) {
			return c.json(
				{
					error: "NOT_FOUND",
					message: "Contact organization not found",
				},
				404
			);
		}

		const updated = await updateContactOrganization(extracted.db, {
			contactOrganizationId,
			websiteId: privateContext.website.id,
			data: extracted.body,
		});

		if (!updated) {
			return c.json(
				{
					error: "NOT_FOUND",
					message: "Contact organization not found",
				},
				404
			);
		}

		return c.json(
			validateResponse(
				formatContactOrganizationResponse(updated),
				contactOrganizationResponseSchema
			),
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
});

contactControlRouter.openapi(deleteContactOrganizationRoute, async (c) => {
	try {
		const extracted = await safelyExtractRequestData(c);
		const privateContext = requirePrivateControlContext(c, extracted);
		const contactOrganizationId = c.req.param("id");

		if (privateContext instanceof Response) {
			return privateContext;
		}

		if (!contactOrganizationId) {
			return c.json(
				{
					error: "NOT_FOUND",
					message: "Contact organization not found",
				},
				404
			);
		}

		const deleted = await deleteContactOrganization(extracted.db, {
			contactOrganizationId,
			websiteId: privateContext.website.id,
		});

		if (!deleted) {
			return c.json(
				{
					error: "NOT_FOUND",
					message: "Contact organization not found",
				},
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
});

// Mount shared runtime routes before private control routes so public requests
// like POST /contacts/identify are not intercepted by private-only middleware.
export const contactRouter = new OpenAPIHono<RestContext>()
	.route("/", contactRuntimeRouter)
	.route("/", contactControlRouter);
