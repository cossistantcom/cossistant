import type { DatabaseClient } from "@api/db";
import {
	type KnowledgeClarificationRequestInsert,
	type KnowledgeClarificationRequestSelect,
	type KnowledgeClarificationTurnInsert,
	type KnowledgeClarificationTurnSelect,
	knowledgeClarificationRequest,
	knowledgeClarificationTurn,
} from "@api/db/schema/knowledge-clarification";
import type { KnowledgeClarificationContextSnapshot } from "@api/lib/knowledge-clarification-context";
import { buildConversationClarificationSummary } from "@api/utils/knowledge-clarification-summary";
import type {
	ConversationClarificationSummary,
	KnowledgeClarificationDraftFaq,
	KnowledgeClarificationQuestionPlan,
	KnowledgeClarificationStatus,
} from "@plasma/types";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { ulid } from "ulid";

export const PROPOSAL_STATUSES: KnowledgeClarificationStatus[] = [
	"analyzing",
	"awaiting_answer",
	"retry_required",
	"deferred",
	"draft_ready",
];

export const ACTIVE_CONVERSATION_STATUSES: KnowledgeClarificationStatus[] = [
	"analyzing",
	"awaiting_answer",
	"retry_required",
	"draft_ready",
];

export const REUSABLE_CONVERSATION_TOPIC_FINGERPRINT_STATUSES = [
	...PROPOSAL_STATUSES,
] as const satisfies KnowledgeClarificationStatus[];

export async function getKnowledgeClarificationRequestById(
	db: DatabaseClient,
	params: {
		requestId: string;
		websiteId: string;
	}
): Promise<KnowledgeClarificationRequestSelect | null> {
	const [request] = await db
		.select()
		.from(knowledgeClarificationRequest)
		.where(
			and(
				eq(knowledgeClarificationRequest.id, params.requestId),
				eq(knowledgeClarificationRequest.websiteId, params.websiteId)
			)
		)
		.limit(1);

	return request ?? null;
}

export async function getActiveKnowledgeClarificationForConversation(
	db: DatabaseClient,
	params: {
		conversationId: string;
		websiteId: string;
	}
): Promise<KnowledgeClarificationRequestSelect | null> {
	const [request] = await db
		.select()
		.from(knowledgeClarificationRequest)
		.where(
			and(
				eq(knowledgeClarificationRequest.conversationId, params.conversationId),
				eq(knowledgeClarificationRequest.websiteId, params.websiteId),
				inArray(
					knowledgeClarificationRequest.status,
					ACTIVE_CONVERSATION_STATUSES
				)
			)
		)
		.orderBy(desc(knowledgeClarificationRequest.updatedAt))
		.limit(1);

	return request ?? null;
}

export async function listKnowledgeClarificationProposals(
	db: DatabaseClient,
	params: {
		websiteId: string;
	}
): Promise<KnowledgeClarificationRequestSelect[]> {
	return db
		.select()
		.from(knowledgeClarificationRequest)
		.where(
			and(
				eq(knowledgeClarificationRequest.websiteId, params.websiteId),
				inArray(knowledgeClarificationRequest.status, PROPOSAL_STATUSES)
			)
		)
		.orderBy(desc(knowledgeClarificationRequest.updatedAt));
}

export async function listKnowledgeClarificationTurns(
	db: DatabaseClient,
	params: {
		requestId: string;
	}
): Promise<KnowledgeClarificationTurnSelect[]> {
	return db
		.select()
		.from(knowledgeClarificationTurn)
		.where(eq(knowledgeClarificationTurn.requestId, params.requestId))
		.orderBy(asc(knowledgeClarificationTurn.createdAt));
}

export async function listKnowledgeClarificationTurnsForRequests(
	db: DatabaseClient,
	params: {
		requestIds: string[];
	}
): Promise<KnowledgeClarificationTurnSelect[]> {
	if (params.requestIds.length === 0) {
		return [];
	}

	return db
		.select()
		.from(knowledgeClarificationTurn)
		.where(inArray(knowledgeClarificationTurn.requestId, params.requestIds))
		.orderBy(
			asc(knowledgeClarificationTurn.requestId),
			asc(knowledgeClarificationTurn.createdAt)
		);
}

