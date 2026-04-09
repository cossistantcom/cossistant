import { tool } from "ai";
import { z } from "zod";
import { escalate as escalateAction } from "../actions/escalate";
import { sendMessage as sendPublicMessage } from "../actions/send-message";
import { updateStatus } from "../actions/update-status";
import { normalizePublicReplyText } from "../reply-contract";
import type {
	PipelineToolContext,
	PipelineToolResult,
	ToolTelemetrySpec,
} from "./contracts";
import { setFinalAction, setToolError } from "./helpers";

const ESCALATION_REASSURANCE_MESSAGE =
	"I've asked a team member to join the conversation. They'll be with you shortly.";

const respondSchema = z.object({
	reasoning: z.string().min(1),
	confidence: z.number().min(0).max(1),
});

const escalateSchema = z.object({
	reason: z.string().min(1),
	urgency: z.enum(["normal", "high", "urgent"]).optional(),
	reasoning: z.string().min(1),
	confidence: z.number().min(0).max(1),
});

const resolveSchema = z.object({
	reasoning: z.string().min(1),
	confidence: z.number().min(0).max(1),
});

const markSpamSchema = z.object({
	reasoning: z.string().min(1),
	confidence: z.number().min(0).max(1),
});

const skipSchema = z.object({
	reasoning: z.string().min(1),
});

async function sendEscalationReassurance(
	ctx: PipelineToolContext
): Promise<void> {
	if (!ctx.allowPublicMessages) {
		return;
	}

	const slot = ctx.runtimeState.publicSendSequence + 1;

	if (ctx.stopTyping) {
		try {
			await ctx.stopTyping();
		} catch (error) {
			ctx.debugLogger?.warn(
				`[ai-pipeline:escalate] conv=${ctx.conversationId} workflowRunId=${ctx.workflowRunId} evt=typing_stop_failed`,
				error
			);
		}
	}

	try {
		const result = await sendPublicMessage({
			db: ctx.db,
			conversationId: ctx.conversationId,
			organizationId: ctx.organizationId,
			websiteId: ctx.websiteId,
			visitorId: ctx.visitorId,
			aiAgentId: ctx.aiAgentId,
			text: ESCALATION_REASSURANCE_MESSAGE,
			idempotencyKey: `public:${ctx.triggerMessageId}:escalate`,
			createdAt: new Date(Date.now() + slot),
		});

		if (result.paused) {
			ctx.debugLogger?.warn(
				`[ai-pipeline:escalate] conv=${ctx.conversationId} workflowRunId=${ctx.workflowRunId} evt=confirmation_skipped_paused`
			);
			return;
		}

		ctx.runtimeState.publicSendSequence = slot;

		if (
			result.messageId &&
			!ctx.runtimeState.sentPublicMessageIds.has(result.messageId)
		) {
			ctx.runtimeState.sentPublicMessageIds.add(result.messageId);
			ctx.runtimeState.publicMessagesSent += 1;
			ctx.runtimeState.publicReplyTexts ??= [];
			ctx.runtimeState.publicReplyTexts.push(
				normalizePublicReplyText(ESCALATION_REASSURANCE_MESSAGE)
			);
		}
	} catch (error) {
		ctx.debugLogger?.warn(
			`[ai-pipeline:escalate] conv=${ctx.conversationId} workflowRunId=${ctx.workflowRunId} evt=confirmation_send_failed`,
			error
		);
	}
}

export function createRespondTool(ctx: PipelineToolContext) {
	return tool({
		description: "Finish the run with a normal response outcome.",
		inputSchema: respondSchema,
		execute: async ({
			reasoning,
			confidence,
		}): Promise<PipelineToolResult<{ action: "respond" }>> => {
			setFinalAction(ctx, {
				action: "respond",
				reasoning,
				confidence,
			});
			return {
				success: true,
				data: { action: "respond" },
			};
		},
	});
}

export function createEscalateTool(ctx: PipelineToolContext) {
	return tool({
		description:
			"Escalate this conversation to human support and finish. This tool also reassures the visitor and creates the public handoff event automatically.",
		inputSchema: escalateSchema,
		execute: async ({
			reason,
			reasoning,
			confidence,
			urgency,
		}): Promise<
			PipelineToolResult<{
				action: "escalate" | "respond";
				changed: boolean;
			}>
		> => {
			if (ctx.isEscalated) {
				setFinalAction(ctx, {
					action: "respond",
					reasoning:
						"Conversation already escalated; converted escalate request into respond outcome.",
					confidence,
				});
				return {
					success: true,
					data: { action: "respond", changed: false },
				};
			}

			try {
				await escalateAction({
					db: ctx.db,
					conversation: ctx.conversation,
					organizationId: ctx.organizationId,
					websiteId: ctx.websiteId,
					aiAgentId: ctx.aiAgentId,
					aiAgentName: ctx.aiAgentName,
					reason,
					visitorMessage: null,
					visitorName: ctx.visitorName,
					urgency: urgency ?? "normal",
				});
				await sendEscalationReassurance(ctx);

				setFinalAction(ctx, {
					action: "escalate",
					reasoning,
					confidence,
					escalation: {
						reason,
						urgency: urgency ?? "normal",
					},
				});

				return {
					success: true,
					data: { action: "escalate", changed: true },
				};
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Failed to escalate";
				setToolError(ctx, {
					toolName: "escalate",
					error: message,
					fatal: true,
				});
				return {
					success: false,
					error: message,
				};
			}
		},
	});
}

