import { getWebsiteBySlugWithAccess } from "@api/db/queries";
import { getWebsiteMembers } from "@api/db/queries/member";
import { getOrganizationsForUser } from "@api/db/queries/organization";
import { updateUserProfile } from "@api/db/queries/user";
import { auth } from "@api/lib/auth";
import {
	updateUserProfileRequestSchema,
	userResponseSchema,
} from "@plasma/types";
import { z } from "@hono/zod-openapi";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../init";

export const userRouter = createTRPCRouter({
	me: protectedProcedure.query(async ({ ctx: { db, session, user } }) => {
		if (!user) {
			throw new TRPCError({ code: "NOT_FOUND" });
		}

		return user;
	}),
	updateProfile: protectedProcedure
		.input(updateUserProfileRequestSchema)
		.output(userResponseSchema)
		.mutation(async ({ ctx: { db, user, headers }, input }) => {
			if (input.userId !== user.id) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You can only update your own profile.",
				});
			}

			const updatedUser = await updateUserProfile(db, {
				userId: user.id,
				name: input.name,
				imageUrl: input.image ?? null,
			});

			if (!updatedUser) {
				throw new TRPCError({ code: "NOT_FOUND" });
			}

			// Force session cache refresh by fetching with disableCookieCache
			// This updates the cookie cache with the fresh user data
			await auth.api.getSession({
				headers,
				query: {
					disableCookieCache: true,
				},
			});

			return {
				...updatedUser,
				createdAt: updatedUser.createdAt.toISOString(),
				updatedAt: updatedUser.updatedAt.toISOString(),
				lastSeenAt: updatedUser.lastSeenAt?.toISOString() ?? null,
			};
		}),
	getWebsiteMembers: protectedProcedure
		.input(
			z.object({
				websiteSlug: z.string(),
			})
		)
		.output(z.array(userResponseSchema))
		.query(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({ code: "NOT_FOUND" });
			}

			const members = await getWebsiteMembers(db, {
				organizationId: websiteData.organizationId,
				websiteTeamId: websiteData.teamId,
			});

			return members;
		}),
	getOrganizations: protectedProcedure.query(async ({ ctx: { db, user } }) => {
		const organizations = await getOrganizationsForUser(db, {
			userId: user.id,
		});

		return organizations.map((org) => ({
			organization: org.organization,
			role: org.role,
			joinedAt: org.joinedAt.toISOString(),
			websites: org.websites,
		}));
	}),
});
