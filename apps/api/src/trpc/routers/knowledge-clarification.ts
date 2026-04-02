import type { Database } from "@api/db";
import { getAiAgentForWebsite } from "@api/db/queries/ai-agent";
import {
	createKnowledge,
	getKnowledgeById,
	getKnowledgeCountByType,
	getTotalKnowledgeSizeBytes,
	updateKnowledge,
} from "@api/db/queries/knowledge";
import {
	createKnowledgeClarificationTurn,
	getActiveKnowledgeClarificationForConversation,
	getKnowledgeClarificationRequestById,
	listKnowledgeClarificationProposals,
	listKnowledgeClarificationTurns,
	updateKnowledgeClarificationRequest,
} from "@api/db/queries/knowledge-clarification";
import { getWebsiteBySlugWithAccess } from "@api/db/queries/website";
import { getPlanForWebsite } from "@api/lib/plans/access";
import {
	createKnowledgeClarificationAuditEntry,
	emitConversationClarificationUpdate,
	loadKnowledgeClarificationRuntime,
	runKnowledgeClarificationStep,
	serializeKnowledgeClarificationRequest,
	startConversationKnowledgeClarification,
	startFaqKnowledgeClarification,
} from "@api/services/knowledge-clarification";
import type { KnowledgeClarificationDraftFaq } from "@plasma/types";
import {
	answerKnowledgeClarificationRequestSchema,
	approveKnowledgeClarificationDraftRequestSchema,
	approveKnowledgeClarificationDraftResponseSchema,
	type ConversationClarificationProgress,
	type FaqKnowledgePayload,
	getActiveKnowledgeClarificationRequestSchema,
	getActiveKnowledgeClarificationResponseSchema,
	getKnowledgeClarificationProposalRequestSchema,
	getKnowledgeClarificationProposalResponseSchema,
	type KnowledgeResponse,
	knowledgeClarificationRequestSchema,
	knowledgeClarificationStepEnvelopeSchema,
	listKnowledgeClarificationProposalsRequestSchema,
	listKnowledgeClarificationProposalsResponseSchema,
	skipKnowledgeClarificationRequestSchema,
	startConversationKnowledgeClarificationRequestSchema,
	startFaqKnowledgeClarificationRequestSchema,
	updateKnowledgeClarificationStatusRequestSchema,
} from "@plasma/types";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../init";
import { loadConversationContext } from "../utils/conversation";

function toNumericLimit(value: number | boolean | null): number | null {
	if (value === null || value === true) {
		return null;
	}
	if (value === false) {
		return 0;
	}
	return value;
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

async function loadWebsiteAndAiAgent(params: {
	db: Parameters<typeof getWebsiteBySlugWithAccess>[0];
	userId: string;
	websiteSlug: string;
}) {
	const website = await getWebsiteBySlugWithAccess(params.db, {
		userId: params.userId,
		websiteSlug: params.websiteSlug,
	});
	if (!website) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Website not found or access denied",
		});
	}

	const aiAgent = await getAiAgentForWebsite(params.db, {
		websiteId: website.id,
		organizationId: website.organizationId,
	});
	if (!aiAgent) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "AI agent not found for this website",
		});
	}

	return { website, aiAgent };
}

async function loadWebsite(params: {
	db: Parameters<typeof getWebsiteBySlugWithAccess>[0];
	userId: string;
	websiteSlug: string;
}) {
	const website = await getWebsiteBySlugWithAccess(params.db, {
		userId: params.userId,
		websiteSlug: params.websiteSlug,
	});
	if (!website) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Website not found or access denied",
		});
	}

	return website;
}

async function loadClarificationRequest(params: {
	db: Parameters<typeof getWebsiteBySlugWithAccess>[0];
	userId: string;
	websiteSlug: string;
	requestId: string;
}) {
	const website = await getWebsiteBySlugWithAccess(params.db, {
		userId: params.userId,
		websiteSlug: params.websiteSlug,
	});
	if (!website) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Website not found or access denied",
		});
	}

	const request = await getKnowledgeClarificationRequestById(params.db, {
		requestId: params.requestId,
		websiteId: website.id,
	});
	if (!request) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Clarification request not found",
		});
	}

	return { website, request };
}

