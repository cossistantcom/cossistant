import { getOrganizationMemberByUserId } from "@api/db/queries/member";
import {
	getContactCount,
	getRollingWindowConversationCount,
	getRollingWindowMessageCount,
	getTeamMemberCount,
	HARD_LIMIT_ROLLING_WINDOW_DAYS,
} from "@api/db/queries/usage";
import {
	getWebsiteBySlugWithAccess,
	listOrganizationWebsitePlanTargets,
} from "@api/db/queries/website";
import { env } from "@api/env";
import { getAiModelsForPlan } from "@api/lib/ai-credits/config";
import { resolveAiCreditsView } from "@api/lib/ai-credits/plan-view";
import { getAiCreditMeterState } from "@api/lib/ai-credits/polar-meter";
import { isPolarEnabled } from "@api/lib/billing-mode";
import {
	getDashboardConversationLockCutoff,
	resolveDashboardHardLimitPolicy,
} from "@api/lib/hard-limits/dashboard";
import {
	getPlanForWebsite,
	getSelfHostedPlanInfo,
} from "@api/lib/plans/access";
import { getPlanConfig, type PlanName } from "@api/lib/plans/config";
import {
	EARLY_BIRD_DISCOUNT_ID,
	getDiscountInfo,
} from "@api/lib/plans/discount";
import {
	getCustomerByOrganizationId,
	getCustomerState,
	getPlanFromCustomerState,
	getSubscriptionForWebsite,
	normalizeWebsiteSubscriptions,
	requireCustomerByOrganizationId,
	updateWebsiteSubscriptionProduct,
} from "@api/lib/plans/polar";
import polarClient from "@api/lib/polar";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../init";

export function buildAiModelsForPlanInfo(params: {
	latestModelsFeature: unknown;
}) {
	return getAiModelsForPlan(params.latestModelsFeature);
}

