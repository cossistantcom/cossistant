import { getBehaviorSettings } from "@api/ai-pipeline/shared/settings";
import type { Database } from "@api/db";
import { getAiAgentById } from "@api/db/queries/ai-agent";
import { listActiveWebsiteViews } from "@api/db/queries/view";
import type { AiAgentToolId } from "@plasma/types";
import { logAiPipeline } from "../logger";
import {
	loadConversationSeed,
	loadIntakeContext,
} from "../primary-pipeline/steps/intake/load-context";
import { resolveAndPersistModel } from "../primary-pipeline/steps/intake/model-resolution";
import {
	emitPipelineProcessingCompletedSafely,
	type PipelineRealtimeConversationTarget,
} from "../shared/events";
import {
	type GenerationRuntimeResult,
	runGenerationRuntime,
} from "../shared/generation";
import { runBackgroundKnowledgeGapReview } from "./knowledge-gap-review";

export type BackgroundPipelineInput = {
	conversationId: string;
	websiteId: string;
	organizationId: string;
	aiAgentId: string;
	sourceMessageId: string;
	sourceMessageCreatedAt: string;
	workflowRunId: string;
	jobId: string;
};

export type BackgroundPipelineResult = {
	status: "completed" | "skipped" | "error";
	reason?: string;
	error?: string;
	metrics: {
		intakeMs: number;
		analysisMs: number;
		executionMs: number;
		totalMs: number;
	};
};

type BackgroundPipelineContext = {
	db: Database;
	input: BackgroundPipelineInput;
};

const BACKGROUND_TOOL_IDS: AiAgentToolId[] = [
	"updateConversationTitle",
	"updateSentiment",
	"setPriority",
	"categorizeConversation",
	"skip",
];

function getBackgroundToolAllowlist(
	aiAgent: Awaited<ReturnType<typeof getAiAgentById>>
): AiAgentToolId[] {
	if (!aiAgent) {
		return ["skip"];
	}

	const settings = getBehaviorSettings(aiAgent);
	const allowlist: AiAgentToolId[] = [];

	if (settings.autoGenerateTitle) {
		allowlist.push("updateConversationTitle");
	}

	if (settings.autoAnalyzeSentiment) {
		allowlist.push("updateSentiment");
	}

	if (settings.canSetPriority) {
		allowlist.push("setPriority");
	}

	if (settings.autoCategorize && settings.canCategorize) {
		allowlist.push("categorizeConversation");
	}

	allowlist.push("skip");
	return allowlist;
}

function hasBackgroundAnalysisWork(
	toolAllowlist: readonly AiAgentToolId[]
): boolean {
	return toolAllowlist.some((toolId) => toolId !== "skip");
}

function hasBackgroundMutation(result: GenerationRuntimeResult): boolean {
	const mutationCounts =
		result.mutationToolCallsByName ?? result.toolCallsByName;

	return BACKGROUND_TOOL_IDS.some((toolId) => {
		if (toolId === "skip") {
			return false;
		}

		return (mutationCounts[toolId] ?? 0) > 0;
	});
}

async function runBackgroundIntake(ctx: BackgroundPipelineContext): Promise<
	| {
			status: "ready";
			aiAgent: NonNullable<Awaited<ReturnType<typeof getAiAgentById>>>;
			toolAllowlist: AiAgentToolId[];
			modelResolution: Awaited<
				ReturnType<typeof resolveAndPersistModel>
			>["modelResolution"];
			conversation: NonNullable<
				Awaited<ReturnType<typeof loadConversationSeed>>["conversation"]
			>;
			decisionMessages: Awaited<
				ReturnType<typeof loadIntakeContext>
			>["decisionMessages"];
			generationEntries: Awaited<
				ReturnType<typeof loadIntakeContext>
			>["generationEntries"];
			conversationHistory: Awaited<
				ReturnType<typeof loadIntakeContext>
			>["conversationHistory"];
			visitorContext: Awaited<
				ReturnType<typeof loadIntakeContext>
			>["visitorContext"];
			conversationState: Awaited<
				ReturnType<typeof loadIntakeContext>
			>["conversationState"];
			triggerMessage: Awaited<
				ReturnType<typeof loadIntakeContext>
			>["triggerMessage"];
			hasLaterHumanMessage: Awaited<
				ReturnType<typeof loadIntakeContext>
			>["hasLaterHumanMessage"];
			hasLaterAiMessage: Awaited<
				ReturnType<typeof loadIntakeContext>
			>["hasLaterAiMessage"];
			availableViews: Awaited<ReturnType<typeof listActiveWebsiteViews>>;
	  }
	| {
			status: "skipped";
			reason: string;
	  }
