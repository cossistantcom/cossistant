import type { Database } from "@api/db";
import {
	getAiAgentById,
	updateAiAgentTrainingStatus,
} from "@api/db/queries/ai-agent";
import {
	createKnowledge,
	getKnowledgeById,
	getKnowledgeCountByType,
	getTotalKnowledgeSizeBytes,
	updateKnowledge,
} from "@api/db/queries/knowledge";
import {
	getActiveKnowledgeClarificationAssociationForConversation,
	getKnowledgeClarificationRequestById,
	listKnowledgeClarificationProposals,
	type listKnowledgeClarificationTurns,
	updateKnowledgeClarificationRequest,
} from "@api/db/queries/knowledge-clarification";
import { getWebsiteBySlugWithAccess } from "@api/db/queries/website";
import { getPlanForWebsite } from "@api/lib/plans/access";
import {
	createKnowledgeClarificationAuditEntry,
	emitConversationClarificationUpdate,
	loadKnowledgeClarificationRuntime,
	serializeKnowledgeClarificationRequestWithMetadata,
} from "@api/services/knowledge-clarification";
import type { KnowledgeClarificationDraftFaq } from "@plasma/types";
import {
	approveKnowledgeClarificationDraftRequestSchema,
	approveKnowledgeClarificationDraftResponseSchema,
	type FaqKnowledgePayload,
	getActiveKnowledgeClarificationRequestSchema,
	getActiveKnowledgeClarificationResponseSchema,
	getKnowledgeClarificationProposalRequestSchema,
	getKnowledgeClarificationProposalResponseSchema,
	type KnowledgeResponse,
	knowledgeClarificationRequestSchema,
	listKnowledgeClarificationProposalsRequestSchema,
	listKnowledgeClarificationProposalsResponseSchema,
	updateKnowledgeClarificationStatusRequestSchema,
} from "@plasma/types";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../init";

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
		Awaited<
			ReturnType<
				typeof getActiveKnowledgeClarificationAssociationForConversation
			>
		>
	>["request"];
	engagementMode?: "owner" | "linked";
}) {
	return serializeKnowledgeClarificationRequestWithMetadata({
		db: params.db as Database,
		request: params.request,
		engagementMode: params.engagementMode,
	});
}

async function maybeTriggerClarificationTraining(params: {
	db: Database;
	aiAgentId: string;
	websiteId: string;
	organizationId: string;
	triggeredBy: string;
}) {
	const agent = await getAiAgentById(params.db, {
		aiAgentId: params.aiAgentId,
	});
	if (!agent) {
		return;
	}

	if (
		agent.trainingStatus === "pending" ||
		agent.trainingStatus === "training"
	) {
		return;
	}

	await updateAiAgentTrainingStatus(params.db, {
		aiAgentId: params.aiAgentId,
		trainingStatus: "pending",
		trainingProgress: 0,
		trainingError: null,
	});
	await triggerAiTraining({
		websiteId: params.websiteId,
		organizationId: params.organizationId,
		aiAgentId: params.aiAgentId,
		triggeredBy: params.triggeredBy,
	});
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
			const association =
				await getActiveKnowledgeClarificationAssociationForConversation(db, {
					conversationId: input.conversationId,
					websiteId: website.id,
				});

			if (!association) {
				return { request: null };
			}

			return {
				request: await maybeSerializeClarificationRequest({
					db,
					request: association.request,
					engagementMode: association.engagementMode,
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

			return {
				request: await serializeKnowledgeClarificationRequestWithMetadata({
					db,
					request,
				}),
			};
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
				request: updatedRequest,
				aiAgentId: null,
			});

			return serializeKnowledgeClarificationRequestWithMetadata({
				db,
				request: updatedRequest,
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
				request: updatedRequest,
				aiAgentId: null,
			});

			return serializeKnowledgeClarificationRequestWithMetadata({
				db,
				request: updatedRequest,
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
				requests.map(async (request) =>
					serializeKnowledgeClarificationRequestWithMetadata({
						db,
						request,
					})
				)
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
				request: updatedRequest,
				aiAgentId: null,
			});

			await maybeTriggerClarificationTraining({
				db,
				aiAgentId: updatedRequest.aiAgentId,
				websiteId: website.id,
				organizationId: website.organizationId,
				triggeredBy: user.id,
			});

			return {
				request: await serializeKnowledgeClarificationRequestWithMetadata({
					db,
					request: updatedRequest,
					targetKnowledge: knowledgeEntry,
				}),
				knowledge: toKnowledgeResponse(knowledgeEntry),
			};
		}),
});
