import { z } from "@hono/zod-openapi";
import { apiTimestampSchema, nullableApiTimestampSchema } from "./common";

export const knowledgeTypeSchema = z.enum(["url", "faq", "article"]).openapi({
	description: "Knowledge entry type",
	example: "url",
});

const headingSchema = z.object({
	level: z.number().int().min(1).max(6).openapi({
		description: "Heading level (1-6)",
		example: 2,
	}),
	text: z.string().min(1).openapi({
		description: "Heading text content",
		example: "Getting started",
	}),
});

const linkSchema = z.url().openapi({
	description: "Absolute URL discovered in the document",
	example: "https://docs.cossistant.com/guide",
});

const imageSchema = z.object({
	src: z.url().openapi({
		description: "Image URL captured during scraping",
		example: "https://cdn.cossistant.com/assets/hero.png",
	}),
	alt: z.string().nullable().openapi({
		description: "Optional alt text attached to the image",
		example: "Agent dashboard hero illustration",
	}),
});

export const urlKnowledgePayloadSchema = z
	.object({
		markdown: z.string().min(1).openapi({
			description: "Scraped markdown body",
			example: "# Welcome to the Help Center",
		}),
		headings: z.array(headingSchema).default([]),
		links: z.array(linkSchema).default([]),
		images: z.array(imageSchema).default([]),
		estimatedTokens: z.number().int().nonnegative().optional().openapi({
			description: "Heuristic token count to assist chunking",
			example: 2048,
		}),
	})
	.openapi({
		description: "Structured payload for raw page content",
	});

export const faqKnowledgePayloadSchema = z
	.object({
		question: z.string().min(1).openapi({
			description: "FAQ question",
			example: "How do I reset my password?",
		}),
		answer: z.string().min(1).openapi({
			description: "Answer shown to customers",
			example: "Go to Settings → Security and click Reset password.",
		}),
		categories: z.array(z.string()).default([]),
		relatedQuestions: z.array(z.string()).default([]),
	})
	.openapi({
		description: "Payload describing a single FAQ entry",
	});

export const articleKnowledgePayloadSchema = z
	.object({
		title: z.string().min(1).openapi({
			description: "Article title",
			example: "Billing and invoicing overview",
		}),
		summary: z.string().nullable().optional().openapi({
			description: "Short synopsis or excerpt",
			example: "Understand how billing cycles and invoices are generated.",
		}),
		markdown: z.string().min(1).openapi({
			description: "Article body in markdown format",
			example: "## Billing cycles\n\nCossistant bills you monthly...",
		}),
		keywords: z.array(z.string()).default([]),
		heroImage: imageSchema.optional(),
	})
	.openapi({
		description: "Payload describing a full article or help doc",
	});

const metadataSchema = z
	.record(z.string(), z.unknown())
	.nullish()
	.openapi({
		description: "Arbitrary metadata such as locale or crawl depth",
		example: {
			locale: "en-US",
			source: "firecrawl",
		},
	});

const baseKnowledgeFields = {
	organizationId: z.ulid().openapi({
		description: "Owning organization identifier",
		example: "01JG000000000000000000000",
	}),
	websiteId: z.ulid().openapi({
		description: "Website identifier",
		example: "01JG000000000000000000001",
	}),
	aiAgentId: z.ulid().nullable().optional().openapi({
		description:
			"Optional AI agent identifier; null/omitted means the entry is shared at the website scope.",
		example: "01JG000000000000000000002",
	}),
	sourceUrl: z.url().nullable().openapi({
		description:
			"Origin URL for this entry (required for url knowledge; optional for others)",
		example: "https://docs.cossistant.com/getting-started",
	}),
	sourceTitle: z.string().nullable().openapi({
		description: "Readable title captured during scraping",
		example: "Getting started with the Cossistant dashboard",
	}),
	origin: z.string().min(1).openapi({
		description:
			"Describes how this entry was created (crawl, manual, agent, etc.)",
		example: "crawl",
	}),
	createdBy: z.string().min(1).openapi({
		description:
			"Identifier of the actor (user, agent, system) that created this entry",
		example: "user_01JG00000000000000000000",
	}),
	contentHash: z.string().min(1).openapi({
		description: "Deterministic hash of the payload for deduping",
		example: "5d41402abc4b2a76b9719d911017c592",
	}),
	metadata: metadataSchema,
};

