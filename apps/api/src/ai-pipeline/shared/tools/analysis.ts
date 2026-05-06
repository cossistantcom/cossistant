import { tool } from "ai";
import { z } from "zod";
import { categorize } from "../actions/categorize";
import { updatePriority } from "../actions/update-priority";
import { updateSentiment } from "../actions/update-sentiment";
import { updateTitle } from "../actions/update-title";
import type {
	PipelineToolContext,
	PipelineToolResult,
	ToolTelemetrySpec,
} from "./contracts";
import { isRecord } from "./internal/guards";

const updateTitleInputSchema = z.object({
	title: z.string().min(1).max(100),
});

const updateSentimentInputSchema = z.object({
	sentiment: z.enum(["positive", "neutral", "negative"]),
	reason: z.string().min(1),
});

const setPriorityInputSchema = z.object({
	priority: z.enum(["low", "normal", "high", "urgent"]),
	reason: z.string().min(1),
});

const categorizeConversationInputSchema = z.object({
	viewId: z.string().min(1),
	reason: z.string().min(1),
});

export function createUpdateConversationTitleTool(ctx: PipelineToolContext) {
	return tool({
		description:
			"Set or update the internal team conversation title in the website default language.",
		inputSchema: updateTitleInputSchema,
		execute: async ({
			title,
		}): Promise<
			PipelineToolResult<{
				changed: boolean;
				reason?: "unchanged" | "manual_title" | "invalid_title";
				title?: string;
			}>
		> => {
			const result = await updateTitle({
				db: ctx.db,
				conversation: ctx.conversation,
				organizationId: ctx.organizationId,
				websiteId: ctx.websiteId,
				aiAgentId: ctx.aiAgentId,
				title: title.trim(),
				translationContext: {
					websiteDefaultLanguage: ctx.websiteDefaultLanguage,
					visitorLanguage: ctx.visitorLanguage,
					autoTranslateEnabled: ctx.autoTranslateEnabled !== false,
				},
				emitTimelineEvent: false,
			});
			return {
				success: true,
				changed: result.changed,
				data: {
					changed: result.changed,
					...(result.changed ? { title: title.trim() } : {}),
					...(result.reason ? { reason: result.reason } : {}),
				},
			};
		},
	});
}

export function createUpdateSentimentTool(ctx: PipelineToolContext) {
	return tool({
		description: "Update conversation sentiment when useful.",
		inputSchema: updateSentimentInputSchema,
		execute: async ({
			sentiment,
			reason: _reason,
		}): Promise<
			PipelineToolResult<{
				changed: boolean;
				reason?: "unchanged" | "manual_sentiment";
				sentiment?: string;
			}>
		> => {
			const result = await updateSentiment({
				db: ctx.db,
				conversation: ctx.conversation,
				organizationId: ctx.organizationId,
				websiteId: ctx.websiteId,
				aiAgentId: ctx.aiAgentId,
				sentiment,
				confidence: 0.9,
				emitTimelineEvent: false,
			});
			return {
				success: true,
				changed: result.changed,
				data: {
					changed: result.changed,
					...(result.changed ? { sentiment } : {}),
					...(result.reason ? { reason: result.reason } : {}),
				},
			};
		},
	});
}

export function createSetPriorityTool(ctx: PipelineToolContext) {
	return tool({
		description: "Set conversation priority.",
		inputSchema: setPriorityInputSchema,
		execute: async ({
			priority,
			reason: _reason,
		}): Promise<
			PipelineToolResult<{
				changed: boolean;
				reason?: "unchanged" | "manual_priority";
				priority?: string;
			}>
		> => {
			const result = await updatePriority({
				db: ctx.db,
				conversation: ctx.conversation,
				organizationId: ctx.organizationId,
				websiteId: ctx.websiteId,
				aiAgentId: ctx.aiAgentId,
				newPriority: priority,
				emitTimelineEvent: false,
			});
			return {
				success: true,
				changed: result.changed,
				data: {
					changed: result.changed,
					...(result.changed ? { priority } : {}),
					...(result.reason ? { reason: result.reason } : {}),
				},
			};
		},
	});
}

export function createCategorizeConversationTool(ctx: PipelineToolContext) {
	if (!(ctx.canCategorize && ctx.availableViews.length > 0)) {
		return null;
	}

	return tool({
		description:
			"Add the conversation to one matching saved view by viewId when the match is clear.",
		inputSchema: categorizeConversationInputSchema,
		execute: async ({
			viewId,
			reason,
		}): Promise<
			PipelineToolResult<{
				changed: boolean;
				viewId: string;
				viewName: string;
				reason: string;
			}>
		> => {
			const matchedView = ctx.availableViews.find((view) => view.id === viewId);
			if (!matchedView) {
				return {
					success: false,
					error: `Unknown viewId: ${viewId}`,
					data: {
						changed: false,
						viewId,
						viewName: "Unknown view",
						reason,
					},
				};
			}

			const result = await categorize({
				db: ctx.db,
				conversationId: ctx.conversationId,
				organizationId: ctx.organizationId,
				websiteId: ctx.websiteId,
				visitorId: ctx.visitorId,
				viewId: matchedView.id,
				aiAgentId: ctx.aiAgentId,
			});

			return {
				success: true,
				data: {
					changed: result.changed,
					viewId: matchedView.id,
					viewName: matchedView.name,
					reason,
				},
			};
		},
	});
}

