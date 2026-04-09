import {
	type ConversationTranscriptEntry,
	isConversationMessage,
	type RoleAwareMessage,
	type SenderType,
} from "@api/ai-pipeline/primary-pipeline/contracts";
import type { ToolExecutionSnapshot } from "@api/ai-pipeline/shared/tools/contracts";
import type { KnowledgeSelect } from "@api/db/schema/knowledge";
import type { TimelineItem } from "@plasma/types/api/timeline-item";

export type KnowledgeClarificationSourceVisibility = "public" | "private";

export type KnowledgeClarificationSearchRetrievalQuality =
	| "none"
	| "weak"
	| "strong";

export type KnowledgeClarificationSearchSignal =
	| "none"
	| "immediate"
	| "background_review";

export type KnowledgeClarificationSearchArticleEvidence = {
	knowledgeId: string | null;
	title: string | null;
	sourceUrl: string | null;
	sourceType: string | null;
	similarity: number | null;
	snippet: string | null;
};

export type KnowledgeClarificationSearchEvidence = {
	query: string | null;
	questionContext: string | null;
	totalFound: number | null;
	maxSimilarity: number | null;
	retrievalQuality: KnowledgeClarificationSearchRetrievalQuality;
	clarificationSignal: KnowledgeClarificationSearchSignal;
	articles: KnowledgeClarificationSearchArticleEvidence[];
	workflowRunId: string | null;
	triggerMessageId: string | null;
	createdAt: string | null;
	visibility: KnowledgeClarificationSourceVisibility | null;
};

export type KnowledgeClarificationLinkedFaqSnapshot = {
	id: string | null;
	sourceTitle: string | null;
	question: string | null;
	answer: string | null;
	categories: string[];
	relatedQuestions: string[];
};

export type KnowledgeClarificationTranscriptMessageSnapshot = {
	messageId: string;
	content: string;
	senderType: SenderType;
	visibility: KnowledgeClarificationSourceVisibility;
	timestamp: string | null;
};

export type KnowledgeClarificationContextSnapshot = {
	sourceTrigger: {
		messageId: string | null;
		text: string | null;
		senderType: SenderType | null;
		visibility: KnowledgeClarificationSourceVisibility | null;
		createdAt: string | null;
	};
	relevantTranscript: KnowledgeClarificationTranscriptMessageSnapshot[];
	kbSearchEvidence: KnowledgeClarificationSearchEvidence[];
	linkedFaq: KnowledgeClarificationLinkedFaqSnapshot | null;
};

const MAX_TRANSCRIPT_MESSAGES = 8;
const MAX_SEARCH_EVIDENCE = 3;
const MAX_SEARCH_ARTICLES = 3;
const MESSAGE_CHAR_LIMIT = 280;
const SOURCE_SUMMARY_MAX_LENGTH = 300;

type ToolPartRecord = {
	toolName: string;
	state: "partial" | "result" | "error";
	output?: unknown;
	providerMetadata?: unknown;
	callProviderMetadata?: unknown;
};

