import type { Database } from "@api/db";
import type { IngestAiCreditUsageStatus } from "@api/lib/ai-credits/polar-meter";
import { generateIdempotentULID } from "@api/utils/db/ids";
import {
	createTimelineItem,
	updateTimelineItem,
} from "@api/utils/timeline-item";
import {
	ConversationTimelineType,
	getToolLogType,
	TimelineItemVisibility,
} from "@cossistant/types";

export const AI_CREDIT_USAGE_TIMELINE_TOOL_NAME = "aiCreditUsage";

export type GenerationUsageSource =
	| "primary_pipeline"
	| "knowledge_clarification";

export type GenerationUsagePhase =
	| "primary_generation"
	| "clarification_plan_generation"
	| "clarification_answer_evaluation"
	| "faq_draft_generation";

export type GenerationUsageTimelinePayload = {
	usageEventId?: string;
	workflowRunId?: string;
	triggerMessageId?: string;
	triggerVisibility?: "public" | "private";
	modelId: string;
	modelIdOriginal?: string;
	modelMigrationApplied?: boolean;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	reasoningTokens?: number;
	tokenSource: "provider" | "fallback_constant";
	baseCredits: number;
	modelCredits: number;
	thinkingCredits: number;
	toolCredits: number;
	totalCredits: number;
	billableToolCount: number;
	excludedToolCount: number;
	totalToolCount: number;
	mode: "normal" | "outage";
	ingestStatus:
		| IngestAiCreditUsageStatus
		| "failed"
		| "skipped"
		| "skipped_customer_openrouter"
		| "skipped_cossistant_platform"
		| "skipped_zero";
	balanceBefore: number | null;
	balanceAfterEstimate: number | null;
	blockedReason?: string;
	source?: GenerationUsageSource;
	phase?: GenerationUsagePhase;
	knowledgeClarificationRequestId?: string;
	knowledgeClarificationStepIndex?: number;
};

function isUniqueViolationError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) {
		return false;
	}

	if ("code" in error && typeof error.code === "string") {
		return error.code === "23505";
	}

	if ("cause" in error) {
		const cause = (error as { cause?: unknown }).cause;
		if (
			typeof cause === "object" &&
			cause !== null &&
			"code" in cause &&
			typeof cause.code === "string"
		) {
			return cause.code === "23505";
		}
	}

	if ("message" in error && typeof error.message === "string") {
		return error.message.toLowerCase().includes("duplicate key");
	}

	return false;
}

function resolveUsageEventId(payload: GenerationUsageTimelinePayload): string {
	const usageEventId = payload.usageEventId ?? payload.workflowRunId;

	if (!usageEventId) {
		throw new Error("AI usage timeline payload is missing a stable event id.");
	}

	return usageEventId;
}

function getTimelineItemId(payload: GenerationUsageTimelinePayload): string {
	return generateIdempotentULID(
		`tool:${resolveUsageEventId(payload)}:ai-credit-usage`
	);
}

function buildToolPart(payload: GenerationUsageTimelinePayload) {
	const usageEventId = resolveUsageEventId(payload);
	const workflowRunId = payload.workflowRunId ?? usageEventId;
	const triggerMessageId = payload.triggerMessageId ?? usageEventId;
	const providerMetadata = {
		cossistant: {
			visibility: TimelineItemVisibility.PRIVATE,
			toolTimeline: {
				logType: getToolLogType(AI_CREDIT_USAGE_TIMELINE_TOOL_NAME),
				usageEventId,
				workflowRunId,
				triggerMessageId,
				...(payload.triggerVisibility
					? { triggerVisibility: payload.triggerVisibility }
					: {}),
				...(payload.source ? { source: payload.source } : {}),
				...(payload.phase ? { phase: payload.phase } : {}),
				...(payload.knowledgeClarificationRequestId
					? {
							knowledgeClarificationRequestId:
								payload.knowledgeClarificationRequestId,
						}
					: {}),
				...(typeof payload.knowledgeClarificationStepIndex === "number"
					? {
							knowledgeClarificationStepIndex:
								payload.knowledgeClarificationStepIndex,
						}
					: {}),
			},
		},
	};

	return {
		type: `tool-${AI_CREDIT_USAGE_TIMELINE_TOOL_NAME}`,
		toolCallId: "ai-credit-usage",
		toolName: AI_CREDIT_USAGE_TIMELINE_TOOL_NAME,
		state: "result",
		input: {
			usageEventId,
			workflowRunId,
			triggerMessageId,
			modelId: payload.modelId,
			blockedReason: payload.blockedReason ?? null,
			source: payload.source ?? "primary_pipeline",
			phase: payload.phase ?? "primary_generation",
			knowledgeClarificationRequestId:
				payload.knowledgeClarificationRequestId ?? null,
			knowledgeClarificationStepIndex:
				payload.knowledgeClarificationStepIndex ?? null,
		},
		output: payload,
		callProviderMetadata: providerMetadata,
		providerMetadata,
	};
}

function buildTimelineText(payload: GenerationUsageTimelinePayload): string {
	if (payload.blockedReason) {
		return `AI credits blocked (${payload.blockedReason}): ${payload.totalCredits} credits required`;
	}

	if (payload.source === "knowledge_clarification") {
		const label =
			payload.phase === "faq_draft_generation"
				? "FAQ draft generation"
				: payload.phase === "clarification_answer_evaluation"
					? "Clarification answer review"
					: "Knowledge clarification planning";
		return `${label}: ${payload.totalTokens} tokens, ${payload.totalCredits} credits`;
	}

	return `AI usage: ${payload.totalTokens} tokens, ${payload.totalCredits} credits`;
}

export async function logGenerationUsageTimeline(params: {
	db: Database;
	organizationId: string;
	websiteId: string;
	conversationId: string;
	visitorId: string;
	aiAgentId: string;
	payload: GenerationUsageTimelinePayload;
}): Promise<void> {
	const itemId = getTimelineItemId(params.payload);
	const part = buildToolPart(params.payload);
	const text = buildTimelineText(params.payload);

	try {
		await createTimelineItem({
			db: params.db,
			organizationId: params.organizationId,
			websiteId: params.websiteId,
			conversationId: params.conversationId,
			conversationOwnerVisitorId: params.visitorId,
			item: {
				id: itemId,
				type: ConversationTimelineType.TOOL,
				text,
				parts: [part],
				aiAgentId: params.aiAgentId,
				visitorId: params.visitorId,
				visibility: TimelineItemVisibility.PRIVATE,
				tool: AI_CREDIT_USAGE_TIMELINE_TOOL_NAME,
			},
		});
		return;
	} catch (error) {
		if (!isUniqueViolationError(error)) {
			throw error;
		}
	}

	await updateTimelineItem({
		db: params.db,
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		conversationId: params.conversationId,
		conversationOwnerVisitorId: params.visitorId,
		itemId,
		item: {
			text,
			parts: [part],
			tool: AI_CREDIT_USAGE_TIMELINE_TOOL_NAME,
		},
	});
}
