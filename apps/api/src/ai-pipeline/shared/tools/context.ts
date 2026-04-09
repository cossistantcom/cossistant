import {
	identifyContact,
	linkVisitorToContact,
	updateContact,
} from "@api/db/queries/contact";
import { getCompleteVisitorWithContact } from "@api/db/queries/visitor";
import { findSimilarKnowledge } from "@api/utils/vector-search";
import { tool } from "ai";
import { z } from "zod";
import { maybeCreateImmediateClarificationFromSearchResult } from "../knowledge-gap/immediate-clarification";
import type {
	PipelineToolContext,
	PipelineToolResult,
	ToolTelemetrySpec,
} from "./contracts";
import { isRecord } from "./internal/guards";

const searchKnowledgeInputSchema = z.object({
	query: z
		.string()
		.min(1)
		.describe("Short keyword query for knowledge search."),
	questionContext: z
		.string()
		.min(1)
		.max(1000)
		.optional()
		.describe(
			"Short summary of the question or issue being checked against the knowledge base."
		),
});

const STRONG_SEARCH_MATCH_THRESHOLD = 0.78;
const WEAK_SEARCH_MATCH_THRESHOLD = 0.55;

export type SearchKnowledgeRetrievalQuality = "none" | "weak" | "strong";

export type SearchKnowledgeClarificationSignal =
	| "immediate"
	| "background_review"
	| "none";

function resolveSearchRetrievalQuality(params: {
	maxSimilarity: number | null;
	totalFound: number;
}): SearchKnowledgeRetrievalQuality {
	if (!(params.totalFound > 0) || params.maxSimilarity === null) {
		return "none";
	}

	if (params.maxSimilarity >= STRONG_SEARCH_MATCH_THRESHOLD) {
		return "strong";
	}

	if (params.maxSimilarity >= WEAK_SEARCH_MATCH_THRESHOLD) {
		return "weak";
	}

	return "none";
}

function resolveSearchClarificationSignal(
	retrievalQuality: SearchKnowledgeRetrievalQuality
): SearchKnowledgeClarificationSignal {
	switch (retrievalQuality) {
		case "none":
			return "immediate";
		case "weak":
			return "background_review";
		default:
			return "none";
	}
}

const identifyVisitorInputSchema = z
	.object({
		email: z.string().email().optional(),
		name: z.string().min(1).max(100).optional(),
	})
	.refine((value) => Boolean(value.email || value.name), {
		message: "Provide at least one of email or name",
	});

