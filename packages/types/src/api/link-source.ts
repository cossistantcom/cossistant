import { z } from "@hono/zod-openapi";
import { apiTimestampSchema, nullableApiTimestampSchema } from "./common";

export const linkSourceStatusSchema = z
	.enum(["pending", "mapping", "crawling", "completed", "failed"])
	.openapi({
		description: "Link source crawl status",
		example: "completed",
	});

/**
 * Link source response schema - used for single item responses
 */
export const linkSourceResponseSchema = z
	.object({
		id: z.ulid().openapi({
			description: "Link source identifier",
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
		parentLinkSourceId: z.ulid().nullable().openapi({
			description:
				"Parent link source ID for hierarchical crawling; null means root",
			example: null,
		}),
		url: z.url().openapi({
			description: "Root URL to crawl",
			example: "https://docs.example.com",
		}),
		status: linkSourceStatusSchema,
		firecrawlJobId: z.string().nullable().openapi({
			description: "Firecrawl job ID for tracking async crawl",
			example: "fc_job_123456",
		}),
		depth: z.number().int().nonnegative().openapi({
			description: "Crawl depth from root (0 = root, 1 = direct subpage)",
			example: 0,
		}),
		discoveredPagesCount: z.number().int().nonnegative().openapi({
			description: "Number of pages discovered during mapping phase",
			example: 25,
		}),
		crawledPagesCount: z.number().int().nonnegative().openapi({
			description: "Number of pages successfully crawled",
			example: 15,
		}),
		totalSizeBytes: z.number().int().nonnegative().openapi({
			description: "Total size of crawled content in bytes",
			example: 102_400,
		}),
		includePaths: z
			.array(z.string())
			.nullable()
			.openapi({
				description: "Paths to include in crawl (only URLs matching these)",
				example: ["/docs", "/blog"],
			}),
		excludePaths: z
			.array(z.string())
			.nullable()
			.openapi({
				description:
					"Paths to exclude from crawl (URLs matching these are skipped)",
				example: ["/admin", "/api"],
			}),
		ignoredUrls: z
			.array(z.string())
			.nullable()
			.openapi({
				description:
					"URLs explicitly ignored by user (excluded from future crawls)",
				example: ["https://docs.example.com/deprecated"],
			}),
		lastCrawledAt: nullableApiTimestampSchema.openapi({
			description: "Timestamp of last successful crawl",
			example: "2024-06-10T12:00:00.000Z",
		}),
		errorMessage: z.string().nullable().openapi({
			description: "Error message if crawl failed",
			example: null,
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
		description: "Link source response",
	});

export type LinkSourceResponse = z.infer<typeof linkSourceResponseSchema>;
export type LinkSourceStatus = z.infer<typeof linkSourceStatusSchema>;

// ============================================================================
// API Request/Response Schemas
// ============================================================================

/**
 * List link sources request schema (TRPC) - with websiteSlug
 */
export const listLinkSourcesRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug to list link sources for",
			example: "my-website",
		}),
		aiAgentId: z.ulid().nullable().optional().openapi({
			description:
				"Filter by AI agent ID; null for shared entries; omit for all",
			example: "01JG000000000000000000002",
		}),
		status: linkSourceStatusSchema.optional().openapi({
			description: "Filter by crawl status",
			example: "completed",
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
		description: "Request to list link sources with filters and pagination",
	});

export type ListLinkSourcesRequest = z.infer<
	typeof listLinkSourcesRequestSchema
>;

/**
 * List link sources response schema
 */
export const listLinkSourcesResponseSchema = z
	.object({
		items: z.array(linkSourceResponseSchema).openapi({
			description: "Array of link sources",
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
		description: "Paginated list of link sources",
	});

export type ListLinkSourcesResponse = z.infer<
	typeof listLinkSourcesResponseSchema
>;

/**
 * Get link source request schema (TRPC)
 */
export const getLinkSourceRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug",
			example: "my-website",
		}),
		id: z.ulid().openapi({
			description: "Link source ID",
			example: "01JG00000000000000000000A",
		}),
	})
	.openapi({
		description: "Request to get a single link source",
	});

export type GetLinkSourceRequest = z.infer<typeof getLinkSourceRequestSchema>;

/**
 * Create link source request schema (TRPC)
 */
export const createLinkSourceRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug to create link source for",
			example: "my-website",
		}),
		aiAgentId: z.ulid().nullable().optional().openapi({
			description:
				"Optional AI agent ID; null/omit for shared at website scope",
			example: "01JG000000000000000000002",
		}),
		parentLinkSourceId: z.ulid().nullable().optional().openapi({
			description:
				"Parent link source ID for hierarchical crawling; null/omit for root",
			example: null,
		}),
		url: z.url().openapi({
			description: "Root URL to crawl",
			example: "https://docs.example.com",
		}),
		includePaths: z
			.array(z.string())
			.optional()
			.openapi({
				description: "Paths to include in crawl (only URLs matching these)",
				example: ["/docs", "/blog"],
			}),
		excludePaths: z
			.array(z.string())
			.optional()
			.openapi({
				description:
					"Paths to exclude from crawl (URLs matching these are skipped)",
				example: ["/admin", "/api"],
			}),
		maxDepth: z.number().int().nonnegative().default(1).optional().openapi({
			description:
				"Maximum crawl depth for new link sources. Defaults to 1 (direct subpages only).",
			example: 1,
		}),
	})
	.openapi({
		description: "Request to create a new link source and trigger crawl",
	});