async function maybeSerializeClarificationRequest(params: {
	db: Parameters<typeof listKnowledgeClarificationTurns>[0];
	request: NonNullable<
		Awaited<ReturnType<typeof getActiveKnowledgeClarificationForConversation>>
	>;
}) {
	const turns = await listKnowledgeClarificationTurns(params.db, {
		requestId: params.request.id,
	});
	return serializeKnowledgeClarificationRequest({
		request: params.request,
		turns,
	});
}

async function emitRetryableConversationClarificationFailure(params: {
	db: Database;
	websiteId: string;
	requestId: string;
	conversation: Awaited<
		ReturnType<typeof loadKnowledgeClarificationRuntime>
	>["conversation"];
}) {
	const failedRequest = await getKnowledgeClarificationRequestById(params.db, {
		requestId: params.requestId,
		websiteId: params.websiteId,
	});

	await emitConversationClarificationUpdate({
		db: params.db,
		conversation: params.conversation,
		request: failedRequest,
		aiAgentId: null,
	});
}

function createConversationClarificationProgressReporter(params: {
	db: Database;
	conversation: Awaited<
		ReturnType<typeof loadKnowledgeClarificationRuntime>
	>["conversation"];
	request: Awaited<ReturnType<typeof getKnowledgeClarificationRequestById>>;
}) {
	return async (progress: ConversationClarificationProgress) => {
		await emitConversationClarificationUpdate({
			db: params.db,
			conversation: params.conversation,
			request: params.request,
			aiAgentId: null,
			progress,
		});
	};
}

async function ensureFaqApprovalWithinLimits(params: {
	db: Database;
	website: NonNullable<Awaited<ReturnType<typeof getWebsiteBySlugWithAccess>>>;
	aiAgentId: string | null;
	draft: FaqKnowledgePayload;
}) {
	const planInfo = await getPlanForWebsite(params.website);
	const faqLimit = toNumericLimit(planInfo.features["ai-agent-training-faqs"]);
	if (faqLimit !== null) {
		const currentCount = await getKnowledgeCountByType(params.db, {
			websiteId: params.website.id,
			aiAgentId: params.aiAgentId,
			type: "faq",
		});
		if (currentCount >= faqLimit) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: `You have reached the limit of ${faqLimit} FAQs for your plan. Please upgrade to add more.`,
			});
		}
	}

	const sizeLimitMb = toNumericLimit(planInfo.features["ai-agent-training-mb"]);
	if (sizeLimitMb !== null) {
		const sizeLimitBytes = sizeLimitMb * 1024 * 1024;
		const currentSize = await getTotalKnowledgeSizeBytes(params.db, {
			websiteId: params.website.id,
			aiAgentId: params.aiAgentId,
		});
		const newEntrySize = new TextEncoder().encode(
			JSON.stringify(params.draft)
		).length;
		if (currentSize + newEntrySize > sizeLimitBytes) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: `Adding this entry would exceed your ${sizeLimitMb}MB knowledge base limit. Please upgrade for more storage.`,
			});
		}
	}
}

function stripDraftTitle(
	draft: KnowledgeClarificationDraftFaq
): FaqKnowledgePayload {
	return {
		question: draft.question,
		answer: draft.answer,
		categories: draft.categories,
		relatedQuestions: draft.relatedQuestions,
	};
}

function isTerminalClarificationRequestStatus(
	status: string
): status is "applied" | "dismissed" {
	return status === "applied" || status === "dismissed";
}

