import {
	AI_AGENT_TOOL_CATALOG,
	type AiAgentToolId,
	parseSkillFileContent,
} from "@cossistant/types";
import { logAiPipeline } from "../../logger";
import { emitPipelineGenerationProgress } from "../events";
import {
	getBestSearchSignal,
	getSearchKnowledgeSignalsFromToolExecutions,
	getSearchRetrievalQualityRank,
} from "../knowledge-gap/search-signals";
import {
	type ResolvedPromptBundle,
	resolvePromptBundle,
} from "../prompt/resolver";
import {
	hasUsefulPublicReply,
	normalizePublicReplyText,
} from "../reply-contract";
import { getBehaviorSettings } from "../settings";
import { buildPipelineToolset } from "../tools";
import type {
	ToolExecutionSnapshot,
	ToolRuntimeState,
} from "../tools/contracts";
import type {
	CapturedFinalAction,
	GenerationMode,
	GenerationRuntimeInput,
	GenerationRuntimeResult,
	GenerationTokenUsage,
	PipelineKind,
} from "./contracts";
import { runGenerationAttempt } from "./internal/attempt";
import { emitGenerationDebugLog } from "./internal/debug-log";
import {
	buildSafeSkipAction,
	buildToolContext,
	countTotalToolCalls,
	createToolRuntimeState,
} from "./internal/runtime-utils";
import { writeGenerationSystemPromptDebugDump } from "./internal/system-prompt-debug-dump";
import { buildGenerationMessages } from "./messages/format-history";
import { buildGenerationSystemPrompt } from "./prompt/builder";

const ANSWER_FIRST_REPAIR_TOOL_ALLOWLIST: AiAgentToolId[] = [
	"sendMessage",
	"respond",
	"escalate",
];
const SEARCH_REPAIR_SNIPPET_LIMIT = 240;

type ParsedSearchExecution = {
	query: string | null;
	questionContext: string | null;
	retrievalQuality: "none" | "weak" | "strong";
	maxSimilarity: number | null;
	articles: Array<{
		title: string | null;
		sourceUrl: string | null;
		similarity: number | null;
		snippet: string | null;
	}>;
};

