import { getConversationTimelineItems } from "@api/db/queries/conversation";
import { getKnowledgeById } from "@api/db/queries/knowledge";
import { getActiveKnowledgeClarificationForConversation } from "@api/db/queries/knowledge-clarification";
import {
	generateText,
	Output,
	runWithOpenRouterByokFallback,
} from "@api/lib/ai";
import { resolveModelForExecution } from "@api/lib/ai-credits/config";
import {
	buildConversationClarificationContextSnapshot,
	buildSpecificClarificationTopicSummary,
	getKnowledgeClarificationSearchEvidenceFromTimelineItems,
} from "@api/lib/knowledge-clarification-context";
import { TimelineItemVisibility } from "@cossistant/types";
import { z } from "zod";
import { requestKnowledgeClarification as requestKnowledgeClarificationAction } from "../shared/actions/request-knowledge-clarification";
import {
	getSearchKnowledgeSignalsFromTimelineItems,
	type SearchKnowledgeSignal,
} from "../shared/knowledge-gap/search-signals";
import { getBehaviorSettings } from "../shared/settings";
import type { BackgroundPipelineInput } from "./index";

const BACKGROUND_KNOWLEDGE_GAP_REVIEW_OUTPUT_SCHEMA = z.object({
	action: z.enum(["create_new", "deepen_existing", "skip"]),
	reason: z.string().min(1).max(240),
	topicSummary: z.string().min(1).max(300).nullable(),
	knowledgeId: z.string().nullable(),
});

