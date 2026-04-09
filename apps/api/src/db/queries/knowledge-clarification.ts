import type { DatabaseClient } from "@api/db";
import {
	type KnowledgeClarificationRequestInsert,
	type KnowledgeClarificationRequestSelect,
	type KnowledgeClarificationSignalInsert,
	type KnowledgeClarificationSignalSelect,
	type KnowledgeClarificationTurnInsert,
	type KnowledgeClarificationTurnSelect,
	knowledgeClarificationRequest,
	knowledgeClarificationSignal,
	knowledgeClarificationTurn,
} from "@api/db/schema/knowledge-clarification";
import type {
	KnowledgeClarificationContextSnapshot,
	KnowledgeClarificationSearchEvidence,
} from "@api/lib/knowledge-clarification-context";
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

export const JOINABLE_REQUEST_STATUSES = [
	...PROPOSAL_STATUSES,
] as const satisfies KnowledgeClarificationStatus[];

export const REUSABLE_CONVERSATION_TOPIC_FINGERPRINT_STATUSES = [
	...JOINABLE_REQUEST_STATUSES,
] as const satisfies KnowledgeClarificationStatus[];

export type KnowledgeClarificationConversationAssociation = {
	conversationId: string;
	request: KnowledgeClarificationRequestSelect;
	engagementMode: "owner" | "linked";
};

export type KnowledgeClarificationVectorMatch = {
	request: KnowledgeClarificationRequestSelect;
	similarity: number;
};

function countLinkedConversationIds(params: {
	request: Pick<KnowledgeClarificationRequestSelect, "conversationId">;
	signals: Pick<KnowledgeClarificationSignalSelect, "conversationId">[];
}): number {
	const conversationIds = new Set<string>();

	if (params.request.conversationId) {
		conversationIds.add(params.request.conversationId);
	}

	for (const signal of params.signals) {
		if (signal.conversationId) {
			conversationIds.add(signal.conversationId);
		}
	}

	return conversationIds.size;
}

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

export async function getActiveKnowledgeClarificationAssociationForConversation(
	db: DatabaseClient,
	params: {
		conversationId: string;
		websiteId: string;
	}
): Promise<KnowledgeClarificationConversationAssociation | null> {
	const [ownerRequest] = await db
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

	if (ownerRequest) {
		return {
			conversationId: params.conversationId,
			request: ownerRequest,
			engagementMode: "owner",
		};
	}

	const [linkedAssociation] = await db
		.select({
			conversationId: knowledgeClarificationSignal.conversationId,
			request: knowledgeClarificationRequest,
		})
		.from(knowledgeClarificationSignal)
		.innerJoin(
			knowledgeClarificationRequest,
			eq(
				knowledgeClarificationSignal.requestId,
				knowledgeClarificationRequest.id
			)
		)
		.where(
			and(
				eq(knowledgeClarificationSignal.sourceKind, "conversation"),
				eq(knowledgeClarificationSignal.conversationId, params.conversationId),
				eq(knowledgeClarificationRequest.websiteId, params.websiteId),
				inArray(
					knowledgeClarificationRequest.status,
					ACTIVE_CONVERSATION_STATUSES
				)
			)
		)
		.orderBy(desc(knowledgeClarificationRequest.updatedAt))
		.limit(1);

	if (!(linkedAssociation?.conversationId && linkedAssociation.request)) {
		return null;
	}

	return {
		conversationId: linkedAssociation.conversationId,
		request: linkedAssociation.request,
		engagementMode: "linked",
	};
}

