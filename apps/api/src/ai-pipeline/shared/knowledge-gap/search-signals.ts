import {
	ConversationTimelineType,
	type TimelineItemVisibility,
} from "@plasma/types";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import type {
	SearchKnowledgeClarificationSignal,
	SearchKnowledgeRetrievalQuality,
} from "../tools/context";
import type { ToolExecutionSnapshot } from "../tools/contracts";

export type SearchKnowledgeSignal = {
	query: string | null;
	questionContext: string | null;
	totalFound: number | null;
	maxSimilarity: number | null;
	retrievalQuality: SearchKnowledgeRetrievalQuality;
	clarificationSignal: SearchKnowledgeClarificationSignal;
	workflowRunId: string | null;
	triggerMessageId: string | null;
	createdAt: string | null;
	visibility: TimelineItemVisibility | "public" | "private" | null;
};

type ToolPartRecord = {
	toolName: string;
	state: "partial" | "result" | "error";
	output?: unknown;
	providerMetadata?: unknown;
	callProviderMetadata?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringField(
	record: Record<string, unknown>,
	key: string
): string | null {
	const value = record[key];
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: null;
}

function getNumberField(
	record: Record<string, unknown>,
	key: string
): number | null {
	const value = record[key];
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRetrievalQuality(
	value: string | null
): value is SearchKnowledgeRetrievalQuality {
	return value === "none" || value === "weak" || value === "strong";
}

function isClarificationSignal(
	value: string | null
): value is SearchKnowledgeClarificationSignal {
	return (
		value === "none" || value === "immediate" || value === "background_review"
	);
}

function isSearchKnowledgeSignal(
	value: SearchKnowledgeSignal | null
): value is SearchKnowledgeSignal {
	return value !== null;
}

function parseSearchSignalOutput(
	output: unknown
): Omit<
	SearchKnowledgeSignal,
	"workflowRunId" | "triggerMessageId" | "createdAt" | "visibility"
> | null {
	if (!isRecord(output)) {
		return null;
	}

	const data = isRecord(output.data) ? output.data : null;
	if (!data) {
		return null;
	}

	const retrievalQualityValue = getStringField(data, "retrievalQuality");
	const clarificationSignalValue = getStringField(data, "clarificationSignal");

	if (
		!(
			isRetrievalQuality(retrievalQualityValue) &&
			isClarificationSignal(clarificationSignalValue)
		)
	) {
		return null;
	}

	return {
		query: getStringField(data, "query"),
		questionContext: getStringField(data, "questionContext"),
		totalFound: getNumberField(data, "totalFound"),
		maxSimilarity: getNumberField(data, "maxSimilarity"),
		retrievalQuality: retrievalQualityValue,
		clarificationSignal: clarificationSignalValue,
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

export function getSearchKnowledgeSignalsFromToolExecutions(
	executions: ToolExecutionSnapshot[]
): SearchKnowledgeSignal[] {
	return executions
		.filter(
			(execution) =>
				execution.toolName === "searchKnowledgeBase" &&
				execution.state === "result"
		)
		.map<SearchKnowledgeSignal | null>((execution) => {
			const parsed = parseSearchSignalOutput(execution.output);
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
		.filter(isSearchKnowledgeSignal);
}

export function getSearchKnowledgeSignalsFromTimelineItems(
	items: TimelineItem[]
): SearchKnowledgeSignal[] {
	return items
		.filter((item) => item.type === ConversationTimelineType.TOOL)
		.map<SearchKnowledgeSignal | null>((item) => {
			const part = extractSearchToolPart(item);
			if (!part || part.state !== "result") {
				return null;
			}

			const parsed = parseSearchSignalOutput(part.output);
			if (!parsed) {
				return null;
			}

			const metadata = extractToolTimelineMetadata(part);
			return {
				...parsed,
				workflowRunId: metadata.workflowRunId,
				triggerMessageId: metadata.triggerMessageId,
				createdAt: item.createdAt,
				visibility: item.visibility,
			};
		})
		.filter(isSearchKnowledgeSignal);
}

export function getSearchRetrievalQualityRank(
	value: SearchKnowledgeRetrievalQuality
): number {
	switch (value) {
		case "strong":
			return 2;
		case "weak":
			return 1;
		default:
			return 0;
	}
}

export function getBestSearchSignal(
	signals: SearchKnowledgeSignal[]
): SearchKnowledgeSignal | null {
	let bestSignal: SearchKnowledgeSignal | null = null;

	for (const signal of signals) {
		if (!bestSignal) {
			bestSignal = signal;
			continue;
		}

		if (
			getSearchRetrievalQualityRank(signal.retrievalQuality) >
			getSearchRetrievalQualityRank(bestSignal.retrievalQuality)
		) {
			bestSignal = signal;
			continue;
		}

		if (
			getSearchRetrievalQualityRank(signal.retrievalQuality) ===
				getSearchRetrievalQualityRank(bestSignal.retrievalQuality) &&
			(signal.maxSimilarity ?? -1) > (bestSignal.maxSimilarity ?? -1)
		) {
			bestSignal = signal;
		}
	}

	return bestSignal;
}

export function buildDeterministicClarificationTopicSummary(params: {
	triggerText: string | null;
	searchSignals: SearchKnowledgeSignal[];
}): string {
	const latestSignal = [...params.searchSignals]
		.reverse()
		.find((signal) => signal.questionContext || signal.query);
	const base =
		latestSignal?.questionContext ||
		params.triggerText?.trim() ||
		latestSignal?.query ||
		"Missing support knowledge";
	const searchLabel =
		latestSignal?.query &&
		latestSignal.query !== latestSignal.questionContext &&
		!base.includes(latestSignal.query)
			? ` Search query: ${latestSignal.query}`
			: "";
	const topicSummary =
		`Clarify missing knowledge for: ${base.trim()}.${searchLabel}`.trim();

	return topicSummary.length > 300
		? `${topicSummary.slice(0, 297).trim()}...`
		: topicSummary;
}