function getChangedFromToolOutput(output: unknown): boolean | null {
	if (!isRecord(output)) {
		return null;
	}

	const data = isRecord(output.data) ? output.data : null;
	const value =
		typeof data?.changed === "boolean"
			? data.changed
			: typeof output.changed === "boolean"
				? output.changed
				: null;

	return value;
}

function getToolReasonFromOutput(output: unknown): string | null {
	if (!isRecord(output)) {
		return null;
	}

	const data = isRecord(output.data) ? output.data : null;
	const candidate =
		typeof data?.reason === "string"
			? data.reason
			: typeof output.reason === "string"
				? output.reason
				: null;

	return candidate?.trim() || null;
}

function getTitleFromToolOutput(output: unknown): string | null {
	if (!isRecord(output)) {
		return null;
	}

	const data = isRecord(output.data) ? output.data : null;
	const titleCandidate =
		typeof data?.title === "string"
			? data.title
			: typeof output.title === "string"
				? output.title
				: null;

	return titleCandidate?.trim() || null;
}

function getSentimentFromToolOutput(output: unknown): string | null {
	if (!isRecord(output)) {
		return null;
	}

	const data = isRecord(output.data) ? output.data : null;
	const sentimentCandidate =
		typeof data?.sentiment === "string"
			? data.sentiment
			: typeof output.sentiment === "string"
				? output.sentiment
				: null;

	return sentimentCandidate?.trim() || null;
}

function getPriorityFromToolOutput(output: unknown): string | null {
	if (!isRecord(output)) {
		return null;
	}

	const data = isRecord(output.data) ? output.data : null;
	const priorityCandidate =
		typeof data?.priority === "string"
			? data.priority
			: typeof output.priority === "string"
				? output.priority
				: null;

	return priorityCandidate?.trim() || null;
}

function getViewNameFromToolOutput(output: unknown): string | null {
	if (!isRecord(output)) {
		return null;
	}

	const data = isRecord(output.data) ? output.data : null;
	const viewNameCandidate =
		typeof data?.viewName === "string"
			? data.viewName
			: typeof output.viewName === "string"
				? output.viewName
				: null;

	return viewNameCandidate?.trim() || null;
}

export const UPDATE_CONVERSATION_TITLE_TELEMETRY: ToolTelemetrySpec = {
	summary: {
		partial: "Updating conversation title...",
		result: ({ output }) => {
			const changed = getChangedFromToolOutput(output);
			if (changed === false) {
				const reason = getToolReasonFromOutput(output);
				if (reason === "manual_title") {
					return "Skipped title update because the title was set manually";
				}
				return "Conversation title unchanged";
			}
			const title = getTitleFromToolOutput(output);
			return title
				? `Updated conversation title to "${title}"`
				: "Updated conversation title";
		},
		error: "Failed to update conversation title",
	},
	progress: {
		partial: "Updating conversation title...",
		result: ({ output }) =>
			getChangedFromToolOutput(output) === false
				? "Conversation title unchanged"
				: "Conversation title updated",
		error: "Failed to update conversation title",
		audience: "dashboard",
	},
};

export const UPDATE_SENTIMENT_TELEMETRY: ToolTelemetrySpec = {
	summary: {
		partial: "Updating sentiment...",
		result: ({ output }) => {
			if (getChangedFromToolOutput(output) === false) {
				return "Sentiment unchanged";
			}
			const sentiment = getSentimentFromToolOutput(output);
			return sentiment
				? `Updated sentiment to ${sentiment}`
				: "Updated sentiment";
		},
		error: "Failed to update sentiment",
	},
	progress: {
		partial: "Analyzing sentiment...",
		result: ({ output }) =>
			getChangedFromToolOutput(output) === false
				? "Sentiment unchanged"
				: "Sentiment updated",
		error: "Failed to update sentiment",
		audience: "dashboard",
	},
};

export const SET_PRIORITY_TELEMETRY: ToolTelemetrySpec = {
	summary: {
		partial: "Setting priority...",
		result: ({ output }) => {
			if (getChangedFromToolOutput(output) === false) {
				return "Priority unchanged";
			}
			const priority = getPriorityFromToolOutput(output);
			return priority ? `Set priority to ${priority}` : "Set priority";
		},
		error: "Failed to set priority",
	},
	progress: {
		partial: "Setting priority...",
		result: ({ output }) =>
			getChangedFromToolOutput(output) === false
				? "Priority unchanged"
				: "Priority updated",
		error: "Failed to set priority",
		audience: "dashboard",
	},
};

export const CATEGORIZE_CONVERSATION_TELEMETRY: ToolTelemetrySpec = {
	summary: {
		partial: "Classifying conversation...",
		result: ({ output }) => {
			if (getChangedFromToolOutput(output) === false) {
				return "Conversation classification unchanged";
			}

			const viewName = getViewNameFromToolOutput(output);
			return viewName
				? `Classified conversation as "${viewName}"`
				: "Classified conversation";
		},
		error: "Failed to classify conversation",
	},
	progress: {
		partial: "Classifying conversation...",
		result: ({ output }) =>
			getChangedFromToolOutput(output) === false
				? "Conversation classification unchanged"
				: "Conversation classified",
		error: "Failed to classify conversation",
		audience: "dashboard",
	},
};
