import type { Database } from "@api/db";
import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import type { ConversationSelect } from "@api/db/schema/conversation";
import { createModelForWebsite, generateText, Output } from "@api/lib/ai";
import { resolveModelForExecution } from "@api/lib/ai-credits/config";
import {
	recordOpenRouterByokFailure,
	recordOpenRouterByokSuccess,
} from "@api/lib/openrouter-byok/resolver";
import { z } from "zod";
import { logAiPipeline } from "../logger";
import type {
	ConversationTranscriptEntry,
	RoleAwareMessage,
} from "../primary-pipeline/contracts";
import { updateTitle } from "../shared/actions/update-title";

const TITLE_REVIEW_OUTPUT_SCHEMA = z.object({
	title: z.string().trim().min(1).max(100),
	confidence: z.number().min(0).max(1),
	reason: z.string().trim().min(1).max(300),
});

const MIN_TITLE_CONFIDENCE = 0.72;
const MAX_TITLE_LENGTH = 80;
const MAX_TRANSCRIPT_ENTRIES = 18;
const MAX_TRANSCRIPT_TEXT_LENGTH = 320;

const GENERIC_TITLES = new Set([
	"ai conversation",
	"chat",
	"conversation",
	"customer question",
	"customer support",
	"general inquiry",
	"general question",
	"help request",
	"inquiry",
	"question",
	"request",
	"support",
	"support conversation",
	"support inquiry",
	"support question",
	"support request",
]);

type TitleReviewOutput = z.infer<typeof TITLE_REVIEW_OUTPUT_SCHEMA>;

export type BackgroundTitleReviewResult =
	| {
			status: "updated";
			title: string;
			reason: string;
	  }
	| {
			status: "skipped";
			reason: "manual_title" | "invalid_title" | "unchanged" | "disabled";
	  }
	| {
			status: "error";
			error: string;
	  };

export type BackgroundTitleReviewParams = {
	db: Database;
	aiAgent: AiAgentSelect;
	conversation: ConversationSelect;
	organizationId: string;
	websiteId: string;
	aiAgentId: string;
	websiteDefaultLanguage: string;
	visitorLanguage?: string | null;
	autoTranslateEnabled: boolean;
	conversationHistory: ConversationTranscriptEntry[];
	triggerMessage: RoleAwareMessage | null;
};