const urlKnowledgeSchema = z
	.object(baseKnowledgeFields)
	.extend({
		type: z.literal("url"),
		sourceUrl: z.url(),
		payload: urlKnowledgePayloadSchema,
	})
	.openapi({ description: "URL knowledge entry" });

const faqKnowledgeSchema = z
	.object(baseKnowledgeFields)
	.extend({
		type: z.literal("faq"),
		payload: faqKnowledgePayloadSchema,
	})
	.openapi({ description: "FAQ knowledge entry" });

const articleKnowledgeSchema = z
	.object(baseKnowledgeFields)
	.extend({
		type: z.literal("article"),
		sourceUrl: z.url().nullable(),
		payload: articleKnowledgePayloadSchema,
	})
	.openapi({ description: "Article knowledge entry" });

export const knowledgeCreateSchema = z.discriminatedUnion("type", [
	urlKnowledgeSchema,
	faqKnowledgeSchema,
	articleKnowledgeSchema,
]);

const knowledgeAuditFieldsSchema = z.object({
	id: z.ulid().openapi({
		description: "Knowledge entry identifier",
		example: "01JG00000000000000000000A",
	}),
	createdAt: apiTimestampSchema.openapi({
		description: "Creation timestamp",
		example: "2024-06-10T12:00:00.000Z",
	}),
	updatedAt: apiTimestampSchema.openapi({
		description: "Last update timestamp",
		example: "2024-06-11T08:00:00.000Z",
	}),
	deletedAt: nullableApiTimestampSchema.openapi({
		description: "Soft delete timestamp",
		example: null,
	}),
});

export const knowledgeSchema = knowledgeCreateSchema
	// Intersection preserves the discriminated union while adding persisted fields.
	.and(knowledgeAuditFieldsSchema)
	.openapi({
		description: "Persisted knowledge entry",
	});

export type KnowledgeType = z.infer<typeof knowledgeTypeSchema>;
export type UrlKnowledgePayload = z.infer<typeof urlKnowledgePayloadSchema>;
export type FaqKnowledgePayload = z.infer<typeof faqKnowledgePayloadSchema>;
export type ArticleKnowledgePayload = z.infer<
	typeof articleKnowledgePayloadSchema
>;
export type KnowledgeCreateInput = z.infer<typeof knowledgeCreateSchema>;
export type Knowledge = z.infer<typeof knowledgeSchema>;

// ============================================================================
// API Request/Response Schemas
// ============================================================================

/**
 * Knowledge response schema - used for single item responses
 */
