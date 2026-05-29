import { env } from "@api/env";
import type { AiCreditGuardResult } from "@api/lib/ai-credits/guard";
import { logAiPipeline } from "../logger";
import { sendMessage as sendPublicMessage } from "../shared/actions/send-message";
import { createPipelineDevConversationLog } from "../shared/dev-conversation-log";
import {
	emitPipelineProcessingCompletedSafely,
	type PipelineRealtimeConversationTarget,
} from "../shared/events";
import {
	type GenerationRuntimeInput,
	runGenerationRuntime,
} from "../shared/generation";
import { maybeCreateImmediateClarificationFromSearchGap } from "../shared/knowledge-gap/post-generation-immediate-clarification";
import type { ToolTracePayloadMode } from "../shared/tools/contracts";
import { logGenerationUsageTimeline } from "../shared/usage/timeline";
import type {
	PrimaryPipelineContext,
	PrimaryPipelineResult,
} from "./contracts";
import { emitPipelineSeenSafe } from "./internal/seen";
import { resolveTracePayloadMode } from "./internal/trace";
import {
	createPrimaryTypingControls,
	type PrimaryTypingControls,
} from "./internal/typing";
import { trackPrimaryGenerationUsage } from "./internal/usage";
import { createScopeBoundaryRedirect } from "./scope-boundary-responder";
import type { DecisionResult } from "./steps/decision";
import { runDecisionStep } from "./steps/decision";
import { runIntakeStep } from "./steps/intake";
import type { IntakeReadyContext } from "./steps/intake/types";
import { buildPrimaryPipelineResult } from "./utils/pipeline-result";
import { createStageMetrics, measureStage } from "./utils/stage-metrics";

function buildGenerationRuntimeInput(params: {
	ctx: PrimaryPipelineContext;
	intake: IntakeReadyContext;
	decision: DecisionResult;
	typingControls: PrimaryTypingControls;
	debugLogger: ReturnType<typeof createPipelineDevConversationLog>;
	deepTraceEnabled: boolean;
	tracePayloadMode: ToolTracePayloadMode;
}): GenerationRuntimeInput {
	const { ctx, intake, decision, typingControls } = params;
	const trigger = intake.triggerMessage;

	return {
		db: ctx.db,
		pipelineKind: "primary",
		mode: decision.mode,
		aiAgent: intake.aiAgent,
		conversation: intake.conversation,
		websiteDefaultLanguage: intake.websiteDefaultLanguage,
		visitorLanguage: intake.visitorLanguage,
		autoTranslateEnabled: intake.autoTranslateEnabled,
		generationEntries: intake.generationEntries,
		visitorContext: intake.visitorContext,
		conversationState: intake.conversationState,
		humanCommand: decision.humanCommand,
		workflowRunId: ctx.input.workflowRunId,
		triggerMessageId: ctx.input.messageId,
		triggerMessageText: intake.triggerMessageText,
		triggerMessageCreatedAt: ctx.input.messageCreatedAt,
		triggerSenderType: trigger?.senderType,
		triggerVisibility: trigger?.visibility,
		hasLaterHumanMessage: intake.hasLaterHumanMessage,
		hasLaterAiMessage: intake.hasLaterAiMessage,
		allowPublicMessages: decision.mode !== "background_only",
		stopTyping: typingControls.stopTyping,
		debugLogger: params.debugLogger,
		deepTraceEnabled: params.deepTraceEnabled,
		tracePayloadMode: params.tracePayloadMode,
		openRouterByokRetry: ctx.input.openRouterByokRetry,
	};
}

function countRecordedToolCalls(
	counts: Record<string, number> | undefined
): number {
	if (!counts) {
		return 0;
	}

	return Object.values(counts).reduce((sum, value) => {
		if (!Number.isFinite(value) || value <= 0) {
			return sum;
		}
		return sum + Math.floor(value);
	}, 0);
}

