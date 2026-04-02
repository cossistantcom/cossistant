import { buildConversationTranscript } from "@api/ai-pipeline/primary-pipeline/steps/intake/history";
import { trackGenerationUsage } from "@api/ai-pipeline/shared/usage";
import type { Database } from "@api/db";
import { getAiAgentForWebsite } from "@api/db/queries/ai-agent";
import { getConversationById } from "@api/db/queries/conversation";
import { getKnowledgeById } from "@api/db/queries/knowledge";
import {
	createKnowledgeClarificationRequest,
	createKnowledgeClarificationTurn,
	getActiveKnowledgeClarificationForConversation,
	getLatestKnowledgeClarificationForConversationBySourceTriggerMessageId,
	getLatestKnowledgeClarificationForConversationByTopicFingerprint,
	listKnowledgeClarificationTurns,
	REUSABLE_CONVERSATION_TOPIC_FINGERPRINT_STATUSES,
	updateKnowledgeClarificationRequest,
} from "@api/db/queries/knowledge-clarification";
import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import type { ConversationSelect } from "@api/db/schema/conversation";
import type { KnowledgeSelect } from "@api/db/schema/knowledge";
import type {
	KnowledgeClarificationRequestSelect,
	KnowledgeClarificationTurnSelect,
} from "@api/db/schema/knowledge-clarification";
import {
	APICallError,
	createStructuredOutputModel,
	EmptyResponseBodyError,
	NoContentGeneratedError,
	NoObjectGeneratedError,
	NoOutputGeneratedError,
	NoSuchModelError,
	Output,
	streamText,
} from "@api/lib/ai";
import { resolveClarificationModelForExecution } from "@api/lib/ai-credits/config";
import {
	buildConversationClarificationContextSnapshot,
	buildFaqClarificationContextSnapshot,
	buildSpecificClarificationTopicSummary,
	extractLinkedFaqSnapshot,
	type KnowledgeClarificationContextSnapshot,
} from "@api/lib/knowledge-clarification-context";
import { realtime } from "@api/realtime/emitter";
import { buildClarificationRelevancePacket } from "@api/services/knowledge-clarification-relevance";
import {
	buildClarificationTopicFingerprint,
	getClarificationSourceTriggerMessageId,
} from "@api/utils/knowledge-clarification-identity";
import {
	buildConversationClarificationSummary,
	getDisplayClarificationQuestionTurn,
	getPendingClarificationQuestionTurn,
} from "@api/utils/knowledge-clarification-summary";
import { createTimelineItem } from "@api/utils/timeline-item";
import {
	type ConversationClarificationProgress,
	type ConversationClarificationProgressPhase,
	ConversationTimelineType,
	type KnowledgeClarificationDraftFaq,
	type KnowledgeClarificationPlannedQuestion,
	type KnowledgeClarificationQuestionInputMode,
	type KnowledgeClarificationQuestionPlan,
	type KnowledgeClarificationQuestionScope,
	type KnowledgeClarificationRequest,
	type KnowledgeClarificationStatus,
	type KnowledgeClarificationStepResponse,
	TimelineItemVisibility,
} from "@plasma/types";
import { ulid } from "ulid";
import { z } from "zod";

const DEFAULT_MAX_CLARIFICATION_STEPS = 3;

const clarificationOutputBaseSchema = z.object({
	topicSummary: z.string().min(1).max(400),
	missingFact: z.string().min(1).max(280),
	whyItMatters: z.string().min(1).max(400),
});

const clarificationPlannedQuestionOutputSchema = z.object({
	id: z.string().min(1).max(80),
	question: z.string().min(1).max(500),
	suggestedAnswers: z.array(z.string().min(1).max(240)).length(3),
	inputMode: z.enum(["textarea_first", "suggested_answers"]),
	questionScope: z.enum(["broad_discovery", "narrow_detail"]),
	missingFact: z.string().min(1).max(280),
	whyItMatters: z.string().min(1).max(400),
});

const clarificationDraftFaqPayloadSchema = z.object({
	title: z.string().min(1).max(200).nullable(),
	question: z.string().min(1).max(300),
	answer: z.string().min(1).max(6000),
	categories: z.array(z.string().min(1).max(80)).max(8),
	relatedQuestions: z.array(z.string().min(1).max(300)).max(8),
});

const clarificationDraftOutputSchema = clarificationOutputBaseSchema.extend({
	kind: z.literal("draft_ready"),
	continueClarifying: z.boolean(),
	draftFaqPayload: clarificationDraftFaqPayloadSchema,
});

const clarificationPlannerOutputSchema = clarificationOutputBaseSchema.extend({
	kind: z.enum(["question_plan", "draft_ready"]),
	questions: z
		.array(clarificationPlannedQuestionOutputSchema)
		.max(3)
		.nullable(),
	draftFaqPayload: clarificationDraftFaqPayloadSchema.nullable(),
});

const clarificationEvaluationOutputSchema = z.object({
	topicSummary: z.string().min(1).max(400),
	outcome: z.enum(["continue", "draft_ready"]),
	reason: z.string().min(1).max(400),
	nextQuestionId: z.string().min(1).max(80).nullable(),
	coveredQuestionIds: z.array(z.string().min(1).max(80)).max(3),
});

const clarificationDraftOnlyOutputSchema = z.object({
	topicSummary: z.string().min(1).max(400),
	missingFact: z.string().min(1).max(280),
	whyItMatters: z.string().min(1).max(400),
	draftFaqPayload: clarificationDraftFaqPayloadSchema,
});

type ClarificationDraftOutput = z.infer<typeof clarificationDraftOutputSchema>;
type ClarificationPlannerOutput = z.infer<
	typeof clarificationPlannerOutputSchema
>;
type ClarificationEvaluationOutput = z.infer<
	typeof clarificationEvaluationOutputSchema
>;
type ClarificationDraftOnlyOutput = z.infer<
	typeof clarificationDraftOnlyOutputSchema
>;

type KnowledgeClarificationActor = {
	userId?: string | null;
	aiAgentId?: string | null;
};

type StartConversationKnowledgeClarificationParams = {
	db: Database;
	organizationId: string;
	websiteId: string;
	aiAgent: AiAgentSelect;
	conversation: ConversationSelect;
	topicSummary: string;
	actor: KnowledgeClarificationActor;
	contextSnapshot?: KnowledgeClarificationContextSnapshot | null;
	maxSteps?: number;
	creationMode?: "manual" | "automation";
};

type StartFaqKnowledgeClarificationParams = {
	db: Database;
	organizationId: string;
	websiteId: string;
	aiAgent: AiAgentSelect;
	topicSummary: string;
	targetKnowledge: KnowledgeSelect;
	contextSnapshot?: KnowledgeClarificationContextSnapshot | null;
	maxSteps?: number;
};

type RunKnowledgeClarificationStepParams = {
	db: Database;
	request: KnowledgeClarificationRequestSelect;
	aiAgent: AiAgentSelect;
	conversation?: ConversationSelect | null;
	targetKnowledge?: KnowledgeSelect | null;
	progressReporter?: ClarificationProgressReporter;
};

type ClarificationProviderUsage = {
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
};

type ClarificationModelMetadata = {
	modelId: string;
	modelIdOriginal: string;
	modelMigrationApplied: boolean;
};

type ClarificationModelCallSuccess<TOutput> = {
	kind: "success";
	model: ClarificationModelMetadata;
	output: TOutput;
	providerUsage?: ClarificationProviderUsage;
	attemptCount: number;
	toolName: string | null;
};

type ClarificationModelCallRetryRequired = {
	kind: "retry_required";
	lastError: string;
	attemptCount: number;
	toolName: string | null;
};

type ClarificationModelCallResult<TOutput> =
	| ClarificationModelCallSuccess<TOutput>
	| ClarificationModelCallRetryRequired;

type ClarificationUsagePhase =
	| "clarification_plan_generation"
	| "clarification_answer_evaluation"
	| "faq_draft_generation";

type ClarificationUsageEvent = {
	phase: ClarificationUsagePhase;
	stepIndex: number;
	model: ClarificationModelMetadata;
	providerUsage?: ClarificationProviderUsage;
};

type ClarificationGenerationResult = {
	kind: "success";
	output: ClarificationQueuedQuestionOutput | ClarificationDraftOutput;
	questionPlan: KnowledgeClarificationQuestionPlan | null;
	model: ClarificationModelMetadata;
	usageEvents: ClarificationUsageEvent[];
	metrics: ClarificationGenerationMetrics;
};

