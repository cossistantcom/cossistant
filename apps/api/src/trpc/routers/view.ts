import { listActiveWebsiteViews } from "@api/db/queries/view";
import { getWebsiteBySlugWithAccess } from "@api/db/queries/website";
import { viewSchema } from "@plasma/types/schemas";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";

export const viewRouter = createTRPCRouter({
	list: protectedProcedure
		.input(z.object({ slug: z.string() }))
		.output(z.array(viewSchema))
		.query(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.slug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const activeViews = await listActiveWebsiteViews(db, {
				websiteId: websiteData.id,
			});

			return activeViews;
		}),
});