> {
	const aiAgent = await getAiAgentById(ctx.db, {
		aiAgentId: ctx.input.aiAgentId,
	});
	if (!aiAgent?.isActive) {
		return {
			status: "skipped",
			reason: "Background analysis requires an active AI agent",
		};
	}

	const toolAllowlist = getBackgroundToolAllowlist(aiAgent);
	if (!hasBackgroundAnalysisWork(toolAllowlist)) {
		return {
			status: "skipped",
			reason: "No background analysis capabilities enabled",
		};
	}

	const { aiAgent: resolvedAiAgent, modelResolution } =
		await resolveAndPersistModel({
			db: ctx.db,
			aiAgent,
			conversationId: ctx.input.conversationId,
		});

	const { conversation, triggerMetadata } = await loadConversationSeed(ctx.db, {
		conversationId: ctx.input.conversationId,
		messageId: ctx.input.sourceMessageId,
		organizationId: ctx.input.organizationId,
	});

	if (!conversation) {
		return {
			status: "skipped",
			reason: `Conversation ${ctx.input.conversationId} not found`,
		};
	}

	if (!triggerMetadata) {
		return {
			status: "skipped",
			reason: `Source message ${ctx.input.sourceMessageId} not found`,
		};
	}

	if (triggerMetadata.conversationId !== ctx.input.conversationId) {
		return {
			status: "skipped",
			reason: `Source message ${ctx.input.sourceMessageId} does not belong to conversation ${ctx.input.conversationId}`,
		};
	}

	const intakeContext = await loadIntakeContext(ctx.db, {
		conversationId: ctx.input.conversationId,
		organizationId: ctx.input.organizationId,
		websiteId: ctx.input.websiteId,
		visitorId: conversation.visitorId,
		conversation,
		triggerMetadata,
	});

	const availableViews = toolAllowlist.includes("categorizeConversation")
		? await listActiveWebsiteViews(ctx.db, {
				websiteId: ctx.input.websiteId,
			})
		: [];

	return {
		status: "ready",
		aiAgent: resolvedAiAgent,
		toolAllowlist,
		modelResolution,
		conversation,
		decisionMessages: intakeContext.decisionMessages,
		generationEntries: intakeContext.generationEntries,
		conversationHistory: intakeContext.conversationHistory,
		visitorContext: intakeContext.visitorContext,
		conversationState: intakeContext.conversationState,
		triggerMessage: intakeContext.triggerMessage,
		hasLaterHumanMessage: intakeContext.hasLaterHumanMessage,
		hasLaterAiMessage: intakeContext.hasLaterAiMessage,
		availableViews,
	};
}

/**
 * Background pipeline shell.
 * Scheduling and queue orchestration are implemented first; triage actions will be added later.
 */