type ClarificationRetryRequiredResult = {
	kind: "retry_required";
	lastError: string;
	metrics: ClarificationGenerationMetrics;
};

type ClarificationQueuedQuestionOutput = {
	kind: "question";
	topicSummary: string;
	question: string;
	suggestedAnswers: string[];
	inputMode: KnowledgeClarificationQuestionInputMode;
	questionScope: KnowledgeClarificationQuestionScope;
	missingFact: string;
	whyItMatters: string;
};

type ClarificationProgressReporter = (
	progress: ConversationClarificationProgress
) => Promise<void>;

type ClarificationGenerationMetrics = {
	contextMs: number;
	modelMs: number;
	fallbackMs: number;
	attemptCount: number;
	endedKind: "question" | "draft_ready" | "retry_required";
	toolName: string | null;
};

type ClarificationQuestionStrategy = {
	inputMode: KnowledgeClarificationQuestionInputMode;
	questionScope: KnowledgeClarificationQuestionScope;
};

type ConversationClarificationStartResolution =
	| "created"
	| "reused"
	| "suppressed_duplicate";

type ConversationClarificationStartResult = {
	request: KnowledgeClarificationRequest;
	step: KnowledgeClarificationStepResponse | null;
	created: boolean;
	resolution: ConversationClarificationStartResolution;
};

const CLARIFICATION_FALLBACK_MODEL_IDS = [
	"google/gemini-3-flash-preview",
	"openai/gpt-5-mini",
	"moonshotai/kimi-k2.5",
] as const;

const CLARIFICATION_PROGRESS_LABELS: Record<
	ConversationClarificationProgressPhase,
	string
> = {
	loading_context: "Loading context...",
	reviewing_evidence: "Reviewing evidence...",
	planning_questions: "Planning questions...",
	evaluating_answer: "Reviewing your answer...",
	generating_draft: "Generating draft...",
	retrying_generation: "Retrying generation...",
	finalizing_step: "Finalizing...",
};

function createClarificationGenerationMetrics(
	overrides: Partial<ClarificationGenerationMetrics> = {}
): ClarificationGenerationMetrics {
	return {
		contextMs: 0,
		modelMs: 0,
		fallbackMs: 0,
		attemptCount: 0,
		endedKind: "retry_required",
		toolName: null,
		...overrides,
	};
}

function buildClarificationModelMetadata(
	aiAgentModelId: string,
	modelId: string
): ClarificationModelMetadata {
	return {
		modelId,
		modelIdOriginal: aiAgentModelId,
		modelMigrationApplied: aiAgentModelId !== modelId,
	};
}

function sanitizeClarificationProgressToolName(
	toolName: string | null | undefined
): string | null {
	if (!toolName) {
		return null;
	}

	const normalizedToolName = toolName
		.trim()
		.replace(/[^A-Za-z0-9:_-]/g, "")
		.slice(0, 80);

	return normalizedToolName.length > 0 ? normalizedToolName : null;
}

function createClarificationProgress(params: {
	phase: ConversationClarificationProgressPhase;
	detail?: string | null;
	attempt?: number | null;
	toolName?: string | null;
}): ConversationClarificationProgress {
	return {
		phase: params.phase,
		label: CLARIFICATION_PROGRESS_LABELS[params.phase],
		detail: params.detail ?? null,
		attempt: params.attempt ?? null,
		toolName: sanitizeClarificationProgressToolName(params.toolName),
		startedAt: new Date().toISOString(),
	};
}

async function reportClarificationProgress(
	reporter: ClarificationProgressReporter | undefined,
	progress: ConversationClarificationProgress
): Promise<void> {
	await reporter?.(progress);
}

async function reportClarificationPhaseProgress(
	reporter: ClarificationProgressReporter | undefined,
	params: {
		phase: ConversationClarificationProgressPhase;
		detail?: string | null;
		attempt?: number | null;
		toolName?: string | null;
	}
): Promise<void> {
	await reportClarificationProgress(
		reporter,
		createClarificationProgress(params)
	);
}

function logClarificationGenerationTiming(params: {
	requestId: string;
	modelIdOriginal: string;
	modelIdResolved: string;
	modelMigrationApplied: boolean;
	contextMs: number;
	modelMs: number;
	fallbackMs: number;
	totalMs: number;
	attemptCount: number;
	endedKind: ClarificationGenerationMetrics["endedKind"];
	toolName: string | null;
}): void {
	console.info("[KnowledgeClarification] Step timing", params);
}

function isTerminalClarificationStatus(
	status: KnowledgeClarificationStatus
): status is "applied" | "dismissed" {
	return status === "applied" || status === "dismissed";
}

function isUniqueViolationError(
	error: unknown,
	constraintName?: string
): boolean {
	if (!(typeof error === "object" && error !== null)) {
		return false;
	}

	const code = "code" in error ? error.code : null;
	if (code !== "23505") {
		return false;
	}

	if (!constraintName) {
		return true;
	}

	const message =
		typeof (error as { message?: unknown }).message === "string"
			? (error as { message: string }).message
			: "";
	const detail =
		typeof (error as { detail?: unknown }).detail === "string"
			? (error as { detail: string }).detail
			: "";
	const constraint =
		typeof (error as { constraint?: unknown }).constraint === "string"
			? (error as { constraint: string }).constraint
			: "";

	return (
		constraint === constraintName ||
		`${message} ${detail}`.includes(constraintName)
	);
}

function normalizeDraftFaq(
	draft: ClarificationDraftOutput["draftFaqPayload"]
): KnowledgeClarificationDraftFaq {
	return {
		title: draft.title ?? null,
		question: draft.question.trim(),
		answer: draft.answer.trim(),
		categories: [
			...new Set(draft.categories.map((value) => value.trim()).filter(Boolean)),
		],
		relatedQuestions: [
			...new Set(
				draft.relatedQuestions.map((value) => value.trim()).filter(Boolean)
			),
		],
	};
}

function normalizeClarificationQuestionText(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function sanitizeClarificationQuestion(question: string): string {
	let sanitized = normalizeClarificationQuestionText(question);

	sanitized = sanitized
		.replace(/^(?:[-*\u2022]\s+|\([a-z0-9]\)\s*|[a-z0-9][.)]\s+)/i, "")
		.trim();

	const inlineChoiceMatch = sanitized.match(
		/\s(?:\([a-z0-9]\)|[a-z0-9][.)]|option\s+[a-z0-9]\b)(?=\s|:|-|$)/i
	);
	if (inlineChoiceMatch && typeof inlineChoiceMatch.index === "number") {
		sanitized = sanitized.slice(0, inlineChoiceMatch.index).trim();
	}

	let previous = "";
	while (sanitized && sanitized !== previous) {
		previous = sanitized;
		sanitized = sanitized
			.replace(/[\s:;,\-.]+$/g, "")
			.replace(/\b(?:do they|is it|are they|does it)\s*$/i, "")
			.trim();
	}

	sanitized = sanitized.replace(/[.!:;,/-]+$/g, "").trim();

	if (!sanitized) {
		return normalizeClarificationQuestionText(question);
	}

	return sanitized.endsWith("?") ? sanitized : `${sanitized}?`;
}

function normalizeSuggestedAnswers(
	suggestedAnswers: string[]
): [string, string, string] {
	if (suggestedAnswers.length !== 3) {
		throw new Error(
			"Clarification model must return exactly 3 suggested answers."
		);
	}

	return suggestedAnswers.map((answer: string) =>
		normalizeClarificationQuestionText(answer)
	) as [string, string, string];
}

function normalizePlannedClarificationQuestion(
	question: NonNullable<ClarificationPlannerOutput["questions"]>[number]
): KnowledgeClarificationPlannedQuestion {
	return {
		id: normalizeClarificationQuestionText(question.id),
		question: sanitizeClarificationQuestion(question.question),
		suggestedAnswers: normalizeSuggestedAnswers(question.suggestedAnswers),
		inputMode: question.inputMode,
		questionScope: question.questionScope,
		missingFact: normalizeClarificationQuestionText(question.missingFact),
		whyItMatters: normalizeClarificationQuestionText(question.whyItMatters),
	};
}

