import { getActiveKnowledgeClarificationForConversation } from "@api/db/queries/knowledge-clarification";
import type { KnowledgeClarificationSearchEvidence } from "@api/lib/knowledge-clarification-context";
import {
	buildConversationClarificationContextSnapshot,
	buildSpecificClarificationTopicSummary,
	getKnowledgeClarificationSearchEvidenceFromToolExecutions,
} from "@api/lib/knowledge-clarification-context";
import type { IntakeReadyContext } from "../../primary-pipeline/steps/intake/types";
import { requestKnowledgeClarification as requestKnowledgeClarificationAction } from "../actions/request-knowledge-clarification";
import type { GenerationRuntimeResult } from "../generation/contracts";
import { getBehaviorSettings } from "../settings";
import type { PipelineToolContext } from "../tools/contracts";
import {
	type ImmediateClarificationIntentDetail,
	resolveImmediateClarificationIntentDetail,
} from "./intent-sufficiency";
import {
	getSearchKnowledgeSignalsFromToolExecutions,
	type SearchKnowledgeSignal,
} from "./search-signals";
import { buildToolDrivenClarificationContext } from "./tool-clarification-context";

type SearchKnowledgeResultData = {
	articles: Array<{
		content: string;
		knowledgeId: string | null;
		similarity: number;
		title: string | null;
		sourceUrl: string | null;
		sourceType: string | null;
	}>;
	query: string;
	questionContext: string | null;
	totalFound: number;
	maxSimilarity: number | null;
	retrievalQuality: "none" | "weak" | "strong";
	clarificationSignal: "immediate" | "background_review" | "none";
};

type ImmediateClarificationCandidate =
	| {
			status: "eligible";
			intentDetail: ImmediateClarificationIntentDetail;
			searchEvidence: KnowledgeClarificationSearchEvidence;
	  }
	| {
			status: "skipped";
			reason: "insufficient_intent" | "search_not_obvious_gap";
	  };

function toSearchEvidence(
	params:
		| {
				searchResult: SearchKnowledgeResultData;
		  }
		| {
				searchSignal: SearchKnowledgeSignal;
		  }
): KnowledgeClarificationSearchEvidence {
	if ("searchResult" in params) {
		const { searchResult } = params;
		return {
			query: searchResult.query,
			questionContext: searchResult.questionContext,
			totalFound: searchResult.totalFound,
			maxSimilarity: searchResult.maxSimilarity,
			retrievalQuality: searchResult.retrievalQuality,
			clarificationSignal: searchResult.clarificationSignal,
			articles: searchResult.articles.map((article) => ({
				knowledgeId: article.knowledgeId,
				title: article.title,
				sourceUrl: article.sourceUrl,
				sourceType: article.sourceType,
				similarity: article.similarity,
				snippet: article.content,
			})),
			workflowRunId: null,
			triggerMessageId: null,
			createdAt: null,
			visibility: null,
		};
	}

	const { searchSignal } = params;
	return {
		query: searchSignal.query,
		questionContext: searchSignal.questionContext,
		totalFound: searchSignal.totalFound,
		maxSimilarity: searchSignal.maxSimilarity,
		retrievalQuality: searchSignal.retrievalQuality,
		clarificationSignal: searchSignal.clarificationSignal,
		articles: [],
		workflowRunId: searchSignal.workflowRunId,
		triggerMessageId: searchSignal.triggerMessageId,
		createdAt: searchSignal.createdAt,
		visibility:
			searchSignal.visibility === "public" ||
			searchSignal.visibility === "private"
				? searchSignal.visibility
				: null,
	};
}

function resolveImmediateClarificationCandidate(params: {
	searchEvidence: KnowledgeClarificationSearchEvidence[];
	triggerText: string | null;
}): ImmediateClarificationCandidate {
	let sawImmediateSignal = false;

	for (const evidence of params.searchEvidence) {
		if (
			!(
				evidence.retrievalQuality === "none" &&
				evidence.clarificationSignal === "immediate"
			)
		) {
			continue;
		}

		sawImmediateSignal = true;
		const intentDetail = resolveImmediateClarificationIntentDetail({
			questionContext: evidence.questionContext,
			triggerText: params.triggerText,
		});
		if (intentDetail) {
			return {
				status: "eligible",
				intentDetail,
				searchEvidence: evidence,
			};
		}
	}

	return {
		status: "skipped",
		reason: sawImmediateSignal
			? "insufficient_intent"
			: "search_not_obvious_gap",
	};
}

async function createGuardedImmediateClarification(params: {
	db: import("@api/db").Database;
	conversation: {
		id: string;
		websiteId: string;
		organizationId: string;
	};
	aiAgentId: string;
	topicSummary: string;
	contextSnapshot: Awaited<
		ReturnType<typeof buildToolDrivenClarificationContext>
	>["contextSnapshot"];
	markHandled?: () => void;
}): Promise<
	| {
			status: "created";
			requestId: string;
			created: boolean;
			topicSummary: string;
	  }
	| {
			status: "skipped";
			reason: "active_clarification_exists";
	  }
