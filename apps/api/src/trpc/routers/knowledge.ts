import {
	createKnowledge,
	deleteKnowledge,
	getKnowledgeById,
	getKnowledgeCountByType,
	getTotalKnowledgeSizeBytes,
	listKnowledge,
	updateKnowledge,
} from "@api/db/queries/knowledge";
import { syncLinkSourceStatsFromKnowledge } from "@api/db/queries/link-source";
import { getWebsiteBySlugWithAccess } from "@api/db/queries/website";
import { getPlanForWebsite } from "@api/lib/plans/access";
import {
	type ArticleKnowledgePayload,
	createKnowledgeRequestSchema,
	deleteKnowledgeRequestSchema,
	getKnowledgeRequestSchema,
	type KnowledgeResponse,
	knowledgeResponseSchema,
	listKnowledgeRequestSchema,
	listKnowledgeResponseSchema,
	toggleKnowledgeEntryIncludedRequestSchema,
	updateKnowledgeRequestSchema,
	uploadKnowledgeFileRequestSchema,
} from "@plasma/types";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../init";

/**
 * Convert feature value to numeric limit
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

// Regex for extracting H1 headings from markdown
const H1_HEADING_REGEX = /^#\s+(.+)$/m;
// Regex for removing file extensions
const FILE_EXTENSION_REGEX = /\.(md|txt)$/;

/**
 * Extract title from markdown content
 * Looks for first H1 heading, falls back to first non-empty line
 */
function extractTitleFromMarkdown(markdown: string): string | null {
	// Look for first H1 heading
	const h1Match = markdown.match(H1_HEADING_REGEX);
	if (h1Match?.[1]) {
		return h1Match[1].trim();
	}

	// Look for first non-empty line as fallback
	const lines = markdown.split("\n").filter((l) => l.trim());
	return lines[0]?.trim() ?? null;
}

function toKnowledgeResponse(entry: {
	id: string;
	organizationId: string;
	websiteId: string;
	aiAgentId: string | null;
	linkSourceId: string | null;
	type: "url" | "faq" | "article";
	sourceUrl: string | null;
	sourceTitle: string | null;
	origin: string;
	createdBy: string;
	contentHash: string;
	payload: unknown;
	metadata: unknown;
	isIncluded: boolean;
	sizeBytes: number;
	createdAt: string;
	updatedAt: string;
	deletedAt: string | null;
}): KnowledgeResponse {
	return {
		id: entry.id,
		organizationId: entry.organizationId,
		websiteId: entry.websiteId,
		aiAgentId: entry.aiAgentId,
		linkSourceId: entry.linkSourceId,
		type: entry.type,
		sourceUrl: entry.sourceUrl,
		sourceTitle: entry.sourceTitle,
		origin: entry.origin,
		createdBy: entry.createdBy,
		contentHash: entry.contentHash,
		payload: entry.payload as KnowledgeResponse["payload"],
		metadata: entry.metadata as KnowledgeResponse["metadata"],
		isIncluded: entry.isIncluded,
		sizeBytes: entry.sizeBytes,
		createdAt: entry.createdAt,
		updatedAt: entry.updatedAt,
		deletedAt: entry.deletedAt,
	};
}