function normalizeClarificationQuestionPlan(
	questions: ClarificationPlannerOutput["questions"]
): KnowledgeClarificationQuestionPlan {
	if (!questions || questions.length === 0) {
		throw new Error("Clarification planner returned no queued questions.");
	}

	const normalizedQuestions = questions.map(
		normalizePlannedClarificationQuestion
	);
	const seenQuestionIds = new Set<string>();
	const seenQuestions = new Set<string>();

	for (const question of normalizedQuestions) {
		if (seenQuestionIds.has(question.id)) {
			throw new Error("Clarification planner returned duplicate question ids.");
		}
		if (seenQuestions.has(question.question.toLowerCase())) {
			throw new Error("Clarification planner returned duplicate questions.");
		}
		seenQuestionIds.add(question.id);
		seenQuestions.add(question.question.toLowerCase());
	}

	return normalizedQuestions;
}

function normalizeClarificationDraftOutput(
	output:
		| ClarificationPlannerOutput
		| ClarificationDraftOutput
		| ClarificationDraftOnlyOutput
): ClarificationDraftOutput {
	const draftFaqPayload =
		"draftFaqPayload" in output ? output.draftFaqPayload : null;
	if (draftFaqPayload === null) {
		throw new Error(
			"Clarification model returned no draft payload for a draft response."
		);
	}

	const parsed = clarificationDraftOutputSchema.safeParse({
		kind: "draft_ready",
		continueClarifying: false,
		topicSummary: output.topicSummary,
		missingFact: output.missingFact,
		whyItMatters: output.whyItMatters,
		draftFaqPayload,
	});

	if (!parsed.success) {
		throw new Error("Clarification model returned an invalid draft response.");
	}

	return parsed.data;
}

function getAiQuestionCount(turns: KnowledgeClarificationTurnSelect[]): number {
	return turns.filter((turn) => turn.role === "ai_question").length;
}

function getQuestionPlan(
	request: Pick<KnowledgeClarificationRequestSelect, "questionPlan">
): KnowledgeClarificationQuestionPlan {
	return request.questionPlan ?? [];
}

function getPlannedQuestionByQuestionText(params: {
	request: Pick<KnowledgeClarificationRequestSelect, "questionPlan">;
	questionText: string | null | undefined;
}): KnowledgeClarificationPlannedQuestion | null {
	if (!params.questionText) {
		return null;
	}

	const normalizedQuestionText = normalizeClarificationQuestionText(
		params.questionText
	).toLowerCase();

	return (
		getQuestionPlan(params.request).find(
			(question) =>
				normalizeClarificationQuestionText(question.question).toLowerCase() ===
				normalizedQuestionText
		) ?? null
	);
}

function getAskedQuestionTexts(
	turns: KnowledgeClarificationTurnSelect[]
): Set<string> {
	return new Set(
		turns
			.filter(
				(turn) =>
					turn.role === "ai_question" && typeof turn.question === "string"
			)
			.map((turn) => normalizeClarificationQuestionText(turn.question ?? ""))
			.filter(Boolean)
	);
}

function getRemainingPlannedQuestions(params: {
	request: Pick<KnowledgeClarificationRequestSelect, "questionPlan">;
	turns: KnowledgeClarificationTurnSelect[];
}): KnowledgeClarificationQuestionPlan {
	const askedQuestionTexts = getAskedQuestionTexts(params.turns);
	return getQuestionPlan(params.request).filter(
		(question) =>
			!askedQuestionTexts.has(
				normalizeClarificationQuestionText(question.question)
			)
	);
}

function getPlannedQuestionById(params: {
	request: Pick<KnowledgeClarificationRequestSelect, "questionPlan">;
	questionId: string;
}): KnowledgeClarificationPlannedQuestion | null {
	return (
		getQuestionPlan(params.request).find(
			(question) => question.id === params.questionId
		) ?? null
	);
}

function isBroadDiscoveryQuestion(params: {
	request: Pick<
		KnowledgeClarificationRequestSelect,
		"source" | "targetKnowledgeId"
	>;
	questionOrdinal: number;
}): boolean {
	return (
		params.request.source === "conversation" &&
		!params.request.targetKnowledgeId &&
		params.questionOrdinal === 1
	);
}

function resolveStoredQuestionStrategy(params: {
	request: Pick<
		KnowledgeClarificationRequestSelect,
		"source" | "targetKnowledgeId" | "questionPlan"
	>;
	turns: KnowledgeClarificationTurnSelect[];
	questionTurnId: string;
}): ClarificationQuestionStrategy {
	const questionTurn = params.turns.find(
		(turn) => turn.id === params.questionTurnId
	);
	const plannedQuestion = getPlannedQuestionByQuestionText({
		request: params.request,
		questionText: questionTurn?.question,
	});

	if (plannedQuestion) {
		return {
			inputMode: plannedQuestion.inputMode,
			questionScope: plannedQuestion.questionScope,
		};
	}

	let questionOrdinal = 0;

	for (const turn of params.turns) {
		if (turn.role !== "ai_question") {
			continue;
		}

		questionOrdinal += 1;

		if (turn.id === params.questionTurnId) {
			break;
		}
	}

	if (
		isBroadDiscoveryQuestion({
			request: params.request,
			questionOrdinal,
		})
	) {
		return {
			inputMode: "textarea_first",
			questionScope: "broad_discovery",
		};
	}

	return {
		inputMode: "suggested_answers",
		questionScope: "narrow_detail",
	};
}

function formatPromptList(
	title: string,
	items: string[],
	emptyMessage: string
): string {
	return `${title}:\n${
		items.length > 0
			? items.map((item) => `- ${item}`).join("\n")
			: `- ${emptyMessage}`
	}`;
}

function buildClarificationPromptContext(params: {
	request: Pick<KnowledgeClarificationRequestSelect, "source" | "topicSummary">;
	contextSnapshot: KnowledgeClarificationContextSnapshot | null;
	turns: KnowledgeClarificationTurnSelect[];
	extraSections?: string[];
}): string {
	const packet = buildClarificationRelevancePacket({
		topicSummary: params.request.topicSummary,
		contextSnapshot: params.contextSnapshot,
		turns: params.turns,
	});

	return [
		`Clarification source: ${params.request.source}`,
		`Topic anchor: ${packet.topicAnchor}`,
		`Current open gap: ${packet.openGap}`,
		`Source trigger: ${
			params.contextSnapshot?.sourceTrigger.text ??
			"No explicit trigger text stored."
		}`,
		packet.latestHumanAnswer
			? `Latest human answer: ${packet.latestHumanAnswer}`
			: "Latest human answer: none",
		packet.latestExchange
			? `Latest clarification exchange:\n- Q: ${packet.latestExchange.question}\n- A: ${packet.latestExchange.answer}`
			: "Latest clarification exchange:\n- none",
		packet.linkedFaqSummary
			? `Linked FAQ snapshot:\n${packet.linkedFaqSummary}`
			: "Linked FAQ snapshot:\n- none",
		formatPromptList(
			"Transcript claims",
			packet.transcriptClaims,
			"No relevant transcript claims stored."
		),
		formatPromptList(
			"Search evidence",
			packet.searchEvidence,
			"No KB search evidence stored."
		),
		formatPromptList(
			"Grounded facts",
			packet.groundedFacts,
			"No grounded facts were extracted yet."
		),
		formatPromptList(
			"Answered clarification questions",
			packet.answeredQuestions.map(
				(entry) => `Q: ${entry.question} | A: ${entry.answer}`
			),
			"No prior clarification answers."
		),
		formatPromptList(
			"Disallowed questions",
			packet.disallowedQuestions,
			"No explicit disallowed questions."
		),
		...(params.extraSections ?? []),
	].join("\n\n");
}

async function resolveConversationForAudit(
	db: Database,
	request: KnowledgeClarificationRequestSelect,
	conversation?: ConversationSelect | null
): Promise<ConversationSelect | null> {
	if (conversation) {
		return conversation;
	}

	if (!request.conversationId) {
		return null;
	}

	return (
		(await getConversationById(db, {
			conversationId: request.conversationId,
		})) ?? null
	);
}

