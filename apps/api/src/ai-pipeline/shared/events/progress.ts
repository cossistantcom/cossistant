import { realtime } from "@api/realtime/emitter";
import { getWidgetToolDefaultProgressMessage } from "@plasma/types";
import { logAiPipeline } from "../../logger";

export type PipelineToolProgressAudience = "all" | "dashboard";
export type PipelineProcessingCompletedStatus =
	| "success"
	| "skipped"
	| "cancelled"
	| "error";

export type PipelineRealtimeConversationTarget = {
	id: string;
	websiteId: string;
	organizationId: string;
	visitorId: string | null;
};

type ToolProgressParams = {
	conversation: PipelineRealtimeConversationTarget;
	aiAgentId: string;
	workflowRunId: string;
	toolCallId: string;
	toolName: string;
	state: "partial" | "result" | "error";
	progressMessage?: string | null;
	audience?: PipelineToolProgressAudience;
};

function getDefaultToolMessage(toolName: string): string | null {
	return getWidgetToolDefaultProgressMessage(toolName);
}

export async function emitPipelineToolProgress(
	params: ToolProgressParams
): Promise<void> {
	const message =
		params.progressMessage ??
		(params.state === "partial"
			? getDefaultToolMessage(params.toolName)
			: null);

	await realtime.emit("aiAgentProcessingProgress", {
		websiteId: params.conversation.websiteId,
		organizationId: params.conversation.organizationId,
		visitorId: params.conversation.visitorId,
		userId: null,
		conversationId: params.conversation.id,
		aiAgentId: params.aiAgentId,
		workflowRunId: params.workflowRunId,
		phase: "tool",
		message,
		tool: {
			toolCallId: params.toolCallId,
			toolName: params.toolName,
			state: params.state,
		},
		audience: params.audience ?? "all",
	});
}

type GenerationPhaseParams = {
	conversation: PipelineRealtimeConversationTarget;
	aiAgentId: string;
	workflowRunId: string;
	phase: "thinking" | "generating" | "finalizing";
	message?: string | null;
	audience?: PipelineToolProgressAudience;
};

export async function emitPipelineGenerationProgress(
	params: GenerationPhaseParams
): Promise<void> {
	await realtime.emit("aiAgentProcessingProgress", {
		websiteId: params.conversation.websiteId,
		organizationId: params.conversation.organizationId,
		visitorId: params.conversation.visitorId,
		userId: null,
		conversationId: params.conversation.id,
		aiAgentId: params.aiAgentId,
		workflowRunId: params.workflowRunId,
		phase: params.phase,
		message: params.message ?? null,
		audience: params.audience ?? "dashboard",
	});
}

type CompletionParams = {
	conversation: PipelineRealtimeConversationTarget;
	aiAgentId: string;
	workflowRunId: string;
	status: PipelineProcessingCompletedStatus;
	action?: string | null;
	reason?: string | null;
	audience?: PipelineToolProgressAudience;
};

export async function emitPipelineProcessingCompleted(
	params: CompletionParams
): Promise<void> {
	await realtime.emit("aiAgentProcessingCompleted", {
		websiteId: params.conversation.websiteId,
		organizationId: params.conversation.organizationId,
		visitorId: params.conversation.visitorId,
		userId: null,
		conversationId: params.conversation.id,
		aiAgentId: params.aiAgentId,
		workflowRunId: params.workflowRunId,
		status: params.status,
		action: params.action ?? null,
		reason: params.reason ?? null,
		audience: params.audience ?? "all",
	});
}

export async function emitPipelineProcessingCompletedSafely(params: {
	conversation: PipelineRealtimeConversationTarget;
	aiAgentId: string;
	workflowRunId: string;
	status: PipelineProcessingCompletedStatus;
	action?: string | null;
	reason?: string | null;
	audience?: PipelineToolProgressAudience;
	pipelineArea: "primary" | "background";
	logConversationId?: string;
}): Promise<void> {
	try {
		await emitPipelineProcessingCompleted(params);
	} catch (error) {
		logAiPipeline({
			area: params.pipelineArea,
			event: "processing_completed_emit_failed",
			level: "warn",
			conversationId: params.logConversationId ?? params.conversation.id,
			fields: {
				status: params.status,
			},
			error,
		});
	}
}