> {
	const existingClarification =
		await getActiveKnowledgeClarificationForConversation(params.db, {
			conversationId: params.conversation.id,
			websiteId: params.conversation.websiteId,
		});
	if (existingClarification) {
		params.markHandled?.();
		return {
			status: "skipped",
			reason: "active_clarification_exists",
		};
	}

	const clarificationResult = await requestKnowledgeClarificationAction({
		db: params.db,
		conversation: params.conversation as never,
		organizationId: params.conversation.organizationId,
		websiteId: params.conversation.websiteId,
		aiAgentId: params.aiAgentId,
		topicSummary: params.topicSummary,
		contextSnapshot: params.contextSnapshot,
	});

	params.markHandled?.();
	return {
		status: "created",
		requestId: clarificationResult.requestId,
		created: clarificationResult.created,
		topicSummary: params.topicSummary,
	};
}

export async function maybeCreateImmediateClarificationFromSearchResult(params: {
	ctx: PipelineToolContext;
	searchResult: SearchKnowledgeResultData;
}): Promise<
	| {
			status: "created";
			requestId: string;
			created: boolean;
			topicSummary: string;
	  }
	| {
			status: "skipped";
			reason:
				| "capability_disabled"
				| "not_primary_pipeline"
				| "already_requested"
				| "active_clarification_exists"
				| "insufficient_intent"
				| "search_not_obvious_gap";
	  }
> {
	const { ctx, searchResult } = params;

	if (ctx.pipelineKind !== "primary") {
		return {
			status: "skipped",
			reason: "not_primary_pipeline",
		};
	}

	if (!ctx.canRequestKnowledgeClarification) {
		return {
			status: "skipped",
			reason: "capability_disabled",
		};
	}

	if (ctx.runtimeState.immediateKnowledgeGapClarificationHandled) {
		return {
			status: "skipped",
			reason: "already_requested",
		};
	}

	if (
		(ctx.runtimeState.toolCallCounts.requestKnowledgeClarification ?? 0) > 0
	) {
		ctx.runtimeState.immediateKnowledgeGapClarificationHandled = true;
		return {
			status: "skipped",
			reason: "already_requested",
		};
	}

	const candidate = resolveImmediateClarificationCandidate({
		searchEvidence: [toSearchEvidence({ searchResult })],
		triggerText: ctx.triggerMessageText ?? null,
	});
	if (candidate.status !== "eligible") {
		return {
			status: "skipped",
			reason: candidate.reason,
		};
	}

	const conversationContext = await buildToolDrivenClarificationContext({
		ctx,
		searchEvidence: [candidate.searchEvidence],
	});
	const topicSummary = buildSpecificClarificationTopicSummary({
		triggerText: conversationContext.triggerMessage?.content ?? null,
		searchEvidence: [candidate.searchEvidence],
		fallback: candidate.intentDetail.text,
	});
	return createGuardedImmediateClarification({
		db: ctx.db,
		conversation: ctx.conversation,
		aiAgentId: ctx.aiAgentId,
		topicSummary,
		contextSnapshot: conversationContext.contextSnapshot,
		markHandled: () => {
			ctx.runtimeState.immediateKnowledgeGapClarificationHandled = true;
		},
	});
}

export async function maybeCreateImmediateClarificationFromSearchGap(params: {
	db: import("@api/db").Database;
	intake: IntakeReadyContext;
	generationResult: GenerationRuntimeResult;
}): Promise<
	| {
			status: "created";
			requestId: string;
			created: boolean;
			topicSummary: string;
	  }
	| {
			status: "skipped";
			reason:
				| "capability_disabled"
				| "active_clarification_exists"
				| "already_requested"
				| "insufficient_intent"
				| "no_search"
				| "search_not_obvious_gap";
	  }
> {
	const settings = getBehaviorSettings(params.intake.aiAgent);
	if (!settings.canRequestKnowledgeClarification) {
		return {
			status: "skipped",
			reason: "capability_disabled",
		};
	}

	if (
		(params.generationResult.toolCallsByName.requestKnowledgeClarification ??
			0) > 0
	) {
		return {
			status: "skipped",
			reason: "already_requested",
		};
	}

	const searchSignals = getSearchKnowledgeSignalsFromToolExecutions(
		params.generationResult.toolExecutions ?? []
	);
	if (searchSignals.length === 0) {
		return {
			status: "skipped",
			reason: "no_search",
		};
	}

	const searchEvidence = searchSignals.map((searchSignal) =>
		toSearchEvidence({ searchSignal })
	);
	const candidate = resolveImmediateClarificationCandidate({
		searchEvidence,
		triggerText: params.intake.triggerMessageText,
	});
	if (candidate.status !== "eligible") {
		return {
			status: "skipped",
			reason: candidate.reason,
		};
	}

	const contextSnapshot = buildConversationClarificationContextSnapshot({
		conversationHistory: params.intake.conversationHistory,
		triggerMessage: params.intake.triggerMessage,
		searchEvidence,
	});
	const topicSummary = buildSpecificClarificationTopicSummary({
		triggerText: params.intake.triggerMessageText,
		searchEvidence: [candidate.searchEvidence],
		fallback: candidate.intentDetail.text,
	});
	return createGuardedImmediateClarification({
		db: params.db,
		conversation: params.intake.conversation,
		aiAgentId: params.intake.aiAgent.id,
		topicSummary,
		contextSnapshot,
	});
}