export async function createKnowledgeClarificationAuditEntry(params: {
	db: Database;
	request: KnowledgeClarificationRequestSelect;
	text: string;
	actor: KnowledgeClarificationActor;
	conversation?: ConversationSelect | null;
}): Promise<void> {
	const conversation = await resolveConversationForAudit(
		params.db,
		params.request,
		params.conversation
	);
	if (!conversation) {
		return;
	}

	await createTimelineItem({
		db: params.db,
		organizationId: params.request.organizationId,
		websiteId: params.request.websiteId,
		conversationId: conversation.id,
		conversationOwnerVisitorId: conversation.visitorId,
		item: {
			type: ConversationTimelineType.EVENT,
			visibility: TimelineItemVisibility.PRIVATE,
			text: params.text,
			parts: [{ type: "text", text: params.text }],
			userId: params.actor.userId ?? null,
			aiAgentId: params.actor.aiAgentId ?? null,
		},
	});
}

export async function emitConversationClarificationUpdate(params: {
	db: Database;
	conversation: ConversationSelect | null;
	request:
		| Pick<
				KnowledgeClarificationRequest,
				| "id"
				| "conversationId"
				| "status"
				| "topicSummary"
				| "stepIndex"
				| "maxSteps"
				| "updatedAt"
		  >
		| KnowledgeClarificationRequestSelect
		| null;
	aiAgentId: string | null;
	turns?: KnowledgeClarificationTurnSelect[];
	progress?: ConversationClarificationProgress | null;
}): Promise<void> {
	if (!params.conversation) {
		return;
	}

	let turns = params.turns ?? [];
	if (params.request && !params.turns) {
		turns = await listKnowledgeClarificationTurns(params.db, {
			requestId: params.request.id,
		});
	}

	await realtime.emit("conversationUpdated", {
		websiteId: params.conversation.websiteId,
		organizationId: params.conversation.organizationId,
		visitorId: params.conversation.visitorId,
		userId: null,
		conversationId: params.conversation.id,
		updates: {
			activeClarification: params.request
				? buildConversationClarificationSummary({
						request: params.request,
						turns,
						progress: params.progress ?? null,
					})
				: null,
		},
		aiAgentId: params.aiAgentId,
	});
}

export function serializeKnowledgeClarificationRequest(params: {
	request: KnowledgeClarificationRequestSelect;
	turns: KnowledgeClarificationTurnSelect[];
}): KnowledgeClarificationRequest {
	const currentQuestionTurn =
		params.request.status === "deferred"
			? getPendingClarificationQuestionTurn(params.turns)
			: getDisplayClarificationQuestionTurn({
					status: params.request.status,
					turns: params.turns,
				});
	const currentQuestionStrategy = currentQuestionTurn
		? resolveStoredQuestionStrategy({
				request: params.request,
				turns: params.turns,
				questionTurnId: currentQuestionTurn.id,
			})
		: null;

	return {
		id: params.request.id,
		organizationId: params.request.organizationId,
		websiteId: params.request.websiteId,
		aiAgentId: params.request.aiAgentId,
		conversationId: params.request.conversationId,
		source: params.request.source,
		status: params.request.status,
		topicSummary: params.request.topicSummary,
		stepIndex: params.request.stepIndex,
		maxSteps: params.request.maxSteps,
		targetKnowledgeId: params.request.targetKnowledgeId,
		questionPlan: params.request.questionPlan ?? null,
		currentQuestion: currentQuestionTurn?.question ?? null,
		currentSuggestedAnswers:
			(currentQuestionTurn?.suggestedAnswers as
				| [string, string, string]
				| null
				| undefined) ?? null,
		currentQuestionInputMode: currentQuestionStrategy?.inputMode ?? null,
		currentQuestionScope: currentQuestionStrategy?.questionScope ?? null,
		draftFaqPayload:
			(params.request
				.draftFaqPayload as KnowledgeClarificationDraftFaq | null) ?? null,
		lastError: params.request.lastError,
		createdAt: params.request.createdAt,
		updatedAt: params.request.updatedAt,
	};
}

export function toKnowledgeClarificationStep(params: {
	request: KnowledgeClarificationRequestSelect;
	turns: KnowledgeClarificationTurnSelect[];
}): KnowledgeClarificationStepResponse | null {
	const serializedRequest = serializeKnowledgeClarificationRequest(params);

	if (serializedRequest.status === "retry_required") {
		return {
			kind: "retry_required",
			request: serializedRequest,
		};
	}

	if (serializedRequest.draftFaqPayload) {
		return {
			kind: "draft_ready",
			request: serializedRequest,
			draftFaqPayload: serializedRequest.draftFaqPayload,
		};
	}

	if (
		serializedRequest.currentQuestion &&
		serializedRequest.currentSuggestedAnswers &&
		serializedRequest.currentQuestionInputMode &&
		serializedRequest.currentQuestionScope
	) {
		return {
			kind: "question",
			request: serializedRequest,
			question: serializedRequest.currentQuestion,
			suggestedAnswers: serializedRequest.currentSuggestedAnswers,
			inputMode: serializedRequest.currentQuestionInputMode,
			questionScope: serializedRequest.currentQuestionScope,
		};
	}

	return null;
}

async function buildResolvedContextSnapshot(params: {
	db: Database;
	request: KnowledgeClarificationRequestSelect;
	conversation?: ConversationSelect | null;
	targetKnowledge?: KnowledgeSelect | null;
}): Promise<KnowledgeClarificationContextSnapshot | null> {
	if (params.request.contextSnapshot) {
		return params.request.contextSnapshot;
	}

	const linkedFaq = extractLinkedFaqSnapshot(params.targetKnowledge ?? null);
	if (params.conversation) {
		const conversationHistory = await buildConversationTranscript(params.db, {
			conversationId: params.conversation.id,
			organizationId: params.request.organizationId,
			websiteId: params.request.websiteId,
		});

		return buildConversationClarificationContextSnapshot({
			conversationHistory,
			linkedFaq,
		});
	}

	if (linkedFaq) {
		return buildFaqClarificationContextSnapshot({
			topicSummary: params.request.topicSummary,
			linkedFaq,
		});
	}

	return null;
}

async function callStructuredClarificationModel<TOutput>(params: {
	aiAgent: AiAgentSelect;
	modelId: string;
	schema: z.ZodType<TOutput>;
	system: string;
	prompt: string;
}): Promise<{
	output: TOutput;
	providerUsage?: ClarificationProviderUsage;
	toolName: string | null;
}> {
	let toolName: string | null = null;

	const result = streamText({
		model: createStructuredOutputModel(params.modelId),
		output: Output.object({
			schema: params.schema,
		}),
		system: params.system,
		prompt: params.prompt,
		temperature: params.aiAgent.temperature ?? 0.4,
		maxOutputTokens: Math.min(params.aiAgent.maxOutputTokens ?? 1200, 1200),
		onChunk: async ({ chunk }) => {
			if (
				"toolName" in chunk &&
				typeof chunk.toolName === "string" &&
				toolName === null
			) {
				toolName = sanitizeClarificationProgressToolName(chunk.toolName);
			}
		},
	});

	const [output, providerUsage] = await Promise.all([
		result.output,
		result.totalUsage,
	]);

	if (!output) {
		throw new NoOutputGeneratedError();
	}

	return {
		output,
		providerUsage,
		toolName,
	};
}

function formatClarificationRetryErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim()) {
		return error.message.trim();
	}

	return "Clarification generation failed.";
}

function isLikelyProviderOrTransportError(error: Error): boolean {
	const message = error.message.toLowerCase();

	return [
		"provider",
		"transport",
		"network",
		"fetch",
		"connection",
		"gateway",
		"rate limit",
		"timeout",
		"timed out",
		"empty response",
		"no output generated",
		"service unavailable",
	].some((needle) => message.includes(needle));
}

function isRetryableClarificationGenerationError(error: unknown): boolean {
	return (
		NoOutputGeneratedError.isInstance(error) ||
		NoObjectGeneratedError.isInstance(error) ||
		APICallError.isInstance(error) ||
		EmptyResponseBodyError.isInstance(error) ||
		NoContentGeneratedError.isInstance(error) ||
		NoSuchModelError.isInstance(error) ||
		(error instanceof Error && isLikelyProviderOrTransportError(error))
	);
}

function logClarificationModelAttemptFailure(params: {
	requestId: string;
	modelId: string;
	attempt: number;
	error: unknown;
}) {
	const errorName =
		params.error instanceof Error
			? params.error.name
			: typeof params.error === "object" && params.error !== null
				? (params.error.constructor?.name ?? "UnknownError")
				: typeof params.error;
	const errorMessage = formatClarificationRetryErrorMessage(params.error);

	console.warn("[KnowledgeClarification] Model attempt failed", {
		requestId: params.requestId,
		modelId: params.modelId,
		attempt: params.attempt,
		errorClass: errorName,
		message: errorMessage,
	});
}