export function createResolveTool(ctx: PipelineToolContext) {
	return tool({
		description: "Resolve the conversation and finish.",
		inputSchema: resolveSchema,
		execute: async ({
			reasoning,
			confidence,
		}): Promise<PipelineToolResult<{ action: "resolve" }>> => {
			try {
				await updateStatus({
					db: ctx.db,
					conversation: ctx.conversation,
					organizationId: ctx.organizationId,
					websiteId: ctx.websiteId,
					aiAgentId: ctx.aiAgentId,
					newStatus: "resolved",
				});

				setFinalAction(ctx, {
					action: "resolve",
					reasoning,
					confidence,
				});

				return {
					success: true,
					data: { action: "resolve" },
				};
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Failed to resolve";
				setToolError(ctx, {
					toolName: "resolve",
					error: message,
					fatal: true,
				});
				return {
					success: false,
					error: message,
				};
			}
		},
	});
}

export function createMarkSpamTool(ctx: PipelineToolContext) {
	return tool({
		description: "Mark the conversation as spam and finish.",
		inputSchema: markSpamSchema,
		execute: async ({
			reasoning,
			confidence,
		}): Promise<PipelineToolResult<{ action: "mark_spam" }>> => {
			try {
				await updateStatus({
					db: ctx.db,
					conversation: ctx.conversation,
					organizationId: ctx.organizationId,
					websiteId: ctx.websiteId,
					aiAgentId: ctx.aiAgentId,
					newStatus: "spam",
				});

				setFinalAction(ctx, {
					action: "mark_spam",
					reasoning,
					confidence,
				});

				return {
					success: true,
					data: { action: "mark_spam" },
				};
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Failed to mark spam";
				setToolError(ctx, {
					toolName: "markSpam",
					error: message,
					fatal: true,
				});
				return {
					success: false,
					error: message,
				};
			}
		},
	});
}

export function createSkipTool(ctx: PipelineToolContext) {
	return tool({
		description: "Finish the run without public response.",
		inputSchema: skipSchema,
		execute: async ({
			reasoning,
		}): Promise<PipelineToolResult<{ action: "skip" }>> => {
			setFinalAction(ctx, {
				action: "skip",
				reasoning,
				confidence: 1,
			});
			return {
				success: true,
				data: { action: "skip" },
			};
		},
	});
}

export const RESPOND_TELEMETRY: ToolTelemetrySpec = {
	summary: {
		partial: "Finalizing response...",
		result: "Response action captured",
		error: "Failed to finalize response action",
	},
	progress: {
		partial: "Finalizing response...",
		result: "Response finalized",
		error: "Failed to finalize response",
		audience: "all",
	},
};

export const ESCALATE_TELEMETRY: ToolTelemetrySpec = {
	summary: {
		partial: "Escalating conversation...",
		result: "Conversation escalated",
		error: "Failed to escalate conversation",
	},
	progress: {
		partial: "Escalating to human support...",
		result: "Escalation completed",
		error: "Escalation failed",
		audience: "all",
	},
};

export const RESOLVE_TELEMETRY: ToolTelemetrySpec = {
	summary: {
		partial: "Resolving conversation...",
		result: "Conversation resolved",
		error: "Failed to resolve conversation",
	},
	progress: {
		partial: "Resolving conversation...",
		result: "Conversation resolved",
		error: "Resolve failed",
		audience: "all",
	},
};

export const MARK_SPAM_TELEMETRY: ToolTelemetrySpec = {
	summary: {
		partial: "Marking conversation as spam...",
		result: "Conversation marked as spam",
		error: "Failed to mark spam",
	},
	progress: {
		partial: "Marking as spam...",
		result: "Conversation marked as spam",
		error: "Spam action failed",
		audience: "dashboard",
	},
};

export const SKIP_TELEMETRY: ToolTelemetrySpec = {
	summary: {
		partial: "Skipping response...",
		result: "Skipped response",
		error: "Failed to skip response",
	},
	progress: {
		partial: "Skipping response...",
		result: "Response skipped",
		error: "Skip failed",
		audience: "dashboard",
	},
};
