/** biome-ignore-all lint/style/useBlockStatements: ok here */
import {
	createApiKey,
	createDefaultWebsiteKeys,
	getApiKeyById,
	getApiKeysByOrganization,
	revokeApiKey,
} from "@api/db/queries/api-keys";
import { getConversationSentimentSatisfactionAggregate } from "@api/db/queries/conversation";
import { getWebsiteFeedbackSatisfactionAggregate } from "@api/db/queries/feedback";
import { scheduleWebsiteLifecycleSequence } from "@api/db/queries/lifecycle-email";
import {
	getOrganizationMemberByUserId,
	getWebsiteMemberById,
	getWebsiteMembers,
	type WebsiteMember,
} from "@api/db/queries/member";
import {
	deleteWebsiteOpenRouterKey,
	getWebsiteOpenRouterKey,
	setWebsiteOpenRouterKeyEnabled,
	toOpenRouterByokPublicState,
	upsertWebsiteOpenRouterKey,
} from "@api/db/queries/openrouter-byok";
import { createDefaultWebsiteViews } from "@api/db/queries/view";
import {
	createWebsite,
	findVerifiedWebsiteByDomain,
	getActiveWebsiteBySlug,
	getWebsiteApiKeyScope,
	getWebsiteById,
	getWebsiteBySlugWithAccess,
	listWebsiteListItemsForOrganization,
	permanentlyDeleteWebsite,
	updateWebsite,
	WebsiteSlugConflictError,
} from "@api/db/queries/website";
import { session as sessionTable, type WebsiteInsert } from "@api/db/schema";
import { env } from "@api/env";
import {
	encryptOpenRouterApiKey,
	maskOpenRouterApiKey,
} from "@api/lib/openrouter-byok/encryption";
import { getPlanForWebsite } from "@api/lib/plans/access";
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
import { generateUniqueWebsiteSlug } from "@api/utils/domain-slug";
import {
	APIKeyType,
	checkWebsiteDomainRequestSchema,
	createWebsiteApiKeyRequestSchema,
	createWebsiteRequestSchema,
	createWebsiteResponseSchema,
	deleteWebsiteOpenRouterApiKeyRequestSchema,
	deleteWebsiteRequestSchema,
	deleteWebsiteResponseSchema,
	listByOrganizationRequestSchema,
	revokeWebsiteApiKeyRequestSchema,
	setWebsiteOpenRouterByokEnabledRequestSchema,
	updateWebsiteRequestSchema,
	upsertWebsiteOpenRouterApiKeyRequestSchema,
	websiteApiKeySchema,
	websiteDeveloperSettingsResponseSchema,
	websiteListItemSchema,
	websiteOpenRouterByokSettingsSchema,
	websiteSummarySchema,
} from "@cossistant/types";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
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
	options?: {
		includeRawKey?: boolean;
		linkedUser?: WebsiteMember | null;
	}
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
	linkedUserId: key.linkedUserId ?? null,
	linkedUser: options?.linkedUser ?? null,
});

function buildWebsiteMemberMap(members: WebsiteMember[]) {
	return new Map(
		members.map((websiteMember) => [websiteMember.id, websiteMember])
	);
}

function toWebsiteOpenRouterByokSettings(params: {
	record: Awaited<ReturnType<typeof getWebsiteOpenRouterKey>>;
	featureAvailable: boolean;
}) {
	return {
		...toOpenRouterByokPublicState(params.record),
		featureAvailable: params.featureAvailable,
		requiredPlan: "pro" as const,
	};
}

async function getWebsiteForOpenRouterByokMutation(params: {
	ctx: {
		db: Parameters<typeof getWebsiteOpenRouterKey>[0];
		user: { id: string };
	};
	organizationId: string;
	websiteId: string;
}) {
	const site = await getWebsiteById(params.ctx.db, {
		websiteId: params.websiteId,
		orgId: params.organizationId,
	});

	if (!site) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Website not found",
		});
	}

	const hasAdminAccess = await isOrganizationAdminOrOwner(params.ctx.db, {
		organizationId: params.organizationId,
		userId: params.ctx.user.id,
	});

	if (!hasAdminAccess) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message:
				"You do not have permission to manage OpenRouter keys for this website.",
		});
	}

	const planInfo = await getPlanForWebsite(site);
	if (planInfo.features["openrouter-byok"] !== true) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Bring your own OpenRouter key is available on the Pro plan.",
		});
	}

	return site;
}