function buildClarificationFallbackModelSequence(
	aiAgentModelId: string
): string[] {
	const primaryResolution =
		resolveClarificationModelForExecution(aiAgentModelId);

	return [
		primaryResolution.modelIdResolved,
		...CLARIFICATION_FALLBACK_MODEL_IDS,
	].filter((modelId, index, values) => values.indexOf(modelId) === index);
}

async function callStructuredClarificationModelWithFallback<TOutput>(params: {
	request: KnowledgeClarificationRequestSelect;
	aiAgent: AiAgentSelect;
	schema: z.ZodType<TOutput>;
	system: string;
	prompt: string;
	progressReporter?: ClarificationProgressReporter;
}): Promise<ClarificationModelCallResult<TOutput>> {
	const candidateModelIds = buildClarificationFallbackModelSequence(
		params.aiAgent.model
	);
	let lastRetryableError: unknown = null;
	let attemptCount = 0;

	for (const [index, modelId] of candidateModelIds.entries()) {
		attemptCount = index + 1;

		try {
			const result = await callStructuredClarificationModel({
				aiAgent: params.aiAgent,
				modelId,
				schema: params.schema,
				system: params.system,
				prompt: params.prompt,
			});

			return {
				kind: "success",
				model: buildClarificationModelMetadata(params.aiAgent.model, modelId),
				output: result.output,
				providerUsage: result.providerUsage,
				attemptCount,
				toolName: result.toolName,
			};
		} catch (error) {
			if (!isRetryableClarificationGenerationError(error)) {
				throw error;
			}

			lastRetryableError = error;
			logClarificationModelAttemptFailure({
				requestId: params.request.id,
				modelId,
				attempt: index + 1,
				error,
			});

			if (index < candidateModelIds.length - 1) {
				await reportClarificationPhaseProgress(params.progressReporter, {
					phase: "retrying_generation",
					attempt: index + 2,
				});
			}
		}
	}

	return {
		kind: "retry_required",
		lastError: formatClarificationRetryErrorMessage(lastRetryableError),
		attemptCount,
		toolName: null,
	};
}

async function planClarificationQuestionQueue(params: {
	request: KnowledgeClarificationRequestSelect;
	aiAgent: AiAgentSelect;
	contextSnapshot: KnowledgeClarificationContextSnapshot | null;
	turns: KnowledgeClarificationTurnSelect[];
	progressReporter?: ClarificationProgressReporter;
}): Promise<ClarificationModelCallResult<ClarificationPlannerOutput>> {
	await reportClarificationPhaseProgress(params.progressReporter, {
		phase: "planning_questions",
	});

	const isConversationDiscovery =
		params.request.source === "conversation" &&
		!params.request.targetKnowledgeId;

	return callStructuredClarificationModelWithFallback({
		request: params.request,
		aiAgent: params.aiAgent,
		schema: clarificationPlannerOutputSchema,
		system: `You are planning a private internal clarification flow for a website owner or teammate.

Your job is to decide whether the grounded evidence already supports a strong FAQ draft, or whether the team should answer a short queue of clarification questions first.

Rules:
- This is internal only. Never address the visitor.
- If grounded facts are already sufficient, return draft_ready immediately.
- Otherwise return question_plan with 1 to 3 questions total.
- Conversation clarifications should start with one broad discovery question, followed by narrow follow-ups only when they are likely to matter.
- FAQ or policy revision clarifications should stay narrow immediately.
- Never ask repeated, generic, or catch-all questions.
- Never ask about what the visitor already tried, clicked, searched for, entered, or saw.
- Every question must be short, plain-language, and focused on one missing fact.
- Suggested answers must have exactly 3 distinct options.
- Use textarea_first only for the first broad discovery question; all follow-ups should use suggested_answers.
- The queue should be ordered, but later questions should be skippable if an earlier answer already covers them.
- Draft answers must use only grounded facts from the provided context.`,
		prompt: [
			`Agent name: ${params.aiAgent.name}`,
			isConversationDiscovery
				? "Plan a queue that starts broad and gets narrower."
				: "Plan only narrow clarification questions if any are still needed.",
			`Question budget: up to ${params.request.maxSteps} total queued questions.`,
			"Return draft_ready when the evidence is already good enough to write the FAQ now.",
			buildClarificationPromptContext({
				request: params.request,
				contextSnapshot: params.contextSnapshot,
				turns: params.turns,
			}),
		].join("\n\n"),
		progressReporter: params.progressReporter,
	});
}

async function evaluateClarificationAnswer(params: {
	request: KnowledgeClarificationRequestSelect;
	aiAgent: AiAgentSelect;
	contextSnapshot: KnowledgeClarificationContextSnapshot | null;
	turns: KnowledgeClarificationTurnSelect[];
	progressReporter?: ClarificationProgressReporter;
}): Promise<ClarificationModelCallResult<ClarificationEvaluationOutput>> {
	const remainingQuestions = getRemainingPlannedQuestions({
		request: params.request,
		turns: params.turns,
	});

	await reportClarificationPhaseProgress(params.progressReporter, {
		phase: "evaluating_answer",
	});

	return callStructuredClarificationModelWithFallback({
		request: params.request,
		aiAgent: params.aiAgent,
		schema: clarificationEvaluationOutputSchema,
		system: `You are deciding whether a clarification flow should stop now or continue to one more pre-generated question.

Rules:
- This is an internal decision for a website owner or teammate.
- Prefer draft_ready when the latest answer already grounds a strong FAQ draft.
- Prefer continue only when one remaining queued question is still materially useful.
- You may skip over queued questions that are already answered indirectly.
- If outcome=continue, nextQuestionId must be one of the remaining queued question ids.
- If outcome=draft_ready, nextQuestionId must be null.
- coveredQuestionIds should list any remaining queued questions that no longer need to be asked.`,
		prompt: [
			`Agent name: ${params.aiAgent.name}`,
			formatPromptList(
				"Remaining queued questions",
				remainingQuestions.map(
					(question) =>
						`${question.id}: ${question.question} | missing fact: ${question.missingFact}`
				),
				"No queued questions remain."
			),
			buildClarificationPromptContext({
				request: params.request,
				contextSnapshot: params.contextSnapshot,
				turns: params.turns,
			}),
		].join("\n\n"),
		progressReporter: params.progressReporter,
	});
}

async function generateClarificationDraft(params: {
	request: KnowledgeClarificationRequestSelect;
	aiAgent: AiAgentSelect;
	contextSnapshot: KnowledgeClarificationContextSnapshot | null;
	turns: KnowledgeClarificationTurnSelect[];
	progressReporter?: ClarificationProgressReporter;
}): Promise<ClarificationModelCallResult<ClarificationDraftOnlyOutput>> {
	await reportClarificationPhaseProgress(params.progressReporter, {
		phase: "generating_draft",
	});

	return callStructuredClarificationModelWithFallback({
		request: params.request,
		aiAgent: params.aiAgent,
		schema: clarificationDraftOnlyOutputSchema,
		system: `You are writing a private internal FAQ draft from grounded clarification evidence.

Rules:
- This is for the website owner or teammate, not the visitor.
- Use only grounded facts from the provided context and clarification answers.
- If details remain uncertain, write the narrowest accurate draft instead of inventing specifics.
- Keep topicSummary and missingFact short and specific.`,
		prompt: [
			`Agent name: ${params.aiAgent.name}`,
			"Write the final FAQ draft now.",
			buildClarificationPromptContext({
				request: params.request,
				contextSnapshot: params.contextSnapshot,
				turns: params.turns,
			}),
		].join("\n\n"),
		progressReporter: params.progressReporter,
	});
}

function getCurrentClarificationStepIndex(
	turns: KnowledgeClarificationTurnSelect[]
): number {
	return Math.max(getAiQuestionCount(turns), 1);
}

function appendClarificationUsageEvent(params: {
	usageEvents: ClarificationUsageEvent[];
	phase: ClarificationUsagePhase;
	stepIndex: number;
	model: ClarificationModelMetadata;
	providerUsage?: ClarificationProviderUsage;
}): void {
	params.usageEvents.push({
		phase: params.phase,
		stepIndex: params.stepIndex,
		model: params.model,
		providerUsage: params.providerUsage,
	});
}