async function logAiCreditGuardBlockedTimeline(params: {
	ctx: PrimaryPipelineContext;
	intake: IntakeReadyContext;
	blockedReason: string;
	reason: string;
	minimumCharge: AiCreditGuardResult["minimumCharge"];
	balance: number | null;
	mode: AiCreditGuardResult["mode"];
}): Promise<void> {
	try {
		await logGenerationUsageTimeline({
			db: params.ctx.db,
			organizationId: params.ctx.input.organizationId,
			websiteId: params.ctx.input.websiteId,
			conversationId: params.ctx.input.conversationId,
			visitorId: params.ctx.input.visitorId,
			aiAgentId: params.intake.aiAgent.id,
			payload: {
				usageEventId: params.ctx.input.workflowRunId,
				workflowRunId: params.ctx.input.workflowRunId,
				triggerMessageId: params.ctx.input.messageId,
				triggerVisibility: params.intake.triggerMessage?.visibility,
				modelId: params.intake.modelResolution.modelIdResolved,
				modelIdOriginal: params.intake.modelResolution.modelIdOriginal,
				modelMigrationApplied:
					params.intake.modelResolution.modelMigrationApplied,
				inputTokens: 0,
				outputTokens: 0,
				totalTokens: 0,
				tokenSource: "provider",
				baseCredits: params.minimumCharge.baseCredits,
				modelCredits: params.minimumCharge.modelCredits,
				thinkingCredits: params.minimumCharge.thinkingCredits,
				toolCredits: params.minimumCharge.toolCredits,
				totalCredits: params.minimumCharge.totalCredits,
				billableToolCount: params.minimumCharge.billableToolCount,
				excludedToolCount: params.minimumCharge.excludedToolCount,
				totalToolCount: params.minimumCharge.totalToolCount,
				mode: params.mode,
				ingestStatus: "skipped",
				balanceBefore: params.balance,
				balanceAfterEstimate: params.balance,
				blockedReason: params.blockedReason,
				source: "primary_pipeline",
				phase: "primary_generation",
			},
		});
	} catch (error) {
		logAiPipeline({
			area: "primary",
			event: "credit_guard_timeline_failed",
			level: "warn",
			conversationId: params.ctx.input.conversationId,
			fields: {
				reason: params.reason,
			},
			error,
		});
	}
}

async function runScopeBoundaryRedirect(params: {
	ctx: PrimaryPipelineContext;
	intake: IntakeReadyContext;
	decision: DecisionResult;
}): Promise<
	| {
			status: "completed";
			reason: string;
			publicMessagesSent: number;
	  }
	| {
			status: "skipped";
			reason: string;
			publicMessagesSent: number;
	  }
> {
	const redirect = await createScopeBoundaryRedirect({
		db: params.ctx.db,
		organizationId: params.ctx.input.organizationId,
		websiteId: params.ctx.input.websiteId,
		conversationId: params.ctx.input.conversationId,
		triggerText: params.intake.triggerMessageText ?? "",
		visitorLanguage: params.intake.visitorLanguage ?? null,
		websiteDefaultLanguage: params.intake.websiteDefaultLanguage ?? "en",
	});

	if (redirect.status === "skipped") {
		return {
			status: "skipped",
			reason: redirect.reason,
			publicMessagesSent: 0,
		};
	}

	const sendResult = await sendPublicMessage({
		db: params.ctx.db,
		conversationId: params.ctx.input.conversationId,
		organizationId: params.ctx.input.organizationId,
		websiteId: params.ctx.input.websiteId,
		visitorId: params.ctx.input.visitorId,
		aiAgentId: params.intake.aiAgent.id,
		text: redirect.message,
		idempotencyKey: `public:${params.ctx.input.messageId}:scopeBoundary`,
	});

	if (sendResult.paused) {
		return {
			status: "skipped",
			reason: "AI is paused for this conversation",
			publicMessagesSent: 0,
		};
	}

	return {
		status: "completed",
		reason: params.decision.reason,
		publicMessagesSent: sendResult.created ? 1 : 0,
	};
}