function normalizeText(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function normalizeTitle(value: string): string {
	return normalizeText(value).toLowerCase();
}

function normalizeComparableText(value: string): string {
	return normalizeText(value)
		.toLowerCase()
		.replace(/["'`]/g, "")
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function truncateText(value: string, maxLength: number): string {
	if (value.length <= maxLength) {
		return value;
	}

	return `${value.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function formatTranscriptEntry(
	entry: ConversationTranscriptEntry
): string | null {
	if ("kind" in entry) {
		return null;
	}

	const text = normalizeText(entry.content);
	if (!text) {
		return null;
	}

	const visibility = entry.visibility === "private" ? " private" : "";
	return `- ${entry.senderType}${visibility}: ${truncateText(
		text,
		MAX_TRANSCRIPT_TEXT_LENGTH
	)}`;
}

function buildTranscript(params: {
	conversationHistory: ConversationTranscriptEntry[];
	triggerMessage: RoleAwareMessage | null;
}): string {
	const entries = [
		...params.conversationHistory,
		...(params.triggerMessage ? [params.triggerMessage] : []),
	]
		.slice(-MAX_TRANSCRIPT_ENTRIES)
		.map(formatTranscriptEntry)
		.filter((entry): entry is string => Boolean(entry));

	return entries.length > 0 ? entries.join("\n") : "- none";
}

function cleanTitle(title: string | null): string | null {
	const normalized = title ? normalizeText(title) : "";
	if (!normalized) {
		return null;
	}

	return normalized.replace(/^["'`]+|["'`]+$/g, "").trim() || null;
}

function getInvalidTitleReason(output: TitleReviewOutput): string | null {
	const title = cleanTitle(output.title);
	if (!title) {
		return "missing_title";
	}

	if (title.length > MAX_TITLE_LENGTH) {
		return "too_long";
	}

	if (output.confidence < MIN_TITLE_CONFIDENCE) {
		return "low_confidence";
	}

	if (GENERIC_TITLES.has(normalizeTitle(title))) {
		return "generic_title";
	}

	return null;
}

function getLatestHumanOrVisitorMessage(params: {
	conversationHistory: ConversationTranscriptEntry[];
	triggerMessage: RoleAwareMessage | null;
}): RoleAwareMessage | null {
	const entries = [
		...params.conversationHistory,
		...(params.triggerMessage ? [params.triggerMessage] : []),
	];

	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if ("kind" in entry) {
			continue;
		}

		if (entry.senderType !== "visitor" && entry.senderType !== "human_agent") {
			continue;
		}

		if (!normalizeText(entry.content)) {
			continue;
		}

		return entry;
	}

	return null;
}

function trimForTitle(value: string, maxLength: number): string {
	const cleaned = normalizeText(value)
		.replace(/^["'`]+|["'`]+$/g, "")
		.replace(/[.!?]+$/g, "")
		.trim();

	if (cleaned.length <= maxLength) {
		return cleaned;
	}

	return cleaned.slice(0, Math.max(0, maxLength - 3)).trim();
}

function deriveFallbackTitle(params: {
	conversationHistory: ConversationTranscriptEntry[];
	triggerMessage: RoleAwareMessage | null;
}): string {
	const latestMessage = getLatestHumanOrVisitorMessage(params);
	const text = normalizeText(latestMessage?.content ?? "");
	if (!text) {
		return "Conversation started";
	}

	const comparable = normalizeComparableText(text);
	const greetingTitleByText: Record<string, string> = {
		hi: "Visitor said hi",
		"hi there": "Visitor said hi",
		"hi team": "Visitor said hi",
		"hi support": "Visitor said hi",
		hello: "Visitor said hello",
		"hello there": "Visitor said hello",
		"hello team": "Visitor said hello",
		"hello support": "Visitor said hello",
		hey: "Visitor said hey",
		"hey there": "Visitor said hey",
		"hey team": "Visitor said hey",
		yo: "Visitor said hi",
	};
	const greetingTitle = greetingTitleByText[comparable];
	if (greetingTitle) {
		return greetingTitle;
	}

	if (
		comparable === "thanks" ||
		comparable === "thank you" ||
		comparable === "thx" ||
		comparable === "ty" ||
		comparable.startsWith("thanks ") ||
		comparable.startsWith("thank you ")
	) {
		return "Visitor said thanks";
	}

	if (
		comparable === "help" ||
		comparable === "can you help" ||
		comparable === "can you help me" ||
		comparable === "can u help" ||
		comparable === "can u help me" ||
		comparable === "i need help" ||
		comparable === "need help" ||
		comparable.includes("can you help") ||
		comparable.includes("i need help")
	) {
		return "Visitor asked for help";
	}

	const label =
		latestMessage?.senderType === "human_agent"
			? "Teammate said"
			: "Visitor said";
	return `${label}: ${trimForTitle(text, MAX_TITLE_LENGTH - label.length - 2)}`;
}

function getValidModelTitle(output: TitleReviewOutput): string | null {
	return getInvalidTitleReason(output) ? null : cleanTitle(output.title);
}

function buildTitleReviewPrompt(params: {
	conversation: ConversationSelect;
	websiteDefaultLanguage: string;
	transcript: string;
}): string {
	return `Existing internal title: ${params.conversation.title?.trim() || "none"}
Existing title source: ${params.conversation.titleSource ?? "none"}
Website default language: ${params.websiteDefaultLanguage}

Recent transcript:
${params.transcript}

Create a non-empty internal team title for this conversation.

Title rules:
- Write the title in the website default language only.
- Keep it short, concrete, and issue-focused.
- Prefer nouns for the product area, issue, task, or question.
- If the visitor only greeted, use an honest fallback such as "Visitor said hi".
- If the visitor only asked for help, use "Visitor asked for help".
- If the visitor only thanked the team, use "Visitor said thanks".
- If no readable topic exists, use "Conversation started".
- Do not use vague titles like "Support request", "Question", "General inquiry", or "Help request".
- Do not include names, emails, IDs, quotes, trailing punctuation, or sentence-like summaries.
- If an AI title already exists, replace it when the current transcript topic changed or became clearer.`;
}

export async function runBackgroundTitleReview(
	params: BackgroundTitleReviewParams
): Promise<BackgroundTitleReviewResult> {
	const { conversation } = params;

	if (conversation.titleSource === "user") {
		logAiPipeline({
			area: "background",
			event: "title_skipped_manual",
			conversationId: conversation.id,
		});
		return {
			status: "skipped",
			reason: "manual_title",
		};
	}

	try {
		const transcript = buildTranscript({
			conversationHistory: params.conversationHistory,
			triggerMessage: params.triggerMessage,
		});
		let title: string | null = null;
		let reason = "";
		let confidence: number | null = null;
		const modelResolution = resolveModelForExecution(params.aiAgent.model);
		const openRouterContext = {
			db: params.db,
			organizationId: params.organizationId,
			websiteId: params.websiteId,
		};
		const model = await createModelForWebsite(modelResolution.modelIdResolved, {
			context: openRouterContext,
		});
		try {
			const review = await generateText({
				model: model.model,
				output: Output.object({
					schema: TITLE_REVIEW_OUTPUT_SCHEMA,
				}),
				system:
					"You generate concise internal conversation titles for support teams. Always return a usable title. Use honest fallback titles for greetings, thanks, or generic help requests.",
				prompt: buildTitleReviewPrompt({
					conversation,
					websiteDefaultLanguage: params.websiteDefaultLanguage,
					transcript,
				}),
				temperature: 0,
				maxOutputTokens: 180,
			});
			await recordOpenRouterByokSuccess({
				context: openRouterContext,
				billingSource: model.billingSource,
			});

			const output = review.output;
			title = getValidModelTitle(output);
			reason = output.reason;
			confidence = output.confidence;

			if (!title) {
				const invalidReason = getInvalidTitleReason(output) ?? "invalid_title";
				title = deriveFallbackTitle({
					conversationHistory: params.conversationHistory,
					triggerMessage: params.triggerMessage,
				});
				reason = `Fallback title used after model output was rejected: ${invalidReason}`;
				logAiPipeline({
					area: "background",
					event: "title_fallback_used",
					conversationId: conversation.id,
					fields: {
						reason: invalidReason,
						modelReason: output.reason,
						confidence: output.confidence,
						title,
					},
				});
			}
		} catch (error) {
			await recordOpenRouterByokFailure({
				context: openRouterContext,
				billingSource: model.billingSource,
				error,
			});
			title = deriveFallbackTitle({
				conversationHistory: params.conversationHistory,
				triggerMessage: params.triggerMessage,
			});
			reason =
				error instanceof Error
					? `Fallback title used after title model failed: ${error.message}`
					: "Fallback title used after title model failed";
			logAiPipeline({
				area: "background",
				event: "title_fallback_used",
				conversationId: conversation.id,
				fields: {
					reason,
					title,
				},
				error,
			});
		}

		if (!title) {
			logAiPipeline({
				area: "background",
				event: "title_error",
				level: "error",
				conversationId: conversation.id,
				fields: {
					message: "Both title model and deterministic fallback failed",
				},
			});
			return {
				status: "error",
				error: "Both title model and deterministic fallback failed",
			};
		}

		const updateResult = await updateTitle({
			db: params.db,
			conversation,
			organizationId: params.organizationId,
			websiteId: params.websiteId,
			aiAgentId: params.aiAgentId,
			title,
			translationContext: {
				websiteDefaultLanguage: params.websiteDefaultLanguage,
				visitorLanguage: params.visitorLanguage,
				autoTranslateEnabled: params.autoTranslateEnabled,
			},
			emitTimelineEvent: false,
		});

		if (!updateResult.changed) {
			const event =
				updateResult.reason === "manual_title"
					? "title_skipped_manual"
					: updateResult.reason === "unchanged"
						? "title_unchanged"
						: "title_error";
			logAiPipeline({
				area: "background",
				event,
				...(event === "title_error" ? { level: "error" as const } : {}),
				conversationId: conversation.id,
				fields: {
					reason: updateResult.reason ?? "unchanged",
					title,
				},
			});
			return {
				status: "skipped",
				reason: updateResult.reason ?? "unchanged",
			};
		}

		logAiPipeline({
			area: "background",
			event: "title_updated",
			conversationId: conversation.id,
			fields: {
				title,
				reason,
				confidence,
			},
		});

		return {
			status: "updated",
			title,
			reason,
		};
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Title review failed";
		logAiPipeline({
			area: "background",
			event: "title_error",
			level: "error",
			conversationId: conversation.id,
			fields: {
				message,
			},
			error,
		});
		return {
			status: "error",
			error: message,
		};
	}
}
