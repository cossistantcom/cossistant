import {
	deleteKnowledge,
	deleteKnowledgeByLinkSource,
	getKnowledgeById,
	getKnowledgeCountByType,
	getTotalKnowledgeSizeBytes,
	getTotalUrlKnowledgeCount,
	listKnowledgeByLinkSource,
	updateKnowledge,
	upsertKnowledge,
} from "@api/db/queries/knowledge";
import {
	createLinkSource,
	deleteLinkSource,
	getLinkSourceById,
	getLinkSourceByUrl,
	getLinkSourceCount,
	getLinkSourceTotalSize,
	listLinkSources,
	updateLinkSource,
} from "@api/db/queries/link-source";
import { getWebsiteBySlugWithAccess } from "@api/db/queries/website";
import type { LinkSourceSelect } from "@api/db/schema/link-source";
import { getPlanForWebsite } from "@api/lib/plans/access";
import { firecrawlService } from "@api/services/firecrawl";
import { cancelWebCrawl, triggerWebCrawl } from "@api/utils/queue-triggers";
import {
	cancelLinkSourceRequestSchema,
	createLinkSourceRequestSchema,
	deleteLinkSourceRequestSchema,
	deletePageRequestSchema,
	getCrawlStatusRequestSchema,
	getLinkSourceRequestSchema,
	getTrainingStatsRequestSchema,
	ignorePageRequestSchema,
	type LinkSourceResponse,
	linkSourceResponseSchema,
	listKnowledgeByLinkSourceRequestSchema,
	listLinkSourcesRequestSchema,
	listLinkSourcesResponseSchema,
	recrawlLinkSourceRequestSchema,
	reindexPageRequestSchema,
	scanSubpagesRequestSchema,
	toggleKnowledgeIncludedRequestSchema,
	trainingStatsResponseSchema,
} from "@plasma/types";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";
import { removeLinkSourceKnowledgePage } from "./link-source-cleanup";

function toLinkSourceResponse(entry: LinkSourceSelect): LinkSourceResponse {
	return {
		id: entry.id,
		organizationId: entry.organizationId,
		websiteId: entry.websiteId,
		aiAgentId: entry.aiAgentId,
		parentLinkSourceId: entry.parentLinkSourceId,
		url: entry.url,
		status: entry.status,
		firecrawlJobId: entry.firecrawlJobId,
		depth: entry.depth,
		discoveredPagesCount: entry.discoveredPagesCount,
		crawledPagesCount: entry.crawledPagesCount,
		totalSizeBytes: entry.totalSizeBytes,
		includePaths: entry.includePaths,
		excludePaths: entry.excludePaths,
		ignoredUrls: entry.ignoredUrls,
		lastCrawledAt: entry.lastCrawledAt,
		errorMessage: entry.errorMessage,
		createdAt: entry.createdAt,
		updatedAt: entry.updatedAt,
		deletedAt: entry.deletedAt,
	};
}

// Convert MB to bytes
const MB_TO_BYTES = 1024 * 1024;

/**
 * Helper to convert FeatureValue to a number limit
 * Returns null for unlimited (null or boolean true)
 * Returns 0 for disabled (boolean false)
 * Returns the number for numeric limits
 */
function toNumericLimit(value: number | boolean | null): number | null {
	if (value === null || value === true) {
		return null; // unlimited
	}
	if (value === false) {
		return 0; // disabled
	}
	return value; // numeric limit
}

