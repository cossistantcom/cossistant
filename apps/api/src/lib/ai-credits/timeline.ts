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
import type { IngestAiCreditUsageStatus } from "./polar-meter";

export const AI_CREDIT_TIMELINE_TOOL_NAME = "aiCreditUsage";

export type AiCreditTimelinePayload = {
	baseCredits: number;
	modelCredits: number;
	thinkingCredits?: number;
	toolCredits: number;
	totalCredits: number;
	billableToolCount: number;
	excludedToolCount: number;
	modelId: string;
	modelIdOriginal?: string;
	modelMigrationApplied?: boolean;
	balanceBefore: number | null;
	balanceAfterEstimate: number | null;
	mode: "normal" | "outage";
	blockedReason?: string;
	ingestStatus?: IngestAiCreditUsageStatus | "skipped";
};

function isUniqueViolationError(error: unknown): boolean {
	if (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		typeof error.code === "string"
	) {
		return error.code === "23505";
	}

	return false;
}

function buildTimelineText(payload: AiCreditTimelinePayload): string {
	if (payload.blockedReason) {
		return `AI credits blocked (${payload.blockedReason})`;
	}

	return `AI credits charged ${payload.totalCredits} (base ${payload.baseCredits}, model ${payload.modelCredits}, thinking ${payload.thinkingCredits ?? 0}, tools ${payload.toolCredits})`;
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
				logType: getToolLogType(AI_CREDIT_TIMELINE_TOOL_NAME),
				triggerMessageId: params.triggerMessageId,
				workflowRunId: params.workflowRunId,
				...(params.triggerVisibility
					? { triggerVisibility: params.triggerVisibility }
					: {}),
			},
		},
	};
}

function buildToolPart(params: {
	workflowRunId: string;
	triggerMessageId: string;
	triggerVisibility?: "public" | "private";
	payload: AiCreditTimelinePayload;
}) {
	const providerMetadata = buildProviderMetadata({
		workflowRunId: params.workflowRunId,
		triggerMessageId: params.triggerMessageId,
		triggerVisibility: params.triggerVisibility,
	});

	return {
		type: `tool-${AI_CREDIT_TIMELINE_TOOL_NAME}`,
		toolCallId: "ai-credit-usage",
		toolName: AI_CREDIT_TIMELINE_TOOL_NAME,
		input: {
			modelId: params.payload.modelId,
			mode: params.payload.mode,
			blockedReason: params.payload.blockedReason ?? null,
		},
		state: "result",
		output: params.payload,
		callProviderMetadata: providerMetadata,
		providerMetadata,
	};
}

function getTimelineItemId(workflowRunId: string): string {
	return generateIdempotentULID(`tool:${workflowRunId}:ai-credit-usage`);
}

export async function logAiCreditUsageTimeline(params: {
	db: Database;
	organizationId: string;
	websiteId: string;
	conversationId: string;
	visitorId: string;
	aiAgentId: string;
	workflowRunId: string;
	triggerMessageId: string;
	triggerVisibility?: "public" | "private";
	payload: AiCreditTimelinePayload;
}): Promise<void> {
	const itemId = getTimelineItemId(params.workflowRunId);
	const toolPart = buildToolPart({
		workflowRunId: params.workflowRunId,
		triggerMessageId: params.triggerMessageId,
		triggerVisibility: params.triggerVisibility,
		payload: params.payload,
	});
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
				parts: [toolPart],
				aiAgentId: params.aiAgentId,
				visitorId: params.visitorId,
				visibility: TimelineItemVisibility.PRIVATE,
				tool: AI_CREDIT_TIMELINE_TOOL_NAME,
			},
		});
		return;
	} catch (error) {
		if (!isUniqueViolationError(error)) {
			console.warn(
				`[ai-credits] Failed to create AI credit timeline item for conv=${params.conversationId}:`,
				error
			);
			return;
		}
	}

	try {
		await updateTimelineItem({
			db: params.db,
			organizationId: params.organizationId,
			websiteId: params.websiteId,
			conversationId: params.conversationId,
			conversationOwnerVisitorId: params.visitorId,
			itemId,
			item: {
				text,
				parts: [toolPart],
				tool: AI_CREDIT_TIMELINE_TOOL_NAME,
			},
		});
	} catch (error) {
		console.warn(
			`[ai-credits] Failed to update AI credit timeline item for conv=${params.conversationId}:`,
			error
		);
	}
}