export function createSearchKnowledgeBaseTool(ctx: PipelineToolContext) {
	return tool({
		description:
			"Search the knowledge base for relevant snippets and source metadata.",
		inputSchema: searchKnowledgeInputSchema,
		execute: async ({
			query,
			questionContext,
		}): Promise<
			PipelineToolResult<{
				articles: Array<{
					content: string;
					knowledgeId: string | null;
					similarity: number;
					title: string | null;
					sourceUrl: string | null;
					sourceType: string | null;
				}>;
				query: string;
				questionContext: string | null;
				totalFound: number;
				maxSimilarity: number | null;
				retrievalQuality: SearchKnowledgeRetrievalQuality;
				clarificationSignal: SearchKnowledgeClarificationSignal;
				lowConfidence: boolean;
				guidance: string | null;
			}>
		> => {
			const results = await findSimilarKnowledge(ctx.db, query, ctx.websiteId, {
				limit: 5,
				minSimilarity: 0.3,
			});
			const articles = results.map((item) => {
				const metadata =
					typeof item.metadata === "object" && item.metadata !== null
						? (item.metadata as Record<string, unknown>)
						: null;

				return {
					content: item.content,
					knowledgeId: item.knowledgeId,
					similarity: Math.round(item.similarity * 100) / 100,
					title:
						typeof metadata?.title === "string"
							? metadata.title
							: typeof metadata?.question === "string"
								? metadata.question
								: null,
					sourceUrl: typeof metadata?.url === "string" ? metadata.url : null,
					sourceType:
						typeof metadata?.sourceType === "string"
							? metadata.sourceType
							: null,
				};
			});
			const totalFound = articles.length;
			const maxSimilarity =
				totalFound > 0
					? articles.reduce(
							(currentMax, article) => Math.max(currentMax, article.similarity),
							0
						)
					: null;
			const retrievalQuality = resolveSearchRetrievalQuality({
				maxSimilarity,
				totalFound,
			});
			const clarificationSignal =
				resolveSearchClarificationSignal(retrievalQuality);
			const lowConfidence =
				totalFound > 0 &&
				articles.every((article) => article.similarity < 0.75);

			let guidance: string | null = null;
			if (retrievalQuality === "strong") {
				guidance =
					"Strong knowledge match found. Answer directly from the retrieved snippets first. If a follow-up is still needed, ask only after giving the grounded answer.";
			} else if (retrievalQuality === "weak") {
				guidance =
					"Partial knowledge match found. Give the best grounded partial answer first, briefly note uncertainty, then ask one narrow follow-up or offer escalation.";
			} else if (totalFound === 0) {
				guidance =
					"No relevant knowledge found. Do not invent facts. Tell the visitor you could not confirm it from the knowledge base and offer escalation or human help instead of sending only a clarification question.";
			} else if (lowConfidence) {
				guidance =
					"Results have low confidence. Give only the grounded parts, then offer escalation if the answer is still uncertain.";
			}

			const searchResult = {
				articles,
				query,
				questionContext: questionContext?.trim() || null,
				totalFound,
				maxSimilarity,
				retrievalQuality,
				clarificationSignal,
				lowConfidence,
				guidance,
			};

			if (retrievalQuality === "none" && clarificationSignal === "immediate") {
				try {
					await maybeCreateImmediateClarificationFromSearchResult({
						ctx,
						searchResult,
					});
				} catch (error) {
					ctx.debugLogger?.warn?.(
						"[ai-pipeline:tool] failed to open immediate knowledge clarification after zero-hit KB search",
						error
					);
				}
			}

			return {
				success: true,
				data: searchResult,
			};
		},
	});
}

export function createIdentifyVisitorTool(ctx: PipelineToolContext) {
	return tool({
		description:
			"Identify or update visitor profile details (email/name) for this conversation.",
		inputSchema: identifyVisitorInputSchema,
		execute: async ({
			email,
			name,
		}): Promise<
			PipelineToolResult<{ visitorId: string; contactId: string }>
		> => {
			const visitor = await getCompleteVisitorWithContact(ctx.db, {
				visitorId: ctx.visitorId,
			});

			if (!visitor) {
				return {
					success: false,
					error: "Visitor not found",
				};
			}

			const trimmedEmail = email?.trim();
			const trimmedName = name?.trim();
			let contact = visitor.contact ?? null;

			if (contact) {
				const updates: Record<string, string> = {};
				if (trimmedEmail && trimmedEmail !== contact.email) {
					updates.email = trimmedEmail;
				}
				if (trimmedName && trimmedName !== contact.name) {
					updates.name = trimmedName;
				}

				if (Object.keys(updates).length > 0) {
					const updated = await updateContact(ctx.db, {
						contactId: contact.id,
						websiteId: ctx.websiteId,
						data: updates,
					});
					if (!updated) {
						return {
							success: false,
							error: "Failed to update contact",
						};
					}
					contact = updated;
				}
			} else {
				if (!trimmedEmail) {
					return {
						success: false,
						error:
							"Email is required for first-time identification in this phase",
					};
				}

				contact = await identifyContact(ctx.db, {
					websiteId: ctx.websiteId,
					organizationId: ctx.organizationId,
					email: trimmedEmail,
					name: trimmedName,
				});

				await linkVisitorToContact(ctx.db, {
					visitorId: ctx.visitorId,
					contactId: contact.id,
					websiteId: ctx.websiteId,
				});
			}

			return {
				success: true,
				data: {
					visitorId: ctx.visitorId,
					contactId: contact.id,
				},
			};
		},
	});
}