type VisitorReplyValidationFailure = {
	code:
		| "missing_public_reply"
		| "actionable_search_skipped"
		| "question_only_public_reply";
	reason: string;
	bestSearchExecution: ParsedSearchExecution | null;
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

function clipText(value: string, maxLength: number): string {
	const normalized = normalizePublicReplyText(value);
	if (normalized.length <= maxLength) {
		return normalized;
	}

	return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function parseSearchExecution(
	execution: ToolExecutionSnapshot
): ParsedSearchExecution | null {
	if (
		execution.toolName !== "searchKnowledgeBase" ||
		execution.state !== "result" ||
		!isRecord(execution.output)
	) {
		return null;
	}

	const data = isRecord(execution.output.data) ? execution.output.data : null;
	if (!data) {
		return null;
	}

	const retrievalQuality = getStringField(data, "retrievalQuality");
	if (
		retrievalQuality !== "none" &&
		retrievalQuality !== "weak" &&
		retrievalQuality !== "strong"
	) {
		return null;
	}

	const articles = Array.isArray(data.articles) ? data.articles : [];

	return {
		query: getStringField(data, "query"),
		questionContext: getStringField(data, "questionContext"),
		retrievalQuality,
		maxSimilarity: getNumberField(data, "maxSimilarity"),
		articles: articles.slice(0, 3).map((article) => {
			if (!isRecord(article)) {
				return {
					title: null,
					sourceUrl: null,
					similarity: null,
					snippet: null,
				};
			}

			return {
				title: getStringField(article, "title"),
				sourceUrl: getStringField(article, "sourceUrl"),
				similarity: getNumberField(article, "similarity"),
				snippet:
					typeof article.content === "string"
						? clipText(article.content, SEARCH_REPAIR_SNIPPET_LIMIT)
						: null,
			};
		}),
	};
}

function getBestSearchExecution(
	executions: ToolExecutionSnapshot[]
): ParsedSearchExecution | null {
	let bestExecution: ParsedSearchExecution | null = null;

	for (const execution of executions) {
		const parsed = parseSearchExecution(execution);
		if (!parsed) {
			continue;
		}

		if (!bestExecution) {
			bestExecution = parsed;
			continue;
		}

		if (
			getSearchRetrievalQualityRank(parsed.retrievalQuality) >
			getSearchRetrievalQualityRank(bestExecution.retrievalQuality)
		) {
			bestExecution = parsed;
			continue;
		}

		if (
			getSearchRetrievalQualityRank(parsed.retrievalQuality) ===
				getSearchRetrievalQualityRank(bestExecution.retrievalQuality) &&
			(parsed.maxSimilarity ?? -1) > (bestExecution.maxSimilarity ?? -1)
		) {
			bestExecution = parsed;
		}
	}

	return bestExecution;
}

function getPublicReplyTexts(runtimeState: ToolRuntimeState): string[] {
	return (runtimeState.publicReplyTexts ?? [])
		.map((text) => normalizePublicReplyText(text))
		.filter((text) => text.length > 0);
}

function getMessagingContractError(params: {
	input: GenerationRuntimeInput;
	action: CapturedFinalAction;
	publicMessagesSent: number;
}): string | null {
	const { input, action, publicMessagesSent } = params;
	const requiresPublicChatReply =
		action.action === "respond" ||
		action.action === "resolve" ||
		action.action === "mark_spam";

	if (
		input.mode !== "background_only" &&
		requiresPublicChatReply &&
		publicMessagesSent === 0
	) {
		return "Non-background completion requires sendMessage as the main public response";
	}

	return null;
}

function getVisitorReplyValidationFailure(params: {
	input: GenerationRuntimeInput;
	action: CapturedFinalAction;
	runtimeState: ToolRuntimeState;
}): VisitorReplyValidationFailure | null {
	const { input, action, runtimeState } = params;
	const publicReplyTexts = getPublicReplyTexts(runtimeState);
	const requiresPublicChatReply =
		action.action === "respond" ||
		action.action === "resolve" ||
		action.action === "mark_spam";
	const bestSearchSignal = getBestSearchSignal(
		getSearchKnowledgeSignalsFromToolExecutions(runtimeState.toolExecutions)
	);
	const actionableSearch =
		bestSearchSignal?.retrievalQuality === "strong" ||
		bestSearchSignal?.retrievalQuality === "weak";
	const bestSearchExecution = getBestSearchExecution(
		runtimeState.toolExecutions
	);

	if (input.mode !== "respond_to_visitor") {
		return null;
	}

	if (requiresPublicChatReply && publicReplyTexts.length === 0) {
		return {
			code: "missing_public_reply",
			reason: "Visitor-facing completion requires a public reply.",
			bestSearchExecution,
		};
	}

	if (!actionableSearch) {
		return null;
	}

	if (action.action === "skip") {
		return {
			code: "actionable_search_skipped",
			reason:
				"KB search found actionable evidence, so the run cannot end with skip.",
			bestSearchExecution,
		};
	}

	if (action.action !== "escalate" && publicReplyTexts.length === 0) {
		return {
			code: "missing_public_reply",
			reason:
				"KB search found actionable evidence, but no public answer was sent.",
			bestSearchExecution,
		};
	}

	if (publicReplyTexts.length > 0 && !hasUsefulPublicReply(publicReplyTexts)) {
		return {
			code: "question_only_public_reply",
			reason:
				"KB search found actionable evidence, but the visitor only received clarification questions.",
			bestSearchExecution,
		};
	}

	return null;
}

function buildRepairEvidenceSection(
	bestSearchExecution: ParsedSearchExecution | null
): string {
	if (!bestSearchExecution) {
		return `## Earlier Context
No reusable KB snippets were recorded from the previous attempt.

If you still cannot safely answer from the existing conversation context, escalate instead of asking a bare clarification question.`;
	}

	const evidenceLines = bestSearchExecution.articles.length
		? bestSearchExecution.articles.map((article, index) =>
				[
					`- Source ${index + 1}: title=${article.title ?? "none"} | similarity=${article.similarity ?? "unknown"} | url=${article.sourceUrl ?? "none"}`,
					article.snippet ? `  snippet=${article.snippet}` : null,
				]
					.filter(Boolean)
					.join("\n")
			)
		: [
				"- No article snippets were preserved, but the retrieval signal was actionable.",
			];

	return `## Earlier KB Evidence
query=${bestSearchExecution.query ?? "none"}
questionContext=${bestSearchExecution.questionContext ?? "none"}
retrievalQuality=${bestSearchExecution.retrievalQuality}
maxSimilarity=${bestSearchExecution.maxSimilarity ?? "unknown"}

${evidenceLines.join("\n")}`;
}

function buildAnswerFirstRepairPrompt(params: {
	failure: VisitorReplyValidationFailure;
	runtimeState: ToolRuntimeState;
}): string {
	const publicReplyTexts = getPublicReplyTexts(params.runtimeState);
	const previousRepliesSection =
		publicReplyTexts.length > 0
			? `## Public Replies Already Sent
${publicReplyTexts.map((text, index) => `- Reply ${index + 1}: ${text}`).join("\n")}`
			: `## Public Replies Already Sent
None.`;

	return `## Answer-First Repair
The previous attempt was invalid because it did not help the visitor enough.
Failure reason: ${params.failure.reason}

Fix it now using only the tools available in this repair attempt.

Rules:
- Send a helpful public reply before you finish unless you escalate immediately.
- If KB evidence exists below, answer from it first.
- Do not ask only a clarification question.
- If you still need clarification, ask one narrow follow-up only after sharing the grounded answer or partial answer.
- Do not call searchKnowledgeBase or requestKnowledgeClarification in this repair attempt.
- Finish with respond or escalate.

${previousRepliesSection}

${buildRepairEvidenceSection(params.failure.bestSearchExecution)}`;
}

function buildRuntimeToolSkills(params: {
	promptBundle: ResolvedPromptBundle;
	toolNames: string[];
}): Array<{ label: string; content: string }> {
	const runtimeToolNameSet = new Set(params.toolNames);
	const enabledToolSkillByName = new Map(
		params.promptBundle.enabledSkills
			.filter((skill) => skill.source === "tool")
			.map((skill) => [skill.name, skill])
	);

	return AI_AGENT_TOOL_CATALOG.filter((tool) =>
		runtimeToolNameSet.has(tool.id)
	).map((tool) => {
		const candidate =
			enabledToolSkillByName.get(tool.defaultSkill.name)?.content ??
			tool.defaultSkill.content;
		try {
			const parsed = parseSkillFileContent({
				content: candidate,
				canonicalFileName: tool.defaultSkill.name,
			});
			return {
				label: tool.defaultSkill.label,
				content: parsed.body,
			};
		} catch {
			return {
				label: tool.defaultSkill.label,
				content: candidate,
			};
		}
	});
}

export async function runGenerationRuntime(
	input: GenerationRuntimeInput
): Promise<GenerationRuntimeResult> {
	const runtimeState = createToolRuntimeState();
	const toolContext = buildToolContext({
		input,
		runtimeState,
	});

	await emitPipelineGenerationProgress({
		conversation: input.conversation,
		aiAgentId: input.aiAgent.id,
		workflowRunId: input.workflowRunId,
		phase: "thinking",
		message: "Analyzing conversation context...",
		audience: "dashboard",
	}).catch((error) => {
		emitGenerationDebugLog(
			input,
			"warn",
			`[ai-pipeline:generation] conv=${input.conversation.id} workflowRunId=${input.workflowRunId} evt=progress_thinking_failed`,
			error
		);
	});

	const baseToolsetResolution = buildPipelineToolset({
		aiAgent: input.aiAgent,
		context: toolContext,
		allowedToolNames: input.toolAllowlist,
	});

	if (baseToolsetResolution.toolNames.length === 0) {
		return {
			status: "completed",
			action: buildSafeSkipAction("No tools available after policy gating"),
			publicMessagesSent: runtimeState.publicMessagesSent,
			toolCallsByName: runtimeState.toolCallCounts,
			mutationToolCallsByName: runtimeState.mutationToolCallCounts,
			chargeableToolCallsByName: runtimeState.chargeableToolCallCounts,
			totalToolCalls: 0,
			attempts: [],
		};
	}

	if (baseToolsetResolution.finishToolNames.length === 0) {
		return {
			status: "completed",
			action: buildSafeSkipAction("No finish tools available"),
			publicMessagesSent: runtimeState.publicMessagesSent,
			toolCallsByName: runtimeState.toolCallCounts,
			mutationToolCallsByName: runtimeState.mutationToolCallCounts,
			chargeableToolCallsByName: runtimeState.chargeableToolCallCounts,
			totalToolCalls: 0,
			attempts: [],
		};
	}

	let runtimeToolSkills: Array<{ label: string; content: string }> = [];
	let promptBundle: Awaited<ReturnType<typeof resolvePromptBundle>>;
	try {
		promptBundle = await resolvePromptBundle({
			db: input.db,
			aiAgent: input.aiAgent,
			mode: input.mode,
		});
		runtimeToolSkills = buildRuntimeToolSkills({
			promptBundle,
			toolNames: baseToolsetResolution.toolNames,
		});
	} catch (error) {
		emitGenerationDebugLog(
			input,
			"warn",
			`[ai-pipeline:generation] conv=${input.conversation.id} workflowRunId=${input.workflowRunId} evt=prompt_bundle_resolve_failed`,
			error
		);

		return {
			status: "error",
			action: buildSafeSkipAction("Failed to resolve prompt bundle"),
			error: "Failed to resolve prompt bundle",
			failureCode: "runtime_error",
			publicMessagesSent: runtimeState.publicMessagesSent,
			toolCallsByName: runtimeState.toolCallCounts,
			mutationToolCallsByName: runtimeState.mutationToolCallCounts,
			chargeableToolCallsByName: runtimeState.chargeableToolCallCounts,
			totalToolCalls: countTotalToolCalls(runtimeState.toolCallCounts),
			attempts: [],
		};
	}

	const systemPrompt = buildGenerationSystemPrompt({
		input,
		promptBundle,
		toolset: baseToolsetResolution.tools,
		toolNames: baseToolsetResolution.toolNames,
		toolSkills: runtimeToolSkills,
	});

	const messages = buildGenerationMessages(input.generationEntries);

	await writeGenerationSystemPromptDebugDump({
		input,
		messages,
		systemPrompt,
	});

	const behaviorSettings = getBehaviorSettings(input.aiAgent);

	const nonFinishToolBudget = Math.max(
		1,
		Math.floor(behaviorSettings.maxToolInvocationsPerRun)
	);

	const attempts: NonNullable<GenerationRuntimeResult["attempts"]> = [];

	runtimeState.finalAction = null;
	runtimeState.lastToolError = null;

	const primaryResult = await runGenerationAttempt({
		input,
		attempt: 1,
		modelId: input.aiAgent.model,
		systemPrompt,
		messages,
		nonFinishToolBudget,
		toolsetResolution: baseToolsetResolution,
		runtimeState,
		attempts,
	});

	if (primaryResult.status === "completed") {
		const validationFailure = getVisitorReplyValidationFailure({
			input,
			action: primaryResult.action,
			runtimeState,
		});
		if (!validationFailure) {
			const contractError = getMessagingContractError({
				input,
				action: primaryResult.action,
				publicMessagesSent: runtimeState.publicMessagesSent,
			});
			if (contractError) {
				return {
					status: "error",
					action: buildSafeSkipAction("Invalid public messaging contract"),
					error: contractError,
					failureCode: "runtime_error",
					publicMessagesSent: runtimeState.publicMessagesSent,
					toolCallsByName: runtimeState.toolCallCounts,
					mutationToolCallsByName: runtimeState.mutationToolCallCounts,
					chargeableToolCallsByName: runtimeState.chargeableToolCallCounts,
					toolExecutions: runtimeState.toolExecutions,
					totalToolCalls: countTotalToolCalls(runtimeState.toolCallCounts),
					attempts,
				};
			}

			return {
				...primaryResult,
				attempts,
			};
		}

		logAiPipeline({
			area: "generation",
			event: "answer_first_repair_start",
			level: "warn",
			conversationId: input.conversation.id,
			fields: {
				attempt: 1,
				model: input.aiAgent.model,
				reason: validationFailure.reason,
				code: validationFailure.code,
			},
		});

		const repairToolsetResolution = buildPipelineToolset({
			aiAgent: input.aiAgent,
			context: toolContext,
			allowedToolNames: ANSWER_FIRST_REPAIR_TOOL_ALLOWLIST,
		});

		if (
			repairToolsetResolution.toolNames.length === 0 ||
			repairToolsetResolution.finishToolNames.length === 0
		) {
			return {
				status: "error",
				action: buildSafeSkipAction("Answer-first repair unavailable"),
				error:
					"Answer-first repair could not run because no repair toolset was available",
				failureCode: "runtime_error",
				publicMessagesSent: runtimeState.publicMessagesSent,
				toolCallsByName: runtimeState.toolCallCounts,
				mutationToolCallsByName: runtimeState.mutationToolCallCounts,
				chargeableToolCallsByName: runtimeState.chargeableToolCallCounts,
				toolExecutions: runtimeState.toolExecutions,
				totalToolCalls: countTotalToolCalls(runtimeState.toolCallCounts),
				attempts,
			};
		}

		runtimeState.finalAction = null;
		runtimeState.lastToolError = null;
		const repairSystemPrompt = `${buildGenerationSystemPrompt({
			input,
			promptBundle,
			toolset: repairToolsetResolution.tools,
			toolNames: repairToolsetResolution.toolNames,
			toolSkills: buildRuntimeToolSkills({
				promptBundle,
				toolNames: repairToolsetResolution.toolNames,
			}),
		})}\n\n${buildAnswerFirstRepairPrompt({
			failure: validationFailure,
			runtimeState,
		})}`;

		const repairResult = await runGenerationAttempt({
			input,
			attempt: 2,
			modelId: input.aiAgent.model,
			systemPrompt: repairSystemPrompt,
			messages,
			nonFinishToolBudget,
			toolsetResolution: repairToolsetResolution,
			runtimeState,
			attempts,
		});

		if (repairResult.status === "error" || repairResult.status === "blocked") {
			return {
				...repairResult,
				attempts,
			};
		}

		const repairValidationFailure = getVisitorReplyValidationFailure({
			input,
			action: repairResult.action,
			runtimeState,
		});

		if (repairValidationFailure) {
			return {
				status: "error",
				action: buildSafeSkipAction("Answer-first contract not satisfied"),
				error: `Answer-first visitor reply contract not satisfied: ${repairValidationFailure.reason}`,
				failureCode: "runtime_error",
				publicMessagesSent: runtimeState.publicMessagesSent,
				toolCallsByName: runtimeState.toolCallCounts,
				mutationToolCallsByName: runtimeState.mutationToolCallCounts,
				chargeableToolCallsByName: runtimeState.chargeableToolCallCounts,
				toolExecutions: runtimeState.toolExecutions,
				totalToolCalls: countTotalToolCalls(runtimeState.toolCallCounts),
				attempts,
			};
		}

		return {
			...repairResult,
			attempts,
		};
	}

	return {
		...primaryResult,
		attempts,
	};
}

export type {
	CapturedFinalAction,
	GenerationMode,
	GenerationRuntimeInput,
	GenerationRuntimeResult,
	GenerationTokenUsage,
	PipelineKind,
} from "./contracts";