export const knowledgeResponseSchema = z
	.object({
		id: z.ulid().openapi({
			description: "Knowledge entry identifier",
			example: "01JG00000000000000000000A",
		}),
		organizationId: z.ulid().openapi({
			description: "Owning organization identifier",
			example: "01JG000000000000000000000",
		}),
		websiteId: z.ulid().openapi({
			description: "Website identifier",
			example: "01JG000000000000000000001",
		}),
		aiAgentId: z.ulid().nullable().openapi({
			description:
				"Optional AI agent identifier; null means shared at website scope",
			example: "01JG000000000000000000002",
		}),
		linkSourceId: z.ulid().nullable().openapi({
			description: "Reference to the link source that created this entry",
			example: "01JG000000000000000000003",
		}),
		type: knowledgeTypeSchema,
		sourceUrl: z.url().nullable().openapi({
			description: "Origin URL for this entry",
			example: "https://docs.cossistant.com/getting-started",
		}),
		sourceTitle: z.string().nullable().openapi({
			description: "Readable title captured during scraping",
			example: "Getting started with the Cossistant dashboard",
		}),
		origin: z.string().openapi({
			description: "How this entry was created (crawl, manual, agent, etc.)",
			example: "crawl",
		}),
		createdBy: z.string().openapi({
			description: "Identifier of the actor that created this entry",
			example: "user_01JG00000000000000000000",
		}),
		contentHash: z.string().openapi({
			description: "Deterministic hash of the payload for deduping",
			example: "5d41402abc4b2a76b9719d911017c592",
		}),
		// Note: We use .passthrough() to prevent Zod's union validation from stripping
		// fields when the first matching schema doesn't include all fields from other schemas.
		payload: z.union([
			urlKnowledgePayloadSchema.passthrough(),
			faqKnowledgePayloadSchema.passthrough(),
			articleKnowledgePayloadSchema.passthrough(),
		]),
		metadata: metadataSchema,
		isIncluded: z.boolean().openapi({
			description: "Whether this entry is included in training",
			example: true,
		}),
		sizeBytes: z.number().int().nonnegative().openapi({
			description: "Size of this entry in bytes",
			example: 4096,
		}),
		createdAt: apiTimestampSchema.openapi({
			description: "Creation timestamp",
			example: "2024-06-10T12:00:00.000Z",
		}),
		updatedAt: apiTimestampSchema.openapi({
			description: "Last update timestamp",
			example: "2024-06-11T08:00:00.000Z",
		}),
		deletedAt: nullableApiTimestampSchema.openapi({
			description: "Soft delete timestamp",
			example: null,
		}),
	})
	.openapi({
		description: "Knowledge entry response",
	});

export type KnowledgeResponse = z.infer<typeof knowledgeResponseSchema>;

/**
 * List knowledge request schema (TRPC) - with websiteSlug
 */
export const listKnowledgeRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug to list knowledge for",
			example: "my-website",
		}),
		type: knowledgeTypeSchema.optional().openapi({
			description: "Filter by knowledge type",
			example: "url",
		}),
		aiAgentId: z.ulid().nullable().optional().openapi({
			description:
				"Filter by AI agent ID; null for shared entries; omit for all",
			example: "01JG000000000000000000002",
		}),
		isIncluded: z.boolean().optional().openapi({
			description:
				"Filter by whether the entry is currently included in training",
			example: true,
		}),
		linkSourceId: z.ulid().optional().openapi({
			description: "Filter by the link source that created this entry",
			example: "01JG000000000000000000003",
		}),
		page: z.coerce.number().int().positive().default(1).openapi({
			description: "Page number (1-indexed)",
			example: 1,
		}),
		limit: z.coerce.number().int().positive().max(100).default(20).openapi({
			description: "Items per page (max 100)",
			example: 20,
		}),
	})
	.openapi({
		description:
			"Request to list knowledge entries with filters and pagination",
	});

export type ListKnowledgeRequest = z.infer<typeof listKnowledgeRequestSchema>;

/**
 * List knowledge request schema (REST) - without websiteSlug (derived from API key)
 */
export const listKnowledgeRestRequestSchema = z
	.object({
		type: knowledgeTypeSchema.optional().openapi({
			description: "Filter by knowledge type",
			example: "url",
		}),
		aiAgentId: z
			.union([z.ulid(), z.literal("null"), z.literal("")])
			.optional()
			.openapi({
				description:
					'Filter by AI agent ID. Pass a valid ULID to filter by agent, pass "null" or empty string to filter for shared/website-scoped entries only, or omit entirely to return all entries.',
				example: "01JG000000000000000000002",
			}),
		isIncluded: z.enum(["true", "false"]).optional().openapi({
			description:
				'Filter by training inclusion. Pass "true" for included entries or "false" for excluded entries.',
			example: "true",
		}),
		linkSourceId: z.ulid().optional().openapi({
			description: "Filter by the link source that created this entry.",
			example: "01JG000000000000000000003",
		}),
		page: z.coerce.number().int().positive().default(1).openapi({
			description: "Page number (1-indexed)",
			example: 1,
		}),
		limit: z.coerce.number().int().positive().max(100).default(20).openapi({
			description: "Items per page (max 100)",
			example: 20,
		}),
	})
	.openapi({
		description:
			"Request to list knowledge entries with filters and pagination (REST)",
	});

