import { buildConversationTranscript } from "@api/ai-pipeline/primary-pipeline/steps/intake/history";
import { trackGenerationUsage } from "@api/ai-pipeline/shared/usage";
import type { Database } from "@api/db";
import { getAiAgentForWebsite } from "@api/db/queries/ai-agent";
import { getConversationById } from "@api/db/queries/conversation";
import { getKnowledgeById } from "@api/db/queries/knowledge";
import {
	createKnowledgeClarificationRequest,
	createKnowledgeClarificationSignal,
	createKnowledgeClarificationTurn,
	getActiveKnowledgeClarificationAssociationForConversation,
	getJoinableKnowledgeClarificationByTargetKnowledgeId,
	getJoinableKnowledgeClarificationByTopicFingerprint,
	getLatestKnowledgeClarificationForConversationBySourceTriggerMessageId,
	listJoinableKnowledgeClarificationRequestsMissingTopicEmbeddings,
	listJoinableKnowledgeClarificationVectorMatches,
	listKnowledgeClarificationSignals,
	listKnowledgeClarificationTurns,
	REUSABLE_CONVERSATION_TOPIC_FINGERPRINT_STATUSES,
	updateKnowledgeClarificationRequest,
} from "@api/db/queries/knowledge-clarification";
import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import type { ConversationSelect } from "@api/db/schema/conversation";
import type { KnowledgeSelect } from "@api/db/schema/knowledge";
import type {
	KnowledgeClarificationRequestSelect,
	KnowledgeClarificationSignalSelect,
	KnowledgeClarificationTurnSelect,
} from "@api/db/schema/knowledge-clarification";
import {
	APICallError,
	createStructuredOutputModel,
	createStructuredOutputModelForWebsite,
	EmptyResponseBodyError,
	generateEmbedding,
	generateEmbeddings,
	isOpenRouterByokFallbackEligibleError,
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
import {
	type OpenRouterBillingSource,
	OpenRouterByokError,
	recordOpenRouterByokFailure,
	recordOpenRouterByokSuccess,
} from "@api/lib/openrouter-byok/resolver";
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
	type KnowledgeClarificationStreamStepDecision,
	type KnowledgeClarificationStreamStepResponse,
	TimelineItemVisibility,
} from "@cossistant/types";
import { ulid } from "ulid";
import { z } from "zod";

const DEFAULT_MAX_CLARIFICATION_STEPS = 3;
const CLARIFICATION_MODEL_TIMEOUT_MS = 30_000;
const CLARIFICATION_INITIAL_MAX_OUTPUT_TOKENS = 900;
const CLARIFICATION_INTERACTIVE_MAX_OUTPUT_TOKENS = 1200;

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

const clarificationInteractiveOutputSchema =
	clarificationOutputBaseSchema.extend({
		kind: z.enum(["question", "draft_ready"]),
		questionPlan: z
			.array(clarificationPlannedQuestionOutputSchema)
			.max(3)
			.nullable(),
		question: z.string().min(1).max(500).nullable(),
		suggestedAnswers: z.array(z.string().min(1).max(240)).length(3).nullable(),
		inputMode: z.enum(["textarea_first", "suggested_answers"]).nullable(),
		questionScope: z.enum(["broad_discovery", "narrow_detail"]).nullable(),
		draftFaqPayload: clarificationDraftFaqPayloadSchema.nullable(),
	});

const clarificationDraftOutputSchema = clarificationOutputBaseSchema.extend({
	kind: z.literal("draft_ready"),
	continueClarifying: z.boolean(),
	draftFaqPayload: clarificationDraftFaqPayloadSchema,
});

type ClarificationDraftOutput = z.infer<typeof clarificationDraftOutputSchema>;
type ClarificationInteractiveOutput = z.infer<
	typeof clarificationInteractiveOutputSchema
>;
type ClarificationPlannedQuestionOutput = z.infer<
	typeof clarificationPlannedQuestionOutputSchema
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
	targetKnowledge?: KnowledgeSelect | null;
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
	billingSource?: OpenRouterBillingSource;
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

type ClarificationModelCallStream<TOutput> = {
	textStream: AsyncIterable<string>;
	result: Promise<ClarificationModelCallResult<TOutput>>;
};

type ClarificationUsagePhase =
	| "clarification_plan_generation"
	| "clarification_answer_evaluation"
	| "faq_draft_generation";

type ClarificationUsageEvent = {
	phase: ClarificationUsagePhase;
	stepIndex: number;
	model: ClarificationModelMetadata;
	providerUsage?: ClarificationProviderUsage;
	billingSource?: OpenRouterBillingSource;
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

type PreparedConversationKnowledgeClarificationStartResult =
	| {
			kind: "step";
			request: KnowledgeClarificationRequest;
			step: KnowledgeClarificationStepResponse;
			created: false;
			resolution: "reused";
	  }
	| {
			kind: "stream";
			request: KnowledgeClarificationRequestSelect;
			created: boolean;
			resolution: "created" | "reused";
	  }
	| {
			kind: "suppressed_duplicate";
			request: KnowledgeClarificationRequest;
			step: null;
			created: false;
			resolution: "suppressed_duplicate";
	  };

type PreparedFaqKnowledgeClarificationStartResult =
	| {
			kind: "step";
			request: KnowledgeClarificationRequest;
			step: KnowledgeClarificationStepResponse;
			created: false;
			resolution: "reused";
	  }
	| {
			kind: "stream";
			request: KnowledgeClarificationRequestSelect;
			created: boolean;
			resolution: "created" | "reused";
	  };

type KnowledgeClarificationStepStreamResult = {
	textStream: AsyncIterable<string>;
	finalize: () => Promise<KnowledgeClarificationStepResponse>;
};

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
	question: ClarificationPlannedQuestionOutput
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
	questions: ClarificationInteractiveOutput["questionPlan"]
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
	output: ClarificationDraftOutput | ClarificationInteractiveOutput
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
		| KnowledgeClarificationRequest
		| KnowledgeClarificationRequestSelect
		| null;
	aiAgentId: string | null;
	turns?: KnowledgeClarificationTurnSelect[];
	progress?: ConversationClarificationProgress | null;
}): Promise<void> {
	if (!(params.conversation || params.request?.conversationId)) {
		return;
	}

	let turns = params.turns ?? [];
	let signals: KnowledgeClarificationSignalSelect[] = [];
	if (params.request && !params.turns) {
		turns = await listKnowledgeClarificationTurns(params.db, {
			requestId: params.request.id,
		});
	}
	if (params.request) {
		signals = await listKnowledgeClarificationSignals(params.db, {
			requestId: params.request.id,
		});
	}

	const conversationsById = new Map<string, ConversationSelect>();
	if (params.conversation) {
		conversationsById.set(params.conversation.id, params.conversation);
	}

	if (params.request) {
		const relatedConversationIds = new Set<string>();

		if (params.request.conversationId) {
			relatedConversationIds.add(params.request.conversationId);
		}

		for (const signal of signals) {
			if (signal.conversationId) {
				relatedConversationIds.add(signal.conversationId);
			}
		}

		const missingConversationIds = [...relatedConversationIds].filter(
			(conversationId) => !conversationsById.has(conversationId)
		);
		if (missingConversationIds.length > 0) {
			const conversations = await Promise.all(
				missingConversationIds.map((conversationId) =>
					getConversationById(params.db, {
						conversationId,
					})
				)
			);

			for (const conversation of conversations) {
				if (conversation) {
					conversationsById.set(conversation.id, conversation);
				}
			}
		}
	}

	if (conversationsById.size === 0) {
		return;
	}

	const linkedConversationCount = params.request
		? countLinkedConversationCount({
				request: params.request,
				signals,
			})
		: 0;

	for (const conversation of conversationsById.values()) {
		const engagementMode =
			params.request?.conversationId &&
			params.request.conversationId !== conversation.id
				? "linked"
				: "owner";

		await realtime.emit("conversationUpdated", {
			websiteId: conversation.websiteId,
			organizationId: conversation.organizationId,
			visitorId: conversation.visitorId,
			userId: null,
			conversationId: conversation.id,
			updates: {
				activeClarification: params.request
					? buildConversationClarificationSummary({
							request: params.request,
							turns,
							conversationId: conversation.id,
							engagementMode,
							linkedConversationCount,
							progress: params.progress ?? null,
						})
					: null,
			},
			aiAgentId: params.aiAgentId,
		});
	}
}