export async function listActiveKnowledgeClarificationRequestsForConversations(
	db: DatabaseClient,
	params: {
		websiteId: string;
		conversationIds: string[];
	}
): Promise<KnowledgeClarificationRequestSelect[]> {
	if (params.conversationIds.length === 0) {
		return [];
	}

	return db
		.select()
		.from(knowledgeClarificationRequest)
		.where(
			and(
				eq(knowledgeClarificationRequest.websiteId, params.websiteId),
				isNotNull(knowledgeClarificationRequest.conversationId),
				inArray(
					knowledgeClarificationRequest.conversationId,
					params.conversationIds
				),
				inArray(
					knowledgeClarificationRequest.status,
					ACTIVE_CONVERSATION_STATUSES
				)
			)
		)
		.orderBy(
			asc(knowledgeClarificationRequest.conversationId),
			desc(knowledgeClarificationRequest.updatedAt)
		);
}

export async function listActiveKnowledgeClarificationSummariesForConversations(
	db: DatabaseClient,
	params: {
		websiteId: string;
		conversationIds: string[];
	}
): Promise<Map<string, ConversationClarificationSummary | null>> {
	const summaryByConversationId = new Map<
		string,
		ConversationClarificationSummary | null
	>();

	if (params.conversationIds.length === 0) {
		return summaryByConversationId;
	}

	const requests =
		await listActiveKnowledgeClarificationRequestsForConversations(db, params);

	if (requests.length === 0) {
		return summaryByConversationId;
	}

	const turns = await listKnowledgeClarificationTurnsForRequests(db, {
		requestIds: requests.map((request) => request.id),
	});
	const turnsByRequestId = new Map<
		string,
		KnowledgeClarificationTurnSelect[]
	>();

	for (const turn of turns) {
		const requestTurns = turnsByRequestId.get(turn.requestId) ?? [];
		requestTurns.push(turn);
		turnsByRequestId.set(turn.requestId, requestTurns);
	}

	for (const request of requests) {
		const conversationId = request.conversationId;
		if (!conversationId || summaryByConversationId.has(conversationId)) {
			continue;
		}

		summaryByConversationId.set(
			conversationId,
			buildConversationClarificationSummary({
				request,
				turns: turnsByRequestId.get(request.id) ?? [],
			})
		);
	}

	return summaryByConversationId;
}

export async function getLatestKnowledgeClarificationForConversationBySourceTriggerMessageId(
	db: DatabaseClient,
	params: {
		conversationId: string;
		websiteId: string;
		sourceTriggerMessageId: string;
	}
): Promise<KnowledgeClarificationRequestSelect | null> {
	const [request] = await db
		.select()
		.from(knowledgeClarificationRequest)
		.where(
			and(
				eq(knowledgeClarificationRequest.conversationId, params.conversationId),
				eq(knowledgeClarificationRequest.websiteId, params.websiteId),
				eq(
					knowledgeClarificationRequest.sourceTriggerMessageId,
					params.sourceTriggerMessageId
				)
			)
		)
		.orderBy(
			desc(knowledgeClarificationRequest.updatedAt),
			desc(knowledgeClarificationRequest.createdAt)
		)
		.limit(1);

	return request ?? null;
}

export async function getLatestKnowledgeClarificationForConversationByTopicFingerprint(
	db: DatabaseClient,
	params: {
		conversationId: string;
		websiteId: string;
		topicFingerprint: string;
		statuses?: readonly KnowledgeClarificationStatus[];
	}
): Promise<KnowledgeClarificationRequestSelect | null> {
	const statuses =
		params.statuses ?? REUSABLE_CONVERSATION_TOPIC_FINGERPRINT_STATUSES;
	const [request] = await db
		.select()
		.from(knowledgeClarificationRequest)
		.where(
			and(
				eq(knowledgeClarificationRequest.source, "conversation"),
				eq(knowledgeClarificationRequest.conversationId, params.conversationId),
				eq(knowledgeClarificationRequest.websiteId, params.websiteId),
				eq(
					knowledgeClarificationRequest.topicFingerprint,
					params.topicFingerprint
				),
				inArray(knowledgeClarificationRequest.status, [...statuses])
			)
		)
		.orderBy(
			desc(knowledgeClarificationRequest.updatedAt),
			desc(knowledgeClarificationRequest.createdAt)
		)
		.limit(1);

	return request ?? null;
}