export type ListKnowledgeRestRequest = z.infer<
	typeof listKnowledgeRestRequestSchema
>;

/**
 * List knowledge response schema
 */
export const listKnowledgeResponseSchema = z
	.object({
		items: z.array(knowledgeResponseSchema).openapi({
			description: "Array of knowledge entries",
		}),
		pagination: z
			.object({
				page: z.number().int().positive().openapi({
					description: "Current page number",
					example: 1,
				}),
				limit: z.number().int().positive().openapi({
					description: "Items per page",
					example: 20,
				}),
				total: z.number().int().nonnegative().openapi({
					description: "Total number of items",
					example: 100,
				}),
				hasMore: z.boolean().openapi({
					description: "Whether there are more items available",
					example: true,
				}),
			})
			.openapi({
				description: "Pagination metadata",
			}),
	})
	.openapi({
		description: "Paginated list of knowledge entries",
	});

export type ListKnowledgeResponse = z.infer<typeof listKnowledgeResponseSchema>;

export const knowledgeSearchRequestSchema = z
	.object({
		query: z.string().trim().min(1).max(2000).openapi({
			description: "Natural-language retrieval query.",
			example: "How do I update billing details?",
		}),
		limit: z.coerce.number().int().min(1).max(20).default(4).openapi({
			description: "Maximum number of chunks to return.",
			default: 4,
		}),
		minSimilarity: z.coerce.number().min(0).max(1).default(0.3).openapi({
			description: "Minimum cosine similarity score to include.",
			default: 0.3,
		}),
		knowledgeId: z.ulid().optional().openapi({
			description: "Optional knowledge entry to restrict retrieval to.",
			example: "01JG00000000000000000000A",
		}),
	})
	.openapi({
		description: "Query parameters for private knowledge retrieval.",
	});

export type KnowledgeSearchRequest = z.infer<
	typeof knowledgeSearchRequestSchema
>;

export const knowledgeSearchResponseSchema = z
	.object({
		query: z.string().openapi({
			description: "Normalized query used for retrieval.",
		}),
		results: z.array(
			z.object({
				id: z.string().openapi({
					description: "Chunk identifier.",
				}),
				content: z.string().openapi({
					description: "Full chunk content.",
				}),
				snippet: z.string().openapi({
					description: "Short readable excerpt from the chunk.",
				}),
				metadata: z.unknown().nullable().openapi({
					description: "Chunk metadata captured during indexing.",
				}),
				similarity: z.number().openapi({
					description: "Similarity score from 0 to 1.",
				}),
				sourceType: z.string().openapi({
					description: "Chunk source type.",
					example: "knowledge",
				}),
				knowledgeId: z.string().nullable().openapi({
					description: "Knowledge entry ID that produced the chunk.",
				}),
				visitorId: z.string().nullable().openapi({
					description: "Visitor memory source ID, null for knowledge chunks.",
				}),
				contactId: z.string().nullable().openapi({
					description: "Contact memory source ID, null for knowledge chunks.",
				}),
				chunkIndex: z.number().int().nullable().openapi({
					description: "Chunk index within its source document.",
				}),
				title: z.string().nullable().openapi({
					description: "Readable source title when available.",
				}),
				sourceUrl: z.string().url().nullable().openapi({
					description: "Source URL when available.",
				}),
			})
		),
		totalFound: z.number().int().openapi({
			description: "Number of results returned.",
		}),
		maxSimilarity: z.number().nullable().openapi({
			description: "Highest similarity score among returned results.",
		}),
		retrievalQuality: z.enum(["none", "low", "medium", "high"]).openapi({
			description: "Coarse quality band inferred from the best match.",
		}),
	})
	.openapi({
		description: "Private knowledge retrieval response.",
	});