export async function runPrimaryPipeline(
	ctx: PrimaryPipelineContext
): Promise<PrimaryPipelineResult> {
	const pipelineStartedAt = Date.now();
	const metrics = createStageMetrics();
	const conversationLog = createPipelineDevConversationLog(
		ctx.input.conversationId
	);
	const deepTraceEnabled = env.AI_AGENT_DEEP_TRACE_ENABLED === true;
	const tracePayloadMode = resolveTracePayloadMode(
		env.AI_AGENT_TRACE_PAYLOAD_MODE
	);

	logAiPipeline({
		area: "primary",
		event: "start",
		conversationId: ctx.input.conversationId,
		fields: {
			trigger: ctx.input.messageId,
			workflowRunId: ctx.input.workflowRunId,
			jobId: ctx.input.jobId,
		},
	});
	conversationLog.log(
		`[ai-pipeline:primary] conv=${ctx.input.conversationId} workflowRunId=${ctx.input.workflowRunId} evt=start trigger=${ctx.input.messageId}`
	);

	const completionConversation: PipelineRealtimeConversationTarget = {
		id: ctx.input.conversationId,
		websiteId: ctx.input.websiteId,
		organizationId: ctx.input.organizationId,
		visitorId: ctx.input.visitorId,
	};

	const emitProcessingCompletedSafe = async (params: {
		conversation?: PipelineRealtimeConversationTarget;
		aiAgentId?: string;
		status: "success" | "skipped" | "error";
		action?: string | null;
		reason?: string | null;
		audience?: "all" | "dashboard";
	}) => {
		await emitPipelineProcessingCompletedSafely({
			conversation: params.conversation ?? completionConversation,
			aiAgentId: params.aiAgentId ?? ctx.input.aiAgentId,
			workflowRunId: ctx.input.workflowRunId,
			status: params.status,
			action: params.action,
			reason: params.reason,
			audience: params.audience ?? "all",
			pipelineArea: "primary",
			logConversationId: ctx.input.conversationId,
		});
	};

	try {
		const intakeResult = await measureStage(metrics, "intakeMs", () =>
			runIntakeStep({
				db: ctx.db,
				input: ctx.input,
			})
		);

		if (intakeResult.status !== "ready") {
			const retryable = intakeResult.cursorDisposition === "retry";
			logAiPipeline({
				area: "primary",
				event: retryable ? "intake_retry" : "skip",
				level: retryable ? "warn" : undefined,
				conversationId: ctx.input.conversationId,
				fields: {
					stage: "intake",
					reason: intakeResult.reason,
				},
			});

			if (retryable) {
				await emitProcessingCompletedSafe({
					status: "error",
					reason: intakeResult.reason,
				});
				return buildPrimaryPipelineResult({
					status: "error",
					metrics,
					pipelineStartedAt,
					cursorDisposition: intakeResult.cursorDisposition,
					error: intakeResult.reason,
					retryable: true,
					action: "intake_skipped",
				});
			}

			await emitProcessingCompletedSafe({
				status: "skipped",
				reason: intakeResult.reason,
			});
			return buildPrimaryPipelineResult({
				status: "skipped",
				metrics,
				pipelineStartedAt,
				cursorDisposition: intakeResult.cursorDisposition,
				reason: intakeResult.reason,
				action: "intake_skipped",
			});
		}

		await emitPipelineSeenSafe({
			db: ctx.db,
			conversation: intakeResult.data.conversation,
			aiAgentId: intakeResult.data.aiAgent.id,
			conversationId: ctx.input.conversationId,
		});

		const decisionResult = await measureStage(metrics, "decisionMs", () =>
			runDecisionStep({
				db: ctx.db,
				input: {
					aiAgent: intakeResult.data.aiAgent,
					conversation: intakeResult.data.conversation,
					decisionMessages: intakeResult.data.decisionMessages,
					conversationState: intakeResult.data.conversationState,
					triggerMessage: intakeResult.data.triggerMessage,
					triggerMessageText: intakeResult.data.triggerMessageText,
					hasLaterHumanMessage: intakeResult.data.hasLaterHumanMessage,
					hasLaterAiMessage: intakeResult.data.hasLaterAiMessage,
				},
			})
		);

		if (!decisionResult.shouldAct) {
			logAiPipeline({
				area: "primary",
				event: "skip",
				conversationId: ctx.input.conversationId,
				fields: {
					stage: "decision",
					mode: decisionResult.mode,
					reason: decisionResult.reason,
				},
			});

			await emitProcessingCompletedSafe({
				conversation: intakeResult.data.conversation,
				aiAgentId: intakeResult.data.aiAgent.id,
				status: "skipped",
				reason: decisionResult.reason,
			});
			return buildPrimaryPipelineResult({
				status: "skipped",
				metrics,
				pipelineStartedAt,
				reason: decisionResult.reason,
				action: "decision_skipped",
			});
		}

		if (decisionResult.decisionOutcome === "scope_boundary_redirect") {
			const redirectResult = await measureStage(metrics, "generationMs", () =>
				runScopeBoundaryRedirect({
					ctx,
					intake: intakeResult.data,
					decision: decisionResult,
				})
			);

			logAiPipeline({
				area: "primary",
				event:
					redirectResult.status === "completed"
						? "scope_boundary_redirect"
						: "skip",
				conversationId: ctx.input.conversationId,
				fields: {
					stage: "decision",
					reason: redirectResult.reason,
					ruleId: decisionResult.scopeBoundaryRuleId,
					publicMessages: redirectResult.publicMessagesSent,
				},
			});

			await emitProcessingCompletedSafe({
				conversation: intakeResult.data.conversation,
				aiAgentId: intakeResult.data.aiAgent.id,
				status: redirectResult.status === "completed" ? "success" : "skipped",
				action:
					redirectResult.status === "completed"
						? "scope_boundary_redirect"
						: "scope_boundary_skipped",
				reason: redirectResult.reason,
			});

			return buildPrimaryPipelineResult({
				status: redirectResult.status,
				metrics,
				pipelineStartedAt,
				action:
					redirectResult.status === "completed"
						? "scope_boundary_redirect"
						: "scope_boundary_skipped",
				reason: redirectResult.reason,
				publicMessagesSent: redirectResult.publicMessagesSent,
			});
		}

		const allowPublicMessages = decisionResult.mode !== "background_only";
		const typingControls = createPrimaryTypingControls({
			allowPublicMessages,
			conversation: intakeResult.data.conversation,
			aiAgentId: intakeResult.data.aiAgent.id,
			conversationId: ctx.input.conversationId,
		});

		const generationResult = await (async () => {
			try {
				await typingControls.startSafely();
				return await measureStage(metrics, "generationMs", () =>
					runGenerationRuntime(
						buildGenerationRuntimeInput({
							ctx,
							intake: intakeResult.data,
							decision: decisionResult,
							typingControls,
							debugLogger: conversationLog,
							deepTraceEnabled,
							tracePayloadMode,
						})
					)
				);
			} finally {
				await typingControls.stopSafely();
			}
		})();

		let usageTelemetry:
			| {
					usageTokens: PrimaryPipelineResult["usageTokens"];
					creditUsage: PrimaryPipelineResult["creditUsage"];
			  }
			| undefined;

		if (generationResult.status === "blocked") {
			const creditGuardResult = generationResult.creditGuard;
			const reason =
				creditGuardResult?.reason ?? generationResult.action.reasoning;
			const blockedReason =
				creditGuardResult?.blockedReason ?? "ai_credit_guard_blocked";

			logAiPipeline({
				area: "primary",
				event: "credit_guard_blocked",
				level: "warn",
				conversationId: ctx.input.conversationId,
				fields: {
					stage: "credit_guard",
					reason,
					blockedReason,
					requiredCredits: creditGuardResult?.minimumCharge.totalCredits,
					balance: creditGuardResult?.balance,
				},
			});

			if (creditGuardResult) {
				await logAiCreditGuardBlockedTimeline({
					ctx,
					intake: intakeResult.data,
					blockedReason,
					reason,
					minimumCharge: creditGuardResult.minimumCharge,
					balance: creditGuardResult.balance,
					mode: creditGuardResult.mode,
				});
			}

			await emitProcessingCompletedSafe({
				conversation: intakeResult.data.conversation,
				aiAgentId: intakeResult.data.aiAgent.id,
				status: "skipped",
				reason,
				audience: allowPublicMessages ? "all" : "dashboard",
			});
			return buildPrimaryPipelineResult({
				status: "skipped",
				metrics,
				pipelineStartedAt,
				reason,
				action: "ai_credit_guard_blocked",
				cursorDisposition: "advance",
				publicMessagesSent: generationResult.publicMessagesSent,
			});
		}

		usageTelemetry = await trackPrimaryGenerationUsage({
			db: ctx.db,
			organizationId: ctx.input.organizationId,
			websiteId: ctx.input.websiteId,
			conversationId: ctx.input.conversationId,
			visitorId: ctx.input.visitorId,
			workflowRunId: ctx.input.workflowRunId,
			triggerMessageId: ctx.input.messageId,
			intake: intakeResult.data,
			generationResult,
			mode: generationResult.creditGuardMode ?? "normal",
		});

		let immediateClarificationResult:
			| Awaited<
					ReturnType<typeof maybeCreateImmediateClarificationFromSearchGap>
			  >
			| undefined;

		if (generationResult.status === "completed") {
			try {
				immediateClarificationResult =
					await maybeCreateImmediateClarificationFromSearchGap({
						db: ctx.db,
						intake: intakeResult.data,
						generationResult,
					});

				if (immediateClarificationResult.status === "created") {
					logAiPipeline({
						area: "primary",
						event: "knowledge_gap_clarification_created",
						conversationId: ctx.input.conversationId,
						fields: {
							stage: "post_generation",
							requestId: immediateClarificationResult.requestId,
							created: immediateClarificationResult.created,
							topicSummary: immediateClarificationResult.topicSummary,
						},
					});
				}
			} catch (error) {
				logAiPipeline({
					area: "primary",
					event: "knowledge_gap_clarification_failed",
					level: "warn",
					conversationId: ctx.input.conversationId,
					fields: {
						stage: "post_generation",
					},
					error,
				});
			}
		}

		if (generationResult.status === "error") {
			const errorMessage =
				generationResult.error ?? "Generation step failed unexpectedly";
			const durableMutationCount = countRecordedToolCalls(
				generationResult.mutationToolCallsByName
			);
			const retryable =
				generationResult.publicMessagesSent === 0 && durableMutationCount === 0;
			logAiPipeline({
				area: "primary",
				event: "generation_error",
				level: "error",
				conversationId: ctx.input.conversationId,
				fields: {
					stage: "generation",
					retryable,
					durableMutations: durableMutationCount,
					failureCode: generationResult.failureCode,
					attempts: generationResult.attempts?.length,
					message: errorMessage,
				},
			});

			await emitProcessingCompletedSafe({
				conversation: intakeResult.data.conversation,
				aiAgentId: intakeResult.data.aiAgent.id,
				status: "error",
				reason: errorMessage,
				audience: allowPublicMessages ? "all" : "dashboard",
			});
			return buildPrimaryPipelineResult({
				status: "error",
				metrics,
				pipelineStartedAt,
				error: errorMessage,
				retryable,
				cursorDisposition: retryable ? "retry" : "advance",
				action: "generation_error",
				publicMessagesSent: generationResult.publicMessagesSent,
				usageTokens: usageTelemetry?.usageTokens,
				creditUsage: usageTelemetry?.creditUsage,
				openRouterByokRetry: generationResult.openRouterByokRetry,
			});
		}

		if (generationResult.action.action === "skip") {
			logAiPipeline({
				area: "primary",
				event: "skip",
				conversationId: ctx.input.conversationId,
				fields: {
					stage: "generation",
					reason: generationResult.action.reasoning,
				},
			});

			await emitProcessingCompletedSafe({
				conversation: intakeResult.data.conversation,
				aiAgentId: intakeResult.data.aiAgent.id,
				status: "skipped",
				action: generationResult.action.action,
				reason: generationResult.action.reasoning,
				audience: allowPublicMessages ? "all" : "dashboard",
			});
			return buildPrimaryPipelineResult({
				status: "skipped",
				metrics,
				pipelineStartedAt,
				reason: generationResult.action.reasoning,
				action: "skip",
				publicMessagesSent: generationResult.publicMessagesSent,
				usageTokens: usageTelemetry?.usageTokens,
				creditUsage: usageTelemetry?.creditUsage,
			});
		}

		logAiPipeline({
			area: "primary",
			event: "completed",
			conversationId: ctx.input.conversationId,
			fields: {
				stage: "generation",
				action: generationResult.action.action,
				publicMessages: generationResult.publicMessagesSent,
			},
		});

		await emitProcessingCompletedSafe({
			conversation: intakeResult.data.conversation,
			aiAgentId: intakeResult.data.aiAgent.id,
			status: "success",
			action: generationResult.action.action,
			reason: generationResult.action.reasoning,
			audience: allowPublicMessages ? "all" : "dashboard",
		});
		return buildPrimaryPipelineResult({
			status: "completed",
			metrics,
			pipelineStartedAt,
			action: generationResult.action.action,
			reason: generationResult.action.reasoning,
			publicMessagesSent: generationResult.publicMessagesSent,
			usageTokens: usageTelemetry?.usageTokens,
			creditUsage: usageTelemetry?.creditUsage,
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown pipeline error";

		logAiPipeline({
			area: "primary",
			event: "error",
			level: "error",
			conversationId: ctx.input.conversationId,
			fields: {
				message,
			},
			error,
		});

		await emitProcessingCompletedSafe({
			status: "error",
			reason: message,
		});
		return buildPrimaryPipelineResult({
			status: "error",
			metrics,
			pipelineStartedAt,
			error: message,
			retryable: true,
			cursorDisposition: "retry",
			action: "primary_error",
		});
	} finally {
		if (deepTraceEnabled) {
			conversationLog.log(
				`[ai-pipeline:primary] conv=${ctx.input.conversationId} workflowRunId=${ctx.input.workflowRunId} evt=end durationMs=${Date.now() - pipelineStartedAt}`
			);
		}
		await conversationLog.flush();
	}
}