function buildQueuedQuestionOutput(params: {
	topicSummary: string;
	plannedQuestion: KnowledgeClarificationPlannedQuestion;
}): ClarificationQueuedQuestionOutput {
	return {
		kind: "question",
		topicSummary: params.topicSummary,
		question: params.plannedQuestion.question,
		suggestedAnswers: params.plannedQuestion.suggestedAnswers,
		inputMode: params.plannedQuestion.inputMode,
		questionScope: params.plannedQuestion.questionScope,
		missingFact: params.plannedQuestion.missingFact,
		whyItMatters: params.plannedQuestion.whyItMatters,
	};
}

function createRetryRequiredGenerationResult(
	lastError: string,
	metrics: ClarificationGenerationMetrics
): ClarificationRetryRequiredResult {
	return {
		kind: "retry_required",
		lastError,
		metrics: {
			...metrics,
			endedKind: "retry_required",
		},
	};
}

function createQuestionGenerationResult(params: {
	output: ClarificationQueuedQuestionOutput;
	questionPlan: KnowledgeClarificationQuestionPlan | null;
	model: ClarificationModelMetadata;
	usageEvents: ClarificationUsageEvent[];
	metrics: ClarificationGenerationMetrics;
}): ClarificationGenerationResult {
	return {
		kind: "success",
		output: params.output,
		questionPlan: params.questionPlan,
		model: params.model,
		usageEvents: params.usageEvents,
		metrics: {
			...params.metrics,
			endedKind: "question",
		},
	};
}

function createDraftGenerationResult(params: {
	output: ClarificationDraftOutput;
	questionPlan: KnowledgeClarificationQuestionPlan | null;
	model: ClarificationModelMetadata;
	usageEvents: ClarificationUsageEvent[];
	metrics: ClarificationGenerationMetrics;
}): ClarificationGenerationResult {
	return {
		kind: "success",
		output: params.output,
		questionPlan: params.questionPlan,
		model: params.model,
		usageEvents: params.usageEvents,
		metrics: {
			...params.metrics,
			endedKind: "draft_ready",
		},
	};
}

async function finalizeClarificationDraftGeneration(params: {
	request: KnowledgeClarificationRequestSelect;
	aiAgent: AiAgentSelect;
	contextSnapshot: KnowledgeClarificationContextSnapshot | null;
	turns: KnowledgeClarificationTurnSelect[];
	questionPlan: KnowledgeClarificationQuestionPlan | null;
	progressReporter?: ClarificationProgressReporter;
	usageEvents: ClarificationUsageEvent[];
	metrics: ClarificationGenerationMetrics;
	timingField: "modelMs" | "fallbackMs";
}): Promise<ClarificationGenerationResult | ClarificationRetryRequiredResult> {
	const draftStartedAt = Date.now();
	const draft = await generateClarificationDraft({
		request: params.request,
		aiAgent: params.aiAgent,
		contextSnapshot: params.contextSnapshot,
		turns: params.turns,
		progressReporter: params.progressReporter,
	});
	params.metrics[params.timingField] = Date.now() - draftStartedAt;
	params.metrics.attemptCount += draft.attemptCount;
	params.metrics.toolName = draft.toolName ?? params.metrics.toolName;

	if (draft.kind === "retry_required") {
		return createRetryRequiredGenerationResult(draft.lastError, params.metrics);
	}

	appendClarificationUsageEvent({
		usageEvents: params.usageEvents,
		phase: "faq_draft_generation",
		stepIndex: getCurrentClarificationStepIndex(params.turns),
		model: draft.model,
		providerUsage: draft.providerUsage,
	});

	return createDraftGenerationResult({
		output: normalizeClarificationDraftOutput(draft.output),
		questionPlan: params.questionPlan,
		model: draft.model,
		usageEvents: params.usageEvents,
		metrics: params.metrics,
	});
}

async function generateClarificationOutput(params: {
	db: Database;
	request: KnowledgeClarificationRequestSelect;
	aiAgent: AiAgentSelect;
	conversation?: ConversationSelect | null;
	targetKnowledge?: KnowledgeSelect | null;
	turns: KnowledgeClarificationTurnSelect[];
	progressReporter?: ClarificationProgressReporter;
}): Promise<ClarificationGenerationResult | ClarificationRetryRequiredResult> {
	const metrics = createClarificationGenerationMetrics();
	const usageEvents: ClarificationUsageEvent[] = [];

	await reportClarificationPhaseProgress(params.progressReporter, {
		phase: "loading_context",
	});
	const contextStartedAt = Date.now();
	const contextSnapshot = await buildResolvedContextSnapshot({
		db: params.db,
		request: params.request,
		conversation: params.conversation ?? null,
		targetKnowledge: params.targetKnowledge ?? null,
	});
	metrics.contextMs = Date.now() - contextStartedAt;

	await reportClarificationPhaseProgress(params.progressReporter, {
		phase: "reviewing_evidence",
	});

	const questionPlan = getQuestionPlan(params.request);
	const remainingQuestions = getRemainingPlannedQuestions({
		request: params.request,
		turns: params.turns,
	});
	const latestTurn = params.turns.at(-1) ?? null;

	if (questionPlan.length === 0) {
		const planningStartedAt = Date.now();
		const planning = await planClarificationQuestionQueue({
			request: params.request,
			aiAgent: params.aiAgent,
			contextSnapshot,
			turns: params.turns,
			progressReporter: params.progressReporter,
		});
		metrics.modelMs = Date.now() - planningStartedAt;
		metrics.attemptCount += planning.attemptCount;
		metrics.toolName = planning.toolName;
		if (planning.kind === "retry_required") {
			return createRetryRequiredGenerationResult(planning.lastError, metrics);
		}

		appendClarificationUsageEvent({
			usageEvents,
			phase:
				planning.output.kind === "draft_ready"
					? "faq_draft_generation"
					: "clarification_plan_generation",
			stepIndex: 1,
			model: planning.model,
			providerUsage: planning.providerUsage,
		});

		if (planning.output.kind === "draft_ready") {
			return createDraftGenerationResult({
				output: normalizeClarificationDraftOutput(planning.output),
				questionPlan: null,
				model: planning.model,
				usageEvents,
				metrics,
			});
		}

		const normalizedPlan = normalizeClarificationQuestionPlan(
			planning.output.questions
		);
		const firstQuestion = normalizedPlan[0];
		if (!firstQuestion) {
			throw new Error("Clarification planner did not return a first question.");
		}

		return createQuestionGenerationResult({
			output: buildQueuedQuestionOutput({
				topicSummary: planning.output.topicSummary,
				plannedQuestion: firstQuestion,
			}),
			questionPlan: normalizedPlan,
			model: planning.model,
			usageEvents,
			metrics,
		});
	}

	const shouldEvaluateAnswer =
		latestTurn?.role === "human_answer" || latestTurn?.role === "human_skip";

	if (shouldEvaluateAnswer && remainingQuestions.length > 0) {
		const evaluationStartedAt = Date.now();
		const evaluation = await evaluateClarificationAnswer({
			request: params.request,
			aiAgent: params.aiAgent,
			contextSnapshot,
			turns: params.turns,
			progressReporter: params.progressReporter,
		});
		metrics.modelMs = Date.now() - evaluationStartedAt;
		metrics.attemptCount += evaluation.attemptCount;
		metrics.toolName = evaluation.toolName;
		if (evaluation.kind === "retry_required") {
			return createRetryRequiredGenerationResult(evaluation.lastError, metrics);
		}

		appendClarificationUsageEvent({
			usageEvents,
			phase: "clarification_answer_evaluation",
			stepIndex: getCurrentClarificationStepIndex(params.turns),
			model: evaluation.model,
			providerUsage: evaluation.providerUsage,
		});

		if (evaluation.output.outcome === "continue") {
			const nextQuestion =
				evaluation.output.nextQuestionId === null
					? null
					: getPlannedQuestionById({
							request: params.request,
							questionId: evaluation.output.nextQuestionId,
						});
			if (nextQuestion) {
				return createQuestionGenerationResult({
					output: buildQueuedQuestionOutput({
						topicSummary: evaluation.output.topicSummary,
						plannedQuestion: nextQuestion,
					}),
					questionPlan,
					model: evaluation.model,
					usageEvents,
					metrics,
				});
			}
		}

		return finalizeClarificationDraftGeneration({
			request: {
				...params.request,
				topicSummary: evaluation.output.topicSummary,
			},
			questionPlan,
			aiAgent: params.aiAgent,
			contextSnapshot,
			turns: params.turns,
			progressReporter: params.progressReporter,
			usageEvents,
			metrics,
			timingField: "fallbackMs",
		});
	}

	return finalizeClarificationDraftGeneration({
		request: params.request,
		questionPlan,
		aiAgent: params.aiAgent,
		contextSnapshot,
		turns: params.turns,
		progressReporter: params.progressReporter,
		usageEvents,
		metrics,
		timingField: "modelMs",
	});
}