export type KnowledgeSearchResponse = z.infer<
	typeof knowledgeSearchResponseSchema
>;

/**
 * Get knowledge request schema (TRPC)
 */
export const getKnowledgeRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug",
			example: "my-website",
		}),
		id: z.ulid().openapi({
			description: "Knowledge entry ID",
			example: "01JG00000000000000000000A",
		}),
	})
	.openapi({
		description: "Request to get a single knowledge entry",
	});

export type GetKnowledgeRequest = z.infer<typeof getKnowledgeRequestSchema>;

/**
 * Create knowledge request schema (TRPC) - extends create input with websiteSlug
 */
export const createKnowledgeRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug to create knowledge for",
			example: "my-website",
		}),
		aiAgentId: z.ulid().nullable().optional().openapi({
			description:
				"Optional AI agent ID; null/omit for shared at website scope",
			example: "01JG000000000000000000002",
		}),
		type: knowledgeTypeSchema,
		sourceUrl: z.url().nullable().optional().openapi({
			description: "Origin URL for this entry",
			example: "https://docs.cossistant.com/getting-started",
		}),
		sourceTitle: z.string().nullable().optional().openapi({
			description: "Readable title",
			example: "Getting started with the Cossistant dashboard",
		}),
		origin: z.string().min(1).openapi({
			description: "How this entry was created (crawl, manual, agent, etc.)",
			example: "manual",
		}),
		payload: z.union([
			urlKnowledgePayloadSchema,
			faqKnowledgePayloadSchema,
			articleKnowledgePayloadSchema,
		]),
		metadata: metadataSchema,
	})
	.openapi({
		description: "Request to create a new knowledge entry",
	});

export type CreateKnowledgeRequest = z.infer<
	typeof createKnowledgeRequestSchema
>;

/**
 * Create knowledge request schema (REST) - without websiteSlug
 */
export const createKnowledgeRestRequestSchema = z
	.object({
		aiAgentId: z.ulid().nullable().optional().openapi({
			description:
				"Optional AI agent ID; null/omit for shared at website scope",
			example: "01JG000000000000000000002",
		}),
		type: knowledgeTypeSchema,
		sourceUrl: z.url().nullable().optional().openapi({
			description: "Origin URL for this entry",
			example: "https://docs.cossistant.com/getting-started",
		}),
		sourceTitle: z.string().nullable().optional().openapi({
			description: "Readable title",
			example: "Getting started with the Cossistant dashboard",
		}),
		origin: z.string().min(1).openapi({
			description: "How this entry was created (crawl, manual, agent, etc.)",
			example: "manual",
		}),
		payload: z.union([
			urlKnowledgePayloadSchema,
			faqKnowledgePayloadSchema,
			articleKnowledgePayloadSchema,
		]),
		metadata: metadataSchema,
	})
	.openapi({
		description: "Request to create a new knowledge entry (REST)",
	});

export type CreateKnowledgeRestRequest = z.infer<
	typeof createKnowledgeRestRequestSchema
>;

/**
 * Update knowledge request schema (TRPC)
 *
 * Note: We use .passthrough() on payload schemas to prevent Zod's union validation
 * from stripping fields when the first matching schema (urlKnowledgePayloadSchema)
 * doesn't include all fields from other schemas (like articleKnowledgePayloadSchema's title).
 */
export const updateKnowledgeRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug",
			example: "my-website",
		}),
		id: z.ulid().openapi({
			description: "Knowledge entry ID to update",
			example: "01JG00000000000000000000A",
		}),
		aiAgentId: z.ulid().nullable().optional().openapi({
			description: "Update AI agent association",
			example: "01JG000000000000000000002",
		}),
		sourceUrl: z.url().nullable().optional().openapi({
			description: "Update origin URL",
			example: "https://docs.cossistant.com/getting-started",
		}),
		sourceTitle: z.string().nullable().optional().openapi({
			description: "Update readable title",
			example: "Getting started with the Cossistant dashboard",
		}),
		payload: z
			.union([
				urlKnowledgePayloadSchema.passthrough(),
				faqKnowledgePayloadSchema.passthrough(),
				articleKnowledgePayloadSchema.passthrough(),
			])
			.optional(),
		metadata: metadataSchema,
	})
	.openapi({
		description: "Request to update an existing knowledge entry",
	});