export const planRouter = createTRPCRouter({
	getPublicDiscountInfo: publicProcedure
		.input(
			z.object({
				discountId: z.string().optional(),
			})
		)
		.query(async ({ input }) => {
			// Default to early bird discount if not specified
			const discountId = input.discountId ?? EARLY_BIRD_DISCOUNT_ID;

			try {
				const discount = await getDiscountInfo(discountId);
				return discount;
			} catch (error) {
				return null;
			}
		}),
	getPlanInfo: protectedProcedure
		.input(
			z.object({
				websiteSlug: z.string(),
			})
		)
		.query(async ({ ctx, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(ctx.db, {
				userId: ctx.user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			// Get plan information
			const planInfo = await getPlanForWebsite(websiteData);

			// Get usage counts
			if (!websiteData.teamId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Website must have a team ID",
				});
			}

			const hardLimitPolicy = resolveDashboardHardLimitPolicy(planInfo);

			const [
				messages,
				conversations,
				contacts,
				teamMembers,
				conversationLockCutoff,
				aiCreditMeterState,
			] = await Promise.all([
				getRollingWindowMessageCount(ctx.db, {
					websiteId: websiteData.id,
					organizationId: websiteData.organizationId,
					windowStart: hardLimitPolicy.windowStart,
				}),
				getRollingWindowConversationCount(ctx.db, {
					websiteId: websiteData.id,
					organizationId: websiteData.organizationId,
					windowStart: hardLimitPolicy.windowStart,
				}),
				getContactCount(ctx.db, {
					websiteId: websiteData.id,
					organizationId: websiteData.organizationId,
				}),
				getTeamMemberCount(ctx.db, {
					teamId: websiteData.teamId,
					organizationId: websiteData.organizationId,
				}),
				getDashboardConversationLockCutoff(ctx.db, {
					websiteId: websiteData.id,
					organizationId: websiteData.organizationId,
					policy: hardLimitPolicy,
				}),
				getAiCreditMeterState(websiteData.organizationId),
			]);

			const aiCredits = resolveAiCreditsView({
				planInfo,
				meterState: aiCreditMeterState,
			});
			const aiModels = buildAiModelsForPlanInfo({
				latestModelsFeature: planInfo.features["latest-ai-models"],
			});

			const messagesReached =
				hardLimitPolicy.messageLimit !== null
					? messages >= hardLimitPolicy.messageLimit
					: false;
			const conversationsReached =
				hardLimitPolicy.conversationLimit !== null
					? conversations >= hardLimitPolicy.conversationLimit
					: false;

			return {
				plan: {
					name: planInfo.planName,
					displayName: planInfo.displayName,
					price: planInfo.price,
					features: planInfo.features,
				},
				billing: planInfo.billing,
				usage: {
					messages,
					contacts,
					conversations,
					teamMembers,
				},
				hardLimitStatus: {
					rollingWindowDays: HARD_LIMIT_ROLLING_WINDOW_DAYS,
					windowStart: hardLimitPolicy.windowStart,
					enforced: hardLimitPolicy.enforced,
					unavailableReason: hardLimitPolicy.unavailableReason,
					messages: {
						limit: hardLimitPolicy.messageLimit,
						used: messages,
						reached: messagesReached,
					},
					conversations: {
						limit: hardLimitPolicy.conversationLimit,
						used: conversations,
						reached: conversationsReached,
						lockCutoff: conversationLockCutoff
							? {
									createdAt: conversationLockCutoff.createdAt,
									id: conversationLockCutoff.id,
								}
							: null,
					},
				},
				aiCredits,
				aiModels,
			};
		}),
	getPlansForOrganization: protectedProcedure
		.input(
			z.object({
				organizationId: z.string(),
			})
		)
		.query(async ({ ctx, input }) => {
			// Verify user has access to this organization
			const membership = await getOrganizationMemberByUserId(ctx.db, {
				userId: ctx.user.id,
				organizationId: input.organizationId,
			});

			if (!membership) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You do not have access to this organization",
				});
			}

			// Get all websites for this organization
			const websites = await listOrganizationWebsitePlanTargets(ctx.db, {
				organizationId: input.organizationId,
			});

			if (websites.length === 0) {
				return [];
			}

			if (!isPolarEnabled()) {
				const selfHostedPlan = getSelfHostedPlanInfo();

				return websites.map((site) => ({
					websiteId: site.id,
					planName: selfHostedPlan.planName,
					displayName: selfHostedPlan.displayName,
				}));
			}

			// Get customer state once for the organization
			const customer = await getCustomerByOrganizationId(input.organizationId);

			if (!customer) {
				console.error("[plans] Missing Polar customer invariant violation", {
					organizationId: input.organizationId,
					websiteCount: websites.length,
				});
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Billing customer is missing. Please contact support.",
				});
			}

			const customerState = await getCustomerState(customer.id);

			// Map each website to its plan
			const planPromises = websites.map(async (site) => {
				const subscription = getSubscriptionForWebsite(customerState, site.id);

				if (subscription) {
					// Create a temporary customer state with just this subscription
					const subscriptionCustomerState = {
						customerId: customerState?.customerId ?? "",
						activeSubscriptions: [subscription],
						grantedBenefits: customerState?.grantedBenefits ?? [],
					};

					// Get plan from subscription
					const planName = await getPlanFromCustomerState(
						subscriptionCustomerState
					);
					const finalPlan = planName ?? "free";
					const config = getPlanConfig(finalPlan);
					return {
						websiteId: site.id,
						planName: finalPlan,
						displayName: config.displayName,
					};
				}

				// Default to free plan
				const freePlan = getPlanConfig("free");
				return {
					websiteId: site.id,
					planName: "free" as PlanName,
					displayName: freePlan.displayName,
				};
			});

			return Promise.all(planPromises);
		}),
	getDiscountInfo: protectedProcedure
		.input(
			z.object({
				discountId: z.string().optional(),
			})
		)
		.query(async ({ input }) => {
			// Default to early bird discount if not specified
			const discountId = input.discountId ?? EARLY_BIRD_DISCOUNT_ID;

			try {
				const discount = await getDiscountInfo(discountId);

				return discount;
			} catch (error) {
				return null;
			}
		}),
	createCheckout: protectedProcedure
		.input(
			z.object({
				websiteSlug: z.string(),
				targetPlan: z.enum(["free", "hobby", "pro"]),
			})
		)
		.mutation(async ({ ctx, input }) => {
			const { targetPlan } = input;

			if (!isPolarEnabled()) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Billing is disabled for this deployment.",
				});
			}

			const websiteData = await getWebsiteBySlugWithAccess(ctx.db, {
				userId: ctx.user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			// Get target plan config
			const targetPlanConfig = getPlanConfig(targetPlan as PlanName);

			if (!targetPlanConfig.polarProductId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Plan ${targetPlan} does not have a Polar product ID configured`,
				});
			}
			const targetProductId = targetPlanConfig.polarProductId;

			try {
				await requireCustomerByOrganizationId(websiteData.organizationId);
			} catch (error) {
				console.error("[plans] Missing Polar customer invariant violation", {
					organizationId: websiteData.organizationId,
					websiteId: websiteData.id,
					targetPlan,
					error,
				});
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Billing customer is missing. Please contact support.",
				});
			}

			const createCheckoutSession = async () => {
				try {
					const baseUrl = env.PUBLIC_APP_URL || "http://localhost:3000";
					const returnPath = `/${input.websiteSlug}/settings/plan`;
					const checkout = await polarClient.checkouts.create({
						products: [targetProductId],
						externalCustomerId: websiteData.organizationId,
						metadata: {
							websiteId: websiteData.id,
						},
						successUrl: `${baseUrl}${returnPath}?checkout_success=true`,
						returnUrl: `${baseUrl}${returnPath}?checkout_error=true`,
					});

					return {
						mode: "checkout" as const,
						checkoutUrl: checkout.url,
					};
				} catch (error) {
					console.error("Error creating checkout:", error);
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create checkout session",
					});
				}
			};

			const normalized = await normalizeWebsiteSubscriptions({
				organizationId: websiteData.organizationId,
				websiteId: websiteData.id,
			});

			if (normalized.revokedSubscriptionIds.length > 0) {
				console.warn("[plans] Revoked duplicate active subscriptions", {
					organizationId: websiteData.organizationId,
					websiteId: websiteData.id,
					keptSubscriptionId: normalized.subscription?.id ?? null,
					revokedSubscriptionIds: normalized.revokedSubscriptionIds,
				});
			}

			if (!normalized.subscription) {
				return createCheckoutSession();
			}

			const updateResult = await updateWebsiteSubscriptionProduct({
				subscriptionId: normalized.subscription.id,
				productId: targetProductId,
				prorationBehavior: "invoice",
			});

			if (updateResult.status === "updated") {
				return {
					mode: "updated" as const,
				};
			}

			if (updateResult.status === "payment_required") {
				return createCheckoutSession();
			}

			if (updateResult.status === "not_found") {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						"Current subscription could not be updated because it no longer exists in Polar.",
				});
			}

			if (updateResult.status === "config_error") {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						"Target plan product is misconfigured in Polar. Please contact support.",
				});
			}

			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to update subscription plan",
			});
		}),
});
