import { generateIdempotentULID } from "@api/utils/db/ids";
import {
	createTimelineItem,
	updateTimelineItem,
} from "@api/utils/timeline-item";
import {
	ConversationTimelineType,
	getToolLogType,
	isWidgetTimelineTool,
	TimelineItemVisibility,
	type ToolTimelineLogType,
} from "@plasma/types";
import type { PipelineToolContext, ToolTelemetrySpec } from "../contracts";
import { emitStructuredToolLog } from "./logging";
import { buildToolSummaryText } from "./text";

type ToolTimelineContext = Pick<
	PipelineToolContext,
	| "db"
	| "conversation"
	| "conversationId"
	| "organizationId"
	| "websiteId"
	| "visitorId"
	| "aiAgentId"
	| "triggerMessageId"
	| "workflowRunId"
	| "triggerVisibility"
>;

function getToolTimelineVisibility(toolName: string): TimelineItemVisibility {
	return isWidgetTimelineTool(toolName)
		? TimelineItemVisibility.PUBLIC
		: TimelineItemVisibility.PRIVATE;
}

function getToolTimelineProviderMetadata(params: {
	toolContext: ToolTimelineContext;
	toolName: string;
}): {
	cossistant: {
		visibility: TimelineItemVisibility;
		toolTimeline: {
			logType: ToolTimelineLogType;
			triggerMessageId: string;
			workflowRunId: string;
			triggerVisibility?: "public" | "private";
		};
	};
} {
	const { toolContext, toolName } = params;
	const visibility = getToolTimelineVisibility(toolName);
	const logType = getToolLogType(toolName);

	return {
		cossistant: {
			visibility,
			toolTimeline: {
				logType,
				triggerMessageId: toolContext.triggerMessageId,
				workflowRunId: toolContext.workflowRunId,
				...(toolContext.triggerVisibility
					? { triggerVisibility: toolContext.triggerVisibility }
					: {}),
			},
		},
	};
}

export function createToolTimelineItemId(params: {
	workflowRunId: string;
	toolCallId: string;
}): string {
	return generateIdempotentULID(
		`tool:${params.workflowRunId}:${params.toolCallId}`
	);
}

function buildToolPart(params: {
	toolContext: ToolTimelineContext;
	toolName: string;
	toolCallId: string;
	state: "partial" | "result" | "error";
	input: Record<string, unknown>;
	output?: unknown;
	errorText?: string;
}): Record<string, unknown> {
	const providerMetadata = getToolTimelineProviderMetadata({
		toolContext: params.toolContext,
		toolName: params.toolName,
	});

	return {
		type: `tool-${params.toolName}`,
		toolCallId: params.toolCallId,
		toolName: params.toolName,
		state: params.state,
		input: params.input,
		callProviderMetadata: providerMetadata,
		providerMetadata,
		...(params.output === undefined ? {} : { output: params.output }),
		...(params.errorText ? { errorText: params.errorText } : {}),
	};
}

function isUniqueViolationError(error: unknown): boolean {
	if (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		typeof error.code === "string"
	) {
		return error.code === "23505";
	}

	if (typeof error === "object" && error !== null && "cause" in error) {
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

	return false;
}

export async function safeCreatePartialToolTimelineItem(params: {
	context: PipelineToolContext;
	toolName: string;
	telemetry: ToolTelemetrySpec;
	toolCallId: string;
	timelineItemId: string;
	sanitizedInput: Record<string, unknown>;
	onUniqueViolation: () => Promise<void>;
}): Promise<void> {
	const {
		context,
		toolName,
		telemetry,
		toolCallId,
		timelineItemId,
		sanitizedInput,
		onUniqueViolation,
	} = params;

	const summaryText = buildToolSummaryText({
		telemetry,
		toolName,
		state: "partial",
		input: sanitizedInput,
	});

	try {
		await createTimelineItem({
			db: context.db,
			organizationId: context.organizationId,
			websiteId: context.websiteId,
			conversationId: context.conversationId,
			conversationOwnerVisitorId: context.visitorId,
			item: {
				id: timelineItemId,
				type: ConversationTimelineType.TOOL,
				text: summaryText,
				parts: [
					buildToolPart({
						toolContext: context,
						toolName,
						toolCallId,
						state: "partial",
						input: sanitizedInput,
					}),
				],
				aiAgentId: context.aiAgentId,
				visitorId: context.visitorId,
				visibility: getToolTimelineVisibility(toolName),
				tool: toolName,
			},
		});
	} catch (error) {
		if (!isUniqueViolationError(error)) {
			emitStructuredToolLog(
				context,
				"warn",
				`[ai-pipeline:tool] conv=${context.conversationId} workflowRunId=${context.workflowRunId} tool=${toolName} evt=timeline_partial_create_failed`,
				error
			);
			return;
		}

		await onUniqueViolation();
	}
}

export async function safeUpdateToolTimelineItem(params: {
	context: PipelineToolContext;
	toolName: string;
	telemetry: ToolTelemetrySpec;
	toolCallId: string;
	timelineItemId: string;
	state: "partial" | "result" | "error";
	sanitizedInput: Record<string, unknown>;
	sanitizedOutput?: unknown;
	errorText?: string;
}): Promise<void> {
	const {
		context,
		toolName,
		telemetry,
		toolCallId,
		timelineItemId,
		state,
		sanitizedInput,
		sanitizedOutput,
		errorText,
	} = params;

	const summaryText = buildToolSummaryText({
		telemetry,
		toolName,
		state,
		input: sanitizedInput,
		output: sanitizedOutput,
		errorText,
	});

	try {
		await updateTimelineItem({
			db: context.db,
			organizationId: context.organizationId,
			websiteId: context.websiteId,
			conversationId: context.conversationId,
			conversationOwnerVisitorId: context.visitorId,
			itemId: timelineItemId,
			item: {
				text: summaryText,
				parts: [
					buildToolPart({
						toolContext: context,
						toolName,
						toolCallId,
						state,
						input: sanitizedInput,
						output: sanitizedOutput,
						errorText,
					}),
				],
				tool: toolName,
			},
		});
	} catch (error) {
		emitStructuredToolLog(
			context,
			"warn",
			`[ai-pipeline:tool] conv=${context.conversationId} workflowRunId=${context.workflowRunId} tool=${toolName} evt=timeline_update_failed`,
			error
		);
	}
}