function normalizeText(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function clipText(value: string, maxLength: number): string {
	const normalized = normalizeText(value);
	if (normalized.length <= maxLength) {
		return normalized;
	}

	return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringField(
	record: Record<string, unknown>,
	key: string
): string | null {
	const value = record[key];
	return typeof value === "string" ? normalizeText(value) || null : null;
}

function getNumberField(
	record: Record<string, unknown>,
	key: string
): number | null {
	const value = record[key];
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asVisibility(
	value: string | null | undefined
): KnowledgeClarificationSourceVisibility | null {
	return value === "public" || value === "private" ? value : null;
}

function asRetrievalQuality(
	value: string | null
): KnowledgeClarificationSearchRetrievalQuality | null {
	return value === "none" || value === "weak" || value === "strong"
		? value
		: null;
}

function asClarificationSignal(
	value: string | null
): KnowledgeClarificationSearchSignal | null {
	return value === "none" ||
		value === "immediate" ||
		value === "background_review"
		? value
		: null;
}

function parseSearchEvidenceArticles(
	data: Record<string, unknown> | null
): KnowledgeClarificationSearchArticleEvidence[] {
	const articles = Array.isArray(data?.articles) ? data.articles : [];

	return articles.slice(0, MAX_SEARCH_ARTICLES).map((article) => {
		if (!isRecord(article)) {
			return {
				knowledgeId: null,
				title: null,
				sourceUrl: null,
				sourceType: null,
				similarity: null,
				snippet: null,
			};
		}

		const content = getStringField(article, "content");

		return {
			knowledgeId: getStringField(article, "knowledgeId"),
			title: getStringField(article, "title"),
			sourceUrl: getStringField(article, "sourceUrl"),
			sourceType: getStringField(article, "sourceType"),
			similarity: getNumberField(article, "similarity"),
			snippet: content ? clipText(content, 220) : null,
		};
	});
}

function parseSearchEvidenceOutput(
	output: unknown
): Omit<
	KnowledgeClarificationSearchEvidence,
	"workflowRunId" | "triggerMessageId" | "createdAt" | "visibility"
> | null {
	if (!isRecord(output)) {
		return null;
	}

	const data = isRecord(output.data) ? output.data : null;
	if (!data) {
		return null;
	}

	const retrievalQuality = asRetrievalQuality(
		getStringField(data, "retrievalQuality")
	);
	const clarificationSignal = asClarificationSignal(
		getStringField(data, "clarificationSignal")
	);

	if (!(retrievalQuality && clarificationSignal)) {
		return null;
	}

	const articles = parseSearchEvidenceArticles(data);
	const totalFound =
		getNumberField(data, "totalFound") ??
		(articles.length > 0 ? articles.length : null);

	return {
		query: getStringField(data, "query"),
		questionContext: getStringField(data, "questionContext"),
		totalFound,
		maxSimilarity: getNumberField(data, "maxSimilarity"),
		retrievalQuality,
		clarificationSignal,
		articles,
	};
}

function extractToolTimelineMetadata(part: ToolPartRecord): {
	workflowRunId: string | null;
	triggerMessageId: string | null;
} {
	const providerMetadata = isRecord(part.providerMetadata)
		? part.providerMetadata
		: isRecord(part.callProviderMetadata)
			? part.callProviderMetadata
			: null;
	const cossistant =
		providerMetadata && isRecord(providerMetadata.plasma)
			? providerMetadata.plasma
			: null;
	const toolTimeline =
		cossistant && isRecord(cossistant.toolTimeline)
			? cossistant.toolTimeline
			: null;

	return {
		workflowRunId: toolTimeline
			? getStringField(toolTimeline, "workflowRunId")
			: null,
		triggerMessageId: toolTimeline
			? getStringField(toolTimeline, "triggerMessageId")
			: null,
	};
}

function extractSearchToolPart(item: TimelineItem): ToolPartRecord | null {
	for (let index = item.parts.length - 1; index >= 0; index -= 1) {
		const candidate = item.parts[index];
		if (!isRecord(candidate)) {
			continue;
		}
		const candidateRecord = candidate as Record<string, unknown>;

		const toolName = getStringField(candidateRecord, "toolName");
		const state = getStringField(candidateRecord, "state");
		if (
			toolName !== "searchKnowledgeBase" ||
			(state !== "partial" && state !== "result" && state !== "error")
		) {
			continue;
		}

		return {
			toolName,
			state,
			output: candidateRecord.output,
			providerMetadata: candidateRecord.providerMetadata,
			callProviderMetadata: candidateRecord.callProviderMetadata,
		};
	}

	return null;
}

function mapMessageSnapshot(
	message: RoleAwareMessage
): KnowledgeClarificationTranscriptMessageSnapshot {
	return {
		messageId: message.messageId,
		content: clipText(message.content, MESSAGE_CHAR_LIMIT),
		senderType: message.senderType,
		visibility: message.visibility,
		timestamp: message.timestamp,
	};
}

function selectRelevantTranscriptMessages(params: {
	conversationHistory: ConversationTranscriptEntry[];
	triggerMessage?: RoleAwareMessage | null;
}): KnowledgeClarificationTranscriptMessageSnapshot[] {
	const messages = params.conversationHistory.filter(isConversationMessage);
	if (messages.length === 0) {
		return [];
	}

	const selected: RoleAwareMessage[] = [];
	const seenIds = new Set<string>();

	const addMessage = (message: RoleAwareMessage | undefined) => {
		if (!(message && !seenIds.has(message.messageId))) {
			return;
		}

		seenIds.add(message.messageId);
		selected.push(message);
	};

	const triggerMessage = params.triggerMessage ?? messages.at(-1) ?? null;
	const triggerIndex = triggerMessage
		? messages.findIndex(
				(message) => message.messageId === triggerMessage.messageId
			)
		: messages.length - 1;
	const resolvedTriggerIndex =
		triggerIndex >= 0 ? triggerIndex : Math.max(messages.length - 1, 0);

	const currentBurst: RoleAwareMessage[] = [];
	for (let index = resolvedTriggerIndex; index >= 0; index -= 1) {
		const message = messages[index];
		if (
			!message ||
			message.senderType !== messages[resolvedTriggerIndex]?.senderType
		) {
			break;
		}
		currentBurst.unshift(message);
	}

	const exchangeContext: RoleAwareMessage[] = [];
	let senderSwitches = 0;
	let previousSenderType: SenderType | null = null;

	for (
		let index = resolvedTriggerIndex - 1;
		index >= 0 && senderSwitches < 4;
		index -= 1
	) {
		const message = messages[index];
		if (!message) {
			continue;
		}

		exchangeContext.unshift(message);
		if (message.senderType !== previousSenderType) {
			previousSenderType = message.senderType;
			senderSwitches += 1;
		}
	}

	const recentHumanMessages: RoleAwareMessage[] = [];
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (!message || message.senderType !== "human_agent") {
			continue;
		}

		recentHumanMessages.unshift(message);
		if (recentHumanMessages.length >= 2) {
			break;
		}
	}

	for (const message of recentHumanMessages) {
		addMessage(message);
	}
	for (const message of exchangeContext) {
		addMessage(message);
	}
	for (const message of currentBurst) {
		addMessage(message);
	}
	addMessage(triggerMessage ?? undefined);

	return selected
		.sort((left, right) => {
			const leftIndex = messages.findIndex(
				(message) => message.messageId === left.messageId
			);
			const rightIndex = messages.findIndex(
				(message) => message.messageId === right.messageId
			);
			return leftIndex - rightIndex;
		})
		.slice(-MAX_TRANSCRIPT_MESSAGES)
		.map(mapMessageSnapshot);
}

function truncateSummary(value: string): string {
	const normalized = normalizeText(value);
	if (normalized.length <= SOURCE_SUMMARY_MAX_LENGTH) {
		return normalized;
	}

	return `${normalized.slice(0, SOURCE_SUMMARY_MAX_LENGTH - 3)}...`;
}

function dedupeSearchEvidence(
	items: KnowledgeClarificationSearchEvidence[]
): KnowledgeClarificationSearchEvidence[] {
	const seen = new Set<string>();
	const deduped: KnowledgeClarificationSearchEvidence[] = [];

	for (const item of items) {
		const key = [
			item.query,
			item.questionContext,
			item.workflowRunId,
			item.triggerMessageId,
			item.createdAt,
		]
			.map((value) => value ?? "")
			.join("|");
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		deduped.push(item);
	}

	return deduped.slice(-MAX_SEARCH_EVIDENCE);
}

export function extractLinkedFaqSnapshot(
	targetKnowledge?: KnowledgeSelect | null
): KnowledgeClarificationLinkedFaqSnapshot | null {
	if (!targetKnowledge) {
		return null;
	}

	const payload =
		typeof targetKnowledge.payload === "object" &&
		targetKnowledge.payload !== null
			? (targetKnowledge.payload as Record<string, unknown>)
			: null;

	const categories = Array.isArray(payload?.categories)
		? payload.categories.filter(
				(value): value is string => typeof value === "string"
			)
		: [];
	const relatedQuestions = Array.isArray(payload?.relatedQuestions)
		? payload.relatedQuestions.filter(
				(value): value is string => typeof value === "string"
			)
		: [];

	return {
		id: targetKnowledge.id,
		sourceTitle: targetKnowledge.sourceTitle ?? null,
		question: payload ? getStringField(payload, "question") : null,
		answer: payload ? getStringField(payload, "answer") : null,
		categories: categories.map(normalizeText).filter(Boolean),
		relatedQuestions: relatedQuestions.map(normalizeText).filter(Boolean),
	};
}

export function getKnowledgeClarificationSearchEvidenceFromToolExecutions(
	executions: ToolExecutionSnapshot[]
): KnowledgeClarificationSearchEvidence[] {
	return dedupeSearchEvidence(
		executions
			.filter(
				(execution) =>
					execution.toolName === "searchKnowledgeBase" &&
					execution.state === "result"
			)
			.map<KnowledgeClarificationSearchEvidence | null>((execution) => {
				const parsed = parseSearchEvidenceOutput(execution.output);
				if (!parsed) {
					return null;
				}

				return {
					...parsed,
					workflowRunId: null,
					triggerMessageId: null,
					createdAt: null,
					visibility: null,
				};
			})
			.filter(
				(item): item is KnowledgeClarificationSearchEvidence => item !== null
			)
	);
}

export function getKnowledgeClarificationSearchEvidenceFromTimelineItems(
	items: TimelineItem[]
): KnowledgeClarificationSearchEvidence[] {
	return dedupeSearchEvidence(
		items
			.map<KnowledgeClarificationSearchEvidence | null>((item) => {
				const part = extractSearchToolPart(item);
				if (!part || part.state !== "result") {
					return null;
				}

				const parsed = parseSearchEvidenceOutput(part.output);
				if (!parsed) {
					return null;
				}

				const metadata = extractToolTimelineMetadata(part);
				return {
					...parsed,
					workflowRunId: metadata.workflowRunId,
					triggerMessageId: metadata.triggerMessageId,
					createdAt: item.createdAt,
					visibility: asVisibility(item.visibility),
				};
			})
			.filter(
				(item): item is KnowledgeClarificationSearchEvidence => item !== null
			)
	);
}

export function buildConversationClarificationContextSnapshot(params: {
	conversationHistory: ConversationTranscriptEntry[];
	triggerMessage?: RoleAwareMessage | null;
	searchEvidence?: KnowledgeClarificationSearchEvidence[];
	linkedFaq?: KnowledgeClarificationLinkedFaqSnapshot | null;
}): KnowledgeClarificationContextSnapshot {
	const trigger = params.triggerMessage ?? null;

	return {
		sourceTrigger: {
			messageId: trigger?.messageId ?? null,
			text: trigger ? clipText(trigger.content, MESSAGE_CHAR_LIMIT) : null,
			senderType: trigger?.senderType ?? null,
			visibility: trigger?.visibility ?? null,
			createdAt: trigger?.timestamp ?? null,
		},
		relevantTranscript: selectRelevantTranscriptMessages({
			conversationHistory: params.conversationHistory,
			triggerMessage: trigger,
		}),
		kbSearchEvidence: dedupeSearchEvidence(params.searchEvidence ?? []),
		linkedFaq: params.linkedFaq ?? null,
	};
}

export function buildFaqClarificationContextSnapshot(params: {
	topicSummary: string;
	linkedFaq: KnowledgeClarificationLinkedFaqSnapshot | null;
}): KnowledgeClarificationContextSnapshot {
	return {
		sourceTrigger: {
			messageId: null,
			text: truncateSummary(params.topicSummary),
			senderType: null,
			visibility: null,
			createdAt: null,
		},
		relevantTranscript: [],
		kbSearchEvidence: [],
		linkedFaq: params.linkedFaq,
	};
}

export function buildSpecificClarificationTopicSummary(params: {
	triggerText?: string | null;
	searchEvidence?: KnowledgeClarificationSearchEvidence[];
	linkedFaq?: KnowledgeClarificationLinkedFaqSnapshot | null;
	fallback?: string | null;
}): string {
	const latestEvidence = [...(params.searchEvidence ?? [])]
		.reverse()
		.find(
			(item) => item.questionContext || item.query || item.articles.length > 0
		);
	const base =
		latestEvidence?.questionContext ??
		params.linkedFaq?.question ??
		params.triggerText?.trim() ??
		latestEvidence?.query ??
		params.fallback?.trim() ??
		"the missing support detail";
	const weakMatchTitle =
		latestEvidence?.retrievalQuality === "weak"
			? latestEvidence.articles[0]?.title
			: null;

	const summary = params.linkedFaq?.question
		? `Clarify the exact FAQ answer for: ${base}`
		: latestEvidence?.retrievalQuality === "none"
			? `Missing exact answer for: ${base}`
			: weakMatchTitle
				? `Clarify the exact answer for: ${base} (current weak match: ${weakMatchTitle})`
				: `Clarify the exact answer for: ${base}`;

	return truncateSummary(summary);
}
