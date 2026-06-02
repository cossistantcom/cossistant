import {
	deleteContact,
	deleteContactsForWebsite,
	getContactWithVisitors,
	listContacts,
} from "@api/db/queries/contact";
import { getWebsiteBySlugWithAccess } from "@api/db/queries/website";
import {
	contactDetailResponseSchema,
	contactListVisitorStatusSchema,
	deleteAllContactsRequestSchema,
	deleteAllContactsResponseSchema,
	deleteContactRequestSchema,
	deleteContactResponseSchema,
	listContactsResponseSchema,
} from "@cossistant/types";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";

const sortBySchema = z.enum([
	"name",
	"email",
	"createdAt",
	"updatedAt",
	"visitorCount",
	"lastSeenAt",
]);

const sortOrderSchema = z.enum(["asc", "desc"]);

export const contactRouter = createTRPCRouter({
	list: protectedProcedure
		.input(
			z.object({
				websiteSlug: z.string(),
				page: z.number().int().min(1).optional(),
				limit: z.number().int().min(1).max(100).optional(),
				search: z.string().optional(),
				sortBy: sortBySchema.optional(),
				sortOrder: sortOrderSchema.optional(),
				visitorStatus: contactListVisitorStatusSchema.optional().default("all"),
			})
		)
		.output(listContactsResponseSchema)
		.query(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const result = await listContacts(db, {
				websiteId: websiteData.id,
				organizationId: websiteData.organizationId,
				page: input.page,
				limit: input.limit,
				search: input.search?.trim() || undefined,
				sortBy: input.sortBy,
				sortOrder: input.sortOrder,
				visitorStatus:
					input.visitorStatus === "all" ? undefined : input.visitorStatus,
			});

			return result;
		}),
	get: protectedProcedure
		.input(
			z.object({
				websiteSlug: z.string(),
				contactId: z.string(),
			})
		)
		.output(contactDetailResponseSchema)
		.query(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const record = await getContactWithVisitors(db, {
				contactId: input.contactId,
				websiteId: websiteData.id,
				organizationId: websiteData.organizationId,
			});

			if (!record) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Contact not found",
				});
			}

			return record;
		}),
	delete: protectedProcedure
		.input(deleteContactRequestSchema)
		.output(deleteContactResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const deleted = await deleteContact(db, {
				contactId: input.contactId,
				websiteId: websiteData.id,
			});

			if (!deleted) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Contact not found",
				});
			}

			return { id: deleted.id };
		}),
	deleteAll: protectedProcedure
		.input(deleteAllContactsRequestSchema)
		.output(deleteAllContactsResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const deletedCount = await deleteContactsForWebsite(db, {
				websiteId: websiteData.id,
				organizationId: websiteData.organizationId,
			});

			return { deletedCount };
		}),
});