async function trackKnowledgeClarificationUsage(params: {
	db: Database;
	request: KnowledgeClarificationRequestSelect;
	conversation?: ConversationSelect | null;
	usageEvent: ClarificationUsageEvent;
}): Promise<void> {
	await trackGenerationUsage({
		db: params.db,
		organizationId: params.request.organizationId,
		websiteId: params.request.websiteId,
		conversationId: params.conversation?.id,
		visitorId: params.conversation?.visitorId,
		aiAgentId: params.request.aiAgentId,
		usageEventId: ulid(),
		triggerMessageId: params.request.id,
		modelId: params.usageEvent.model.modelId,
		modelIdOriginal: params.usageEvent.model.modelIdOriginal,
		modelMigrationApplied: params.usageEvent.model.modelMigrationApplied,
		providerUsage: params.usageEvent.providerUsage,
		source: "knowledge_clarification",
		phase: params.usageEvent.phase,
		knowledgeClarificationRequestId: params.request.id,
		knowledgeClarificationStepIndex: params.usageEvent.stepIndex,
	});
}

export async function runKnowledgeClarificationStep(
	params: RunKnowledgeClarificationStepParams
): Promise<KnowledgeClarificationStepResponse> {
	const totalStartedAt = Date.now();
	const turns = await listKnowledgeClarificationTurns(params.db, {
		requestId: params.request.id,
	});

	const generation = await generateClarificationOutput({
		db: params.db,
		request: params.request,
		aiAgent: params.aiAgent,
		conversation: params.conversation ?? null,
		targetKnowledge: params.targetKnowledge ?? null,
		turns,
		progressReporter: params.progressReporter,
	});
	const fallbackResolution = resolveClarificationModelForExecution(
		params.aiAgent.model
	);

	if (generation.kind === "retry_required") {
		await reportClarificationPhaseProgress(params.progressReporter, {
			phase: "finalizing_step",
			toolName: generation.metrics.toolName,
		});
		const updatedRequest = await updateKnowledgeClarificationRequest(
			params.db,
			{
				requestId: params.request.id,
				updates: {
					status: "retry_required",
					lastError: generation.lastError,
				},
			}
		);
		if (!updatedRequest) {
			throw new Error("Failed to update clarification request.");
		}
		const step = toKnowledgeClarificationStep({
			request: updatedRequest,
			turns,
		});
		if (!step || step.kind !== "retry_required") {
			throw new Error("Clarification retry step could not be created.");
		}
		logClarificationGenerationTiming({
			requestId: params.request.id,
			modelIdOriginal: params.aiAgent.model,
			modelIdResolved: fallbackResolution.modelIdResolved,
			modelMigrationApplied: fallbackResolution.modelMigrationApplied,
			contextMs: generation.metrics.contextMs,
			modelMs: generation.metrics.modelMs,
			fallbackMs: generation.metrics.fallbackMs,
			totalMs: Date.now() - totalStartedAt,
			attemptCount: generation.metrics.attemptCount,
			endedKind: generation.metrics.endedKind,
			toolName: generation.metrics.toolName,
		});
		return step;
	}

	const output = generation.output;
	for (const usageEvent of generation.usageEvents) {
		await trackKnowledgeClarificationUsage({
			db: params.db,
			request: params.request,
			conversation: params.conversation ?? null,
			usageEvent,
		});
	}

	if (output.kind === "question") {
		const nextStepIndex = getAiQuestionCount(turns) + 1;
		await createKnowledgeClarificationTurn(params.db, {
			requestId: params.request.id,
			role: "ai_question",
			question: output.question.trim(),
			suggestedAnswers: output.suggestedAnswers,
		});
		await reportClarificationPhaseProgress(params.progressReporter, {
			phase: "finalizing_step",
			toolName: generation.metrics.toolName,
		});

		const updatedRequest = await updateKnowledgeClarificationRequest(
			params.db,
			{
				requestId: params.request.id,
				updates: {
					status: "awaiting_answer",
					stepIndex: nextStepIndex,
					maxSteps:
						generation.questionPlan && generation.questionPlan.length > 0
							? generation.questionPlan.length
							: params.request.maxSteps,
					topicSummary: output.topicSummary.trim(),
					questionPlan: generation.questionPlan ?? params.request.questionPlan,
					draftFaqPayload: null,
					lastError: null,
				},
			}
		);

		if (!updatedRequest) {
			throw new Error("Failed to update clarification request.");
		}

		const updatedTurns = await listKnowledgeClarificationTurns(params.db, {
			requestId: params.request.id,
		});
		const step = toKnowledgeClarificationStep({
			request: updatedRequest,
			turns: updatedTurns,
		});
		if (!step) {
			throw new Error("Clarification question step could not be created.");
		}
		logClarificationGenerationTiming({
			requestId: params.request.id,
			modelIdOriginal: generation.model.modelIdOriginal,
			modelIdResolved: generation.model.modelId,
			modelMigrationApplied: generation.model.modelMigrationApplied,
			contextMs: generation.metrics.contextMs,
			modelMs: generation.metrics.modelMs,
			fallbackMs: generation.metrics.fallbackMs,
			totalMs: Date.now() - totalStartedAt,
			attemptCount: generation.metrics.attemptCount,
			endedKind: generation.metrics.endedKind,
			toolName: generation.metrics.toolName,
		});
		return step;
	}

	const normalizedDraft = normalizeDraftFaq(output.draftFaqPayload);
	await reportClarificationPhaseProgress(params.progressReporter, {
		phase: "finalizing_step",
		toolName: generation.metrics.toolName,
	});
	const updatedRequest = await updateKnowledgeClarificationRequest(params.db, {
		requestId: params.request.id,
		updates: {
			status: "draft_ready",
			topicSummary: output.topicSummary.trim(),
			questionPlan: generation.questionPlan ?? params.request.questionPlan,
			draftFaqPayload: normalizedDraft,
			lastError: null,
		},
	});

	if (!updatedRequest) {
		throw new Error("Failed to store clarification draft.");
	}

	const step = toKnowledgeClarificationStep({
		request: updatedRequest,
		turns,
	});
	if (!step) {
		throw new Error("Clarification draft step could not be created.");
	}
	logClarificationGenerationTiming({
		requestId: params.request.id,
		modelIdOriginal: generation.model.modelIdOriginal,
		modelIdResolved: generation.model.modelId,
		modelMigrationApplied: generation.model.modelMigrationApplied,
		contextMs: generation.metrics.contextMs,
		modelMs: generation.metrics.modelMs,
		fallbackMs: generation.metrics.fallbackMs,
		totalMs: Date.now() - totalStartedAt,
		attemptCount: generation.metrics.attemptCount,
		endedKind: generation.metrics.endedKind,
		toolName: generation.metrics.toolName,
	});
	return step;
}

async function resolveConversationClarificationDuplicate(params: {
	db: Database;
	conversationId: string;
	websiteId: string;
	sourceTriggerMessageId: string | null;
	topicFingerprint: string | null;
}): Promise<{
	request: KnowledgeClarificationRequestSelect;
	resolution: ConversationClarificationStartResolution;
} | null> {
	if (params.sourceTriggerMessageId) {
		const request =
			await getLatestKnowledgeClarificationForConversationBySourceTriggerMessageId(
				params.db,
				{
					conversationId: params.conversationId,
					websiteId: params.websiteId,
					sourceTriggerMessageId: params.sourceTriggerMessageId,
				}
			);
		if (request) {
			return {
				request,
				resolution: isTerminalClarificationStatus(request.status)
					? "suppressed_duplicate"
					: "reused",
			};
		}
	}

	if (params.topicFingerprint) {
		const request =
			await getLatestKnowledgeClarificationForConversationByTopicFingerprint(
				params.db,
				{
					conversationId: params.conversationId,
					websiteId: params.websiteId,
					topicFingerprint: params.topicFingerprint,
					statuses: REUSABLE_CONVERSATION_TOPIC_FINGERPRINT_STATUSES,
				}
			);
		if (request) {
			return {
				request,
				resolution: "reused",
			};
		}
	}

	return null;
}