function getSearchKnowledgeBaseResultCount(output: unknown): number | null {
	if (!isRecord(output)) {
		return null;
	}

	const data = isRecord(output.data) ? output.data : null;
	const totalFound = data?.totalFound;
	if (typeof totalFound === "number" && Number.isFinite(totalFound)) {
		return totalFound;
	}

	const articles = Array.isArray(data?.articles) ? data.articles : null;
	if (articles) {
		return articles.length;
	}

	return null;
}

function summarizeSearchKnowledgeBaseOutput(output: unknown): unknown {
	if (!isRecord(output)) {
		return output;
	}

	const data = isRecord(output.data) ? output.data : null;
	const articles = Array.isArray(data?.articles) ? data.articles : [];

	const summarizedArticles = articles.slice(0, 5).map((article, index) => {
		if (!isRecord(article)) {
			return { index };
		}

		const content = typeof article.content === "string" ? article.content : "";

		return {
			index,
			title: typeof article.title === "string" ? article.title : null,
			sourceUrl:
				typeof article.sourceUrl === "string" ? article.sourceUrl : null,
			sourceType:
				typeof article.sourceType === "string" ? article.sourceType : null,
			similarity:
				typeof article.similarity === "number" ? article.similarity : null,
			snippet: content.length > 220 ? `${content.slice(0, 220)}...` : content,
		};
	});

	return {
		success: output.success === true,
		error: typeof output.error === "string" ? output.error : null,
		data: {
			query: typeof data?.query === "string" ? data.query : null,
			questionContext:
				typeof data?.questionContext === "string" ? data.questionContext : null,
			totalFound:
				typeof data?.totalFound === "number"
					? data.totalFound
					: articles.length,
			maxSimilarity:
				typeof data?.maxSimilarity === "number" ? data.maxSimilarity : null,
			retrievalQuality:
				typeof data?.retrievalQuality === "string"
					? data.retrievalQuality
					: null,
			clarificationSignal:
				typeof data?.clarificationSignal === "string"
					? data.clarificationSignal
					: null,
			lowConfidence: data?.lowConfidence === true,
			guidance: typeof data?.guidance === "string" ? data.guidance : null,
			articlesCount: articles.length,
			articles: summarizedArticles,
		},
	};
}

export const SEARCH_KNOWLEDGE_BASE_TELEMETRY: ToolTelemetrySpec = {
	summary: {
		partial: "Looking in knowledge base...",
		result: ({ output }) => {
			const count = getSearchKnowledgeBaseResultCount(output);
			if (typeof count === "number" && Number.isFinite(count)) {
				return `Found ${count} relevant source${count === 1 ? "" : "s"}`;
			}
			return "Finished knowledge base lookup";
		},
		error: "Knowledge base lookup failed",
	},
	progress: {
		partial: "Searching knowledge base...",
		result: ({ output }) => {
			const count = getSearchKnowledgeBaseResultCount(output);
			if (typeof count === "number" && count > 0) {
				return `Found ${count} relevant source${count === 1 ? "" : "s"}`;
			}
			return "No results found";
		},
		error: "Search failed",
		audience: "all",
	},
	sanitizeOutput: summarizeSearchKnowledgeBaseOutput,
};

export const IDENTIFY_VISITOR_TELEMETRY: ToolTelemetrySpec = {
	summary: {
		partial: "Identifying visitor profile...",
		result: "Updated visitor identity",
		error: "Failed to identify visitor",
	},
	progress: {
		partial: "Updating visitor details...",
		result: "Visitor details updated",
		error: "Visitor update failed",
		audience: "dashboard",
	},
};
