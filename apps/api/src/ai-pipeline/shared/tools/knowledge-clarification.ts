import { getKnowledgeClarificationSearchEvidenceFromToolExecutions } from "@api/lib/knowledge-clarification-context";
import type { KnowledgeClarificationStatus } from "@plasma/types";
import { tool } from "ai";
import { z } from "zod";
import { requestKnowledgeClarification as requestKnowledgeClarificationAction } from "../actions/request-knowledge-clarification";
import { buildToolDrivenClarificationContext } from "../knowledge-gap/tool-clarification-context";
import type {
	PipelineToolContext,
	PipelineToolResult,
	ToolTelemetrySpec,
} from "./contracts";
import { setToolError } from "./helpers";

const requestKnowledgeClarificationSchema = z.object({
	topicSummary: z
		.string()
		.min(1)
		.max(1000)
		.describe(
			"Short summary of the knowledge gap the team should clarify for the FAQ."
		),
});

export function createRequestKnowledgeClarificationTool(
	ctx: PipelineToolContext
) {
	return tool({
		description:
			"Start a private team clarification workflow to improve knowledge base precision without escalating the conversation.",
		inputSchema: requestKnowledgeClarificationSchema,
		execute: async ({
			topicSummary,
		}): Promise<
			PipelineToolResult<{
				requestId: string;
				created: boolean;
				changed: boolean;
				resolution: "created" | "reused" | "suppressed_duplicate";
				status: KnowledgeClarificationStatus;
			}>
		> => {
			try {
				const { contextSnapshot } = await buildToolDrivenClarificationContext({
					ctx,
					searchEvidence:
						getKnowledgeClarificationSearchEvidenceFromToolExecutions(
							ctx.runtimeState.toolExecutions
						),
				});
				const result = await requestKnowledgeClarificationAction({
					db: ctx.db,
					conversation: ctx.conversation,
					organizationId: ctx.organizationId,
					websiteId: ctx.websiteId,
					aiAgentId: ctx.aiAgentId,
					topicSummary,
					contextSnapshot,
				});

				return {
					success: true,
					changed: result.created,
					data: {
						...result,
						changed: result.created,
					},
				};
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to request knowledge clarification";
				setToolError(ctx, {
					toolName: "requestKnowledgeClarification",
					error: message,
					fatal: false,
				});
				return {
					success: false,
					error: message,
				};
			}
		},
	});
}

export const REQUEST_KNOWLEDGE_CLARIFICATION_TELEMETRY: ToolTelemetrySpec = {
	summary: {
		partial: "Opening knowledge clarification...",
		result: "Knowledge clarification requested",
		error: "Failed to request knowledge clarification",
	},
	progress: {
		partial: "Preparing a knowledge clarification request...",
		result: "Knowledge clarification ready for the team",
		error: "Clarification request failed",
		audience: "dashboard",
	},
};