export type CreateLinkSourceRequest = z.infer<
	typeof createLinkSourceRequestSchema
>;

/**
 * Delete link source request schema (TRPC)
 */
export const deleteLinkSourceRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug",
			example: "my-website",
		}),
		id: z.ulid().openapi({
			description: "Link source ID to delete",
			example: "01JG00000000000000000000A",
		}),
	})
	.openapi({
		description: "Request to delete a link source",
	});

export type DeleteLinkSourceRequest = z.infer<
	typeof deleteLinkSourceRequestSchema
>;

/**
 * Recrawl link source request schema (TRPC)
 */
export const recrawlLinkSourceRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug",
			example: "my-website",
		}),
		id: z.ulid().openapi({
			description: "Link source ID to recrawl",
			example: "01JG00000000000000000000A",
		}),
	})
	.openapi({
		description: "Request to trigger a recrawl of an existing link source",
	});

export type RecrawlLinkSourceRequest = z.infer<
	typeof recrawlLinkSourceRequestSchema
>;

/**
 * Cancel link source request schema (TRPC)
 */
export const cancelLinkSourceRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug",
			example: "my-website",
		}),
		id: z.ulid().openapi({
			description: "Link source ID to cancel",
			example: "01JG00000000000000000000A",
		}),
	})
	.openapi({
		description: "Request to cancel a crawl in progress",
	});

export type CancelLinkSourceRequest = z.infer<
	typeof cancelLinkSourceRequestSchema
>;

/**
 * Get crawl status request schema (TRPC)
 */
export const getCrawlStatusRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug",
			example: "my-website",
		}),
		id: z.ulid().openapi({
			description: "Link source ID to check status",
			example: "01JG00000000000000000000A",
		}),
	})
	.openapi({
		description: "Request to get crawl status of a link source",
	});

export type GetCrawlStatusRequest = z.infer<typeof getCrawlStatusRequestSchema>;

/**
 * Training stats response schema
 */
export const trainingStatsResponseSchema = z
	.object({
		linkSourcesCount: z.number().int().nonnegative().openapi({
			description: "Total number of link sources",
			example: 5,
		}),
		urlKnowledgeCount: z.number().int().nonnegative().openapi({
			description: "Total number of URL knowledge entries",
			example: 50,
		}),
		faqKnowledgeCount: z.number().int().nonnegative().openapi({
			description: "Total number of FAQ knowledge entries",
			example: 20,
		}),
		articleKnowledgeCount: z.number().int().nonnegative().openapi({
			description: "Total number of article knowledge entries",
			example: 10,
		}),
		totalSizeBytes: z.number().int().nonnegative().openapi({
			description: "Total size of all knowledge in bytes",
			example: 512_000,
		}),
		planLimitBytes: z.number().int().nonnegative().nullable().openapi({
			description: "Plan limit for knowledge size in bytes (null = unlimited)",
			example: 10_485_760,
		}),
		planLimitLinks: z.number().int().nonnegative().nullable().openapi({
			description: "Plan limit for number of link sources (null = unlimited)",
			example: 100,
		}),
		crawlPagesPerSourceLimit: z
			.number()
			.int()
			.nonnegative()
			.nullable()
			.openapi({
				description:
					"Plan limit for pages crawled per source (null = unlimited)",
				example: 1000,
			}),
		totalPagesLimit: z.number().int().nonnegative().nullable().openapi({
			description:
				"Plan limit for total pages across all sources (null = unlimited)",
			example: 10,
		}),
		planLimitFaqs: z.number().int().nonnegative().nullable().openapi({
			description: "Plan limit for number of FAQs (null = unlimited)",
			example: 10,
		}),
		planLimitFiles: z.number().int().nonnegative().nullable().openapi({
			description: "Plan limit for number of files (null = unlimited)",
			example: 5,
		}),
	})
	.openapi({
		description: "Training statistics for the AI agent",
	});

export type TrainingStatsResponse = z.infer<typeof trainingStatsResponseSchema>;

/**
 * Get training stats request schema (TRPC)
 */
export const getTrainingStatsRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug",
			example: "my-website",
		}),
		aiAgentId: z.ulid().nullable().optional().openapi({
			description:
				"Filter by AI agent ID; null for shared entries; omit for all",
			example: "01JG000000000000000000002",
		}),
	})
	.openapi({
		description: "Request to get training statistics",
	});

export type GetTrainingStatsRequest = z.infer<
	typeof getTrainingStatsRequestSchema
>;

/**
 * Scan subpages request schema (TRPC)
 * Used to trigger crawl of deeper subpages for a specific knowledge entry
 */
