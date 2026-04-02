import type { Database } from "@api/db";
import {
	getMemberNotificationSettings,
	updateMemberNotificationSettings,
} from "@api/db/queries";
import { getWebsiteBySlugWithAccess } from "@api/db/queries/website";
import { member } from "@api/db/schema";
import { isValidPushSubscription } from "@api/utils/web-push";
import {
	MemberNotificationChannel,
	memberNotificationSettingsResponseSchema,
	updateMemberNotificationSettingsRequestSchema,
} from "@plasma/types";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const pushSubscriptionSchema = z.object({
	endpoint: z.url(),
	keys: z.object({
		p256dh: z.string(),
		auth: z.string(),
	}),
});

import { createTRPCRouter, protectedProcedure } from "../init";

async function getMemberForOrganization(
	db: Database,
	params: { userId: string; organizationId: string }
) {
	const membership = await db.query.member.findFirst({
		where: and(
			eq(member.userId, params.userId),
			eq(member.organizationId, params.organizationId)
		),
	});

	if (!membership) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You are not a member of this organization.",
		});
	}

	return membership;
}

export const notificationRouter = createTRPCRouter({
	getMemberSettings: protectedProcedure
		.input(z.object({ websiteSlug: z.string() }))
		.output(memberNotificationSettingsResponseSchema)
		.query(async ({ ctx, input }) => {
			const website = await getWebsiteBySlugWithAccess(ctx.db, {
				userId: ctx.user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!website) {
				throw new TRPCError({ code: "NOT_FOUND" });
			}

			const membership = await getMemberForOrganization(ctx.db, {
				userId: ctx.user.id,
				organizationId: website.organizationId,
			});

			return getMemberNotificationSettings(ctx.db, {
				organizationId: website.organizationId,
				memberId: membership.id,
			});
		}),
	updateMemberSettings: protectedProcedure
		.input(updateMemberNotificationSettingsRequestSchema)
		.output(memberNotificationSettingsResponseSchema)
		.mutation(async ({ ctx, input }) => {
			const website = await getWebsiteBySlugWithAccess(ctx.db, {
				userId: ctx.user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!website) {
				throw new TRPCError({ code: "NOT_FOUND" });
			}

			const membership = await getMemberForOrganization(ctx.db, {
				userId: ctx.user.id,
				organizationId: website.organizationId,
			});

			return updateMemberNotificationSettings(ctx.db, {
				organizationId: website.organizationId,
				memberId: membership.id,
				settings: input.settings,
			});
		}),

	/**
	 * Subscribe to push notifications
	 * Stores the PushSubscription in the config field
	 */
	subscribeToPush: protectedProcedure
		.input(
			z.object({
				websiteSlug: z.string(),
				subscription: pushSubscriptionSchema,
			})
		)
		.output(memberNotificationSettingsResponseSchema)
		.mutation(async ({ ctx, input }) => {
			const website = await getWebsiteBySlugWithAccess(ctx.db, {
				userId: ctx.user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!website) {
				throw new TRPCError({ code: "NOT_FOUND" });
			}

			const membership = await getMemberForOrganization(ctx.db, {
				userId: ctx.user.id,
				organizationId: website.organizationId,
			});

			// Validate the subscription data
			if (!isValidPushSubscription(input.subscription)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Invalid push subscription data",
				});
			}

			// Update the BROWSER_PUSH_NEW_MESSAGE channel with subscription in config
			return updateMemberNotificationSettings(ctx.db, {
				organizationId: website.organizationId,
				memberId: membership.id,
				settings: [
					{
						channel: MemberNotificationChannel.BROWSER_PUSH_NEW_MESSAGE,
						enabled: true,
						delaySeconds: 0,
						config: {
							subscription: input.subscription,
						},
					},
				],
			});
		}),

	/**
	 * Unsubscribe from push notifications
	 * Clears the subscription from config and disables the channel
	 */
	unsubscribeFromPush: protectedProcedure
		.input(z.object({ websiteSlug: z.string() }))
		.output(memberNotificationSettingsResponseSchema)
		.mutation(async ({ ctx, input }) => {
			const website = await getWebsiteBySlugWithAccess(ctx.db, {
				userId: ctx.user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!website) {
				throw new TRPCError({ code: "NOT_FOUND" });
			}

			const membership = await getMemberForOrganization(ctx.db, {
				userId: ctx.user.id,
				organizationId: website.organizationId,
			});

			// Update the BROWSER_PUSH_NEW_MESSAGE channel: disable and clear subscription
			return updateMemberNotificationSettings(ctx.db, {
				organizationId: website.organizationId,
				memberId: membership.id,
				settings: [
					{
						channel: MemberNotificationChannel.BROWSER_PUSH_NEW_MESSAGE,
						enabled: false,
						delaySeconds: 0,
						config: null,
					},
				],
			});
		}),
});
