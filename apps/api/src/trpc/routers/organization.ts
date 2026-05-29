import {
	getOrganizationSettings,
	updateOrganizationSettings,
} from "@api/db/queries";
import { isValidTimezone } from "@api/utils/timezone";
import {
	organizationSettingsResponseSchema,
	updateOrganizationSettingsRequestSchema,
} from "@cossistant/types";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";

export const organizationRouter = createTRPCRouter({
	getSettings: protectedProcedure
		.input(z.object({ organizationId: z.ulid() }))
		.output(organizationSettingsResponseSchema)
		.query(async ({ ctx, input }) => {
			const settings = await getOrganizationSettings(ctx.db, {
				organizationId: input.organizationId,
				userId: ctx.user.id,
			});

			if (!settings) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You do not have access to this organization.",
				});
			}

			return settings;
		}),
	updateSettings: protectedProcedure
		.input(updateOrganizationSettingsRequestSchema)
		.output(organizationSettingsResponseSchema)
		.mutation(async ({ ctx, input }) => {
			if (!isValidTimezone(input.timezone)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Invalid timezone.",
				});
			}

			const settings = await updateOrganizationSettings(ctx.db, {
				organizationId: input.organizationId,
				userId: ctx.user.id,
				timezone: input.timezone,
				weeklyDigestEnabled: input.weeklyDigestEnabled,
			});

			if (!settings) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only organization owners and admins can update this.",
				});
			}

			return settings;
		}),
});