export const knowledgeClarificationRouter = createTRPCRouter({
	getActiveForConversation: protectedProcedure
		.input(getActiveKnowledgeClarificationRequestSchema)
		.output(getActiveKnowledgeClarificationResponseSchema)
		.query(async ({ ctx: { db, user }, input }) => {
			const website = await loadWebsite({
				db,
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});
			const request = await getActiveKnowledgeClarificationForConversation(db, {
				conversationId: input.conversationId,
				websiteId: website.id,
			});

			if (!request) {
				return { request: null };
			}

			return {
				request: await maybeSerializeClarificationRequest({
					db,
					request,
				}),
			};
		}),

	getProposal: protectedProcedure
		.input(getKnowledgeClarificationProposalRequestSchema)
		.output(getKnowledgeClarificationProposalResponseSchema)
		.query(async ({ ctx: { db, user }, input }) => {
			const website = await loadWebsite({
				db,
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});
			const request = await getKnowledgeClarificationRequestById(db, {
				requestId: input.requestId,
				websiteId: website.id,
			});
			if (!request) {
				return { request: null };
			}

			const turns = await listKnowledgeClarificationTurns(db, {
				requestId: request.id,
			});

			return {
				request: serializeKnowledgeClarificationRequest({
					request,
					turns,
				}),
			};
		}),

	startFromConversation: protectedProcedure
		.input(startConversationKnowledgeClarificationRequestSchema)
		.output(knowledgeClarificationStepEnvelopeSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { website, conversation } = await loadConversationContext(
				db,
				user.id,
				{
					websiteSlug: input.websiteSlug,
					conversationId: input.conversationId,
				}
			);
			const aiAgent = await getAiAgentForWebsite(db, {
				websiteId: website.id,
				organizationId: website.organizationId,
			});
			if (!aiAgent) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "AI agent not found for this website",
				});
			}

			try {
				const result = await startConversationKnowledgeClarification({
					db,
					organizationId: website.organizationId,
					websiteId: website.id,
					aiAgent,
					conversation,
					topicSummary: input.topicSummary,
					actor: { userId: user.id },
					creationMode: "manual",
				});
				if (!result.step) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							"This clarification trigger already maps to a completed request",
					});
				}

				try {
					await emitConversationClarificationUpdate({
						db,
						conversation,
						request: result.step.request,
						aiAgentId: null,
					});
				} catch (error) {
					console.warn(
						"[KnowledgeClarification] Failed to emit conversation start update",
						{
							conversationId: conversation.id,
							requestId: result.step.request.id,
							error:
								error instanceof Error ? error.message : "Unknown emit failure",
						}
					);
				}

				return { step: result.step };
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error
							? error.message
							: "Failed to start clarification flow",
				});
			}
		}),

	startFromFaq: protectedProcedure
		.input(startFaqKnowledgeClarificationRequestSchema)
		.output(knowledgeClarificationStepEnvelopeSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { website, aiAgent } = await loadWebsiteAndAiAgent({
				db,
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});
			const targetKnowledge = await getKnowledgeById(db, {
				id: input.knowledgeId,
				websiteId: website.id,
			});
			if (!targetKnowledge) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "FAQ not found",
				});
			}
			if (targetKnowledge.type !== "faq") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Only FAQ knowledge can be deepened in this flow",
				});
			}

			const payload =
				typeof targetKnowledge.payload === "object" &&
				targetKnowledge.payload !== null
					? (targetKnowledge.payload as Record<string, unknown>)
					: null;
			const defaultTopicSummary =
				input.topicSummary?.trim() ||
				(typeof payload?.question === "string"
					? `Clarify FAQ: ${payload.question}`
					: "Clarify this FAQ");

			try {
				const { step } = await startFaqKnowledgeClarification({
					db,
					organizationId: website.organizationId,
					websiteId: website.id,
					aiAgent,
					topicSummary: defaultTopicSummary,
					targetKnowledge,
				});

				return { step };
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error
							? error.message
							: "Failed to start clarification flow",
				});
			}
		}),

	answer: protectedProcedure
		.input(answerKnowledgeClarificationRequestSchema)
		.output(knowledgeClarificationStepEnvelopeSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { website, request } = await loadClarificationRequest({
				db,
				userId: user.id,
				websiteSlug: input.websiteSlug,
				requestId: input.requestId,
			});

			if (
				request.status !== "awaiting_answer" &&
				request.status !== "deferred"
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "This clarification request is not waiting for an answer",
				});
			}

			await createKnowledgeClarificationTurn(db, {
				requestId: request.id,
				role: "human_answer",
				selectedAnswer: input.selectedAnswer?.trim() || null,
				freeAnswer: input.freeAnswer?.trim() || null,
			});

			const answerText =
				input.selectedAnswer?.trim() || input.freeAnswer?.trim() || "No answer";
			const analyzingRequest = await updateKnowledgeClarificationRequest(db, {
				requestId: request.id,
				updates: {
					status: "analyzing",
					lastError: null,
				},
			});
			if (!analyzingRequest) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to update clarification request",
				});
			}

			const runtime = await loadKnowledgeClarificationRuntime({
				db,
				organizationId: website.organizationId,
				websiteId: website.id,
				request: analyzingRequest,
			});
			const progressReporter = createConversationClarificationProgressReporter({
				db,
				conversation: runtime.conversation,
				request: analyzingRequest,
			});

			await emitConversationClarificationUpdate({
				db,
				conversation: runtime.conversation,
				request: analyzingRequest,
				aiAgentId: null,
			});

			await createKnowledgeClarificationAuditEntry({
				db,
				request: analyzingRequest,
				conversation: runtime.conversation,
				actor: { userId: user.id },
				text: `Knowledge clarification answered: ${answerText}`,
			});

			try {
				const step = await runKnowledgeClarificationStep({
					db,
					request: analyzingRequest,
					aiAgent: runtime.aiAgent,
					conversation: runtime.conversation,
					targetKnowledge: runtime.targetKnowledge,
					progressReporter,
				});

				await emitConversationClarificationUpdate({
					db,
					conversation: runtime.conversation,
					request: step.request,
					aiAgentId: null,
				});

				return { step };
			} catch (error) {
				await emitRetryableConversationClarificationFailure({
					db,
					websiteId: website.id,
					requestId: analyzingRequest.id,
					conversation: runtime.conversation,
				});

				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error
							? error.message
							: "Failed to continue clarification flow",
				});
			}
		}),

	skip: protectedProcedure
		.input(skipKnowledgeClarificationRequestSchema)
		.output(knowledgeClarificationStepEnvelopeSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { website, request } = await loadClarificationRequest({
				db,
				userId: user.id,
				websiteSlug: input.websiteSlug,
				requestId: input.requestId,
			});

			if (
				request.status !== "awaiting_answer" &&
				request.status !== "deferred"
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "This clarification request is not waiting for an answer",
				});
			}

			await createKnowledgeClarificationTurn(db, {
				requestId: request.id,
				role: "human_skip",
				selectedAnswer: null,
				freeAnswer: null,
			});

			const analyzingRequest = await updateKnowledgeClarificationRequest(db, {
				requestId: request.id,
				updates: {
					status: "analyzing",
					lastError: null,
				},
			});
			if (!analyzingRequest) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to update clarification request",
				});
			}

			const runtime = await loadKnowledgeClarificationRuntime({
				db,
				organizationId: website.organizationId,
				websiteId: website.id,
				request: analyzingRequest,
			});
			const progressReporter = createConversationClarificationProgressReporter({
				db,
				conversation: runtime.conversation,
				request: analyzingRequest,
			});

			await emitConversationClarificationUpdate({
				db,
				conversation: runtime.conversation,
				request: analyzingRequest,
				aiAgentId: null,
			});

			await createKnowledgeClarificationAuditEntry({
				db,
				request: analyzingRequest,
				conversation: runtime.conversation,
				actor: { userId: user.id },
				text: "Knowledge clarification question skipped.",
			});

			try {
				const step = await runKnowledgeClarificationStep({
					db,
					request: analyzingRequest,
					aiAgent: runtime.aiAgent,
					conversation: runtime.conversation,
					targetKnowledge: runtime.targetKnowledge,
					progressReporter,
				});

				await emitConversationClarificationUpdate({
					db,
					conversation: runtime.conversation,
					request: step.request,
					aiAgentId: null,
				});

				return { step };
			} catch (error) {
				await emitRetryableConversationClarificationFailure({
					db,
					websiteId: website.id,
					requestId: analyzingRequest.id,
					conversation: runtime.conversation,
				});

				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error
							? error.message
							: "Failed to continue clarification flow",
				});
			}
		}),

	retry: protectedProcedure
		.input(updateKnowledgeClarificationStatusRequestSchema)
		.output(knowledgeClarificationStepEnvelopeSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { website, request } = await loadClarificationRequest({
				db,
				userId: user.id,
				websiteSlug: input.websiteSlug,
				requestId: input.requestId,
			});
			if (request.status !== "retry_required") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "This clarification request cannot be retried",
				});
			}

			const analyzingRequest = await updateKnowledgeClarificationRequest(db, {
				requestId: request.id,
				updates: {
					status: "analyzing",
					lastError: null,
				},
			});
			if (!analyzingRequest) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to update clarification request",
				});
			}

			const runtime = await loadKnowledgeClarificationRuntime({
				db,
				organizationId: website.organizationId,
				websiteId: website.id,
				request: analyzingRequest,
			});
			const progressReporter = createConversationClarificationProgressReporter({
				db,
				conversation: runtime.conversation,
				request: analyzingRequest,
			});

			await emitConversationClarificationUpdate({
				db,
				conversation: runtime.conversation,
				request: analyzingRequest,
				aiAgentId: null,
			});

			try {
				const step = await runKnowledgeClarificationStep({
					db,
					request: analyzingRequest,
					aiAgent: runtime.aiAgent,
					conversation: runtime.conversation,
					targetKnowledge: runtime.targetKnowledge,
					progressReporter,
				});

				await emitConversationClarificationUpdate({
					db,
					conversation: runtime.conversation,
					request: step.request,
					aiAgentId: null,
				});
				return { step };
			} catch (error) {
				await emitRetryableConversationClarificationFailure({
					db,
					websiteId: website.id,
					requestId: analyzingRequest.id,
					conversation: runtime.conversation,
				});

				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error
							? error.message
							: "Failed to retry clarification flow",
				});
			}
		}),

	defer: protectedProcedure
		.input(updateKnowledgeClarificationStatusRequestSchema)
		.output(knowledgeClarificationRequestSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { request } = await loadClarificationRequest({
				db,
				userId: user.id,
				websiteSlug: input.websiteSlug,
				requestId: input.requestId,
			});
			if (isTerminalClarificationRequestStatus(request.status)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "This clarification request can no longer be changed",
				});
			}
			const updatedRequest = await updateKnowledgeClarificationRequest(db, {
				requestId: request.id,
				updates: {
					status: "deferred",
				},
			});
			if (!updatedRequest) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to defer clarification request",
				});
			}

			const runtime = await loadKnowledgeClarificationRuntime({
				db,
				organizationId: updatedRequest.organizationId,
				websiteId: updatedRequest.websiteId,
				request: updatedRequest,
			});
			await createKnowledgeClarificationAuditEntry({
				db,
				request: updatedRequest,
				conversation: runtime.conversation,
				actor: { userId: user.id },
				text: "Knowledge clarification deferred to proposals.",
			});

			await emitConversationClarificationUpdate({
				db,
				conversation: runtime.conversation,
				request: null,
				aiAgentId: null,
			});

			const turns = await listKnowledgeClarificationTurns(db, {
				requestId: updatedRequest.id,
			});
			return serializeKnowledgeClarificationRequest({
				request: updatedRequest,
				turns,
			});
		}),

	dismiss: protectedProcedure
		.input(updateKnowledgeClarificationStatusRequestSchema)
		.output(knowledgeClarificationRequestSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { request } = await loadClarificationRequest({
				db,
				userId: user.id,
				websiteSlug: input.websiteSlug,
				requestId: input.requestId,
			});
			if (isTerminalClarificationRequestStatus(request.status)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "This clarification request can no longer be changed",
				});
			}
			const updatedRequest = await updateKnowledgeClarificationRequest(db, {
				requestId: request.id,
				updates: {
					status: "dismissed",
				},
			});
			if (!updatedRequest) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to dismiss clarification request",
				});
			}

			const runtime = await loadKnowledgeClarificationRuntime({
				db,
				organizationId: updatedRequest.organizationId,
				websiteId: updatedRequest.websiteId,
				request: updatedRequest,
			});
			await createKnowledgeClarificationAuditEntry({
				db,
				request: updatedRequest,
				conversation: runtime.conversation,
				actor: { userId: user.id },
				text: "Knowledge clarification dismissed.",
			});

			await emitConversationClarificationUpdate({
				db,
				conversation: runtime.conversation,
				request: null,
				aiAgentId: null,
			});

			const turns = await listKnowledgeClarificationTurns(db, {
				requestId: updatedRequest.id,
			});
			return serializeKnowledgeClarificationRequest({
				request: updatedRequest,
				turns,
			});
		}),

	listProposals: protectedProcedure
		.input(listKnowledgeClarificationProposalsRequestSchema)
		.output(listKnowledgeClarificationProposalsResponseSchema)
		.query(async ({ ctx: { db, user }, input }) => {
			const website = await loadWebsite({
				db,
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});
			const requests = await listKnowledgeClarificationProposals(db, {
				websiteId: website.id,
			});
			const items = await Promise.all(
				requests.map(async (request) => {
					const turns = await listKnowledgeClarificationTurns(db, {
						requestId: request.id,
					});
					return serializeKnowledgeClarificationRequest({
						request,
						turns,
					});
				})
			);

			return { items };
		}),

	approveDraft: protectedProcedure
		.input(approveKnowledgeClarificationDraftRequestSchema)
		.output(approveKnowledgeClarificationDraftResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { website, request } = await loadClarificationRequest({
				db,
				userId: user.id,
				websiteSlug: input.websiteSlug,
				requestId: input.requestId,
			});
			if (request.status !== "draft_ready") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "This clarification draft is no longer ready to approve",
				});
			}
			const faqPayload = stripDraftTitle(input.draft);

			const targetKnowledge = request.targetKnowledgeId
				? await getKnowledgeById(db, {
						id: request.targetKnowledgeId,
						websiteId: website.id,
					})
				: null;

			let knowledgeEntry: Awaited<ReturnType<typeof createKnowledge>> | null =
				null;
			if (targetKnowledge) {
				knowledgeEntry = await updateKnowledge(db, {
					id: targetKnowledge.id,
					websiteId: website.id,
					aiAgentId: request.aiAgentId,
					sourceTitle: faqPayload.question,
					payload: faqPayload,
				});
				if (!knowledgeEntry) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Target FAQ no longer exists",
					});
				}
			} else {
				await ensureFaqApprovalWithinLimits({
					db,
					website,
					aiAgentId: request.aiAgentId,
					draft: faqPayload,
				});
				knowledgeEntry = await createKnowledge(db, {
					organizationId: website.organizationId,
					websiteId: website.id,
					aiAgentId: request.aiAgentId,
					type: "faq",
					sourceTitle: faqPayload.question,
					origin: "knowledge_clarification",
					createdBy: user.id,
					payload: faqPayload,
					metadata: {
						clarificationRequestId: request.id,
					},
				});
			}
			if (!knowledgeEntry) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to persist approved FAQ",
				});
			}

			const updatedRequest = await updateKnowledgeClarificationRequest(db, {
				requestId: request.id,
				updates: {
					status: "applied",
					targetKnowledgeId: knowledgeEntry.id,
					draftFaqPayload: input.draft,
					lastError: null,
				},
			});
			if (!updatedRequest) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to mark clarification request as applied",
				});
			}

			const runtime = await loadKnowledgeClarificationRuntime({
				db,
				organizationId: updatedRequest.organizationId,
				websiteId: updatedRequest.websiteId,
				request: updatedRequest,
			});
			await createKnowledgeClarificationAuditEntry({
				db,
				request: updatedRequest,
				conversation: runtime.conversation,
				actor: { userId: user.id },
				text: `Knowledge clarification approved: ${faqPayload.question}`,
			});

			await emitConversationClarificationUpdate({
				db,
				conversation: runtime.conversation,
				request: null,
				aiAgentId: null,
			});

			const turns = await listKnowledgeClarificationTurns(db, {
				requestId: updatedRequest.id,
			});
			return {
				request: serializeKnowledgeClarificationRequest({
					request: updatedRequest,
					turns,
				}),
				knowledge: toKnowledgeResponse(knowledgeEntry),
			};
		}),
});