export type UpdateKnowledgeRequest = z.infer<
	typeof updateKnowledgeRequestSchema
>;

/**
 * Update knowledge request schema (REST) - without websiteSlug
 *
 * Note: We use .passthrough() on payload schemas to prevent Zod's union validation
 * from stripping fields. See updateKnowledgeRequestSchema for details.
 */
export const updateKnowledgeRestRequestSchema = z
	.object({
		aiAgentId: z.ulid().nullable().optional().openapi({
			description: "Update AI agent association",
			example: "01JG000000000000000000002",
		}),
		sourceUrl: z.url().nullable().optional().openapi({
			description: "Update origin URL",
			example: "https://docs.cossistant.com/getting-started",
		}),
		sourceTitle: z.string().nullable().optional().openapi({
			description: "Update readable title",
			example: "Getting started with the Cossistant dashboard",
		}),
		payload: z
			.union([
				urlKnowledgePayloadSchema.passthrough(),
				faqKnowledgePayloadSchema.passthrough(),
				articleKnowledgePayloadSchema.passthrough(),
			])
			.optional(),
		metadata: metadataSchema,
	})
	.openapi({
		description: "Request to update an existing knowledge entry (REST)",
	});

export type UpdateKnowledgeRestRequest = z.infer<
	typeof updateKnowledgeRestRequestSchema
>;

/**
 * Delete knowledge request schema (TRPC)
 */
export const deleteKnowledgeRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug",
			example: "my-website",
		}),
		id: z.ulid().openapi({
			description: "Knowledge entry ID to delete",
			example: "01JG00000000000000000000A",
		}),
	})
	.openapi({
		description: "Request to delete a knowledge entry",
	});

export type DeleteKnowledgeRequest = z.infer<
	typeof deleteKnowledgeRequestSchema
>;

/**
 * Toggle knowledge entry included request schema (TRPC)
 * Named differently from link-source's toggleKnowledgeIncludedRequestSchema to avoid export conflict
 */
export const toggleKnowledgeEntryIncludedRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug",
			example: "my-website",
		}),
		id: z.ulid().openapi({
			description: "Knowledge entry ID",
			example: "01JG00000000000000000000A",
		}),
		isIncluded: z.boolean().openapi({
			description: "Whether this entry should be included in training",
			example: true,
		}),
	})
	.openapi({
		description: "Request to toggle knowledge entry inclusion in training",
	});

export type ToggleKnowledgeEntryIncludedRequest = z.infer<
	typeof toggleKnowledgeEntryIncludedRequestSchema
>;

/**
 * Upload knowledge file request schema (TRPC)
 */
export const uploadKnowledgeFileRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug",
			example: "my-website",
		}),
		aiAgentId: z.ulid().nullable().optional().openapi({
			description:
				"Optional AI agent ID; null/omit for shared at website scope",
			example: "01JG000000000000000000002",
		}),
		fileName: z.string().min(1).openapi({
			description: "Original file name",
			example: "getting-started.md",
		}),
		fileContent: z.string().min(1).openapi({
			description: "Raw file content",
			example: "# Getting Started\n\nWelcome to our documentation...",
		}),
		fileExtension: z.enum(["md", "txt"]).openapi({
			description: "File extension",
			example: "md",
		}),
	})
	.openapi({
		description: "Request to upload a file as a knowledge entry",
	});

export type UploadKnowledgeFileRequest = z.infer<
	typeof uploadKnowledgeFileRequestSchema
>;
