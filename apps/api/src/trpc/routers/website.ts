/** biome-ignore-all lint/style/useBlockStatements: ok here */
import {
	createApiKey,
	createDefaultWebsiteKeys,
	getApiKeyById,
	getApiKeysByOrganization,
	revokeApiKey,
} from "@api/db/queries/api-keys";
import { createDefaultWebsiteViews } from "@api/db/queries/view";
import {
	createWebsite,
	getWebsiteBySlugWithAccess,
	permanentlyDeleteWebsite,
	updateWebsite,
} from "@api/db/queries/website";
import {
	conversation,
	feedback,
	member,
	session as sessionTable,
	type WebsiteInsert,
	website,
} from "@api/db/schema";
import { env } from "@api/env";
import {
	ensureFreeSubscriptionForWebsite,
	getCustomerByOrganizationId,
	getCustomerState,
	PolarCustomerInvariantViolationError,
	partitionWebsiteSubscriptionsForDeletion,
} from "@api/lib/plans/polar";
import polarClient from "@api/lib/polar";
import { generateTinybirdJWT } from "@api/lib/tinybird-jwt";
import {
	isOrganizationAdminOrOwner,
	isOrganizationOwner,
} from "@api/utils/access-control";
import { invalidateApiKeyCacheForWebsite } from "@api/utils/cache/api-key-cache";
import { generateULID } from "@api/utils/db/ids";
import { normalizeDomain } from "@api/utils/domain";
import { domainToSlug } from "@api/utils/domain-slug";
import {
	APIKeyType,
	checkWebsiteDomainRequestSchema,
	createWebsiteApiKeyRequestSchema,
	createWebsiteRequestSchema,
	createWebsiteResponseSchema,
	deleteWebsiteRequestSchema,
	deleteWebsiteResponseSchema,
	listByOrganizationRequestSchema,
	revokeWebsiteApiKeyRequestSchema,
	updateWebsiteRequestSchema,
	websiteApiKeySchema,
	websiteDeveloperSettingsResponseSchema,
	websiteListItemSchema,
	websiteSummarySchema,
} from "@plasma/types";
import { TRPCError } from "@trpc/server";
import { and, eq, gte, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";

type ApiKeyRecord = Awaited<
	ReturnType<typeof getApiKeysByOrganization>
>[number];

type ApiKeyLike =
	| ApiKeyRecord
	| Awaited<ReturnType<typeof createApiKey>>
	| NonNullable<Awaited<ReturnType<typeof revokeApiKey>>>;

const toNumberOrNull = (value: unknown): number | null => {
	if (value === null || value === undefined) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
};

const toWebsiteApiKey = (
	key: ApiKeyLike,
	options?: { includeRawKey?: boolean }
) => ({
	id: key.id,
	name:
		key.name ??
		`${key.isTest ? "Test " : ""}${
			key.keyType === APIKeyType.PRIVATE ? "Private" : "Public"
		} API Key`,
	keyType: key.keyType,
	key:
		options?.includeRawKey || key.keyType !== APIKeyType.PRIVATE
			? key.key
			: null,
	isTest: key.isTest,
	isActive: key.isActive,
	createdAt: key.createdAt,
	lastUsedAt: key.lastUsedAt ?? null,
	revokedAt: key.revokedAt ?? null,
});

export const websiteRouter = createTRPCRouter({
	getBySlug: protectedProcedure
		.input(z.object({ slug: z.string() }))
		.query(async ({ ctx: { db, user, session }, input }) => {
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

			// Set the active organization in the session if it's not already set
			if (
				session.activeOrganizationId !== websiteData.organizationId &&
				websiteData.organizationId
			) {
				try {
					await db
						.update(sessionTable)
						.set({ activeOrganizationId: websiteData.organizationId })
						.where(eq(sessionTable.id, session.id));
				} catch (error) {
					// Non-critical, continue
					console.error("Failed to update active organization:", error);
				}
			}

			return websiteData;
		}),
	listByOrganization: protectedProcedure
		.input(listByOrganizationRequestSchema)
		.output(z.array(websiteListItemSchema))
		.query(async ({ ctx: { db, user }, input }) => {
			// Verify user has access to this organization
			const [membership] = await db
				.select()
				.from(member)
				.where(
					and(
						eq(member.userId, user.id),
						eq(member.organizationId, input.organizationId)
					)
				)
				.limit(1);

			if (!membership) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You do not have access to this organization",
				});
			}

			// Get all websites for this organization
			const websites = await db
				.select({
					id: website.id,
					name: website.name,
					slug: website.slug,
					logoUrl: website.logoUrl,
					domain: website.domain,
					organizationId: website.organizationId,
				})
				.from(website)
				.where(
					and(
						eq(website.organizationId, input.organizationId),
						isNull(website.deletedAt)
					)
				)
				.orderBy(website.createdAt);

			return websites;
		}),
	developerSettings: protectedProcedure
		.input(z.object({ slug: z.string() }))
		.output(websiteDeveloperSettingsResponseSchema)
		.query(async ({ ctx, input }) => {
			const site = await ctx.db.query.website.findFirst({
				where: and(eq(website.slug, input.slug), isNull(website.deletedAt)),
				columns: {
					id: true,
					slug: true,
					name: true,
					domain: true,
					contactEmail: true,
					logoUrl: true,
					organizationId: true,
					whitelistedDomains: true,
					defaultParticipantIds: true,
				},
			});

			if (!site) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found",
				});
			}

			const hasAdminAccess = await isOrganizationAdminOrOwner(ctx.db, {
				organizationId: site.organizationId,
				userId: ctx.user.id,
			});

			if (!hasAdminAccess) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message:
						"You do not have permission to manage API keys for this website.",
				});
			}

			const apiKeys = await getApiKeysByOrganization(ctx.db, {
				orgId: site.organizationId,
				websiteId: site.id,
			});

			return {
				website: {
					id: site.id,
					slug: site.slug,
					name: site.name,
					domain: site.domain,
					contactEmail: site.contactEmail ?? null,
					logoUrl: site.logoUrl ?? null,
					organizationId: site.organizationId,
					whitelistedDomains: site.whitelistedDomains,
					defaultParticipantIds: site.defaultParticipantIds ?? null,
				},
				apiKeys: apiKeys
					.filter((key) => key.isActive)
					.map((key) => toWebsiteApiKey(key)),
			};
		}),
	create: protectedProcedure
		.input(createWebsiteRequestSchema)
		.output(createWebsiteResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			// Check if website with same verified domain already exists
			let normalizedDomain: string;

			try {
				normalizedDomain = normalizeDomain(input.domain);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Invalid domain provided.",
					cause: error,
				});
			}

			const existingDomainWebsite = await db.query.website.findFirst({
				where: and(
					eq(website.domain, normalizedDomain),
					eq(website.isDomainOwnershipVerified, true)
				),
			});

			if (existingDomainWebsite) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Domain already in use by another website",
				});
			}

			const userEmailDomain = user.email.split("@")[1]?.toLowerCase();
			const isDomainOwnershipVerified = userEmailDomain === normalizedDomain;

			// Generate a unique slug by always adding a random suffix
			const slug = domainToSlug(normalizedDomain);

			const createdWebsite = await createWebsite(db, {
				organizationId: input.organizationId,
				data: {
					name: input.name,
					installationTarget: input.installationTarget,
					domain: normalizedDomain,
					isDomainOwnershipVerified,
					whitelistedDomains: [
						`https://${normalizedDomain}`,
						"http://localhost:3000",
					],
					slug,
				},
			});

			const [apiKeys] = await Promise.all([
				createDefaultWebsiteKeys(db, {
					websiteId: createdWebsite.id,
					websiteName: input.name,
					organizationId: input.organizationId,
					createdBy: user.id,
				}),
				createDefaultWebsiteViews(db, {
					websiteId: createdWebsite.id,
					websiteName: input.name,
					organizationId: input.organizationId,
					createdBy: user.id,
				}),
			]);

			try {
				const freeProvisionResult = await ensureFreeSubscriptionForWebsite({
					organizationId: input.organizationId,
					websiteId: createdWebsite.id,
				});

				if (freeProvisionResult.status === "skipped_lock_contention") {
					console.warn(
						"[plans] Free subscription provisioning lock contention",
						{
							organizationId: input.organizationId,
							websiteId: createdWebsite.id,
						}
					);
				}

				if (freeProvisionResult.revokedSubscriptionIds.length > 0) {
					console.warn(
						"[plans] Revoked duplicate subscriptions during free provisioning",
						{
							organizationId: input.organizationId,
							websiteId: createdWebsite.id,
							revokedSubscriptionIds:
								freeProvisionResult.revokedSubscriptionIds,
						}
					);
				}
			} catch (error) {
				console.error("[plans] Failed to provision free website subscription", {
					organizationId: input.organizationId,
					websiteId: createdWebsite.id,
					invariantViolation:
						error instanceof PolarCustomerInvariantViolationError,
					error,
				});
			}

			return {
				id: createdWebsite.id,
				name: createdWebsite.name,
				slug: createdWebsite.slug,
				whitelistedDomains: createdWebsite.whitelistedDomains,
				organizationId: createdWebsite.organizationId,
				apiKeys: apiKeys.map((key) =>
					toWebsiteApiKey(key, { includeRawKey: true })
				),
			};
		}),
	createApiKey: protectedProcedure
		.input(createWebsiteApiKeyRequestSchema)
		.output(websiteApiKeySchema)
		.mutation(async ({ ctx, input }) => {
			const site = await ctx.db.query.website.findFirst({
				where: and(
					eq(website.id, input.websiteId),
					eq(website.organizationId, input.organizationId),
					isNull(website.deletedAt)
				),
				columns: { id: true, organizationId: true },
			});

			if (!site) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found",
				});
			}

			const hasAdminAccess = await isOrganizationAdminOrOwner(ctx.db, {
				organizationId: input.organizationId,
				userId: ctx.user.id,
			});

			if (!hasAdminAccess) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message:
						"You do not have permission to create API keys for this website.",
				});
			}

			const createdKey = await createApiKey(ctx.db, {
				id: generateULID(),
				name: input.name,
				organizationId: input.organizationId,
				websiteId: input.websiteId,
				keyType: input.keyType,
				createdBy: ctx.user.id,
				isTest: input.isTest,
			});

			return toWebsiteApiKey(createdKey, { includeRawKey: true });
		}),
	revokeApiKey: protectedProcedure
		.input(revokeWebsiteApiKeyRequestSchema)
		.output(websiteApiKeySchema)
		.mutation(async ({ ctx, input }) => {
			const site = await ctx.db.query.website.findFirst({
				where: and(
					eq(website.id, input.websiteId),
					eq(website.organizationId, input.organizationId),
					isNull(website.deletedAt)
				),
				columns: { id: true, organizationId: true },
			});

			if (!site) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found",
				});
			}

			const hasAdminAccess = await isOrganizationAdminOrOwner(ctx.db, {
				organizationId: input.organizationId,
				userId: ctx.user.id,
			});

			if (!hasAdminAccess) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message:
						"You do not have permission to revoke API keys for this website.",
				});
			}

			const existingKey = await getApiKeyById(ctx.db, {
				orgId: input.organizationId,
				apiKeyId: input.apiKeyId,
			});

			if (!existingKey || existingKey.websiteId !== input.websiteId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "API key not found",
				});
			}

			const revoked = await revokeApiKey(ctx.db, {
				orgId: input.organizationId,
				apiKeyId: input.apiKeyId,
				revokedBy: ctx.user.id,
			});

			if (!revoked) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "API key not found",
				});
			}

			return toWebsiteApiKey(revoked);
		}),
	checkDomain: protectedProcedure
		.input(checkWebsiteDomainRequestSchema)
		.output(z.boolean())
		.query(async ({ ctx: { db }, input }) => {
			let normalizedDomain: string;

			try {
				normalizedDomain = normalizeDomain(input.domain);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Invalid domain provided.",
					cause: error,
				});
			}

			const existingWebsite = await db.query.website.findFirst({
				where: and(
					eq(website.domain, normalizedDomain),
					eq(website.isDomainOwnershipVerified, true)
				),
			});

			return !!existingWebsite;
		}),
	getTinybirdToken: protectedProcedure
		.input(z.object({ websiteSlug: z.string() }))
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

			const token = await generateTinybirdJWT(websiteData.id);

			return {
				token,
				host: env.TINYBIRD_HOST,
				expiresAt: Date.now() + 600_000,
				maxRetentionDays: 90, // TODO: check subscription tier
			};
		}),

	getSatisfactionSignals: protectedProcedure
		.input(
			z.object({
				websiteSlug: z.string(),
				dateFrom: z.string(),
				dateTo: z.string(),
			})
		)
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

			const [ratingResult, sentimentResult] = await Promise.all([
				db
					.select({
						average: sql<
							number | null
						>`AVG(((${feedback.rating} - 1) / 4.0) * 100)`,
						count: sql<number>`COUNT(*)`,
					})
					.from(feedback)
					.where(
						and(
							eq(feedback.organizationId, websiteData.organizationId),
							eq(feedback.websiteId, websiteData.id),
							isNull(feedback.deletedAt),
							gte(feedback.createdAt, input.dateFrom),
							lt(feedback.createdAt, input.dateTo)
						)
					),

				db
					.select({
						average: sql<number | null>`
							AVG(
								50 + (
									CASE
										WHEN ${conversation.sentiment} = 'positive' THEN 50
										WHEN ${conversation.sentiment} = 'negative' THEN -50
										ELSE 0
									END
								) * COALESCE(${conversation.sentimentConfidence}, 1)
							)
						`,
						count: sql<number>`COUNT(*)`,
					})
					.from(conversation)
					.where(
						and(
							eq(conversation.organizationId, websiteData.organizationId),
							eq(conversation.websiteId, websiteData.id),
							isNull(conversation.deletedAt),
							isNotNull(conversation.sentiment),
							gte(conversation.startedAt, input.dateFrom),
							lt(conversation.startedAt, input.dateTo)
						)
					),
			]);

			const ratingCount = Number(ratingResult[0]?.count ?? 0);
			const ratingScore =
				ratingCount > 0 ? toNumberOrNull(ratingResult[0]?.average) : null;

			const sentimentCount = Number(sentimentResult[0]?.count ?? 0);
			const sentimentScore =
				sentimentCount > 0 ? toNumberOrNull(sentimentResult[0]?.average) : null;

			return { ratingScore, sentimentScore };
		}),
	delete: protectedProcedure
		.input(deleteWebsiteRequestSchema)
		.output(deleteWebsiteResponseSchema)
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

			const hasOwnerAccess = await isOrganizationOwner(db, {
				organizationId: websiteData.organizationId,
				userId: user.id,
			});

			if (!hasOwnerAccess) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only organization owners can delete websites.",
				});
			}

			const customer = await getCustomerByOrganizationId(
				websiteData.organizationId
			);
			let freeSubscriptionsToRevoke: Array<{ id: string }> = [];

			if (customer) {
				const customerState = await getCustomerState(customer.id);

				if (!customerState) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message:
							"Unable to verify billing subscriptions. Please try again later.",
					});
				}

				const subscriptionPartition = partitionWebsiteSubscriptionsForDeletion(
					customerState,
					websiteData.id
				);

				if (subscriptionPartition.blockingPaidOrUnknown.length > 0) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `This website has an active paid subscription. Please unsubscribe first in /${input.websiteSlug}/billing.`,
					});
				}

				freeSubscriptionsToRevoke = subscriptionPartition.freeToRevoke.map(
					(subscription) => ({ id: subscription.id })
				);
			}

			for (const subscription of freeSubscriptionsToRevoke) {
				try {
					await polarClient.subscriptions.revoke({
						id: subscription.id,
					});
				} catch (error) {
					console.error(
						`[plans] Failed to revoke free subscription id=${subscription.id} for website=${websiteData.id}:`,
						error
					);
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message:
							"Failed to revoke free subscription before deletion. Please try again.",
					});
				}
			}

			try {
				await invalidateApiKeyCacheForWebsite(db, websiteData.id);
			} catch (error) {
				console.error(
					"[api-key-cache] Failed to invalidate website API key cache before deletion",
					{
						websiteId: websiteData.id,
						error,
					}
				);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to invalidate API key cache. Please try again.",
				});
			}

			const deletedWebsite = await permanentlyDeleteWebsite(db, {
				orgId: websiteData.organizationId,
				websiteId: websiteData.id,
			});

			if (!deletedWebsite) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found",
				});
			}

			return deletedWebsite;
		}),

	update: protectedProcedure
		.input(updateWebsiteRequestSchema)
		.output(websiteSummarySchema)
		.mutation(async ({ ctx, input }) => {
			const site = await ctx.db.query.website.findFirst({
				where: and(
					eq(website.id, input.websiteId),
					eq(website.organizationId, input.organizationId),
					isNull(website.deletedAt)
				),
				columns: {
					id: true,
					slug: true,
					name: true,
					domain: true,
					contactEmail: true,
					logoUrl: true,
					organizationId: true,
					whitelistedDomains: true,
				},
			});

			if (!site) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found",
				});
			}

			const hasAdminAccess = await isOrganizationAdminOrOwner(ctx.db, {
				organizationId: input.organizationId,
				userId: ctx.user.id,
			});

			if (!hasAdminAccess) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You do not have permission to update this website.",
				});
			}

			const updateData: Partial<Omit<WebsiteInsert, "organizationId">> = {};

			// Copy over non-null values from input data
			if (input.data.name !== undefined) updateData.name = input.data.name;
			if (input.data.slug !== undefined) updateData.slug = input.data.slug;
			if (input.data.domain !== undefined)
				updateData.domain = input.data.domain;
			if (input.data.contactEmail !== undefined)
				updateData.contactEmail = input.data.contactEmail;
			if (input.data.description !== undefined)
				updateData.description = input.data.description;
			if (input.data.logoUrl !== undefined)
				updateData.logoUrl = input.data.logoUrl;
			if (input.data.whitelistedDomains !== undefined) {
				updateData.whitelistedDomains = input.data.whitelistedDomains;
			}
			if (input.data.defaultParticipantIds !== undefined) {
				updateData.defaultParticipantIds = input.data.defaultParticipantIds;
			}
			if (input.data.installationTarget !== undefined)
				updateData.installationTarget = input.data.installationTarget;
			if (input.data.status !== undefined)
				updateData.status = input.data.status;
			if (input.data.teamId !== undefined && input.data.teamId !== null) {
				updateData.teamId = input.data.teamId;
			}

			if (updateData.name) {
				const trimmedName = updateData.name.trim();

				if (!trimmedName) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Website name cannot be empty.",
					});
				}

				updateData.name = trimmedName;
			}

			if (updateData.domain) {
				let normalizedDomain: string;

				try {
					normalizedDomain = normalizeDomain(updateData.domain);
				} catch (error) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Invalid domain provided.",
						cause: error,
					});
				}

				if (normalizedDomain !== site.domain) {
					const existingDomain = await ctx.db.query.website.findFirst({
						where: and(
							eq(website.domain, normalizedDomain),
							eq(website.isDomainOwnershipVerified, true),
							ne(website.id, site.id)
						),
					});

					if (existingDomain) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "Domain already in use by another website",
						});
					}

					updateData.isDomainOwnershipVerified = false;
					const newDefaultDomain = `https://${normalizedDomain}`;
					updateData.whitelistedDomains = [newDefaultDomain];
				}

				updateData.domain = normalizedDomain;
			}

			if (updateData.contactEmail !== undefined) {
				const trimmedEmail = updateData.contactEmail
					? updateData.contactEmail.trim().toLowerCase()
					: null;

				updateData.contactEmail =
					trimmedEmail && trimmedEmail.length > 0 ? trimmedEmail : null;
			}

			const updatedSite = await updateWebsite(ctx.db, {
				orgId: input.organizationId,
				websiteId: input.websiteId,
				data: updateData,
			});

			if (!updatedSite) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found",
				});
			}

			try {
				await invalidateApiKeyCacheForWebsite(ctx.db, site.id);
			} catch (error) {
				console.error("Failed to invalidate API key cache for website", error);
			}

			return {
				id: updatedSite.id,
				slug: updatedSite.slug,
				name: updatedSite.name,
				domain: updatedSite.domain,
				contactEmail: updatedSite.contactEmail ?? null,
				logoUrl: updatedSite.logoUrl ?? null,
				organizationId: updatedSite.organizationId,
				whitelistedDomains: updatedSite.whitelistedDomains,
				defaultParticipantIds: updatedSite.defaultParticipantIds ?? null,
			};
		}),
});