export async function getActiveKnowledgeClarificationForConversation(
	db: DatabaseClient,
	params: {
		conversationId: string;
		websiteId: string;
	}
): Promise<KnowledgeClarificationRequestSelect | null> {
	const association =
		await getActiveKnowledgeClarificationAssociationForConversation(db, params);

	return association?.request ?? null;
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

export async function listKnowledgeClarificationSignals(
	db: DatabaseClient,
	params: {
		requestId: string;
	}
): Promise<KnowledgeClarificationSignalSelect[]> {
	return db
		.select()
		.from(knowledgeClarificationSignal)
		.where(eq(knowledgeClarificationSignal.requestId, params.requestId))
		.orderBy(asc(knowledgeClarificationSignal.createdAt));
}

export async function listKnowledgeClarificationSignalsForRequests(
	db: DatabaseClient,
	params: {
		requestIds: string[];
	}
): Promise<KnowledgeClarificationSignalSelect[]> {
	if (params.requestIds.length === 0) {
		return [];
	}

	return db
		.select()
		.from(knowledgeClarificationSignal)
		.where(inArray(knowledgeClarificationSignal.requestId, params.requestIds))
		.orderBy(
			asc(knowledgeClarificationSignal.requestId),
			asc(knowledgeClarificationSignal.createdAt)
		);
}

export async function listActiveKnowledgeClarificationAssociationsForConversations(
	db: DatabaseClient,
	params: {
		websiteId: string;
		conversationIds: string[];
	}
): Promise<KnowledgeClarificationConversationAssociation[]> {
	if (params.conversationIds.length === 0) {
		return [];
	}

	const ownerRows = await db
		.select({
			conversationId: knowledgeClarificationRequest.conversationId,
			request: knowledgeClarificationRequest,
		})
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

	const linkedRows = await db
		.select({
			conversationId: knowledgeClarificationSignal.conversationId,
			request: knowledgeClarificationRequest,
		})
		.from(knowledgeClarificationSignal)
		.innerJoin(
			knowledgeClarificationRequest,
			eq(
				knowledgeClarificationSignal.requestId,
				knowledgeClarificationRequest.id
			)
		)
		.where(
			and(
				eq(knowledgeClarificationSignal.sourceKind, "conversation"),
				eq(knowledgeClarificationRequest.websiteId, params.websiteId),
				isNotNull(knowledgeClarificationSignal.conversationId),
				inArray(
					knowledgeClarificationSignal.conversationId,
					params.conversationIds
				),
				inArray(
					knowledgeClarificationRequest.status,
					ACTIVE_CONVERSATION_STATUSES
				)
			)
		)
		.orderBy(
			asc(knowledgeClarificationSignal.conversationId),
			desc(knowledgeClarificationRequest.updatedAt)
		);

	const associationByConversationId = new Map<
		string,
		KnowledgeClarificationConversationAssociation
	>();

	for (const row of ownerRows) {
		if (!(row.conversationId && row.request)) {
			continue;
		}

		if (!associationByConversationId.has(row.conversationId)) {
			associationByConversationId.set(row.conversationId, {
				conversationId: row.conversationId,
				request: row.request,
				engagementMode: "owner",
			});
		}
	}

	for (const row of linkedRows) {
		if (!(row.conversationId && row.request)) {
			continue;
		}

		if (!associationByConversationId.has(row.conversationId)) {
			associationByConversationId.set(row.conversationId, {
				conversationId: row.conversationId,
				request: row.request,
				engagementMode: "linked",
			});
		}
	}

	return [...associationByConversationId.values()];
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

	const associations =
		await listActiveKnowledgeClarificationAssociationsForConversations(
			db,
			params
		);

	if (associations.length === 0) {
		return summaryByConversationId;
	}

	const requestIds = associations.map((association) => association.request.id);
	const [turns, signals] = await Promise.all([
		listKnowledgeClarificationTurnsForRequests(db, {
			requestIds,
		}),
		listKnowledgeClarificationSignalsForRequests(db, {
			requestIds,
		}),
	]);
	const turnsByRequestId = new Map<
		string,
		KnowledgeClarificationTurnSelect[]
	>();
	const signalsByRequestId = new Map<
		string,
		KnowledgeClarificationSignalSelect[]
	>();

	for (const turn of turns) {
		const requestTurns = turnsByRequestId.get(turn.requestId) ?? [];
		requestTurns.push(turn);
		turnsByRequestId.set(turn.requestId, requestTurns);
	}

	for (const signal of signals) {
		const requestSignals = signalsByRequestId.get(signal.requestId) ?? [];
		requestSignals.push(signal);
		signalsByRequestId.set(signal.requestId, requestSignals);
	}

	for (const association of associations) {
		summaryByConversationId.set(
			association.conversationId,
			buildConversationClarificationSummary({
				request: association.request,
				turns: turnsByRequestId.get(association.request.id) ?? [],
				conversationId: association.conversationId,
				engagementMode: association.engagementMode,
				linkedConversationCount: countLinkedConversationIds({
					request: association.request,
					signals: signalsByRequestId.get(association.request.id) ?? [],
				}),
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

export async function getJoinableKnowledgeClarificationByTargetKnowledgeId(
	db: DatabaseClient,
	params: {
		websiteId: string;
		aiAgentId: string;
		targetKnowledgeId: string;
		statuses?: readonly KnowledgeClarificationStatus[];
	}
): Promise<KnowledgeClarificationRequestSelect | null> {
	const statuses = params.statuses ?? JOINABLE_REQUEST_STATUSES;
	const [request] = await db
		.select()
		.from(knowledgeClarificationRequest)
		.where(
			and(
				eq(knowledgeClarificationRequest.websiteId, params.websiteId),
				eq(knowledgeClarificationRequest.aiAgentId, params.aiAgentId),
				eq(
					knowledgeClarificationRequest.targetKnowledgeId,
					params.targetKnowledgeId
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

export async function getJoinableKnowledgeClarificationByTopicFingerprint(
	db: DatabaseClient,
	params: {
		websiteId: string;
		aiAgentId: string;
		topicFingerprint: string;
		statuses?: readonly KnowledgeClarificationStatus[];
	}
): Promise<KnowledgeClarificationRequestSelect | null> {
	const statuses = params.statuses ?? JOINABLE_REQUEST_STATUSES;
	const [request] = await db
		.select()
		.from(knowledgeClarificationRequest)
		.where(
			and(
				eq(knowledgeClarificationRequest.websiteId, params.websiteId),
				eq(knowledgeClarificationRequest.aiAgentId, params.aiAgentId),
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

export async function listJoinableKnowledgeClarificationVectorMatches(
	db: DatabaseClient,
	params: {
		websiteId: string;
		aiAgentId: string;
		topicEmbedding: number[];
		statuses?: readonly KnowledgeClarificationStatus[];
		limit?: number;
	}
): Promise<KnowledgeClarificationVectorMatch[]> {
	const statuses = params.statuses ?? JOINABLE_REQUEST_STATUSES;
	const limit = params.limit ?? 2;
	const similarity = sql<number>`1 - (${cosineDistance(
		knowledgeClarificationRequest.topicEmbedding,
		params.topicEmbedding
	)})`;

	return db
		.select({
			request: knowledgeClarificationRequest,
			similarity,
		})
		.from(knowledgeClarificationRequest)
		.where(
			and(
				eq(knowledgeClarificationRequest.websiteId, params.websiteId),
				eq(knowledgeClarificationRequest.aiAgentId, params.aiAgentId),
				inArray(knowledgeClarificationRequest.status, [...statuses]),
				isNotNull(knowledgeClarificationRequest.topicEmbedding),
				gt(similarity, 0)
			)
		)
		.orderBy(
			desc(similarity),
			desc(knowledgeClarificationRequest.updatedAt),
			desc(knowledgeClarificationRequest.createdAt)
		)
		.limit(limit);
}

export async function listJoinableKnowledgeClarificationRequestsMissingTopicEmbeddings(
	db: DatabaseClient,
	params: {
		websiteId: string;
		aiAgentId: string;
		statuses?: readonly KnowledgeClarificationStatus[];
		limit?: number;
	}
): Promise<KnowledgeClarificationRequestSelect[]> {
	const statuses = params.statuses ?? JOINABLE_REQUEST_STATUSES;
	const limit = params.limit ?? 25;

	return db
		.select()
		.from(knowledgeClarificationRequest)
		.where(
			and(
				eq(knowledgeClarificationRequest.websiteId, params.websiteId),
				eq(knowledgeClarificationRequest.aiAgentId, params.aiAgentId),
				inArray(knowledgeClarificationRequest.status, [...statuses]),
				isNull(knowledgeClarificationRequest.topicEmbedding)
			)
		)
		.orderBy(
			desc(knowledgeClarificationRequest.updatedAt),
			desc(knowledgeClarificationRequest.createdAt)
		)
		.limit(limit);
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
		topicEmbedding?: number[] | null;
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
			topicEmbedding: params.topicEmbedding ?? null,
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

export async function createKnowledgeClarificationSignal(
	db: DatabaseClient,
	params: {
		requestId: string;
		sourceKind: KnowledgeClarificationSignalInsert["sourceKind"];
		conversationId?: string | null;
		knowledgeId?: string | null;
		triggerMessageId?: string | null;
		summary: string;
		searchEvidence?: KnowledgeClarificationSearchEvidence[] | null;
	}
): Promise<KnowledgeClarificationSignalSelect> {
	const [signal] = await db
		.insert(knowledgeClarificationSignal)
		.values({
			id: ulid(),
			requestId: params.requestId,
			sourceKind: params.sourceKind,
			conversationId: params.conversationId ?? null,
			knowledgeId: params.knowledgeId ?? null,
			triggerMessageId: params.triggerMessageId ?? null,
			summary: params.summary,
			searchEvidence: params.searchEvidence ?? null,
			createdAt: new Date().toISOString(),
		})
		.returning();

	if (!signal) {
		throw new Error("Failed to create knowledge clarification signal");
	}

	return signal;
}

export async function updateKnowledgeClarificationRequest(
	db: DatabaseClient,
	params: {
		requestId: string;
		currentStatuses?: KnowledgeClarificationRequestSelect["status"][];
		expectedStepIndex?: number;
		updates: Partial<{
			status: KnowledgeClarificationRequestSelect["status"];
			topicSummary: string;
			topicEmbedding: number[] | null;
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
	const whereClauses = [eq(knowledgeClarificationRequest.id, params.requestId)];

	if (params.currentStatuses && params.currentStatuses.length > 0) {
		whereClauses.push(
			inArray(knowledgeClarificationRequest.status, params.currentStatuses)
		);
	}

	if (params.expectedStepIndex !== undefined) {
		whereClauses.push(
			eq(knowledgeClarificationRequest.stepIndex, params.expectedStepIndex)
		);
	}

	const [request] = await db
		.update(knowledgeClarificationRequest)
		.set({
			...params.updates,
			updatedAt: new Date().toISOString(),
		})
		.where(and(...whereClauses))
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