export const linkSourceRouter = createTRPCRouter({
	/**
	 * List link sources with filters and pagination
	 */
	list: protectedProcedure
		.input(listLinkSourcesRequestSchema)
		.output(listLinkSourcesResponseSchema)
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

			const result = await listLinkSources(db, {
				organizationId: websiteData.organizationId,
				websiteId: websiteData.id,
				aiAgentId: input.aiAgentId,
				status: input.status,
				page: input.page,
				limit: input.limit,
			});

			return {
				items: result.items.map(toLinkSourceResponse),
				pagination: result.pagination,
			};
		}),

	/**
	 * Get a single link source by ID
	 */
	get: protectedProcedure
		.input(getLinkSourceRequestSchema)
		.output(linkSourceResponseSchema.nullable())
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

			const entry = await getLinkSourceById(db, {
				id: input.id,
				websiteId: websiteData.id,
			});

			if (!entry) {
				return null;
			}

			return toLinkSourceResponse(entry);
		}),

	/**
	 * Create a new link source and trigger crawl via worker
	 */
	create: protectedProcedure
		.input(createLinkSourceRequestSchema)
		.output(linkSourceResponseSchema)
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

			// Check if this URL already exists
			const existingSource = await getLinkSourceByUrl(db, {
				websiteId: websiteData.id,
				aiAgentId: input.aiAgentId ?? null,
				url: input.url,
			});

			if (existingSource) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "This URL has already been added as a source",
				});
			}

			// Check plan limits
			const planInfo = await getPlanForWebsite(websiteData);
			const linkLimit = toNumericLimit(
				planInfo.features["ai-agent-training-links"]
			);

			if (linkLimit !== null) {
				const currentCount = await getLinkSourceCount(db, {
					websiteId: websiteData.id,
					aiAgentId: input.aiAgentId ?? null,
				});

				if (currentCount >= linkLimit) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: `You have reached the limit of ${linkLimit} link sources for your plan. Please upgrade to add more.`,
					});
				}
			}

			// Check total pages limit
			const totalPagesLimit = toNumericLimit(
				planInfo.features["ai-agent-training-pages-total"]
			);

			// Get current total pages count
			const currentTotalPages = await getTotalUrlKnowledgeCount(db, {
				websiteId: websiteData.id,
				aiAgentId: input.aiAgentId ?? null,
			});

			if (totalPagesLimit !== null && currentTotalPages >= totalPagesLimit) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: `You have reached the limit of ${totalPagesLimit} total pages for your plan. Please upgrade to crawl more pages.`,
				});
			}

			// Create the link source with pending status
			const entry = await createLinkSource(db, {
				organizationId: websiteData.organizationId,
				websiteId: websiteData.id,
				aiAgentId: input.aiAgentId ?? null,
				parentLinkSourceId: input.parentLinkSourceId ?? null,
				url: input.url,
				includePaths: input.includePaths,
				excludePaths: input.excludePaths,
			});

			// Get crawl page limit from plan (separate from link source count limit)
			const crawlPagesLimit = toNumericLimit(
				planInfo.features["ai-agent-crawl-pages-per-source"]
			);
			let crawlLimit = crawlPagesLimit ?? 1000; // Default 1000 if unlimited

			// If total pages limit is set, also constrain by remaining pages
			if (totalPagesLimit !== null) {
				const remainingPages = totalPagesLimit - currentTotalPages;
				crawlLimit = Math.min(crawlLimit, Math.max(0, remainingPages));
			}

			// Enqueue the crawl job - worker will handle the actual crawling using v2 API
			try {
				await triggerWebCrawl({
					linkSourceId: entry.id,
					websiteId: websiteData.id,
					organizationId: websiteData.organizationId,
					aiAgentId: input.aiAgentId ?? null,
					url: input.url,
					crawlLimit,
					createdBy: user.id,
					includePaths: input.includePaths,
					excludePaths: input.excludePaths,
					maxDepth: input.maxDepth,
				});
			} catch (error) {
				// If queueing fails, mark the link source as failed
				console.error(
					"[link-source:create] Failed to enqueue crawl job:",
					error
				);
				await updateLinkSource(db, {
					id: entry.id,
					websiteId: websiteData.id,
					status: "failed",
					errorMessage: "Failed to queue crawl job. Please try again.",
				});

				return toLinkSourceResponse({
					...entry,
					status: "failed",
					errorMessage: "Failed to queue crawl job. Please try again.",
				});
			}

			// Return the link source with pending status
			// Frontend will poll for status updates
			return toLinkSourceResponse(entry);
		}),

	/**
	 * Delete a link source
	 */
	delete: protectedProcedure
		.input(deleteLinkSourceRequestSchema)
		.output(linkSourceResponseSchema.pick({ id: true }))
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

			// Get the link source first
			const linkSourceEntry = await getLinkSourceById(db, {
				id: input.id,
				websiteId: websiteData.id,
			});

			if (!linkSourceEntry) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Link source not found",
				});
			}

			// If there's a pending or active crawl, try to cancel both BullMQ job and Firecrawl job
			if (
				linkSourceEntry.status === "pending" ||
				linkSourceEntry.status === "crawling"
			) {
				// Cancel BullMQ queue job (for pending jobs)
				try {
					await cancelWebCrawl(input.id);
				} catch (error) {
					console.error(
						"[link-source:delete] Failed to cancel BullMQ job:",
						error
					);
					// Continue with deletion even if cancellation fails
				}

				// Cancel Firecrawl crawl job (for active crawls)
				if (linkSourceEntry.firecrawlJobId) {
					try {
						await firecrawlService.cancelCrawl(linkSourceEntry.firecrawlJobId);
						console.log(
							`[link-source:delete] Cancelled Firecrawl crawl job ${linkSourceEntry.firecrawlJobId}`
						);
					} catch (error) {
						console.error(
							"[link-source:delete] Failed to cancel Firecrawl crawl job:",
							error
						);
						// Continue with deletion even if cancellation fails
					}
				}
			}

			await deleteKnowledgeByLinkSource(db, {
				linkSourceId: input.id,
				websiteId: websiteData.id,
			});

			const deleted = await deleteLinkSource(db, {
				id: input.id,
				websiteId: websiteData.id,
			});

			if (!deleted) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Link source not found",
				});
			}

			return { id: input.id };
		}),

	/**
	 * Cancel a crawl in progress
	 */
	cancel: protectedProcedure
		.input(cancelLinkSourceRequestSchema)
		.output(linkSourceResponseSchema)
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

			const linkSourceEntry = await getLinkSourceById(db, {
				id: input.id,
				websiteId: websiteData.id,
			});

			if (!linkSourceEntry) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Link source not found",
				});
			}

			// Only allow cancelling pending or crawling jobs
			if (
				linkSourceEntry.status !== "pending" &&
				linkSourceEntry.status !== "crawling"
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Cannot cancel a crawl with status "${linkSourceEntry.status}"`,
				});
			}

			// Cancel BullMQ queue job (for pending jobs)
			try {
				await cancelWebCrawl(input.id);
			} catch (error) {
				console.error(
					"[link-source:cancel] Failed to cancel BullMQ job:",
					error
				);
				// Continue even if cancellation fails
			}

			// Cancel Firecrawl crawl job (for active crawls)
			if (linkSourceEntry.firecrawlJobId) {
				try {
					await firecrawlService.cancelCrawl(linkSourceEntry.firecrawlJobId);
					console.log(
						`[link-source:cancel] Cancelled Firecrawl crawl job ${linkSourceEntry.firecrawlJobId}`
					);
				} catch (error) {
					console.error(
						"[link-source:cancel] Failed to cancel Firecrawl crawl job:",
						error
					);
					// Continue even if cancellation fails
				}
			}

			// Update status to failed with cancellation message
			const updatedEntry = await updateLinkSource(db, {
				id: input.id,
				websiteId: websiteData.id,
				status: "failed",
				errorMessage: "Cancelled by user",
			});

			return toLinkSourceResponse(updatedEntry ?? linkSourceEntry);
		}),

	/**
	 * Trigger a recrawl of an existing link source via worker
	 */
	recrawl: protectedProcedure
		.input(recrawlLinkSourceRequestSchema)
		.output(linkSourceResponseSchema)
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

			const linkSourceEntry = await getLinkSourceById(db, {
				id: input.id,
				websiteId: websiteData.id,
			});

			if (!linkSourceEntry) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Link source not found",
				});
			}

			// Don't allow recrawl if already crawling or pending
			if (
				linkSourceEntry.status === "crawling" ||
				linkSourceEntry.status === "pending"
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "A crawl is already in progress for this source",
				});
			}

			// Get crawl page limit from plan
			const planInfo = await getPlanForWebsite(websiteData);
			const crawlPagesLimit = toNumericLimit(
				planInfo.features["ai-agent-crawl-pages-per-source"]
			);
			let crawlLimit = crawlPagesLimit ?? 1000; // Default 1000 if unlimited

			// Check total pages limit (for recrawl, existing pages from this source will be replaced)
			const totalPagesLimit = toNumericLimit(
				planInfo.features["ai-agent-training-pages-total"]
			);

			if (totalPagesLimit !== null) {
				const currentTotalPages = await getTotalUrlKnowledgeCount(db, {
					websiteId: websiteData.id,
					aiAgentId: linkSourceEntry.aiAgentId,
				});

				// For recrawl, we can use the current source's page count as "free" slots
				const existingPagesInSource = linkSourceEntry.crawledPagesCount ?? 0;
				const otherPagesCount = currentTotalPages - existingPagesInSource;
				const remainingPages = totalPagesLimit - otherPagesCount;
				crawlLimit = Math.min(crawlLimit, Math.max(0, remainingPages));
			}

			// Reset link source to pending status
			const updatedEntry = await updateLinkSource(db, {
				id: input.id,
				websiteId: websiteData.id,
				status: "pending",
				firecrawlJobId: null,
				errorMessage: null,
			});

			// Enqueue the crawl job - worker will handle the actual crawling using v2 API
			try {
				await triggerWebCrawl({
					linkSourceId: input.id,
					websiteId: websiteData.id,
					organizationId: websiteData.organizationId,
					aiAgentId: linkSourceEntry.aiAgentId,
					url: linkSourceEntry.url,
					crawlLimit,
					createdBy: user.id,
					includePaths: linkSourceEntry.includePaths,
					excludePaths: linkSourceEntry.excludePaths,
					// Keep recrawl conservative and aligned with create defaults.
					maxDepth: 1,
				});
			} catch (error) {
				// If queueing fails, mark the link source as failed
				console.error(
					"[link-source:recrawl] Failed to enqueue crawl job:",
					error
				);
				await updateLinkSource(db, {
					id: input.id,
					websiteId: websiteData.id,
					status: "failed",
					errorMessage: "Failed to queue crawl job. Please try again.",
				});

				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to queue crawl job. Please try again.",
				});
			}

			return toLinkSourceResponse(updatedEntry ?? linkSourceEntry);
		}),

	/**
	 * Get crawl status (worker updates the database)
	 */
	getCrawlStatus: protectedProcedure
		.input(getCrawlStatusRequestSchema)
		.output(linkSourceResponseSchema)
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

			const linkSourceEntry = await getLinkSourceById(db, {
				id: input.id,
				websiteId: websiteData.id,
			});

			if (!linkSourceEntry) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Link source not found",
				});
			}

			// Worker handles all status updates - just return current state
			return toLinkSourceResponse(linkSourceEntry);
		}),

	/**
	 * List knowledge entries for a specific link source
	 */
	listKnowledgeByLinkSource: protectedProcedure
		.input(listKnowledgeByLinkSourceRequestSchema)
		.output(
			z.object({
				items: z.array(
					z.object({
						id: z.string(),
						sourceUrl: z.string().nullable(),
						sourceTitle: z.string().nullable(),
						type: z.string(),
						isIncluded: z.boolean(),
						sizeBytes: z.number(),
						createdAt: z.string(),
						updatedAt: z.string(),
					})
				),
				pagination: z.object({
					page: z.number(),
					limit: z.number(),
					total: z.number(),
					hasMore: z.boolean(),
				}),
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

			const linkSourceEntry = await getLinkSourceById(db, {
				id: input.linkSourceId,
				websiteId: websiteData.id,
			});

			if (!linkSourceEntry) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Link source not found",
				});
			}

			const result = await listKnowledgeByLinkSource(db, {
				linkSourceId: input.linkSourceId,
				page: input.page,
				limit: input.limit,
			});

			return {
				items: result.items.map((item) => ({
					id: item.id,
					sourceUrl: item.sourceUrl,
					sourceTitle: item.sourceTitle,
					type: item.type,
					isIncluded: item.isIncluded,
					sizeBytes: Number(item.sizeBytes),
					createdAt: item.createdAt,
					updatedAt: item.updatedAt,
				})),
				pagination: result.pagination,
			};
		}),

	/**
	 * Toggle whether a knowledge entry is included in training
	 */
	toggleKnowledgeIncluded: protectedProcedure
		.input(toggleKnowledgeIncludedRequestSchema)
		.output(z.object({ id: z.string(), isIncluded: z.boolean() }))
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

			const updated = await updateKnowledge(db, {
				id: input.knowledgeId,
				websiteId: websiteData.id,
				isIncluded: input.isIncluded,
			});

			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Knowledge entry not found",
				});
			}

			return {
				id: updated.id,
				isIncluded: updated.isIncluded,
			};
		}),

	/**
	 * Get knowledge content (markdown) by ID
	 */
	getKnowledgeContent: protectedProcedure
		.input(
			z.object({
				websiteSlug: z.string(),
				knowledgeId: z.string(),
			})
		)
		.output(
			z.object({
				id: z.string(),
				sourceUrl: z.string().nullable(),
				sourceTitle: z.string().nullable(),
				markdown: z.string(),
				sizeBytes: z.number(),
				createdAt: z.string(),
				updatedAt: z.string(),
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

			const knowledgeEntry = await getKnowledgeById(db, {
				id: input.knowledgeId,
				websiteId: websiteData.id,
			});

			if (!knowledgeEntry) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Knowledge entry not found",
				});
			}

			// Extract markdown from payload
			const payload = knowledgeEntry.payload as {
				markdown?: string;
			} | null;
			const markdown = payload?.markdown ?? "";

			return {
				id: knowledgeEntry.id,
				sourceUrl: knowledgeEntry.sourceUrl,
				sourceTitle: knowledgeEntry.sourceTitle,
				markdown,
				sizeBytes: Number(knowledgeEntry.sizeBytes),
				createdAt: knowledgeEntry.createdAt,
				updatedAt: knowledgeEntry.updatedAt,
			};
		}),

	/**
	 * Scan subpages of a specific knowledge entry (scan deeper)
	 */
	scanSubpages: protectedProcedure
		.input(scanSubpagesRequestSchema)
		.output(linkSourceResponseSchema)
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

			const parentLinkSource = await getLinkSourceById(db, {
				id: input.linkSourceId,
				websiteId: websiteData.id,
			});

			if (!parentLinkSource) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Link source not found",
				});
			}

			// Get the knowledge entry to find its URL
			const knowledgeList = await listKnowledgeByLinkSource(db, {
				linkSourceId: input.linkSourceId,
				page: 1,
				limit: 1000,
			});

			const knowledgeEntry = knowledgeList.items.find(
				(k) => k.id === input.knowledgeId
			);

			if (!knowledgeEntry?.sourceUrl) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Knowledge entry not found or has no source URL",
				});
			}

			// Check if this URL already has a link source
			const existingSource = await getLinkSourceByUrl(db, {
				websiteId: websiteData.id,
				aiAgentId: parentLinkSource.aiAgentId,
				url: knowledgeEntry.sourceUrl,
			});

			if (existingSource) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "A crawl already exists for this URL",
				});
			}

			// Get crawl page limit from plan
			const planInfo = await getPlanForWebsite(websiteData);
			const crawlPagesLimit = toNumericLimit(
				planInfo.features["ai-agent-crawl-pages-per-source"]
			);
			let crawlLimit = crawlPagesLimit ?? 1000; // Default 1000 if unlimited

			// Check total pages limit
			const totalPagesLimit = toNumericLimit(
				planInfo.features["ai-agent-training-pages-total"]
			);

			if (totalPagesLimit !== null) {
				const currentTotalPages = await getTotalUrlKnowledgeCount(db, {
					websiteId: websiteData.id,
					aiAgentId: parentLinkSource.aiAgentId,
				});

				if (currentTotalPages >= totalPagesLimit) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: `You have reached the limit of ${totalPagesLimit} total pages for your plan. Please upgrade to scan more pages.`,
					});
				}

				const remainingPages = totalPagesLimit - currentTotalPages;
				crawlLimit = Math.min(crawlLimit, Math.max(0, remainingPages));
			}

			// Create a new child link source
			const newLinkSource = await createLinkSource(db, {
				organizationId: websiteData.organizationId,
				websiteId: websiteData.id,
				aiAgentId: parentLinkSource.aiAgentId,
				parentLinkSourceId: parentLinkSource.id,
				url: knowledgeEntry.sourceUrl,
				depth: parentLinkSource.depth + 1,
				includePaths: parentLinkSource.includePaths,
				excludePaths: parentLinkSource.excludePaths,
			});

			// Enqueue the crawl job using v2 API
			try {
				await triggerWebCrawl({
					linkSourceId: newLinkSource.id,
					websiteId: websiteData.id,
					organizationId: websiteData.organizationId,
					aiAgentId: parentLinkSource.aiAgentId,
					url: knowledgeEntry.sourceUrl,
					crawlLimit,
					createdBy: user.id,
					includePaths: parentLinkSource.includePaths,
					excludePaths: parentLinkSource.excludePaths,
					maxDepth: 1, // Only scan direct subpages
				});
			} catch (error) {
				console.error(
					"[link-source:scanSubpages] Failed to enqueue crawl job:",
					error
				);
				await updateLinkSource(db, {
					id: newLinkSource.id,
					websiteId: websiteData.id,
					status: "failed",
					errorMessage: "Failed to queue crawl job. Please try again.",
				});

				return toLinkSourceResponse({
					...newLinkSource,
					status: "failed",
					errorMessage: "Failed to queue crawl job. Please try again.",
				});
			}

			return toLinkSourceResponse(newLinkSource);
		}),

	/**
	 * Ignore a page - adds URL to ignoredUrls array and removes the knowledge entry
	 */
	ignorePage: protectedProcedure
		.input(ignorePageRequestSchema)
		.output(z.object({ success: z.boolean() }))
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

			// Get the link source
			const linkSourceEntry = await getLinkSourceById(db, {
				id: input.linkSourceId,
				websiteId: websiteData.id,
			});

			if (!linkSourceEntry) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Link source not found",
				});
			}

			// Get the knowledge entry
			const knowledgeEntry = await getKnowledgeById(db, {
				id: input.knowledgeId,
				websiteId: websiteData.id,
			});

			if (!knowledgeEntry) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Knowledge entry not found",
				});
			}

			if (!knowledgeEntry.sourceUrl) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Knowledge entry has no source URL",
				});
			}

			if (knowledgeEntry.linkSourceId !== input.linkSourceId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Knowledge entry does not belong to this link source",
				});
			}

			const deleted = await removeLinkSourceKnowledgePage({
				db,
				websiteId: websiteData.id,
				linkSourceId: input.linkSourceId,
				knowledgeId: input.knowledgeId,
				sourceUrl: knowledgeEntry.sourceUrl,
				ignoredUrls: linkSourceEntry.ignoredUrls ?? null,
				ignoreFutureCrawls: true,
			});

			if (!deleted) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Knowledge entry not found",
				});
			}

			return { success: true };
		}),

	/**
	 * Reindex (re-scrape) a single page
	 */
	reindexPage: protectedProcedure
		.input(reindexPageRequestSchema)
		.output(
			z.object({
				id: z.string(),
				sourceUrl: z.string().nullable(),
				sourceTitle: z.string().nullable(),
				sizeBytes: z.number(),
			})
		)
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

			// Get the link source
			const linkSourceEntry = await getLinkSourceById(db, {
				id: input.linkSourceId,
				websiteId: websiteData.id,
			});

			if (!linkSourceEntry) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Link source not found",
				});
			}

			// Get the knowledge entry
			const knowledgeEntry = await getKnowledgeById(db, {
				id: input.knowledgeId,
				websiteId: websiteData.id,
			});

			if (!knowledgeEntry) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Knowledge entry not found",
				});
			}

			if (!knowledgeEntry.sourceUrl) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Knowledge entry has no source URL",
				});
			}

			// Use Firecrawl to scrape the single page
			const scrapeResult = await firecrawlService.scrapeSinglePage(
				knowledgeEntry.sourceUrl
			);

			if (!(scrapeResult.success && scrapeResult.data)) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: scrapeResult.error ?? "Failed to scrape page",
				});
			}

			// Calculate size
			const sizeBytes = new TextEncoder().encode(
				scrapeResult.data.markdown
			).length;

			// Update the knowledge entry
			const updatedEntry = await upsertKnowledge(db, {
				organizationId: websiteData.organizationId,
				websiteId: websiteData.id,
				aiAgentId: linkSourceEntry.aiAgentId,
				linkSourceId: input.linkSourceId,
				type: "url",
				sourceUrl: knowledgeEntry.sourceUrl,
				sourceTitle:
					scrapeResult.data.title ?? scrapeResult.data.ogTitle ?? null,
				origin: "reindex",
				createdBy: user.id,
				payload: {
					markdown: scrapeResult.data.markdown,
					headings: [],
					links: [],
					images: [],
					estimatedTokens: Math.ceil(scrapeResult.data.markdown.length / 4),
				},
				metadata: {
					source: "firecrawl",
					reindexedAt: new Date().toISOString(),
				},
				sizeBytes,
				isIncluded: knowledgeEntry.isIncluded,
			});

			return {
				id: updatedEntry.id,
				sourceUrl: updatedEntry.sourceUrl,
				sourceTitle: updatedEntry.sourceTitle,
				sizeBytes: Number(updatedEntry.sizeBytes),
			};
		}),

	/**
	 * Delete a page from knowledge base (without ignoring future crawls)
	 */
	deletePage: protectedProcedure
		.input(deletePageRequestSchema)
		.output(z.object({ success: z.boolean() }))
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

			// Get the knowledge entry
			const knowledgeEntry = await getKnowledgeById(db, {
				id: input.knowledgeId,
				websiteId: websiteData.id,
			});

			if (!knowledgeEntry) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Knowledge entry not found",
				});
			}

			const deleted = knowledgeEntry.linkSourceId
				? await removeLinkSourceKnowledgePage({
						db,
						websiteId: websiteData.id,
						linkSourceId: knowledgeEntry.linkSourceId,
						knowledgeId: input.knowledgeId,
						sourceUrl: knowledgeEntry.sourceUrl,
						ignoredUrls: null,
						ignoreFutureCrawls: false,
					})
				: await deleteKnowledge(db, {
						id: input.knowledgeId,
						websiteId: websiteData.id,
					});

			if (!deleted) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Knowledge entry not found",
				});
			}

			return { success: true };
		}),

	/**
	 * Get training statistics
	 */
	getTrainingStats: protectedProcedure
		.input(getTrainingStatsRequestSchema)
		.output(trainingStatsResponseSchema)
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

			// Get plan limits
			const planInfo = await getPlanForWebsite(websiteData);
			const linkLimit = toNumericLimit(
				planInfo.features["ai-agent-training-links"]
			);
			const sizeLimitMb = toNumericLimit(
				planInfo.features["ai-agent-training-mb"]
			);
			const sizeLimitBytes =
				sizeLimitMb !== null ? sizeLimitMb * MB_TO_BYTES : null;
			const crawlPagesPerSourceLimit = toNumericLimit(
				planInfo.features["ai-agent-crawl-pages-per-source"]
			);
			const totalPagesLimit = toNumericLimit(
				planInfo.features["ai-agent-training-pages-total"]
			);
			const faqLimit = toNumericLimit(
				planInfo.features["ai-agent-training-faqs"]
			);
			const fileLimit = toNumericLimit(
				planInfo.features["ai-agent-training-files"]
			);

			// Get link source count
			const linkSourcesCount = await getLinkSourceCount(db, {
				websiteId: websiteData.id,
				aiAgentId: input.aiAgentId ?? undefined,
			});

			// Get knowledge counts by type using efficient queries
			const [urlKnowledgeCount, faqKnowledgeCount, articleKnowledgeCount] =
				await Promise.all([
					getKnowledgeCountByType(db, {
						websiteId: websiteData.id,
						aiAgentId: input.aiAgentId ?? null,
						type: "url",
					}),
					getKnowledgeCountByType(db, {
						websiteId: websiteData.id,
						aiAgentId: input.aiAgentId ?? null,
						type: "faq",
					}),
					getKnowledgeCountByType(db, {
						websiteId: websiteData.id,
						aiAgentId: input.aiAgentId ?? null,
						type: "article",
					}),
				]);

			// Get total size from knowledge table (includes all knowledge types)
			const totalSizeBytes = await getTotalKnowledgeSizeBytes(db, {
				websiteId: websiteData.id,
				aiAgentId: input.aiAgentId ?? null,
			});

			return {
				linkSourcesCount,
				urlKnowledgeCount,
				faqKnowledgeCount,
				articleKnowledgeCount,
				totalSizeBytes,
				planLimitBytes: sizeLimitBytes,
				planLimitLinks: linkLimit,
				crawlPagesPerSourceLimit,
				totalPagesLimit,
				planLimitFaqs: faqLimit,
				planLimitFiles: fileLimit,
			};
		}),
});