function normalizeText(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function formatTranscriptEntry(entry: {
	content: string;
	kind?: "tool";
	senderType?: "visitor" | "human_agent" | "ai_agent";
	visibility?: "public" | "private";
}): string {
	if (entry.kind === "tool") {
		return entry.content;
	}

	const visibilityPrefix = entry.visibility === "private" ? "[PRIVATE]" : "";
	const senderPrefix =
		entry.senderType === "visitor"
			? "[VISITOR]"
			: entry.senderType === "human_agent"
				? "[TEAM]"
				: "";

	return [visibilityPrefix, senderPrefix, entry.content]
		.filter(Boolean)
		.join(" ");
}

function formatSearchSignals(signals: SearchKnowledgeSignal[]): string {
	if (signals.length === 0) {
		return "- none";
	}

	return signals
		.map((signal, index) =>
			[
				`${index + 1}. query=${signal.query ?? "none"}`,
				`questionContext=${signal.questionContext ?? "none"}`,
				`totalFound=${signal.totalFound ?? "unknown"}`,
				`maxSimilarity=${signal.maxSimilarity ?? "unknown"}`,
				`retrievalQuality=${signal.retrievalQuality}`,
				`clarificationSignal=${signal.clarificationSignal}`,
			].join(" | ")
		)
		.join("\n");
}

function formatFaqCandidates(
	items: Array<{
		knowledgeId: string;
		title: string | null;
		similarity: number | null;
		snippet: string | null;
	}>
): string {
	if (items.length === 0) {
		return "- none";
	}

	return items
		.map(
			(item, index) =>
				`${index + 1}. knowledgeId=${item.knowledgeId} | title=${item.title ?? "none"} | similarity=${item.similarity ?? "unknown"} | snippet=${item.snippet ?? "none"}`
		)
		.join("\n");
}

function getLatestWorkflowItems<
	T extends {
		workflowRunId: string | null;
		createdAt: string | null;
	},
>(items: T[], triggerCreatedAt: string | undefined): T[] {
	const relevantItems = items
		.filter((item) => item.workflowRunId)
		.filter((item) => {
			if (!(triggerCreatedAt && item.createdAt)) {
				return true;
			}

			return Date.parse(item.createdAt) <= Date.parse(triggerCreatedAt);
		})
		.sort((left, right) => {
			const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
			const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
			return leftTime - rightTime;
		});

	const latestWorkflowRunId =
		relevantItems[relevantItems.length - 1]?.workflowRunId ?? null;
	if (!latestWorkflowRunId) {
		return [];
	}

	return relevantItems.filter(
		(item) => item.workflowRunId === latestWorkflowRunId
	);
}

export async function runBackgroundKnowledgeGapReview(params: {
	db: import("@api/db").Database;
	input: BackgroundPipelineInput;
	intake: {
		aiAgent: {
			id: string;
			name: string;
			model: string;
		};
		conversation: {
			id: string;
			organizationId: string;
			websiteId: string;
			visitorId: string;
		};
		conversationHistory: Array<{
			content: string;
			kind?: "tool";
			senderType?: "visitor" | "human_agent" | "ai_agent";
			visibility?: "public" | "private";
		}>;
		triggerMessage: {
			messageId: string;
			content: string;
			senderType: "visitor" | "human_agent" | "ai_agent";
			visibility: "public" | "private";
			timestamp?: string | null;
		} | null;
	};
}): Promise<
	| {
			status: "created";
			requestId: string;
			created: boolean;
			topicSummary: string;
			reason: string;
	  }
	| {
			status: "skipped";
			reason:
				| "capability_disabled"
				| "active_clarification_exists"
				| "no_recent_searches"
				| "no_candidate_gap"
				| "review_skipped";
	  }
> {
	const settings = getBehaviorSettings(params.intake.aiAgent as never);
	if (!settings.canRequestKnowledgeClarification) {
		return {
			status: "skipped",
			reason: "capability_disabled",
		};
	}

	const existingClarification =
		await getActiveKnowledgeClarificationForConversation(params.db, {
			conversationId: params.intake.conversation.id,
			websiteId: params.intake.conversation.websiteId,
		});
	if (existingClarification) {
		return {
			status: "skipped",
			reason: "active_clarification_exists",
		};
	}

	const timeline = await getConversationTimelineItems(params.db, {
		organizationId: params.intake.conversation.organizationId,
		conversationId: params.intake.conversation.id,
		websiteId: params.intake.conversation.websiteId,
		limit: 80,
		visibility: [TimelineItemVisibility.PUBLIC, TimelineItemVisibility.PRIVATE],
		maxCreatedAt: params.input.sourceMessageCreatedAt,
	});

	const searchSignals = getSearchKnowledgeSignalsFromTimelineItems(
		timeline.items
	);
	const searchEvidence =
		getKnowledgeClarificationSearchEvidenceFromTimelineItems(timeline.items);
	if (searchSignals.length === 0) {
		return {
			status: "skipped",
			reason: "no_recent_searches",
		};
	}

	const latestWorkflowSignals = getLatestWorkflowItems(
		searchSignals,
		params.input.sourceMessageCreatedAt
	);
	const latestWorkflowEvidence = getLatestWorkflowItems(
		searchEvidence,
		params.input.sourceMessageCreatedAt
	);
	if (latestWorkflowSignals.length === 0) {
		return {
			status: "skipped",
			reason: "no_recent_searches",
		};
	}

	const hasWeakSearchCandidate = latestWorkflowSignals.some(
		(signal) => signal.clarificationSignal === "background_review"
	);
	const hasHumanCorrectionCandidate =
		params.intake.triggerMessage?.senderType === "human_agent" &&
		params.intake.triggerMessage.visibility === "public";
	if (!(hasWeakSearchCandidate || hasHumanCorrectionCandidate)) {
		return {
			status: "skipped",
			reason: "no_candidate_gap",
		};
	}

	const transcript = params.intake.conversationHistory
		.slice(-12)
		.map(formatTranscriptEntry)
		.join("\n");
	const faqCandidates = [
		...new Map(
			latestWorkflowEvidence
				.flatMap((evidence) => evidence.articles)
				.filter(
					(article) =>
						article.sourceType === "faq" && article.knowledgeId !== null
				)
				.map((article) => [
					article.knowledgeId,
					{
						knowledgeId: article.knowledgeId as string,
						title: article.title,
						similarity: article.similarity,
						snippet: article.snippet,
					},
				])
		).values(),
	].slice(0, 3);
	const triggerText = normalizeText(
		params.intake.triggerMessage?.content ?? ""
	);
	const modelResolution = resolveModelForExecution(params.intake.aiAgent.model);
	const openRouterContext = {
		db: params.db,
		organizationId: params.input.organizationId,
		websiteId: params.input.websiteId,
	};
	const { result: review } = await runWithOpenRouterByokFallback({
		modelId: modelResolution.modelIdResolved,
		options: { context: openRouterContext },
		operation: ({ model }) =>
			generateText({
				model,
				output: Output.object({
					schema: BACKGROUND_KNOWLEDGE_GAP_REVIEW_OUTPUT_SCHEMA,
				}),
				system: `You decide whether an internal knowledge clarification request should be created.

Open a clarification only when the recent knowledge-base retrieval and conversation suggest the FAQ or internal knowledge is incomplete, weak, stale, or contradicted by a teammate.

Do NOT create a clarification for normal teammate handling, acknowledgements, or when the KB already looks strong enough.

If you choose create:
- Write a short, concrete topic summary.
- Focus on the missing policy, workflow, or product detail the team should clarify.`,
				prompt: [
					`Trigger sender: ${params.intake.triggerMessage?.senderType ?? "none"}`,
					`Trigger visibility: ${params.intake.triggerMessage?.visibility ?? "none"}`,
					`Trigger text: ${triggerText || "none"}`,
					`Latest KB search workflow:\n${formatSearchSignals(latestWorkflowSignals)}`,
					`FAQ candidates to deepen:\n${formatFaqCandidates(faqCandidates)}`,
					`Recent transcript:\n${transcript || "- none"}`,
				].join("\n\n"),
				temperature: 0,
				maxOutputTokens: 220,
			}),
	});

	const reviewOutput = review.output;
	if (!(reviewOutput && reviewOutput.action !== "skip")) {
		return {
			status: "skipped",
			reason: "review_skipped",
		};
	}

	const contextSnapshotBase = buildConversationClarificationContextSnapshot({
		conversationHistory: params.intake.conversationHistory
			.filter((entry) => entry.kind !== "tool")
			.map((entry, index) => ({
				messageId: `background-${index}`,
				content: entry.content,
				senderType: entry.senderType ?? "visitor",
				senderId: null,
				senderName: null,
				timestamp: null,
				visibility: entry.visibility ?? "public",
			})) as never,
		triggerMessage: params.intake.triggerMessage
			? {
					messageId:
						params.intake.triggerMessage.messageId ??
						params.input.sourceMessageId,
					content: params.intake.triggerMessage.content,
					senderType: params.intake.triggerMessage.senderType,
					senderId: null,
					senderName: null,
					timestamp: params.intake.triggerMessage.timestamp ?? null,
					visibility: params.intake.triggerMessage.visibility,
				}
			: null,
		searchEvidence: latestWorkflowEvidence,
	});
	const contextSnapshot = {
		...contextSnapshotBase,
		sourceTrigger: {
			...contextSnapshotBase.sourceTrigger,
			text: triggerText || contextSnapshotBase.sourceTrigger.text,
			senderType:
				params.intake.triggerMessage?.senderType ??
				contextSnapshotBase.sourceTrigger.senderType,
			visibility:
				params.intake.triggerMessage?.visibility ??
				contextSnapshotBase.sourceTrigger.visibility,
		},
	};
	const fallbackTopicSummary = buildSpecificClarificationTopicSummary({
		triggerText: triggerText || null,
		searchEvidence: latestWorkflowEvidence,
		fallback: reviewOutput.topicSummary ?? triggerText,
	});
	const topicSummary =
		reviewOutput.topicSummary?.trim() || fallbackTopicSummary;
	const targetKnowledge =
		reviewOutput.action === "deepen_existing" && reviewOutput.knowledgeId
			? await getKnowledgeById(params.db, {
					id: reviewOutput.knowledgeId,
					websiteId: params.intake.conversation.websiteId,
				})
			: null;
	const clarificationResult = await requestKnowledgeClarificationAction({
		db: params.db,
		conversation: params.intake.conversation as never,
		organizationId: params.intake.conversation.organizationId,
		websiteId: params.intake.conversation.websiteId,
		aiAgentId: params.intake.aiAgent.id,
		topicSummary,
		contextSnapshot,
		targetKnowledge,
	});

	return {
		status: "created",
		requestId: clarificationResult.requestId,
		created: clarificationResult.created,
		topicSummary,
		reason: reviewOutput.reason,
	};
}