export async function runBackgroundPipeline(
	ctx: BackgroundPipelineContext
): Promise<BackgroundPipelineResult> {
	const startTime = Date.now();
	const { conversationId, workflowRunId, jobId } = ctx.input;
	let intakeMs = 0;
	let analysisMs = 0;
	const completionConversation: PipelineRealtimeConversationTarget = {
		id: ctx.input.conversationId,
		websiteId: ctx.input.websiteId,
		organizationId: ctx.input.organizationId,
		visitorId: null,
	};

	const emitProcessingCompletedSafe = async (params: {
		conversation?: PipelineRealtimeConversationTarget;
		aiAgentId?: string;
		status: "success" | "skipped" | "error";
		action?: string | null;
		reason?: string | null;
	}) => {
		await emitPipelineProcessingCompletedSafely({
			conversation: params.conversation ?? completionConversation,
			aiAgentId: params.aiAgentId ?? ctx.input.aiAgentId,
			workflowRunId: ctx.input.workflowRunId,
			status: params.status,
			action: params.action,
			reason: params.reason,
			audience: "dashboard",
			pipelineArea: "background",
			logConversationId: conversationId,
		});
	};

	try {
		logAiPipeline({
			area: "background",
			event: "start",
			conversationId,
			fields: {
				workflowRunId,
				jobId,
				sourceMessageId: ctx.input.sourceMessageId,
			},
		});

		const intakeStartedAt = Date.now();
		const intakeResult = await runBackgroundIntake(ctx);
		intakeMs = Date.now() - intakeStartedAt;

		if (intakeResult.status !== "ready") {
			logAiPipeline({
				area: "background",
				event: "skip",
				conversationId,
				fields: {
					reason: intakeResult.reason,
				},
			});

			await emitProcessingCompletedSafe({
				status: "skipped",
				reason: intakeResult.reason,
			});
			return {
				status: "skipped",
				reason: intakeResult.reason,
				metrics: {
					intakeMs,
					analysisMs,
					executionMs: 0,
					totalMs: Date.now() - startTime,
				},
			};
		}

		const analysisStartedAt = Date.now();
		const generationResult = await runGenerationRuntime({
			db: ctx.db,
			pipelineKind: "background",
			mode: "background_only",
			aiAgent: intakeResult.aiAgent,
			conversation: intakeResult.conversation,
			generationEntries: intakeResult.generationEntries,
			visitorContext: intakeResult.visitorContext,
			conversationState: intakeResult.conversationState,
			humanCommand: null,
			workflowRunId,
			triggerMessageId: ctx.input.sourceMessageId,
			triggerMessageText: intakeResult.triggerMessage?.content ?? null,
			triggerMessageCreatedAt: ctx.input.sourceMessageCreatedAt,
			triggerSenderType: intakeResult.triggerMessage?.senderType,
			triggerVisibility: intakeResult.triggerMessage?.visibility,
			hasLaterHumanMessage: intakeResult.hasLaterHumanMessage,
			hasLaterAiMessage: intakeResult.hasLaterAiMessage,
			allowPublicMessages: false,
			availableViews: intakeResult.availableViews.map((view) => ({
				id: view.id,
				name: view.name,
				description: view.description,
				prompt: view.prompt,
			})),
			toolAllowlist: intakeResult.toolAllowlist,
		});
		analysisMs = Date.now() - analysisStartedAt;

		if (generationResult.status === "error") {
			const errorMessage =
				generationResult.error ?? "Background analysis failed";
			logAiPipeline({
				area: "background",
				event: "error",
				level: "error",
				conversationId,
				fields: {
					message: errorMessage,
					failureCode: generationResult.failureCode,
				},
			});

			await emitProcessingCompletedSafe({
				conversation: intakeResult.conversation,
				aiAgentId: intakeResult.aiAgent.id,
				status: "error",
				reason: errorMessage,
			});
			return {
				status: "error",
				error: errorMessage,
				metrics: {
					intakeMs,
					analysisMs,
					executionMs: 0,
					totalMs: Date.now() - startTime,
				},
			};
		}

		const knowledgeGapReviewResult = await runBackgroundKnowledgeGapReview({
			db: ctx.db,
			input: ctx.input,
			intake: {
				aiAgent: intakeResult.aiAgent,
				conversation: intakeResult.conversation,
				conversationHistory: intakeResult.conversationHistory,
				triggerMessage: intakeResult.triggerMessage,
			},
		});

		if (knowledgeGapReviewResult.status === "created") {
			logAiPipeline({
				area: "background",
				event: "knowledge_gap_clarification_created",
				conversationId,
				fields: {
					requestId: knowledgeGapReviewResult.requestId,
					created: knowledgeGapReviewResult.created,
					topicSummary: knowledgeGapReviewResult.topicSummary,
					reason: knowledgeGapReviewResult.reason,
				},
			});

			await emitProcessingCompletedSafe({
				conversation: intakeResult.conversation,
				aiAgentId: intakeResult.aiAgent.id,
				status: "success",
				action: "requestKnowledgeClarification",
				reason: knowledgeGapReviewResult.reason,
			});
			return {
				status: "completed",
				metrics: {
					intakeMs,
					analysisMs,
					executionMs: 0,
					totalMs: Date.now() - startTime,
				},
			};
		}

		if (!hasBackgroundMutation(generationResult)) {
			logAiPipeline({
				area: "background",
				event: "skip",
				conversationId,
				fields: {
					reason:
						knowledgeGapReviewResult.reason === "review_skipped"
							? generationResult.action.reasoning
							: `${generationResult.action.reasoning} | knowledgeGapReview=${knowledgeGapReviewResult.reason}`,
				},
			});

			await emitProcessingCompletedSafe({
				conversation: intakeResult.conversation,
				aiAgentId: intakeResult.aiAgent.id,
				status: "skipped",
				action: generationResult.action.action,
				reason: generationResult.action.reasoning,
			});
			return {
				status: "skipped",
				reason: generationResult.action.reasoning,
				metrics: {
					intakeMs,
					analysisMs,
					executionMs: 0,
					totalMs: Date.now() - startTime,
				},
			};
		}

		logAiPipeline({
			area: "background",
			event: "completed",
			conversationId,
			fields: {
				workflowRunId,
				jobId,
				sourceMessageId: ctx.input.sourceMessageId,
				toolCalls: generationResult.totalToolCalls,
			},
		});

		await emitProcessingCompletedSafe({
			conversation: intakeResult.conversation,
			aiAgentId: intakeResult.aiAgent.id,
			status: "success",
			action: generationResult.action.action,
			reason: generationResult.action.reasoning,
		});
		return {
			status: "completed",
			metrics: {
				intakeMs,
				analysisMs,
				executionMs: 0,
				totalMs: Date.now() - startTime,
			},
		};
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Background pipeline failed";

		logAiPipeline({
			area: "background",
			event: "error",
			level: "error",
			conversationId,
			fields: {
				message,
			},
			error,
		});

		await emitProcessingCompletedSafe({
			status: "error",
			reason: message,
		});
		return {
			status: "error",
			error: message,
			metrics: {
				intakeMs,
				analysisMs,
				executionMs: 0,
				totalMs: Date.now() - startTime,
			},
		};
	}
}