export const knowledgeRouter = createTRPCRouter({
	/**
	 * List knowledge entries with filters and pagination
	 */
	list: protectedProcedure
		.input(listKnowledgeRequestSchema)
		.output(listKnowledgeResponseSchema)
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

			const result = await listKnowledge(db, {
				organizationId: websiteData.organizationId,
				websiteId: websiteData.id,
				type: input.type,
				aiAgentId: input.aiAgentId,
				page: input.page,
				limit: input.limit,
			});

			// Debug: Log first item's payload to verify title is returned
			if (result.items.length > 0 && input.type === "article") {
				const firstItem = result.items[0];
				console.log(
					"[knowledge.list] First article item payload:",
					JSON.stringify(firstItem?.payload, null, 2)
				);
			}

			return {
				items: result.items.map(toKnowledgeResponse),
				pagination: result.pagination,
			};
		}),

	/**
	 * Get a single knowledge entry by ID
	 */
	get: protectedProcedure
		.input(getKnowledgeRequestSchema)
		.output(knowledgeResponseSchema.nullable())
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

			const entry = await getKnowledgeById(db, {
				id: input.id,
				websiteId: websiteData.id,
			});

			if (!entry) {
				return null;
			}

			return toKnowledgeResponse(entry);
		}),

	/**
	 * Create a new knowledge entry
	 */
	create: protectedProcedure
		.input(createKnowledgeRequestSchema)
		.output(knowledgeResponseSchema)
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

			// Get plan info for limit checks
			const planInfo = await getPlanForWebsite(websiteData);

			// Check count limits for FAQs and articles (not URLs - those are handled by link-source)
			if (input.type === "faq") {
				const faqLimit = toNumericLimit(
					planInfo.features["ai-agent-training-faqs"]
				);
				if (faqLimit !== null) {
					const currentCount = await getKnowledgeCountByType(db, {
						websiteId: websiteData.id,
						aiAgentId: input.aiAgentId ?? null,
						type: "faq",
					});
					if (currentCount >= faqLimit) {
						throw new TRPCError({
							code: "FORBIDDEN",
							message: `You have reached the limit of ${faqLimit} FAQs for your plan. Please upgrade to add more.`,
						});
					}
				}
			} else if (input.type === "article") {
				const fileLimit = toNumericLimit(
					planInfo.features["ai-agent-training-files"]
				);
				if (fileLimit !== null) {
					const currentCount = await getKnowledgeCountByType(db, {
						websiteId: websiteData.id,
						aiAgentId: input.aiAgentId ?? null,
						type: "article",
					});
					if (currentCount >= fileLimit) {
						throw new TRPCError({
							code: "FORBIDDEN",
							message: `You have reached the limit of ${fileLimit} files for your plan. Please upgrade to add more.`,
						});
					}
				}
			}

			// Check MB size limit (applies to all types)
			const sizeLimitMb = toNumericLimit(
				planInfo.features["ai-agent-training-mb"]
			);
			if (sizeLimitMb !== null) {
				const sizeLimitBytes = sizeLimitMb * 1024 * 1024;
				const currentSize = await getTotalKnowledgeSizeBytes(db, {
					websiteId: websiteData.id,
					aiAgentId: input.aiAgentId ?? null,
				});
				const newEntrySize = new TextEncoder().encode(
					JSON.stringify(input.payload)
				).length;
				if (currentSize + newEntrySize > sizeLimitBytes) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: `Adding this entry would exceed your ${sizeLimitMb}MB knowledge base limit. Please upgrade for more storage.`,
					});
				}
			}

			const entry = await createKnowledge(db, {
				organizationId: websiteData.organizationId,
				websiteId: websiteData.id,
				aiAgentId: input.aiAgentId ?? null,
				type: input.type,
				sourceUrl: input.sourceUrl ?? null,
				sourceTitle: input.sourceTitle ?? null,
				origin: input.origin,
				createdBy: user.id,
				payload: input.payload,
				metadata: input.metadata ?? null,
			});

			return toKnowledgeResponse(entry);
		}),

	/**
	 * Update an existing knowledge entry
	 */
	update: protectedProcedure
		.input(updateKnowledgeRequestSchema)
		.output(knowledgeResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			// Debug: Log full received input
			console.log(
				"[knowledge.update] Full input received:",
				JSON.stringify(input, null, 2)
			);

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

			const entry = await updateKnowledge(db, {
				id: input.id,
				websiteId: websiteData.id,
				aiAgentId: input.aiAgentId,
				sourceUrl: input.sourceUrl,
				sourceTitle: input.sourceTitle,
				payload: input.payload,
				metadata: input.metadata ?? undefined,
			});

			// Debug: Log full result
			console.log(
				"[knowledge.update] Full result:",
				JSON.stringify(entry, null, 2)
			);

			if (!entry) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Knowledge entry not found",
				});
			}

			return toKnowledgeResponse(entry);
		}),

	/**
	 * Delete a knowledge entry
	 */
	delete: protectedProcedure
		.input(deleteKnowledgeRequestSchema)
		.output(knowledgeResponseSchema.pick({ id: true }))
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

			const knowledgeEntry = await getKnowledgeById(db, {
				id: input.id,
				websiteId: websiteData.id,
			});

			if (!knowledgeEntry) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Knowledge entry not found",
				});
			}

			const deleted = await deleteKnowledge(db, {
				id: input.id,
				websiteId: websiteData.id,
			});

			if (!deleted) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Knowledge entry not found",
				});
			}

			if (knowledgeEntry.linkSourceId && knowledgeEntry.type === "url") {
				await syncLinkSourceStatsFromKnowledge(db, {
					id: knowledgeEntry.linkSourceId,
					websiteId: websiteData.id,
				});
			}

			return { id: input.id };
		}),

	/**
	 * Toggle whether a knowledge entry is included in training
	 */
	toggleIncluded: protectedProcedure
		.input(toggleKnowledgeEntryIncludedRequestSchema)
		.output(knowledgeResponseSchema.pick({ id: true, isIncluded: true }))
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

			const entry = await updateKnowledge(db, {
				id: input.id,
				websiteId: websiteData.id,
				isIncluded: input.isIncluded,
			});

			if (!entry) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Knowledge entry not found",
				});
			}

			return { id: entry.id, isIncluded: entry.isIncluded };
		}),

	/**
	 * Upload a file (markdown or text) as an article knowledge entry
	 */
	uploadFile: protectedProcedure
		.input(uploadKnowledgeFileRequestSchema)
		.output(knowledgeResponseSchema)
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

			// Get plan info for limit checks
			const planInfo = await getPlanForWebsite(websiteData);

			// Check file count limit
			const fileLimit = toNumericLimit(
				planInfo.features["ai-agent-training-files"]
			);
			if (fileLimit !== null) {
				const currentCount = await getKnowledgeCountByType(db, {
					websiteId: websiteData.id,
					aiAgentId: input.aiAgentId ?? null,
					type: "article",
				});
				if (currentCount >= fileLimit) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: `You have reached the limit of ${fileLimit} files for your plan. Please upgrade to add more.`,
					});
				}
			}

			// Check MB size limit
			const sizeLimitMb = toNumericLimit(
				planInfo.features["ai-agent-training-mb"]
			);
			const fileSize = new TextEncoder().encode(input.fileContent).length;
			if (sizeLimitMb !== null) {
				const sizeLimitBytes = sizeLimitMb * 1024 * 1024;
				const currentSize = await getTotalKnowledgeSizeBytes(db, {
					websiteId: websiteData.id,
					aiAgentId: input.aiAgentId ?? null,
				});
				if (currentSize + fileSize > sizeLimitBytes) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: `Uploading this file would exceed your ${sizeLimitMb}MB knowledge base limit. Please upgrade for more storage.`,
					});
				}
			}

			// Parse content and extract title
			const markdown = input.fileContent;
			const title =
				extractTitleFromMarkdown(markdown) ??
				input.fileName.replace(FILE_EXTENSION_REGEX, "");

			// Create the payload
			const payload: ArticleKnowledgePayload = {
				title,
				summary: null,
				markdown,
				keywords: [],
			};

			// Create article knowledge entry
			const entry = await createKnowledge(db, {
				organizationId: websiteData.organizationId,
				websiteId: websiteData.id,
				aiAgentId: input.aiAgentId ?? null,
				type: "article",
				sourceTitle: title,
				origin: "file-upload",
				createdBy: user.id,
				payload,
				sizeBytes: fileSize,
			});

			return toKnowledgeResponse(entry);
		}),
});