const WEBSITE_CREATE_ERROR_MESSAGE = "Failed to create website";

const tinybirdEnabledResponseSchema = z.object({
	enabled: z.literal(true),
	token: z.string(),
	host: z.string(),
	expiresAt: z.number(),
	maxRetentionDays: z.number(),
});

const tinybirdDisabledResponseSchema = z.object({
	enabled: z.literal(false),
	token: z.null(),
	host: z.null(),
	expiresAt: z.null(),
	maxRetentionDays: z.null(),
});

const getTinybirdTokenResponseSchema = z.union([
	tinybirdEnabledResponseSchema,
	tinybirdDisabledResponseSchema,
]);

function logWebsiteCreateError(params: {
	error: unknown;
	organizationId: string;
	userId: string;
	domain: string;
	slug?: string;
}) {
	console.error("[website.create] Failed to create website", params);
}

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
			const membership = await getOrganizationMemberByUserId(db, {
				userId: user.id,
				organizationId: input.organizationId,
			});

			if (!membership) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You do not have access to this organization",
				});
			}

			// Get all websites for this organization
			const websites = await listWebsiteListItemsForOrganization(db, {
				organizationId: input.organizationId,
			});

			return websites;
		}),
	developerSettings: protectedProcedure
		.input(z.object({ slug: z.string() }))
		.output(websiteDeveloperSettingsResponseSchema)
		.query(async ({ ctx, input }) => {
			const site = await getActiveWebsiteBySlug(ctx.db, {
				websiteSlug: input.slug,
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
			const [planInfo, openRouterKey] = await Promise.all([
				getPlanForWebsite(site),
				getWebsiteOpenRouterKey(ctx.db, {
					organizationId: site.organizationId,
					websiteId: site.id,
				}),
			]);
			const members =
				site.teamId === null
					? []
					: await getWebsiteMembers(ctx.db, {
							organizationId: site.organizationId,
							websiteTeamId: site.teamId,
						});
			const memberMap = buildWebsiteMemberMap(members);

			return {
				website: {
					id: site.id,
					slug: site.slug,
					name: site.name,
					domain: site.domain,
					defaultLanguage: site.defaultLanguage,
					autoTranslateEnabled: site.autoTranslateEnabled,
					contactEmail: site.contactEmail ?? null,
					logoUrl: site.logoUrl ?? null,
					organizationId: site.organizationId,
					whitelistedDomains: site.whitelistedDomains,
					defaultParticipantIds: site.defaultParticipantIds ?? null,
				},
				apiKeys: apiKeys
					.filter((key) => key.isActive)
					.map((key) =>
						toWebsiteApiKey(key, {
							linkedUser:
								(key.linkedUserId && memberMap.get(key.linkedUserId)) || null,
						})
					),
				openRouterByok: toWebsiteOpenRouterByokSettings({
					record: openRouterKey,
					featureAvailable: planInfo.features["openrouter-byok"] === true,
				}),
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

			const existingDomainWebsite = await findVerifiedWebsiteByDomain(db, {
				domain: normalizedDomain,
			});

			if (existingDomainWebsite) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Domain already in use by another website",
				});
			}

			const userEmailDomain = user.email.split("@")[1]?.toLowerCase();
			const isDomainOwnershipVerified = userEmailDomain === normalizedDomain;

			const { createdWebsite, apiKeys } = await (async () => {
				let slug: string | undefined;

				try {
					slug = await generateUniqueWebsiteSlug(db, normalizedDomain);

					const websiteRecord = await createWebsite(db, {
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

					const [defaultApiKeys] = await Promise.all([
						createDefaultWebsiteKeys(db, {
							websiteId: websiteRecord.id,
							websiteName: input.name,
							organizationId: input.organizationId,
							createdBy: user.id,
						}),
						createDefaultWebsiteViews(db, {
							websiteId: websiteRecord.id,
							websiteName: input.name,
							organizationId: input.organizationId,
							createdBy: user.id,
						}),
					]);

					return { createdWebsite: websiteRecord, apiKeys: defaultApiKeys };
				} catch (error) {
					if (error instanceof WebsiteSlugConflictError) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message:
								"A conflicting website slug already exists. Please try again.",
						});
					}

					logWebsiteCreateError({
						error,
						organizationId: input.organizationId,
						userId: user.id,
						domain: normalizedDomain,
						slug,
					});

					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: WEBSITE_CREATE_ERROR_MESSAGE,
					});
				}
			})();

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

			try {
				await scheduleWebsiteLifecycleSequence(db, {
					organizationId: input.organizationId,
					websiteId: createdWebsite.id,
					websiteName: createdWebsite.name,
					websiteSlug: createdWebsite.slug,
				});
			} catch (error) {
				console.error("[lifecycle-email] Failed to schedule website sequence", {
					organizationId: input.organizationId,
					websiteId: createdWebsite.id,
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
			const site = await getWebsiteApiKeyScope(ctx.db, {
				websiteId: input.websiteId,
				organizationId: input.organizationId,
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

			let linkedUser: WebsiteMember | null = null;
			let linkedUserId: string | null = null;

			if (input.linkedUserId) {
				if (input.keyType !== APIKeyType.PRIVATE) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Only private API keys can be linked to a team member.",
					});
				}

				if (!site.teamId) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "This website does not have a team to link API keys to.",
					});
				}

				linkedUser = await getWebsiteMemberById(ctx.db, {
					organizationId: input.organizationId,
					websiteTeamId: site.teamId,
					userId: input.linkedUserId,
				});

				if (!linkedUser) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Linked team member not found for this website.",
					});
				}

				linkedUserId = linkedUser.id;
			}

			const createdKey = await createApiKey(ctx.db, {
				id: generateULID(),
				name: input.name,
				organizationId: input.organizationId,
				websiteId: input.websiteId,
				keyType: input.keyType,
				createdBy: ctx.user.id,
				linkedUserId,
				isTest: input.isTest,
			});

			return toWebsiteApiKey(createdKey, {
				includeRawKey: true,
				linkedUser,
			});
		}),
	revokeApiKey: protectedProcedure
		.input(revokeWebsiteApiKeyRequestSchema)
		.output(websiteApiKeySchema)
		.mutation(async ({ ctx, input }) => {
			const site = await getWebsiteApiKeyScope(ctx.db, {
				websiteId: input.websiteId,
				organizationId: input.organizationId,
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

			const linkedUser =
				revoked.linkedUserId && site.teamId
					? await getWebsiteMemberById(ctx.db, {
							organizationId: input.organizationId,
							websiteTeamId: site.teamId,
							userId: revoked.linkedUserId,
						})
					: null;

			return toWebsiteApiKey(revoked, { linkedUser });
		}),
	upsertOpenRouterApiKey: protectedProcedure
		.input(upsertWebsiteOpenRouterApiKeyRequestSchema)
		.output(websiteOpenRouterByokSettingsSchema)
		.mutation(async ({ ctx, input }) => {
			await getWebsiteForOpenRouterByokMutation({
				ctx,
				organizationId: input.organizationId,
				websiteId: input.websiteId,
			});

			const apiKey = input.apiKey.trim();
			const record = await upsertWebsiteOpenRouterKey(ctx.db, {
				organizationId: input.organizationId,
				websiteId: input.websiteId,
				encryptedApiKey: encryptOpenRouterApiKey({
					apiKey,
					secret: env.API_KEY_SECRET,
				}),
				maskedKey: maskOpenRouterApiKey(apiKey),
				userId: ctx.user.id,
			});

			return toWebsiteOpenRouterByokSettings({
				record,
				featureAvailable: true,
			});
		}),
	setOpenRouterByokEnabled: protectedProcedure
		.input(setWebsiteOpenRouterByokEnabledRequestSchema)
		.output(websiteOpenRouterByokSettingsSchema)
		.mutation(async ({ ctx, input }) => {
			await getWebsiteForOpenRouterByokMutation({
				ctx,
				organizationId: input.organizationId,
				websiteId: input.websiteId,
			});

			const existing = await getWebsiteOpenRouterKey(ctx.db, {
				organizationId: input.organizationId,
				websiteId: input.websiteId,
			});

			if (input.enabled && !existing) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Save an OpenRouter API key before enabling BYOK.",
				});
			}

			const record = existing
				? await setWebsiteOpenRouterKeyEnabled(ctx.db, {
						organizationId: input.organizationId,
						websiteId: input.websiteId,
						enabled: input.enabled,
						userId: ctx.user.id,
					})
				: null;

			return toWebsiteOpenRouterByokSettings({
				record,
				featureAvailable: true,
			});
		}),
	deleteOpenRouterApiKey: protectedProcedure
		.input(deleteWebsiteOpenRouterApiKeyRequestSchema)
		.output(websiteOpenRouterByokSettingsSchema)
		.mutation(async ({ ctx, input }) => {
			await getWebsiteForOpenRouterByokMutation({
				ctx,
				organizationId: input.organizationId,
				websiteId: input.websiteId,
			});

			await deleteWebsiteOpenRouterKey(ctx.db, {
				organizationId: input.organizationId,
				websiteId: input.websiteId,
			});

			return toWebsiteOpenRouterByokSettings({
				record: null,
				featureAvailable: true,
			});
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

			const existingWebsite = await findVerifiedWebsiteByDomain(db, {
				domain: normalizedDomain,
			});

			return !!existingWebsite;
		}),
	getTinybirdToken: protectedProcedure
		.input(z.object({ websiteSlug: z.string() }))
		.output(getTinybirdTokenResponseSchema)
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

			if (env.TINYBIRD_ENABLED === false) {
				return {
					enabled: false as const,
					token: null,
					host: null,
					expiresAt: null,
					maxRetentionDays: null,
				};
			}

			const token = await generateTinybirdJWT(websiteData.id);

			if (!token) {
				return {
					enabled: false as const,
					token: null,
					host: null,
					expiresAt: null,
					maxRetentionDays: null,
				};
			}

			return {
				enabled: true as const,
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
				getWebsiteFeedbackSatisfactionAggregate(db, {
					organizationId: websiteData.organizationId,
					websiteId: websiteData.id,
					dateFrom: input.dateFrom,
					dateTo: input.dateTo,
				}),
				getConversationSentimentSatisfactionAggregate(db, {
					organizationId: websiteData.organizationId,
					websiteId: websiteData.id,
					dateFrom: input.dateFrom,
					dateTo: input.dateTo,
				}),
			]);

			const ratingCount = ratingResult.count;
			const ratingScore =
				ratingCount > 0 ? toNumberOrNull(ratingResult.average) : null;

			const sentimentCount = sentimentResult.count;
			const sentimentScore =
				sentimentCount > 0 ? toNumberOrNull(sentimentResult.average) : null;

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
			const site = await getWebsiteById(ctx.db, {
				websiteId: input.websiteId,
				orgId: input.organizationId,
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
			if (input.data.defaultLanguage !== undefined) {
				updateData.defaultLanguage = input.data.defaultLanguage;
			}
			if (input.data.autoTranslateEnabled !== undefined) {
				updateData.autoTranslateEnabled = input.data.autoTranslateEnabled;
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
					const existingDomain = await findVerifiedWebsiteByDomain(ctx.db, {
						domain: normalizedDomain,
						excludeWebsiteId: site.id,
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
				defaultLanguage: updatedSite.defaultLanguage,
				autoTranslateEnabled: updatedSite.autoTranslateEnabled,
				contactEmail: updatedSite.contactEmail ?? null,
				logoUrl: updatedSite.logoUrl ?? null,
				organizationId: updatedSite.organizationId,
				whitelistedDomains: updatedSite.whitelistedDomains,
				defaultParticipantIds: updatedSite.defaultParticipantIds ?? null,
			};
		}),
});
