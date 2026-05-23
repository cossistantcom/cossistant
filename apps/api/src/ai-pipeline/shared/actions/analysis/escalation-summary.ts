/**
 * Escalation Summary Generator
 *
 * Generates a quick summary of the conversation for escalation notifications.
 * Used in email and push notifications sent to admins.
 */

import type { Database } from "@api/db";
import { getConversationTimelineItems } from "@api/db/queries/conversation";
import type { ConversationSelect } from "@api/db/schema/conversation";
import {
	DefaultModels,
	generateText,
	Output,
	runWithOpenRouterByokFallback,
} from "@api/lib/ai";
import {
	ConversationTimelineType,
	TimelineItemVisibility,
} from "@cossistant/types";
import { z } from "zod";

/**
 * Model to use for summary generation (fast and cheap)
 */
const SUMMARY_MODEL = DefaultModels.summary;

/**
 * Schema for escalation summary response
 */
const escalationSummarySchema = z.object({
	summary: z
		.string()
		.max(500)
		.describe(
			"A brief summary of the conversation and why escalation was requested (max 500 chars)"
		),
	keyPoints: z
		.array(z.string())
		.max(3)
		.describe("Up to 3 key points the human agent should know"),
});

export type EscalationSummary = z.infer<typeof escalationSummarySchema>;

type GenerateEscalationSummaryParams = {
	db: Database;
	conversation: ConversationSelect;
	organizationId: string;
	websiteId: string;
	escalationReason: string;
};

/**
 * Generate a summary of the conversation for escalation notifications
 *
 * Uses LLM to create a concise summary that helps human agents
 * quickly understand the context when they receive an escalation.
 */
export async function generateEscalationSummary(
	params: GenerateEscalationSummaryParams
): Promise<EscalationSummary | null> {
	const { db, conversation, organizationId, websiteId, escalationReason } =
		params;

	// Get conversation messages
	const { items } = await getConversationTimelineItems(db, {
		organizationId,
		conversationId: conversation.id,
		websiteId,
		limit: 15, // Get enough context for a good summary
		visibility: [TimelineItemVisibility.PUBLIC],
	});

	// Filter to only message items with content
	const messages = items.filter(
		(item) =>
			item.type === ConversationTimelineType.MESSAGE &&
			item.text &&
			item.text.trim()
	);

	if (messages.length === 0) {
		console.log(
			`[ai-agent:analysis] conv=${conversation.id} | No messages for escalation summary`
		);
		return null;
	}

	const openRouterContext = {
		db,
		organizationId,
		websiteId,
	};

	try {
		console.log(
			`[ai-agent:analysis] conv=${conversation.id} | Generating escalation summary from ${messages.length} messages`
		);

		// Format messages for context
		const messageContext = messages
			.map((m) => {
				const sender = m.visitorId ? "Visitor" : m.aiAgentId ? "AI" : "Agent";
				return `${sender}: "${m.text}"`;
			})
			.join("\n");
		const { result } = await runWithOpenRouterByokFallback({
			modelId: SUMMARY_MODEL,
			options: { context: openRouterContext },
			operation: ({ model }) =>
				generateText({
					model,
					output: Output.object({
						schema: escalationSummarySchema,
					}),
					system: `You are a support assistant helping human agents quickly understand escalated conversations.

Your task is to create a brief summary that:
1. Explains what the visitor needs help with
2. Notes any important context or constraints
3. Highlights why the AI escalated (visitor request, complex issue, etc.)

Keep the summary concise and actionable - the human agent needs to quickly understand the situation.`,
					prompt: `Create a brief summary of this escalated conversation.

Escalation reason: ${escalationReason}

Conversation:
${messageContext}

Summarize:
1. What the visitor needs
2. Key context the agent should know
3. Why this was escalated`,
					temperature: 0.3, // Low temperature for consistent summaries
				}),
		});

		if (!result.output) {
			console.error(
				`[ai-agent:analysis] conv=${conversation.id} | Escalation summary returned no structured output`
			);
			return null;
		}

		console.log(
			`[ai-agent:analysis] conv=${conversation.id} | Generated escalation summary: "${result.output.summary.slice(0, 50)}..."`
		);

		return result.output;
	} catch (error) {
		// Log but don't throw - summary generation is non-critical
		console.error(
			`[ai-agent:analysis] conv=${conversation.id} | Escalation summary generation failed:`,
			error instanceof Error ? error.message : error
		);
		return null;
	}
}