export async function createKnowledgeClarificationRequest(
	db: DatabaseClient,
	params: {
		organizationId: string;
		websiteId: string;
		aiAgentId: string;
		conversationId?: string | null;
		source: KnowledgeClarificationRequestInsert["source"];
		topicSummary: string;
		sourceTriggerMessageId?: string | null;
		topicFingerprint?: string | null;
		targetKnowledgeId?: string | null;
		contextSnapshot?: KnowledgeClarificationContextSnapshot | null;
		maxSteps?: number;
		status?: KnowledgeClarificationRequestInsert["status"];
		questionPlan?: KnowledgeClarificationQuestionPlan | null;
		draftFaqPayload?: KnowledgeClarificationDraftFaq | null;
		lastError?: string | null;
	}
): Promise<KnowledgeClarificationRequestSelect> {
	const now = new Date().toISOString();
	const [request] = await db
		.insert(knowledgeClarificationRequest)
		.values({
			id: ulid(),
			organizationId: params.organizationId,
			websiteId: params.websiteId,
			aiAgentId: params.aiAgentId,
			conversationId: params.conversationId ?? null,
			source: params.source,
			status: params.status ?? "awaiting_answer",
			topicSummary: params.topicSummary,
			sourceTriggerMessageId: params.sourceTriggerMessageId ?? null,
			topicFingerprint: params.topicFingerprint ?? null,
			stepIndex: 0,
			maxSteps: params.maxSteps ?? 3,
			contextSnapshot: params.contextSnapshot ?? null,
			targetKnowledgeId: params.targetKnowledgeId ?? null,
			questionPlan: params.questionPlan ?? null,
			draftFaqPayload: params.draftFaqPayload ?? null,
			lastError: params.lastError ?? null,
			createdAt: now,
			updatedAt: now,
		})
		.returning();

	if (!request) {
		throw new Error("Failed to create knowledge clarification request");
	}

	return request;
}

export async function updateKnowledgeClarificationRequest(
	db: DatabaseClient,
	params: {
		requestId: string;
		updates: Partial<{
			status: KnowledgeClarificationRequestSelect["status"];
			topicSummary: string;
			stepIndex: number;
			maxSteps: number;
			contextSnapshot: KnowledgeClarificationContextSnapshot | null;
			targetKnowledgeId: string | null;
			questionPlan: KnowledgeClarificationQuestionPlan | null;
			draftFaqPayload: KnowledgeClarificationDraftFaq | null;
			lastError: string | null;
		}>;
	}
): Promise<KnowledgeClarificationRequestSelect | null> {
	const [request] = await db
		.update(knowledgeClarificationRequest)
		.set({
			...params.updates,
			updatedAt: new Date().toISOString(),
		})
		.where(eq(knowledgeClarificationRequest.id, params.requestId))
		.returning();

	return request ?? null;
}

export async function createKnowledgeClarificationTurn(
	db: DatabaseClient,
	params: {
		requestId: string;
		role: KnowledgeClarificationTurnInsert["role"];
		question?: string | null;
		suggestedAnswers?: string[] | null;
		selectedAnswer?: string | null;
		freeAnswer?: string | null;
	}
): Promise<KnowledgeClarificationTurnSelect> {
	const now = new Date().toISOString();
	const [turn] = await db
		.insert(knowledgeClarificationTurn)
		.values({
			id: ulid(),
			requestId: params.requestId,
			role: params.role,
			question: params.question ?? null,
			suggestedAnswers: params.suggestedAnswers ?? null,
			selectedAnswer: params.selectedAnswer ?? null,
			freeAnswer: params.freeAnswer ?? null,
			createdAt: now,
			updatedAt: now,
		})
		.returning();

	if (!turn) {
		throw new Error("Failed to create knowledge clarification turn");
	}

	return turn;
}
