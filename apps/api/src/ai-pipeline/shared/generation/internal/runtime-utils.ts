import { generateVisitorName } from "@cossistant/core";
import { getBehaviorSettings } from "../../settings";
import type {
	PipelineToolContext,
	ToolRuntimeState,
} from "../../tools/contracts";
import type {
	CapturedFinalAction,
	GenerationRuntimeInput,
	GenerationRuntimeResult,
} from "../contracts";

export type ToolStepLike = {
	toolCalls?: Array<{ toolName?: string }>;
};

export type GenerationAttemptOutcome = NonNullable<
	GenerationRuntimeResult["attempts"]
>[number]["outcome"];

export type GenerationFailureCode = NonNullable<
	GenerationRuntimeResult["failureCode"]
>;

export type RuntimeResultWithoutAttempts = Omit<
	GenerationRuntimeResult,
	"attempts"
>;

export function countTotalToolCalls(
	toolCallsByName: Record<string, number>
): number {
	return Object.values(toolCallsByName).reduce((sum, value) => {
		if (!Number.isFinite(value) || value <= 0) {
			return sum;
		}
		return sum + Math.floor(value);
	}, 0);
}

export function countNonFinishToolCalls(params: {
	steps: readonly ToolStepLike[] | undefined;
	finishToolNames: Set<string>;
}): number {
	if (!(params.steps && params.steps.length > 0)) {
		return 0;
	}

	let total = 0;

	for (const step of params.steps) {
		for (const call of step.toolCalls ?? []) {
			const toolName = call?.toolName;
			if (!(toolName && typeof toolName === "string")) {
				continue;
			}
			if (params.finishToolNames.has(toolName)) {
				continue;
			}
			total += 1;
		}
	}

	return total;
}

export function buildSafeSkipAction(reasoning: string): CapturedFinalAction {
	return {
		action: "skip",
		reasoning,
		confidence: 1,
	};
}

export function toUsage(
	value:
		| {
				inputTokens?: number;
				outputTokens?: number;
				totalTokens?: number;
				reasoningTokens?: number;
				outputTokenDetails?: {
					reasoningTokens?: number;
				};
		  }
		| undefined
): GenerationRuntimeResult["usage"] {
	if (!value) {
		return;
	}

	const inputTokens =
		typeof value.inputTokens === "number" ? value.inputTokens : undefined;
	const outputTokens =
		typeof value.outputTokens === "number" ? value.outputTokens : undefined;
	const totalTokens =
		typeof value.totalTokens === "number" ? value.totalTokens : undefined;
	const reasoningTokens =
		typeof value.outputTokenDetails?.reasoningTokens === "number"
			? value.outputTokenDetails.reasoningTokens
			: typeof value.reasoningTokens === "number"
				? value.reasoningTokens
				: undefined;

	if (
		inputTokens === undefined &&
		outputTokens === undefined &&
		totalTokens === undefined &&
		reasoningTokens === undefined
	) {
		return;
	}

	return {
		inputTokens,
		outputTokens,
		totalTokens,
		reasoningTokens,
	};
}

export function createToolRuntimeState(): ToolRuntimeState {
	return {
		finalAction: null,
		publicMessagesSent: 0,
		publicReplyTexts: [],
		toolCallCounts: {},
		mutationToolCallCounts: {},
		successfulToolCallCounts: {},
		failedToolCallCounts: {},
		chargeableToolCallCounts: {},
		toolExecutions: [],
		immediateKnowledgeGapClarificationHandled: false,
		publicSendSequence: 0,
		privateSendSequence: 0,
		sentPublicMessageIds: new Set<string>(),
		lastToolError: null,
	};
}

export function buildToolContext(params: {
	input: GenerationRuntimeInput;
	runtimeState: ToolRuntimeState;
}): PipelineToolContext {
	const { input, runtimeState } = params;
	const visitorName =
		input.visitorContext?.name?.trim() ||
		generateVisitorName(input.conversation.visitorId);
	const behaviorSettings = getBehaviorSettings(input.aiAgent);

	return {
		db: input.db,
		conversation: input.conversation,
		conversationId: input.conversation.id,
		organizationId: input.conversation.organizationId,
		websiteId: input.conversation.websiteId,
		visitorId: input.conversation.visitorId,
		aiAgentId: input.aiAgent.id,
		aiAgentName: input.aiAgent.name,
		visitorName,
		websiteDefaultLanguage: input.websiteDefaultLanguage,
		visitorLanguage: input.visitorLanguage,
		autoTranslateEnabled: input.autoTranslateEnabled !== false,
		workflowRunId: input.workflowRunId,
		triggerMessageId: input.triggerMessageId,
		triggerMessageText: input.triggerMessageText ?? null,
		triggerMessageCreatedAt: input.triggerMessageCreatedAt,
		triggerSenderType: input.triggerSenderType,
		triggerVisibility: input.triggerVisibility,
		allowPublicMessages: input.allowPublicMessages,
		pipelineKind: input.pipelineKind,
		mode: input.mode,
		isEscalated: input.conversationState.isEscalated,
		canCategorize: behaviorSettings.canCategorize,
		canRequestKnowledgeClarification:
			behaviorSettings.canRequestKnowledgeClarification,
		availableViews: input.availableViews ?? [],
		stopTyping: input.stopTyping,
		runtimeState,
		debugLogger: input.debugLogger,
		deepTraceEnabled: input.deepTraceEnabled,
		tracePayloadMode: input.tracePayloadMode,
	};
}

export function recordAttempt(params: {
	attempts: NonNullable<GenerationRuntimeResult["attempts"]>;
	modelId: string;
	attempt: number;
	outcome: GenerationAttemptOutcome;
	durationMs: number;
}): void {
	params.attempts.push({
		modelId: params.modelId,
		attempt: params.attempt,
		outcome: params.outcome,
		durationMs: params.durationMs,
	});
}
