import type { Database } from "@api/db";
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
import type { GenerationRuntimeInput } from "../contracts";

export const AI_THINKING_TRACE_TOOL_NAME = "aiThinkingTrace";
const MAX_REASONING_TEXT_LENGTH = 4000;

type TokenUsage = {
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
	reasoningTokens?: number;
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

function redactSensitiveText(value: string): string {
	return value
		.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
		.replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "sk-[redacted]")
		.replace(
			/\b(api[_-]?key|token|password|secret)\b\s*[:=]\s*["']?[^"'\s,}]+["']?/gi,
			"$1: [redacted]"
		);
}

export function sanitizeReasoningText(value: string | null): string | null {
	if (!value) {
		return null;
	}

	const redacted = redactSensitiveText(value.trim());
	if (redacted.length === 0) {
		return null;
	}

	if (redacted.length <= MAX_REASONING_TEXT_LENGTH) {
		return redacted;
	}

	return `${redacted.slice(0, MAX_REASONING_TEXT_LENGTH).trimEnd()}\n... [truncated]`;
}

function getTimelineItemId(params: {
	workflowRunId: string;
	attempt: number;
}): string {
	return generateIdempotentULID(
		`tool:${params.workflowRunId}:ai-thinking-trace:${params.attempt}`
	);
}

function buildProviderMetadata(params: {
	workflowRunId: string;
	triggerMessageId: string;
	triggerVisibility?: "public" | "private";
}) {
	return {
		cossistant: {
			visibility: TimelineItemVisibility.PRIVATE,
			toolTimeline: {
				logType: getToolLogType(AI_THINKING_TRACE_TOOL_NAME),
				triggerMessageId: params.triggerMessageId,
				workflowRunId: params.workflowRunId,
				...(params.triggerVisibility
					? { triggerVisibility: params.triggerVisibility }
					: {}),
			},
		},
	};
}

function buildTimelineParts(params: {
	workflowRunId: string;
	triggerMessageId: string;
	triggerVisibility?: "public" | "private";
	modelId: string;
	attempt: number;
	thinkingCredits: number;
	reasoningMaxTokens: number | null;
	captureStatus: "captured" | "not_returned";
	reasoningText: string | null;
	usage: TokenUsage | undefined;
}) {
	const providerMetadata = buildProviderMetadata({
		workflowRunId: params.workflowRunId,
		triggerMessageId: params.triggerMessageId,
		triggerVisibility: params.triggerVisibility,
	});
	const output = {
		modelId: params.modelId,
		workflowRunId: params.workflowRunId,
		attempt: params.attempt,
		thinkingCredits: params.thinkingCredits,
		reasoningMaxTokens: params.reasoningMaxTokens,
		captureStatus: params.captureStatus,
		tokens: {
			inputTokens: params.usage?.inputTokens ?? null,
			outputTokens: params.usage?.outputTokens ?? null,
			totalTokens: params.usage?.totalTokens ?? null,
			reasoningTokens: params.usage?.reasoningTokens ?? null,
		},
		reasoningText: params.reasoningText,
	};
	const toolPart = {
		type: `tool-${AI_THINKING_TRACE_TOOL_NAME}`,
		toolCallId: `ai-thinking-trace-${params.attempt}`,
		toolName: AI_THINKING_TRACE_TOOL_NAME,
		state: "result",
		input: {
			modelId: params.modelId,
			attempt: params.attempt,
			reasoningMaxTokens: params.reasoningMaxTokens,
		},
		output,
		callProviderMetadata: providerMetadata,
		providerMetadata,
	};

	if (!params.reasoningText) {
		return [toolPart];
	}

	return [
		toolPart,
		{
			type: "reasoning",
			text: params.reasoningText,
			state: "done",
			providerMetadata,
		},
	];
}

export async function logAiThinkingTraceTimeline(params: {
	db: Database;
	input: GenerationRuntimeInput;
	modelId: string;
	attempt: number;
	thinkingCredits: number;
	reasoningMaxTokens: number | null;
	reasoningText: string | null;
	usage: TokenUsage | undefined;
}): Promise<void> {
	const reasoningText = sanitizeReasoningText(params.reasoningText);
	const captureStatus = reasoningText ? "captured" : "not_returned";
	const text =
		captureStatus === "captured"
			? "AI thinking trace captured"
			: "AI thinking was enabled, but the provider did not return reasoning text";
	const itemId = getTimelineItemId({
		workflowRunId: params.input.workflowRunId,
		attempt: params.attempt,
	});
	const parts = buildTimelineParts({
		workflowRunId: params.input.workflowRunId,
		triggerMessageId: params.input.triggerMessageId,
		triggerVisibility: params.input.triggerVisibility,
		modelId: params.modelId,
		attempt: params.attempt,
		thinkingCredits: params.thinkingCredits,
		reasoningMaxTokens: params.reasoningMaxTokens,
		captureStatus,
		reasoningText,
		usage: params.usage,
	});

	try {
		await createTimelineItem({
			db: params.db,
			organizationId: params.input.conversation.organizationId,
			websiteId: params.input.conversation.websiteId,
			conversationId: params.input.conversation.id,
			conversationOwnerVisitorId: params.input.conversation.visitorId,
			item: {
				id: itemId,
				type: ConversationTimelineType.TOOL,
				text,
				parts,
				aiAgentId: params.input.aiAgent.id,
				visitorId: params.input.conversation.visitorId,
				visibility: TimelineItemVisibility.PRIVATE,
				tool: AI_THINKING_TRACE_TOOL_NAME,
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
		organizationId: params.input.conversation.organizationId,
		websiteId: params.input.conversation.websiteId,
		conversationId: params.input.conversation.id,
		conversationOwnerVisitorId: params.input.conversation.visitorId,
		itemId,
		item: {
			text,
			parts,
			tool: AI_THINKING_TRACE_TOOL_NAME,
		},
	});
}