async function getConversationClarificationSeedStep(params: {
	db: Database;
	request: KnowledgeClarificationRequestSelect;
	aiAgent: AiAgentSelect;
	conversation: ConversationSelect;
}): Promise<KnowledgeClarificationStepResponse> {
	const turns = await listKnowledgeClarificationTurns(params.db, {
		requestId: params.request.id,
	});
	const existingStep = toKnowledgeClarificationStep({
		request: params.request,
		turns,
	});
	if (existingStep) {
		return existingStep;
	}

	await updateKnowledgeClarificationRequest(params.db, {
		requestId: params.request.id,
		updates: {
			status: "analyzing",
			lastError: null,
		},
	});

	return runKnowledgeClarificationStep({
		db: params.db,
		request: {
			...params.request,
			status: "analyzing",
			lastError: null,
		},
		aiAgent: params.aiAgent,
		conversation: params.conversation,
	});
}

export async function startConversationKnowledgeClarification(
	params: StartConversationKnowledgeClarificationParams
): Promise<ConversationClarificationStartResult> {
	const contextSnapshot =
		params.contextSnapshot ??
		buildConversationClarificationContextSnapshot({
			conversationHistory: await buildConversationTranscript(params.db, {
				conversationId: params.conversation.id,
				organizationId: params.organizationId,
				websiteId: params.websiteId,
			}),
		});
	const topicSummary = buildSpecificClarificationTopicSummary({
		triggerText: contextSnapshot.sourceTrigger.text,
		searchEvidence: contextSnapshot.kbSearchEvidence,
		linkedFaq: contextSnapshot.linkedFaq,
		fallback: params.topicSummary,
	});
	const sourceTriggerMessageId =
		params.creationMode === "automation"
			? getClarificationSourceTriggerMessageId(contextSnapshot)
			: null;
	const topicFingerprint = buildClarificationTopicFingerprint(topicSummary);
	const duplicate = await resolveConversationClarificationDuplicate({
		db: params.db,
		conversationId: params.conversation.id,
		websiteId: params.websiteId,
		sourceTriggerMessageId,
		topicFingerprint,
	});

	if (duplicate) {
		if (duplicate.resolution === "suppressed_duplicate") {
			const turns = await listKnowledgeClarificationTurns(params.db, {
				requestId: duplicate.request.id,
			});
			return {
				request: serializeKnowledgeClarificationRequest({
					request: duplicate.request,
					turns,
				}),
				step: null,
				created: false,
				resolution: "suppressed_duplicate",
			};
		}

		const step = await getConversationClarificationSeedStep({
			db: params.db,
			request: duplicate.request,
			aiAgent: params.aiAgent,
			conversation: params.conversation,
		});
		return {
			request: step.request,
			step,
			created: false,
			resolution: "reused",
		};
	}

	const existing = await getActiveKnowledgeClarificationForConversation(
		params.db,
		{
			conversationId: params.conversation.id,
			websiteId: params.websiteId,
		}
	);

	if (existing) {
		const step = await getConversationClarificationSeedStep({
			db: params.db,
			request: existing,
			aiAgent: params.aiAgent,
			conversation: params.conversation,
		});
		return {
			request: step.request,
			step,
			created: false,
			resolution: "reused",
		};
	}

	let request: KnowledgeClarificationRequestSelect;
	try {
		request = await createKnowledgeClarificationRequest(params.db, {
			organizationId: params.organizationId,
			websiteId: params.websiteId,
			aiAgentId: params.aiAgent.id,
			conversationId: params.conversation.id,
			source: "conversation",
			status: "analyzing",
			topicSummary,
			sourceTriggerMessageId,
			topicFingerprint,
			contextSnapshot,
			maxSteps: params.maxSteps ?? DEFAULT_MAX_CLARIFICATION_STEPS,
		});
	} catch (error) {
		if (
			!(
				isUniqueViolationError(
					error,
					"knowledge_clarification_request_conv_trigger_unique"
				) ||
				isUniqueViolationError(
					error,
					"knowledge_clarification_request_conv_topic_fingerprint_unique"
				)
			)
		) {
			throw error;
		}

		const winner = await resolveConversationClarificationDuplicate({
			db: params.db,
			conversationId: params.conversation.id,
			websiteId: params.websiteId,
			sourceTriggerMessageId,
			topicFingerprint,
		});
		if (!winner) {
			throw error;
		}

		if (winner.resolution === "suppressed_duplicate") {
			const turns = await listKnowledgeClarificationTurns(params.db, {
				requestId: winner.request.id,
			});
			return {
				request: serializeKnowledgeClarificationRequest({
					request: winner.request,
					turns,
				}),
				step: null,
				created: false,
				resolution: "suppressed_duplicate",
			};
		}

		const step = await getConversationClarificationSeedStep({
			db: params.db,
			request: winner.request,
			aiAgent: params.aiAgent,
			conversation: params.conversation,
		});
		return {
			request: step.request,
			step,
			created: false,
			resolution: "reused",
		};
	}

	await createKnowledgeClarificationAuditEntry({
		db: params.db,
		request,
		conversation: params.conversation,
		actor: params.actor,
		text: `Knowledge clarification started: ${request.topicSummary.trim()}`,
	});

	const step = await runKnowledgeClarificationStep({
		db: params.db,
		request,
		aiAgent: params.aiAgent,
		conversation: params.conversation,
	});

	return {
		request: step.request,
		step,
		created: true,
		resolution: "created",
	};
}

export async function startFaqKnowledgeClarification(
	params: StartFaqKnowledgeClarificationParams
): Promise<{
	request: KnowledgeClarificationRequest;
	step: KnowledgeClarificationStepResponse;
}> {
	const contextSnapshot =
		params.contextSnapshot ??
		buildFaqClarificationContextSnapshot({
			topicSummary: params.topicSummary,
			linkedFaq: extractLinkedFaqSnapshot(params.targetKnowledge),
		});
	const topicSummary = buildSpecificClarificationTopicSummary({
		triggerText: contextSnapshot.sourceTrigger.text,
		searchEvidence: contextSnapshot.kbSearchEvidence,
		linkedFaq: contextSnapshot.linkedFaq,
		fallback: params.topicSummary,
	});
	const request = await createKnowledgeClarificationRequest(params.db, {
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		aiAgentId: params.aiAgent.id,
		source: "faq",
		status: "analyzing",
		topicSummary,
		contextSnapshot,
		maxSteps: params.maxSteps ?? DEFAULT_MAX_CLARIFICATION_STEPS,
		targetKnowledgeId: params.targetKnowledge.id,
	});

	const step = await runKnowledgeClarificationStep({
		db: params.db,
		request,
		aiAgent: params.aiAgent,
		targetKnowledge: params.targetKnowledge,
	});

	return {
		request: step.request,
		step,
	};
}

export async function loadKnowledgeClarificationRuntime(params: {
	db: Database;
	organizationId: string;
	websiteId: string;
	request: KnowledgeClarificationRequestSelect;
}): Promise<{
	aiAgent: AiAgentSelect;
	conversation: ConversationSelect | null;
	targetKnowledge: KnowledgeSelect | null;
}> {
	const [aiAgent, conversation, targetKnowledge] = await Promise.all([
		getAiAgentForWebsite(params.db, {
			websiteId: params.websiteId,
			organizationId: params.organizationId,
		}),
		params.request.conversationId
			? getConversationById(params.db, {
					conversationId: params.request.conversationId,
				})
			: Promise.resolve(null),
		params.request.targetKnowledgeId
			? getKnowledgeById(params.db, {
					id: params.request.targetKnowledgeId,
					websiteId: params.websiteId,
				})
			: Promise.resolve(null),
	]);

	if (!aiAgent) {
		throw new Error("AI agent not found for clarification request.");
	}

	return {
		aiAgent,
		conversation: conversation ?? null,
		targetKnowledge,
	};
}