export const scanSubpagesRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug",
			example: "my-website",
		}),
		linkSourceId: z.ulid().openapi({
			description: "Parent link source ID",
			example: "01JG00000000000000000000A",
		}),
		knowledgeId: z.ulid().openapi({
			description: "Knowledge entry ID to scan subpages for",
			example: "01JG00000000000000000000B",
		}),
	})
	.openapi({
		description: "Request to scan subpages of a specific page",
	});

export type ScanSubpagesRequest = z.infer<typeof scanSubpagesRequestSchema>;

/**
 * List knowledge by link source request schema (TRPC)
 */
export const listKnowledgeByLinkSourceRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug",
			example: "my-website",
		}),
		linkSourceId: z.ulid().openapi({
			description: "Link source ID to list knowledge for",
			example: "01JG00000000000000000000A",
		}),
		page: z.coerce.number().int().positive().default(1).openapi({
			description: "Page number (1-indexed)",
			example: 1,
		}),
		limit: z.coerce.number().int().positive().max(100).default(50).openapi({
			description: "Items per page (max 100)",
			example: 50,
		}),
	})
	.openapi({
		description: "Request to list knowledge entries for a link source",
	});

export type ListKnowledgeByLinkSourceRequest = z.infer<
	typeof listKnowledgeByLinkSourceRequestSchema
>;

/**
 * Toggle knowledge included request schema (TRPC)
 */
export const toggleKnowledgeIncludedRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug",
			example: "my-website",
		}),
		knowledgeId: z.ulid().openapi({
			description: "Knowledge entry ID to toggle",
			example: "01JG00000000000000000000A",
		}),
		isIncluded: z.boolean().openapi({
			description: "Whether to include this knowledge in training",
			example: true,
		}),
	})
	.openapi({
		description: "Request to toggle knowledge inclusion in training",
	});

export type ToggleKnowledgeIncludedRequest = z.infer<
	typeof toggleKnowledgeIncludedRequestSchema
>;

/**
 * Discovered page schema for realtime updates
 */
export const discoveredPageSchema = z.object({
	url: z.string().openapi({
		description: "URL of the discovered page",
		example: "https://docs.example.com/getting-started",
	}),
	title: z.string().nullable().openapi({
		description: "Title of the page if available",
		example: "Getting Started Guide",
	}),
	depth: z.number().int().nonnegative().openapi({
		description: "Depth from the root URL",
		example: 1,
	}),
});

export type DiscoveredPage = z.infer<typeof discoveredPageSchema>;

/**
 * Crawl progress page schema for realtime updates
 */
export const crawlProgressPageSchema = z.object({
	url: z.string().openapi({
		description: "URL of the crawled page",
		example: "https://docs.example.com/getting-started",
	}),
	title: z.string().nullable().openapi({
		description: "Title of the page",
		example: "Getting Started Guide",
	}),
	status: z.enum(["pending", "crawling", "completed", "failed"]).openapi({
		description: "Status of this specific page",
		example: "completed",
	}),
	sizeBytes: z.number().int().nonnegative().optional().openapi({
		description: "Size of crawled content in bytes",
		example: 4096,
	}),
	error: z.string().nullable().optional().openapi({
		description: "Error message if page crawl failed",
		example: null,
	}),
});

export type CrawlProgressPage = z.infer<typeof crawlProgressPageSchema>;

/**
 * Ignore page request schema (TRPC)
 * Adds URL to ignoredUrls and soft-deletes the knowledge entry
 */
export const ignorePageRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug",
			example: "my-website",
		}),
		linkSourceId: z.ulid().openapi({
			description: "Link source ID containing this page",
			example: "01JG00000000000000000000A",
		}),
		knowledgeId: z.ulid().openapi({
			description: "Knowledge entry ID to ignore",
			example: "01JG00000000000000000000B",
		}),
	})
	.openapi({
		description: "Request to ignore a page (add to ignoredUrls and delete)",
	});

export type IgnorePageRequest = z.infer<typeof ignorePageRequestSchema>;

/**
 * Reindex page request schema (TRPC)
 * Re-scrapes a single URL and updates the knowledge entry
 */
export const reindexPageRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug",
			example: "my-website",
		}),
		linkSourceId: z.ulid().openapi({
			description: "Link source ID containing this page",
			example: "01JG00000000000000000000A",
		}),
		knowledgeId: z.ulid().openapi({
			description: "Knowledge entry ID to reindex",
			example: "01JG00000000000000000000B",
		}),
	})
	.openapi({
		description: "Request to reindex (re-scrape) a specific page",
	});

export type ReindexPageRequest = z.infer<typeof reindexPageRequestSchema>;

/**
 * Delete page request schema (TRPC)
 * Soft-deletes a knowledge entry without ignoring future crawls
 */
export const deletePageRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug",
			example: "my-website",
		}),
		knowledgeId: z.ulid().openapi({
			description: "Knowledge entry ID to delete",
			example: "01JG00000000000000000000B",
		}),
	})
	.openapi({
		description: "Request to delete a page from knowledge base",
	});

export type DeletePageRequest = z.infer<typeof deletePageRequestSchema>;