function countLinkedConversationCount(params: {
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

function buildTargetKnowledgeSummary(params: {
	request: Pick<
		KnowledgeClarificationRequestSelect,
		"targetKnowledgeId" | "contextSnapshot"
	>;
	targetKnowledge?: KnowledgeSelect | null;
}): KnowledgeClarificationRequest["targetKnowledgeSummary"] {
	if (params.targetKnowledge) {
		const linkedFaq = extractLinkedFaqSnapshot(params.targetKnowledge);
		return {
			id: params.targetKnowledge.id,
			question: linkedFaq?.question ?? null,
			sourceTitle: params.targetKnowledge.sourceTitle ?? null,
		};
	}

	if (
		params.request.targetKnowledgeId &&
		params.request.contextSnapshot?.linkedFaq
	) {
		return {
			id: params.request.targetKnowledgeId,
			question: params.request.contextSnapshot.linkedFaq.question,
			sourceTitle: params.request.contextSnapshot.linkedFaq.sourceTitle,
		};
	}

	return null;
}

export function serializeKnowledgeClarificationRequest(params: {
	request: KnowledgeClarificationRequestSelect;
	turns: KnowledgeClarificationTurnSelect[];
	engagementMode?: KnowledgeClarificationRequest["engagementMode"];
	linkedConversationCount?: number;
	targetKnowledge?: KnowledgeSelect | null;
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
		engagementMode: params.engagementMode ?? "owner",
		linkedConversationCount:
			params.linkedConversationCount ?? (params.request.conversationId ? 1 : 0),
		stepIndex: params.request.stepIndex,
		maxSteps: params.request.maxSteps,
		targetKnowledgeId: params.request.targetKnowledgeId,
		targetKnowledgeSummary: buildTargetKnowledgeSummary({
			request: params.request,
			targetKnowledge: params.targetKnowledge ?? null,
		}),
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

export async function serializeKnowledgeClarificationRequestWithMetadata(params: {
	db: Database;
	request: KnowledgeClarificationRequestSelect;
	turns?: KnowledgeClarificationTurnSelect[];
	signals?: KnowledgeClarificationSignalSelect[];
	engagementMode?: KnowledgeClarificationRequest["engagementMode"];
	targetKnowledge?: KnowledgeSelect | null;
}): Promise<KnowledgeClarificationRequest> {
	const [turns, signals, targetKnowledge] = await Promise.all([
		params.turns
			? Promise.resolve(params.turns)
			: listKnowledgeClarificationTurns(params.db, {
					requestId: params.request.id,
				}),
		params.signals
			? Promise.resolve(params.signals)
			: listKnowledgeClarificationSignals(params.db, {
					requestId: params.request.id,
				}),
		params.targetKnowledge !== undefined
			? Promise.resolve(params.targetKnowledge)
			: params.request.targetKnowledgeId
				? getKnowledgeById(params.db, {
						id: params.request.targetKnowledgeId,
						websiteId: params.request.websiteId,
					})
				: Promise.resolve(null),
	]);

	return serializeKnowledgeClarificationRequest({
		request: params.request,
		turns,
		engagementMode: params.engagementMode,
		linkedConversationCount: countLinkedConversationCount({
			request: params.request,
			signals,
		}),
		targetKnowledge,
	});
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

function withSerializedKnowledgeClarificationStepRequest(params: {
	step: KnowledgeClarificationStepResponse;
	request: KnowledgeClarificationRequest;
}): KnowledgeClarificationStepResponse {
	return {
		...params.step,
		request: params.request,
	};
}

export function toKnowledgeClarificationStreamDecision(
	step: KnowledgeClarificationStepResponse
): KnowledgeClarificationStreamStepDecision {
	if (step.kind === "question") {
		return {
			topicSummary: step.request.topicSummary,
			kind: "question",
			questionPlan: step.request.questionPlan ?? null,
			question: step.question,
			suggestedAnswers: step.suggestedAnswers,
			inputMode: step.inputMode,
			questionScope: step.questionScope,
			draftFaqPayload: null,
			lastError: step.request.lastError,
		};
	}

	if (step.kind === "draft_ready") {
		return {
			topicSummary: step.request.topicSummary,
			kind: "draft_ready",
			questionPlan: step.request.questionPlan ?? null,
			question: null,
			suggestedAnswers: null,
			inputMode: null,
			questionScope: null,
			draftFaqPayload: step.draftFaqPayload,
			lastError: step.request.lastError,
		};
	}

	return {
		topicSummary: step.request.topicSummary,
		kind: "retry_required",
		questionPlan: step.request.questionPlan ?? null,
		question: null,
		suggestedAnswers: null,
		inputMode: null,
		questionScope: null,
		draftFaqPayload: null,
		lastError: step.request.lastError,
	};
}

export function toKnowledgeClarificationStreamStepResponse(
	step: KnowledgeClarificationStepResponse
): KnowledgeClarificationStreamStepResponse {
	return {
		requestId: step.request.id,
		decision: toKnowledgeClarificationStreamDecision(step),
		status:
			step.request.status === "analyzing"
				? "analyzing"
				: step.request.status === "draft_ready"
					? "draft_ready"
					: step.request.status === "retry_required"
						? "retry_required"
						: "awaiting_answer",
		updatedAt: step.request.updatedAt,
		request: step.request,
	};
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

async function* emptyTextStream() {}

async function startStructuredClarificationModelWithFallback<TOutput>(params: {
	db: Database;
	request: KnowledgeClarificationRequestSelect;
	aiAgent: AiAgentSelect;
	schema: z.ZodType<TOutput>;
	system: string;
	prompt: string;
	maxOutputTokens: number;
	progressReporter?: ClarificationProgressReporter;
}): Promise<ClarificationModelCallStream<TOutput>> {
	const resolvedModel = resolveClarificationModelForExecution(
		params.aiAgent.model
	);
	let toolName: string | null = null;
	let result: ReturnType<typeof streamText>;
	let billingSource: OpenRouterBillingSource | undefined;
	const openRouterContext = {
		db: params.db,
		organizationId: params.request.organizationId,
		websiteId: params.request.websiteId,
	};

	const startStream = (model: Parameters<typeof streamText>[0]["model"]) =>
		streamText({
			model,
			output: Output.object({
				schema: params.schema,
			}),
			system: params.system,
			prompt: params.prompt,
			abortSignal: AbortSignal.timeout(CLARIFICATION_MODEL_TIMEOUT_MS),
			temperature: 0,
			maxOutputTokens: Math.min(
				params.aiAgent.maxOutputTokens ?? params.maxOutputTokens,
				params.maxOutputTokens
			),
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

	try {
		const modelResolution = await createStructuredOutputModelForWebsite(
			resolvedModel.modelIdResolved,
			{ context: openRouterContext }
		);
		billingSource = modelResolution.billingSource;

		result = startStream(modelResolution.model);
	} catch (error) {
		if (
			error instanceof OpenRouterByokError &&
			error.code === "decrypt_failed"
		) {
			billingSource = "cossistant";
			result = startStream(
				createStructuredOutputModel(resolvedModel.modelIdResolved)
			);
		} else {
			if (!isRetryableClarificationGenerationError(error)) {
				throw error;
			}

			logClarificationModelAttemptFailure({
				requestId: params.request.id,
				modelId: resolvedModel.modelIdResolved,
				attempt: 1,
				error,
			});

			return {
				textStream: emptyTextStream(),
				result: Promise.resolve({
					kind: "retry_required",
					lastError: formatClarificationRetryErrorMessage(error),
					attemptCount: 1,
					toolName: null,
				}),
			};
		}
	}

	return {
		textStream: result.textStream,
		result: (async () => {
			try {
				const [output, providerUsage] = await Promise.all([
					result.output,
					result.totalUsage,
				]);

				if (!output) {
					throw new NoOutputGeneratedError();
				}

				if (billingSource) {
					await recordOpenRouterByokSuccess({
						context: openRouterContext,
						billingSource,
					});
				}

				return {
					kind: "success",
					model: buildClarificationModelMetadata(
						params.aiAgent.model,
						resolvedModel.modelIdResolved
					),
					output,
					providerUsage,
					billingSource,
					attemptCount: 1,
					toolName,
				} satisfies ClarificationModelCallSuccess<TOutput>;
			} catch (error) {
				if (
					billingSource === "customer_openrouter" &&
					isOpenRouterByokFallbackEligibleError(error)
				) {
					await recordOpenRouterByokFailure({
						context: openRouterContext,
						billingSource,
						error,
					});

					const fallbackResult = startStream(
						createStructuredOutputModel(resolvedModel.modelIdResolved)
					);
					try {
						const [output, providerUsage] = await Promise.all([
							fallbackResult.output,
							fallbackResult.totalUsage,
						]);

						if (!output) {
							throw new NoOutputGeneratedError();
						}

						return {
							kind: "success",
							model: buildClarificationModelMetadata(
								params.aiAgent.model,
								resolvedModel.modelIdResolved
							),
							output,
							providerUsage,
							billingSource: "cossistant",
							attemptCount: 1,
							toolName,
						} satisfies ClarificationModelCallSuccess<TOutput>;
					} catch (fallbackError) {
						if (!isRetryableClarificationGenerationError(fallbackError)) {
							throw fallbackError;
						}

						logClarificationModelAttemptFailure({
							requestId: params.request.id,
							modelId: resolvedModel.modelIdResolved,
							attempt: 1,
							error: fallbackError,
						});

						return {
							kind: "retry_required",
							lastError: formatClarificationRetryErrorMessage(fallbackError),
							attemptCount: 1,
							toolName,
						} satisfies ClarificationModelCallRetryRequired;
					}
				}

				if (!isRetryableClarificationGenerationError(error)) {
					throw error;
				}

				logClarificationModelAttemptFailure({
					requestId: params.request.id,
					modelId: resolvedModel.modelIdResolved,
					attempt: 1,
					error,
				});

				return {
					kind: "retry_required",
					lastError: formatClarificationRetryErrorMessage(error),
					attemptCount: 1,
					toolName,
				} satisfies ClarificationModelCallRetryRequired;
			}
		})(),
	};
}

async function callStructuredClarificationModelWithFallback<TOutput>(params: {
	db: Database;
	request: KnowledgeClarificationRequestSelect;
	aiAgent: AiAgentSelect;
	schema: z.ZodType<TOutput>;
	system: string;
	prompt: string;
	maxOutputTokens: number;
	progressReporter?: ClarificationProgressReporter;
}): Promise<ClarificationModelCallResult<TOutput>> {
	const started = await startStructuredClarificationModelWithFallback(params);
	return started.result;
}

function normalizeClarificationInteractiveQuestionOutput(params: {
	output: ClarificationInteractiveOutput;
	fallbackQuestionId: string;
}): KnowledgeClarificationPlannedQuestion {
	if (
		!(
			params.output.question &&
			params.output.suggestedAnswers &&
			params.output.inputMode &&
			params.output.questionScope
		)
	) {
		throw new Error(
			"Clarification model returned an incomplete question response."
		);
	}

	const matchingPlannedQuestion =
		params.output.questionPlan?.find(
			(question) =>
				normalizeClarificationQuestionText(question.question).toLowerCase() ===
				normalizeClarificationQuestionText(
					params.output.question ?? ""
				).toLowerCase()
		) ?? null;

	return normalizePlannedClarificationQuestion({
		id: matchingPlannedQuestion?.id ?? params.fallbackQuestionId,
		question: params.output.question,
		suggestedAnswers: params.output.suggestedAnswers,
		inputMode: params.output.inputMode,
		questionScope: params.output.questionScope,
		missingFact: params.output.missingFact,
		whyItMatters: params.output.whyItMatters,
	});
}

function mergeClarificationQuestionPlan(params: {
	request: Pick<KnowledgeClarificationRequestSelect, "questionPlan">;
	currentQuestion: KnowledgeClarificationPlannedQuestion;
	returnedQuestionPlan: ClarificationInteractiveOutput["questionPlan"];
}): KnowledgeClarificationQuestionPlan {
	const normalizedReturnedPlan =
		params.returnedQuestionPlan && params.returnedQuestionPlan.length > 0
			? normalizeClarificationQuestionPlan(params.returnedQuestionPlan)
			: null;

	const currentQuestionKey = normalizeClarificationQuestionText(
		params.currentQuestion.question
	).toLowerCase();

	if (normalizedReturnedPlan && normalizedReturnedPlan.length > 0) {
		return normalizedReturnedPlan.some(
			(question) =>
				normalizeClarificationQuestionText(question.question).toLowerCase() ===
				currentQuestionKey
		)
			? normalizedReturnedPlan
			: [params.currentQuestion, ...normalizedReturnedPlan];
	}

	const existingQuestionPlan = getQuestionPlan(params.request);
	if (existingQuestionPlan.length === 0) {
		return [params.currentQuestion];
	}

	return existingQuestionPlan.some(
		(question) =>
			normalizeClarificationQuestionText(question.question).toLowerCase() ===
			currentQuestionKey
	)
		? existingQuestionPlan
		: [...existingQuestionPlan, params.currentQuestion];
}

function buildClarificationInteractivePromptConfig(params: {
	request: KnowledgeClarificationRequestSelect;
	aiAgent: AiAgentSelect;
	contextSnapshot: KnowledgeClarificationContextSnapshot | null;
	turns: KnowledgeClarificationTurnSelect[];
}) {
	const askedQuestionCount = getAiQuestionCount(params.turns);
	const remainingQuestionBudget = Math.max(
		params.request.maxSteps - askedQuestionCount,
		0
	);
	const remainingQuestions = getRemainingPlannedQuestions({
		request: params.request,
		turns: params.turns,
	});
	const isInitialGeneration = askedQuestionCount === 0;
	const isConversationDiscovery =
		params.request.source === "conversation" &&
		!params.request.targetKnowledgeId &&
		isInitialGeneration;

	return {
		isInitialGeneration,
		maxOutputTokens: isInitialGeneration
			? CLARIFICATION_INITIAL_MAX_OUTPUT_TOKENS
			: CLARIFICATION_INTERACTIVE_MAX_OUTPUT_TOKENS,
		prompt: [
			`Agent name: ${params.aiAgent.name}`,
			isConversationDiscovery
				? "Start with one broad discovery question if a question is still needed."
				: "Decide whether one more narrow question is still worth asking.",
			`Question budget remaining: ${remainingQuestionBudget}.`,
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
		system: `You are preparing the next step in a private internal clarification flow for a website owner or teammate.

Return exactly one of these outcomes:
- question: ask one high-signal clarification question
- draft_ready: write the final FAQ draft now

Rules:
- This is internal only. Never address the visitor.
- Use only grounded facts from the provided context and clarification answers.
- Prefer draft_ready when the current evidence is already enough.
- Ask at most one new question in this step.
- Never ask repeated, generic, or catch-all questions.
- Never ask about what the visitor already tried, clicked, searched for, entered, or saw.
- Every question must be short, plain-language, and focused on one missing fact.
- Suggested answers must have exactly 3 distinct options.
- Use textarea_first only for the first broad discovery question in a conversation clarification.
- All later questions should use suggested_answers.
- If kind=question during the initial step, also return questionPlan with the current question first and any later likely follow-ups after it.
- If kind=question after the initial step, return questionPlan only if you need to materially revise the remaining queue. Otherwise return null.
- If no question budget remains, return draft_ready.
- If kind=draft_ready, question, suggestedAnswers, inputMode, questionScope, and questionPlan should be null unless a revised queue is still helpful for internal review.
- If kind=question, draftFaqPayload must be null.
- If kind=draft_ready, draftFaqPayload must be complete and grounded.`,
	};
}

async function generateClarificationInteractiveStep(params: {
	db: Database;
	request: KnowledgeClarificationRequestSelect;
	aiAgent: AiAgentSelect;
	contextSnapshot: KnowledgeClarificationContextSnapshot | null;
	turns: KnowledgeClarificationTurnSelect[];
	progressReporter?: ClarificationProgressReporter;
}): Promise<ClarificationModelCallResult<ClarificationInteractiveOutput>> {
	const config = buildClarificationInteractivePromptConfig(params);

	await reportClarificationPhaseProgress(params.progressReporter, {
		phase: config.isInitialGeneration
			? "planning_questions"
			: "evaluating_answer",
	});

	return callStructuredClarificationModelWithFallback({
		db: params.db,
		request: params.request,
		aiAgent: params.aiAgent,
		schema: clarificationInteractiveOutputSchema,
		system: config.system,
		prompt: config.prompt,
		maxOutputTokens: config.maxOutputTokens,
		progressReporter: params.progressReporter,
	});
}

async function startClarificationInteractiveStepStream(params: {
	db: Database;
	request: KnowledgeClarificationRequestSelect;
	aiAgent: AiAgentSelect;
	contextSnapshot: KnowledgeClarificationContextSnapshot | null;
	turns: KnowledgeClarificationTurnSelect[];
	progressReporter?: ClarificationProgressReporter;
}): Promise<ClarificationModelCallStream<ClarificationInteractiveOutput>> {
	const config = buildClarificationInteractivePromptConfig(params);

	await reportClarificationPhaseProgress(params.progressReporter, {
		phase: config.isInitialGeneration
			? "planning_questions"
			: "evaluating_answer",
	});

	return startStructuredClarificationModelWithFallback({
		db: params.db,
		request: params.request,
		aiAgent: params.aiAgent,
		schema: clarificationInteractiveOutputSchema,
		system: config.system,
		prompt: config.prompt,
		maxOutputTokens: config.maxOutputTokens,
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
	billingSource?: OpenRouterBillingSource;
}): void {
	params.usageEvents.push({
		phase: params.phase,
		stepIndex: params.stepIndex,
		model: params.model,
		providerUsage: params.providerUsage,
		billingSource: params.billingSource,
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

function finalizeClarificationGeneration(params: {
	request: KnowledgeClarificationRequestSelect;
	turns: KnowledgeClarificationTurnSelect[];
	generation: ClarificationModelCallResult<ClarificationInteractiveOutput>;
	metrics: ClarificationGenerationMetrics;
	usageEvents: ClarificationUsageEvent[];
}): ClarificationGenerationResult | ClarificationRetryRequiredResult {
	const questionPlan = getQuestionPlan(params.request);

	params.metrics.attemptCount += params.generation.attemptCount;
	params.metrics.toolName = params.generation.toolName;

	if (params.generation.kind === "retry_required") {
		return createRetryRequiredGenerationResult(
			params.generation.lastError,
			params.metrics
		);
	}

	appendClarificationUsageEvent({
		usageEvents: params.usageEvents,
		phase:
			params.generation.output.kind === "draft_ready"
				? "faq_draft_generation"
				: questionPlan.length === 0
					? "clarification_plan_generation"
					: "clarification_answer_evaluation",
		stepIndex:
			questionPlan.length === 0
				? 1
				: getCurrentClarificationStepIndex(params.turns),
		model: params.generation.model,
		providerUsage: params.generation.providerUsage,
		billingSource: params.generation.billingSource,
	});

	if (params.generation.output.kind === "draft_ready") {
		const normalizedQuestionPlan =
			params.generation.output.questionPlan &&
			params.generation.output.questionPlan.length > 0
				? normalizeClarificationQuestionPlan(
						params.generation.output.questionPlan
					)
				: questionPlan.length > 0
					? questionPlan
					: null;

		return createDraftGenerationResult({
			output: normalizeClarificationDraftOutput(params.generation.output),
			questionPlan: normalizedQuestionPlan,
			model: params.generation.model,
			usageEvents: params.usageEvents,
			metrics: params.metrics,
		});
	}

	const nextQuestionOrdinal = getAiQuestionCount(params.turns) + 1;
	const currentQuestion = normalizeClarificationInteractiveQuestionOutput({
		output: params.generation.output,
		fallbackQuestionId: `clarification_step_${nextQuestionOrdinal}`,
	});
	const mergedQuestionPlan = mergeClarificationQuestionPlan({
		request: params.request,
		currentQuestion,
		returnedQuestionPlan: params.generation.output.questionPlan,
	});

	return createQuestionGenerationResult({
		output: buildQueuedQuestionOutput({
			topicSummary: params.generation.output.topicSummary,
			plannedQuestion: currentQuestion,
		}),
		questionPlan: mergedQuestionPlan,
		model: params.generation.model,
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

	const generationStartedAt = Date.now();
	const generation = await generateClarificationInteractiveStep({
		db: params.db,
		request: params.request,
		aiAgent: params.aiAgent,
		contextSnapshot,
		turns: params.turns,
		progressReporter: params.progressReporter,
	});
	metrics.modelMs = Date.now() - generationStartedAt;
	return finalizeClarificationGeneration({
		request: params.request,
		turns: params.turns,
		generation,
		metrics,
		usageEvents,
	});
}

async function startClarificationOutputStream(params: {
	db: Database;
	request: KnowledgeClarificationRequestSelect;
	aiAgent: AiAgentSelect;
	conversation?: ConversationSelect | null;
	targetKnowledge?: KnowledgeSelect | null;
	turns: KnowledgeClarificationTurnSelect[];
	progressReporter?: ClarificationProgressReporter;
}): Promise<{
	textStream: AsyncIterable<string>;
	result: Promise<
		ClarificationGenerationResult | ClarificationRetryRequiredResult
	>;
}> {
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

	const generationStartedAt = Date.now();
	const generationStream = await startClarificationInteractiveStepStream({
		db: params.db,
		request: params.request,
		aiAgent: params.aiAgent,
		contextSnapshot,
		turns: params.turns,
		progressReporter: params.progressReporter,
	});

	return {
		textStream: generationStream.textStream,
		result: generationStream.result.then((generation) => {
			metrics.modelMs = Date.now() - generationStartedAt;
			return finalizeClarificationGeneration({
				request: params.request,
				turns: params.turns,
				generation,
				metrics,
				usageEvents,
			});
		}),
	};
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
		billingSource: params.usageEvent.billingSource,
		source: "knowledge_clarification",
		phase: params.usageEvent.phase,
		knowledgeClarificationRequestId: params.request.id,
		knowledgeClarificationStepIndex: params.usageEvent.stepIndex,
	});
}

async function persistKnowledgeClarificationGeneration(params: {
	db: Database;
	request: KnowledgeClarificationRequestSelect;
	aiAgent: AiAgentSelect;
	conversation?: ConversationSelect | null;
	progressReporter?: ClarificationProgressReporter;
	turns: KnowledgeClarificationTurnSelect[];
	generation: ClarificationGenerationResult | ClarificationRetryRequiredResult;
	totalStartedAt: number;
}): Promise<KnowledgeClarificationStepResponse> {
	const fallbackResolution = resolveClarificationModelForExecution(
		params.aiAgent.model
	);

	if (params.generation.kind === "retry_required") {
		await reportClarificationPhaseProgress(params.progressReporter, {
			phase: "finalizing_step",
			toolName: params.generation.metrics.toolName,
		});
		const updatedRequest = await updateKnowledgeClarificationRequest(
			params.db,
			{
				requestId: params.request.id,
				updates: {
					status: "retry_required",
					lastError: params.generation.lastError,
				},
			}
		);
		if (!updatedRequest) {
			throw new Error("Failed to update clarification request.");
		}
		const step = toKnowledgeClarificationStep({
			request: updatedRequest,
			turns: params.turns,
		});
		if (!step || step.kind !== "retry_required") {
			throw new Error("Clarification retry step could not be created.");
		}
		logClarificationGenerationTiming({
			requestId: params.request.id,
			modelIdOriginal: params.aiAgent.model,
			modelIdResolved: fallbackResolution.modelIdResolved,
			modelMigrationApplied: fallbackResolution.modelMigrationApplied,
			contextMs: params.generation.metrics.contextMs,
			modelMs: params.generation.metrics.modelMs,
			fallbackMs: params.generation.metrics.fallbackMs,
			totalMs: Date.now() - params.totalStartedAt,
			attemptCount: params.generation.metrics.attemptCount,
			endedKind: params.generation.metrics.endedKind,
			toolName: params.generation.metrics.toolName,
		});
		return step;
	}

	const output = params.generation.output;
	for (const usageEvent of params.generation.usageEvents) {
		await trackKnowledgeClarificationUsage({
			db: params.db,
			request: params.request,
			conversation: params.conversation ?? null,
			usageEvent,
		});
	}

	if (output.kind === "question") {
		const nextStepIndex = getAiQuestionCount(params.turns) + 1;
		await createKnowledgeClarificationTurn(params.db, {
			requestId: params.request.id,
			role: "ai_question",
			question: output.question.trim(),
			suggestedAnswers: output.suggestedAnswers,
		});
		await reportClarificationPhaseProgress(params.progressReporter, {
			phase: "finalizing_step",
			toolName: params.generation.metrics.toolName,
		});

		const updatedRequest = await updateKnowledgeClarificationRequest(
			params.db,
			{
				requestId: params.request.id,
				updates: {
					status: "awaiting_answer",
					stepIndex: nextStepIndex,
					maxSteps:
						params.generation.questionPlan &&
						params.generation.questionPlan.length > 0
							? params.generation.questionPlan.length
							: params.request.maxSteps,
					topicSummary: output.topicSummary.trim(),
					questionPlan:
						params.generation.questionPlan ?? params.request.questionPlan,
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
			modelIdOriginal: params.generation.model.modelIdOriginal,
			modelIdResolved: params.generation.model.modelId,
			modelMigrationApplied: params.generation.model.modelMigrationApplied,
			contextMs: params.generation.metrics.contextMs,
			modelMs: params.generation.metrics.modelMs,
			fallbackMs: params.generation.metrics.fallbackMs,
			totalMs: Date.now() - params.totalStartedAt,
			attemptCount: params.generation.metrics.attemptCount,
			endedKind: params.generation.metrics.endedKind,
			toolName: params.generation.metrics.toolName,
		});
		return step;
	}

	const normalizedDraft = normalizeDraftFaq(output.draftFaqPayload);
	await reportClarificationPhaseProgress(params.progressReporter, {
		phase: "finalizing_step",
		toolName: params.generation.metrics.toolName,
	});
	const updatedRequest = await updateKnowledgeClarificationRequest(params.db, {
		requestId: params.request.id,
		updates: {
			status: "draft_ready",
			topicSummary: output.topicSummary.trim(),
			questionPlan:
				params.generation.questionPlan ?? params.request.questionPlan,
			draftFaqPayload: normalizedDraft,
			lastError: null,
		},
	});

	if (!updatedRequest) {
		throw new Error("Failed to store clarification draft.");
	}

	const step = toKnowledgeClarificationStep({
		request: updatedRequest,
		turns: params.turns,
	});
	if (!step) {
		throw new Error("Clarification draft step could not be created.");
	}
	logClarificationGenerationTiming({
		requestId: params.request.id,
		modelIdOriginal: params.generation.model.modelIdOriginal,
		modelIdResolved: params.generation.model.modelId,
		modelMigrationApplied: params.generation.model.modelMigrationApplied,
		contextMs: params.generation.metrics.contextMs,
		modelMs: params.generation.metrics.modelMs,
		fallbackMs: params.generation.metrics.fallbackMs,
		totalMs: Date.now() - params.totalStartedAt,
		attemptCount: params.generation.metrics.attemptCount,
		endedKind: params.generation.metrics.endedKind,
		toolName: params.generation.metrics.toolName,
	});
	return step;
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

	return persistKnowledgeClarificationGeneration({
		db: params.db,
		request: params.request,
		aiAgent: params.aiAgent,
		conversation: params.conversation ?? null,
		progressReporter: params.progressReporter,
		turns,
		generation,
		totalStartedAt,
	});
}

export async function startKnowledgeClarificationStepStream(
	params: RunKnowledgeClarificationStepParams
): Promise<KnowledgeClarificationStepStreamResult> {
	const totalStartedAt = Date.now();
	const turns = await listKnowledgeClarificationTurns(params.db, {
		requestId: params.request.id,
	});
	const generationStream = await startClarificationOutputStream({
		db: params.db,
		request: params.request,
		aiAgent: params.aiAgent,
		conversation: params.conversation ?? null,
		targetKnowledge: params.targetKnowledge ?? null,
		turns,
		progressReporter: params.progressReporter,
	});

	let finalizedStepPromise: Promise<KnowledgeClarificationStepResponse> | null =
		null;

	return {
		textStream: generationStream.textStream,
		finalize: async () => {
			if (!finalizedStepPromise) {
				finalizedStepPromise = generationStream.result.then((generation) =>
					persistKnowledgeClarificationGeneration({
						db: params.db,
						request: params.request,
						aiAgent: params.aiAgent,
						conversation: params.conversation ?? null,
						progressReporter: params.progressReporter,
						turns,
						generation,
						totalStartedAt,
					})
				);
			}

			return finalizedStepPromise;
		},
	};
}

function withTargetKnowledgeContextSnapshot(params: {
	requestTopicSummary: string;
	contextSnapshot: KnowledgeClarificationContextSnapshot | null;
	targetKnowledge?: KnowledgeSelect | null;
}): KnowledgeClarificationContextSnapshot | null {
	if (!params.targetKnowledge) {
		return params.contextSnapshot;
	}

	const linkedFaq = extractLinkedFaqSnapshot(params.targetKnowledge);
	if (!linkedFaq) {
		return params.contextSnapshot;
	}

	if (params.contextSnapshot) {
		return {
			...params.contextSnapshot,
			linkedFaq,
		};
	}

	return buildFaqClarificationContextSnapshot({
		topicSummary: params.requestTopicSummary,
		linkedFaq,
	});
}

async function ensureJoinableClarificationRequestTopicEmbeddings(params: {
	db: Database;
	websiteId: string;
	aiAgentId: string;
}): Promise<void> {
	const requests =
		await listJoinableKnowledgeClarificationRequestsMissingTopicEmbeddings(
			params.db,
			{
				websiteId: params.websiteId,
				aiAgentId: params.aiAgentId,
			}
		);

	if (requests.length === 0) {
		return;
	}

	const topicSummaries = requests
		.map((request) => request.topicSummary.trim())
		.filter(Boolean);
	if (topicSummaries.length === 0) {
		return;
	}

	const embeddings = await generateEmbeddings(topicSummaries);
	await Promise.all(
		requests.map((request, index) =>
			updateKnowledgeClarificationRequest(params.db, {
				requestId: request.id,
				updates: {
					topicEmbedding: embeddings[index] ?? null,
				},
			})
		)
	);
}

async function resolveConversationClarificationDuplicate(params: {
	db: Database;
	conversationId: string;
	websiteId: string;
	sourceTriggerMessageId: string | null;
}): Promise<{
	request: KnowledgeClarificationRequestSelect;
	resolution: ConversationClarificationStartResolution;
} | null> {
	if (!params.sourceTriggerMessageId) {
		return null;
	}

	const request =
		await getLatestKnowledgeClarificationForConversationBySourceTriggerMessageId(
			params.db,
			{
				conversationId: params.conversationId,
				websiteId: params.websiteId,
				sourceTriggerMessageId: params.sourceTriggerMessageId,
			}
		);
	if (!request) {
		return null;
	}

	return {
		request,
		resolution: isTerminalClarificationStatus(request.status)
			? "suppressed_duplicate"
			: "reused",
	};
}

function isCompatibleReusableClarification(params: {
	request: Pick<KnowledgeClarificationRequestSelect, "targetKnowledgeId">;
	targetKnowledgeId: string | null;
}): boolean {
	if (!params.targetKnowledgeId) {
		return true;
	}

	return (
		!params.request.targetKnowledgeId ||
		params.request.targetKnowledgeId === params.targetKnowledgeId
	);
}

async function resolveSharedReusableClarification(params: {
	db: Database;
	websiteId: string;
	aiAgentId: string;
	targetKnowledgeId: string | null;
	topicFingerprint: string | null;
	topicSummary: string;
}): Promise<{
	request: KnowledgeClarificationRequestSelect | null;
	topicEmbedding: number[] | null;
}> {
	if (params.targetKnowledgeId) {
		const targetedRequest =
			await getJoinableKnowledgeClarificationByTargetKnowledgeId(params.db, {
				websiteId: params.websiteId,
				aiAgentId: params.aiAgentId,
				targetKnowledgeId: params.targetKnowledgeId,
			});
		if (targetedRequest) {
			return {
				request: targetedRequest,
				topicEmbedding: null,
			};
		}
	}

	if (params.topicFingerprint) {
		const exactFingerprintRequest =
			await getJoinableKnowledgeClarificationByTopicFingerprint(params.db, {
				websiteId: params.websiteId,
				aiAgentId: params.aiAgentId,
				topicFingerprint: params.topicFingerprint,
				statuses: REUSABLE_CONVERSATION_TOPIC_FINGERPRINT_STATUSES,
			});
		if (
			exactFingerprintRequest &&
			isCompatibleReusableClarification({
				request: exactFingerprintRequest,
				targetKnowledgeId: params.targetKnowledgeId,
			})
		) {
			return {
				request: exactFingerprintRequest,
				topicEmbedding: null,
			};
		}
	}

	const trimmedTopicSummary = params.topicSummary.trim();
	if (!trimmedTopicSummary) {
		return {
			request: null,
			topicEmbedding: null,
		};
	}

	const topicEmbedding = await generateEmbedding(trimmedTopicSummary);
	await ensureJoinableClarificationRequestTopicEmbeddings({
		db: params.db,
		websiteId: params.websiteId,
		aiAgentId: params.aiAgentId,
	});

	const compatibleMatches = (
		await listJoinableKnowledgeClarificationVectorMatches(params.db, {
			websiteId: params.websiteId,
			aiAgentId: params.aiAgentId,
			topicEmbedding,
			limit: 5,
		})
	).filter((match) =>
		isCompatibleReusableClarification({
			request: match.request,
			targetKnowledgeId: params.targetKnowledgeId,
		})
	);

	const topMatch = compatibleMatches[0] ?? null;
	const nextMatch = compatibleMatches[1] ?? null;
	const isStrongTopMatch =
		topMatch &&
		topMatch.similarity >= 0.9 &&
		(!nextMatch || topMatch.similarity - nextMatch.similarity >= 0.04);

	return {
		request: isStrongTopMatch ? topMatch.request : null,
		topicEmbedding,
	};
}

async function maybeUpgradeReusableClarificationTargetKnowledge(params: {
	db: Database;
	request: KnowledgeClarificationRequestSelect;
	targetKnowledge?: KnowledgeSelect | null;
}): Promise<KnowledgeClarificationRequestSelect> {
	if (
		!(
			params.targetKnowledge &&
			!params.request.targetKnowledgeId &&
			params.targetKnowledge.id
		)
	) {
		return params.request;
	}

	const contextSnapshot = withTargetKnowledgeContextSnapshot({
		requestTopicSummary: params.request.topicSummary,
		contextSnapshot: params.request.contextSnapshot ?? null,
		targetKnowledge: params.targetKnowledge,
	});
	const updatedRequest = await updateKnowledgeClarificationRequest(params.db, {
		requestId: params.request.id,
		updates: {
			targetKnowledgeId: params.targetKnowledge.id,
			contextSnapshot,
		},
	});

	if (!updatedRequest) {
		throw new Error("Failed to upgrade clarification target knowledge.");
	}

	return updatedRequest;
}

async function maybeCreateClarificationReuseSignal(params: {
	db: Database;
	request: KnowledgeClarificationRequestSelect;
	sourceKind: "conversation" | "faq";
	conversationId?: string | null;
	knowledgeId?: string | null;
	triggerMessageId?: string | null;
	summary: string;
	searchEvidence?: KnowledgeClarificationContextSnapshot["kbSearchEvidence"];
}): Promise<void> {
	if (
		params.sourceKind === "conversation" &&
		params.conversationId &&
		params.request.conversationId === params.conversationId &&
		!params.knowledgeId
	) {
		return;
	}

	try {
		await createKnowledgeClarificationSignal(params.db, {
			requestId: params.request.id,
			sourceKind: params.sourceKind,
			conversationId: params.conversationId ?? null,
			knowledgeId: params.knowledgeId ?? null,
			triggerMessageId: params.triggerMessageId ?? null,
			summary: params.summary,
			searchEvidence: params.searchEvidence ?? null,
		});
	} catch (error) {
		if (
			!(
				isUniqueViolationError(
					error,
					"knowledge_clarification_signal_request_conv_trigger_unique"
				) ||
				isUniqueViolationError(
					error,
					"knowledge_clarification_signal_request_conv_unique"
				) ||
				isUniqueViolationError(
					error,
					"knowledge_clarification_signal_request_faq_unique"
				)
			)
		) {
			throw error;
		}
	}
}

async function getKnowledgeClarificationStartTarget(params: {
	db: Database;
	request: KnowledgeClarificationRequestSelect;
	targetKnowledge?: KnowledgeSelect | null;
	engagementMode?: KnowledgeClarificationRequest["engagementMode"];
}): Promise<
	| {
			kind: "step";
			request: KnowledgeClarificationRequest;
			step: KnowledgeClarificationStepResponse;
	  }
	| {
			kind: "stream";
			request: KnowledgeClarificationRequestSelect;
	  }
> {
	const turns = await listKnowledgeClarificationTurns(params.db, {
		requestId: params.request.id,
	});
	const existingStep = toKnowledgeClarificationStep({
		request: params.request,
		turns,
	});
	if (existingStep) {
		const request = await serializeKnowledgeClarificationRequestWithMetadata({
			db: params.db,
			request: params.request,
			turns,
			targetKnowledge: params.targetKnowledge,
			engagementMode: params.engagementMode,
		});
		return {
			kind: "step",
			request,
			step: withSerializedKnowledgeClarificationStepRequest({
				step: existingStep,
				request,
			}),
		};
	}

	const analyzingRequest = await updateKnowledgeClarificationRequest(
		params.db,
		{
			requestId: params.request.id,
			updates: {
				status: "analyzing",
				lastError: null,
			},
		}
	);
	if (!analyzingRequest) {
		throw new Error("Failed to update clarification request.");
	}

	return {
		kind: "stream",
		request: analyzingRequest,
	};
}

export async function prepareConversationKnowledgeClarificationStart(
	params: StartConversationKnowledgeClarificationParams
): Promise<PreparedConversationKnowledgeClarificationStartResult> {
	const baseContextSnapshot =
		params.contextSnapshot ??
		buildConversationClarificationContextSnapshot({
			conversationHistory: await buildConversationTranscript(params.db, {
				conversationId: params.conversation.id,
				organizationId: params.organizationId,
				websiteId: params.websiteId,
			}),
		});
	const contextSnapshot = withTargetKnowledgeContextSnapshot({
		requestTopicSummary: params.topicSummary,
		contextSnapshot: baseContextSnapshot,
		targetKnowledge: params.targetKnowledge ?? null,
	});
	const topicSummary = buildSpecificClarificationTopicSummary({
		triggerText: contextSnapshot?.sourceTrigger.text,
		searchEvidence: contextSnapshot?.kbSearchEvidence,
		linkedFaq: contextSnapshot?.linkedFaq,
		fallback: params.topicSummary,
	});
	const sourceTriggerMessageId =
		params.creationMode === "automation"
			? getClarificationSourceTriggerMessageId(contextSnapshot ?? null)
			: null;
	const topicFingerprint = buildClarificationTopicFingerprint(topicSummary);
	const duplicate = await resolveConversationClarificationDuplicate({
		db: params.db,
		conversationId: params.conversation.id,
		websiteId: params.websiteId,
		sourceTriggerMessageId,
	});

	if (duplicate) {
		if (duplicate.resolution === "suppressed_duplicate") {
			return {
				kind: "suppressed_duplicate",
				request: await serializeKnowledgeClarificationRequestWithMetadata({
					db: params.db,
					request: duplicate.request,
					targetKnowledge: params.targetKnowledge ?? null,
				}),
				step: null,
				created: false,
				resolution: "suppressed_duplicate",
			};
		}

		const reusableRequest =
			await maybeUpgradeReusableClarificationTargetKnowledge({
				db: params.db,
				request: duplicate.request,
				targetKnowledge: params.targetKnowledge ?? null,
			});
		const target = await getKnowledgeClarificationStartTarget({
			db: params.db,
			request: reusableRequest,
			targetKnowledge: params.targetKnowledge ?? null,
			engagementMode:
				reusableRequest.conversationId === params.conversation.id
					? "owner"
					: "linked",
		});
		return target.kind === "step"
			? {
					kind: "step",
					request: target.request,
					step: target.step,
					created: false,
					resolution: "reused",
				}
			: {
					kind: "stream",
					request: target.request,
					created: false,
					resolution: "reused",
				};
	}

	const activeAssociation =
		await getActiveKnowledgeClarificationAssociationForConversation(params.db, {
			conversationId: params.conversation.id,
			websiteId: params.websiteId,
		});

	if (activeAssociation?.request) {
		const reusableRequest =
			await maybeUpgradeReusableClarificationTargetKnowledge({
				db: params.db,
				request: activeAssociation.request,
				targetKnowledge: params.targetKnowledge ?? null,
			});
		const target = await getKnowledgeClarificationStartTarget({
			db: params.db,
			request: reusableRequest,
			targetKnowledge: params.targetKnowledge ?? null,
			engagementMode: activeAssociation.engagementMode,
		});
		return target.kind === "step"
			? {
					kind: "step",
					request: target.request,
					step: target.step,
					created: false,
					resolution: "reused",
				}
			: {
					kind: "stream",
					request: target.request,
					created: false,
					resolution: "reused",
				};
	}

	const reusable = await resolveSharedReusableClarification({
		db: params.db,
		websiteId: params.websiteId,
		aiAgentId: params.aiAgent.id,
		targetKnowledgeId: params.targetKnowledge?.id ?? null,
		topicFingerprint,
		topicSummary,
	});

	if (reusable.request) {
		const reusableRequest =
			await maybeUpgradeReusableClarificationTargetKnowledge({
				db: params.db,
				request: reusable.request,
				targetKnowledge: params.targetKnowledge ?? null,
			});
		await maybeCreateClarificationReuseSignal({
			db: params.db,
			request: reusableRequest,
			sourceKind: "conversation",
			conversationId: params.conversation.id,
			knowledgeId: params.targetKnowledge?.id ?? null,
			triggerMessageId: sourceTriggerMessageId,
			summary: topicSummary,
			searchEvidence: contextSnapshot?.kbSearchEvidence,
		});
		const target = await getKnowledgeClarificationStartTarget({
			db: params.db,
			request: reusableRequest,
			targetKnowledge: params.targetKnowledge ?? null,
			engagementMode:
				reusableRequest.conversationId === params.conversation.id
					? "owner"
					: "linked",
		});
		return target.kind === "step"
			? {
					kind: "step",
					request: target.request,
					step: target.step,
					created: false,
					resolution: "reused",
				}
			: {
					kind: "stream",
					request: target.request,
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
			topicEmbedding: reusable.topicEmbedding,
			contextSnapshot,
			targetKnowledgeId: params.targetKnowledge?.id ?? null,
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
		});
		if (winner) {
			if (winner.resolution === "suppressed_duplicate") {
				return {
					kind: "suppressed_duplicate",
					request: await serializeKnowledgeClarificationRequestWithMetadata({
						db: params.db,
						request: winner.request,
						targetKnowledge: params.targetKnowledge ?? null,
					}),
					step: null,
					created: false,
					resolution: "suppressed_duplicate",
				};
			}

			const reusableRequest =
				await maybeUpgradeReusableClarificationTargetKnowledge({
					db: params.db,
					request: winner.request,
					targetKnowledge: params.targetKnowledge ?? null,
				});
			const target = await getKnowledgeClarificationStartTarget({
				db: params.db,
				request: reusableRequest,
				targetKnowledge: params.targetKnowledge ?? null,
				engagementMode:
					reusableRequest.conversationId === params.conversation.id
						? "owner"
						: "linked",
			});
			return target.kind === "step"
				? {
						kind: "step",
						request: target.request,
						step: target.step,
						created: false,
						resolution: "reused",
					}
				: {
						kind: "stream",
						request: target.request,
						created: false,
						resolution: "reused",
					};
		}

		const fallbackReusable = await resolveSharedReusableClarification({
			db: params.db,
			websiteId: params.websiteId,
			aiAgentId: params.aiAgent.id,
			targetKnowledgeId: params.targetKnowledge?.id ?? null,
			topicFingerprint,
			topicSummary,
		});
		if (!fallbackReusable.request) {
			throw error;
		}

		const reusableRequest =
			await maybeUpgradeReusableClarificationTargetKnowledge({
				db: params.db,
				request: fallbackReusable.request,
				targetKnowledge: params.targetKnowledge ?? null,
			});
		await maybeCreateClarificationReuseSignal({
			db: params.db,
			request: reusableRequest,
			sourceKind: "conversation",
			conversationId: params.conversation.id,
			knowledgeId: params.targetKnowledge?.id ?? null,
			triggerMessageId: sourceTriggerMessageId,
			summary: topicSummary,
			searchEvidence: contextSnapshot?.kbSearchEvidence,
		});
		const target = await getKnowledgeClarificationStartTarget({
			db: params.db,
			request: reusableRequest,
			targetKnowledge: params.targetKnowledge ?? null,
			engagementMode:
				reusableRequest.conversationId === params.conversation.id
					? "owner"
					: "linked",
		});
		return target.kind === "step"
			? {
					kind: "step",
					request: target.request,
					step: target.step,
					created: false,
					resolution: "reused",
				}
			: {
					kind: "stream",
					request: target.request,
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

	return {
		kind: "stream",
		request,
		created: true,
		resolution: "created",
	};
}

export async function startConversationKnowledgeClarification(
	params: StartConversationKnowledgeClarificationParams
): Promise<ConversationClarificationStartResult> {
	const prepared = await prepareConversationKnowledgeClarificationStart(params);

	if (prepared.kind === "suppressed_duplicate") {
		return {
			request: prepared.request,
			step: null,
			created: false,
			resolution: "suppressed_duplicate",
		};
	}

	if (prepared.kind === "step") {
		return {
			request: prepared.request,
			step: prepared.step,
			created: false,
			resolution: "reused",
		};
	}

	const step = await runKnowledgeClarificationStep({
		db: params.db,
		request: prepared.request,
		aiAgent: params.aiAgent,
		conversation: params.conversation,
	});

	return {
		request: step.request,
		step,
		created: prepared.created,
		resolution: prepared.resolution,
	};
}

export async function prepareFaqKnowledgeClarificationStart(
	params: StartFaqKnowledgeClarificationParams
): Promise<PreparedFaqKnowledgeClarificationStartResult> {
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
	const topicFingerprint = buildClarificationTopicFingerprint(topicSummary);
	const reusable = await resolveSharedReusableClarification({
		db: params.db,
		websiteId: params.websiteId,
		aiAgentId: params.aiAgent.id,
		targetKnowledgeId: params.targetKnowledge.id,
		topicFingerprint,
		topicSummary,
	});

	if (reusable.request) {
		const reusableRequest =
			await maybeUpgradeReusableClarificationTargetKnowledge({
				db: params.db,
				request: reusable.request,
				targetKnowledge: params.targetKnowledge,
			});
		await maybeCreateClarificationReuseSignal({
			db: params.db,
			request: reusableRequest,
			sourceKind: "faq",
			knowledgeId: params.targetKnowledge.id,
			summary: topicSummary,
			searchEvidence: contextSnapshot.kbSearchEvidence,
		});
		const target = await getKnowledgeClarificationStartTarget({
			db: params.db,
			request: reusableRequest,
			targetKnowledge: params.targetKnowledge,
		});
		return target.kind === "step"
			? {
					kind: "step",
					request: target.request,
					step: target.step,
					created: false,
					resolution: "reused",
				}
			: {
					kind: "stream",
					request: target.request,
					created: false,
					resolution: "reused",
				};
	}

	const request = await createKnowledgeClarificationRequest(params.db, {
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		aiAgentId: params.aiAgent.id,
		source: "faq",
		status: "analyzing",
		topicSummary,
		topicFingerprint,
		topicEmbedding: reusable.topicEmbedding,
		contextSnapshot,
		maxSteps: params.maxSteps ?? DEFAULT_MAX_CLARIFICATION_STEPS,
		targetKnowledgeId: params.targetKnowledge.id,
	});

	return {
		kind: "stream",
		request,
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
	const prepared = await prepareFaqKnowledgeClarificationStart(params);

	if (prepared.kind === "step") {
		return {
			request: prepared.request,
			step: prepared.step,
		};
	}

	const step = await runKnowledgeClarificationStep({
		db: params.db,
		request: prepared.request,
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
