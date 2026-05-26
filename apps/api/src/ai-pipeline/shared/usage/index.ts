import {
	calculateAiCreditCharge,
	getMinimumAiCreditCharge,
} from "@api/lib/ai-credits/config";
import {
	type IngestAiCreditUsageStatus,
	ingestAiCreditUsage,
} from "@api/lib/ai-credits/polar-meter";
import type { OpenRouterBillingSource } from "@api/lib/openrouter-byok/resolver";
import { logAiPipeline } from "../../logger";
import type { GenerationTokenUsage } from "../generation/contracts";
import {
	type GenerationUsagePhase,
	type GenerationUsageSource,
	type GenerationUsageTimelinePayload,
	logGenerationUsageTimeline,
} from "./timeline";
import { resolveGenerationTokenUsage } from "./token-usage";

export type GenerationCreditUsage = {
	totalCredits: number;
	thinkingCredits: number;
	mode: "normal" | "outage";
	ingestStatus:
		| IngestAiCreditUsageStatus
		| "failed"
		| "skipped"
		| "skipped_customer_openrouter"
		| "skipped_cossistant_platform"
		| "skipped_zero";
	billingSource: OpenRouterBillingSource;
};

export type GenerationUsageTrackingResult = {
	usageTokens: GenerationTokenUsage;
	creditUsage: GenerationCreditUsage;
};

export async function trackGenerationUsage(params: {
	db: import("@api/db").Database;
	organizationId: string;
	websiteId: string;
	conversationId?: string;
	visitorId?: string;
	aiAgentId?: string;
	workflowRunId?: string;
	usageEventId?: string;
	triggerMessageId?: string;
	triggerVisibility?: "public" | "private";
	modelId: string;
	modelIdOriginal?: string;
	modelMigrationApplied?: boolean;
	mode?: "normal" | "outage";
	providerUsage?:
		| {
				inputTokens?: number;
				outputTokens?: number;
				totalTokens?: number;
				reasoningTokens?: number;
		  }
		| undefined;
	toolCallsByName?: Record<string, number> | null;
	chargeableToolCallsByName?: Record<string, number> | null;
	aiThinkingEnabled?: boolean | null;
	source?: GenerationUsageSource;
	phase?: GenerationUsagePhase;
	knowledgeClarificationRequestId?: string;
	knowledgeClarificationStepIndex?: number;
	billingSource?: OpenRouterBillingSource;
}): Promise<GenerationUsageTrackingResult> {
	const usageTokens = resolveGenerationTokenUsage({
		providerUsage: params.providerUsage,
	});
	const mode = params.mode ?? "normal";
	const usageEventId = params.usageEventId ?? params.workflowRunId;

	if (!usageEventId) {
		throw new Error(
			"trackGenerationUsage requires usageEventId or workflowRunId"
		);
	}

	const effectiveToolCallsByName =
		params.chargeableToolCallsByName &&
		Object.keys(params.chargeableToolCallsByName).length > 0
			? params.chargeableToolCallsByName
			: params.toolCallsByName;
	const hasToolCounts =
		effectiveToolCallsByName &&
		Object.keys(effectiveToolCallsByName).length > 0;
	const charge = hasToolCounts
		? calculateAiCreditCharge({
				modelId: params.modelId,
				toolCallsByName: effectiveToolCallsByName,
				aiThinkingEnabled: params.aiThinkingEnabled,
			})
		: getMinimumAiCreditCharge(params.modelId, {
				aiThinkingEnabled: params.aiThinkingEnabled,
			});
	const billingSource = params.billingSource ?? "cossistant";

	let ingestStatus: GenerationCreditUsage["ingestStatus"] = "skipped";

	if (billingSource === "customer_openrouter") {
		ingestStatus = "skipped_customer_openrouter";
	} else if (billingSource === "cossistant_platform") {
		ingestStatus = "skipped_cossistant_platform";
	} else if (charge.totalCredits <= 0) {
		ingestStatus = "skipped_zero";
	} else {
		try {
			const ingestResult = await ingestAiCreditUsage({
				organizationId: params.organizationId,
				credits: charge.totalCredits,
				workflowRunId: usageEventId,
				modelId: params.modelId,
				modelIdOriginal: params.modelIdOriginal,
				modelMigrationApplied: params.modelMigrationApplied,
				mode,
				baseCredits: charge.baseCredits,
				modelCredits: charge.modelCredits,
				thinkingCredits: charge.thinkingCredits,
				toolCredits: charge.toolCredits,
				billableToolCount: charge.billableToolCount,
				excludedToolCount: charge.excludedToolCount,
				totalToolCount: charge.totalToolCount,
				reasoningTokens: usageTokens.reasoningTokens,
			});
			ingestStatus = ingestResult.status;
		} catch (error) {
			ingestStatus = "failed";
			logAiPipeline({
				area: "usage",
				event: "ingest_failed",
				level: "warn",
				conversationId:
					params.conversationId ??
					params.knowledgeClarificationRequestId ??
					undefined,
				error,
			});
		}
	}

	const timelinePayload: GenerationUsageTimelinePayload = {
		usageEventId,
		workflowRunId: params.workflowRunId,
		triggerMessageId: params.triggerMessageId,
		triggerVisibility: params.triggerVisibility,
		modelId: params.modelId,
		modelIdOriginal: params.modelIdOriginal,
		modelMigrationApplied: params.modelMigrationApplied,
		inputTokens: usageTokens.inputTokens,
		outputTokens: usageTokens.outputTokens,
		totalTokens: usageTokens.totalTokens,
		reasoningTokens: usageTokens.reasoningTokens,
		tokenSource: usageTokens.source,
		baseCredits: charge.baseCredits,
		modelCredits: charge.modelCredits,
		thinkingCredits: charge.thinkingCredits,
		toolCredits: charge.toolCredits,
		totalCredits: charge.totalCredits,
		billableToolCount: charge.billableToolCount,
		excludedToolCount: charge.excludedToolCount,
		totalToolCount: charge.totalToolCount,
		mode,
		ingestStatus,
		balanceBefore: null,
		balanceAfterEstimate: null,
		source: params.source,
		phase: params.phase,
		knowledgeClarificationRequestId: params.knowledgeClarificationRequestId,
		knowledgeClarificationStepIndex: params.knowledgeClarificationStepIndex,
	};

	if (params.conversationId && params.visitorId && params.aiAgentId) {
		try {
			await logGenerationUsageTimeline({
				db: params.db,
				organizationId: params.organizationId,
				websiteId: params.websiteId,
				conversationId: params.conversationId,
				visitorId: params.visitorId,
				aiAgentId: params.aiAgentId,
				payload: timelinePayload,
			});
		} catch (error) {
			logAiPipeline({
				area: "usage",
				event: "timeline_failed",
				level: "warn",
				conversationId:
					params.conversationId ??
					params.knowledgeClarificationRequestId ??
					undefined,
				error,
			});
		}
	}

	return {
		usageTokens,
		creditUsage: {
			totalCredits: charge.totalCredits,
			thinkingCredits: charge.thinkingCredits,
			mode,
			ingestStatus,
			billingSource,
		},
	};
}

export {
	AI_CREDIT_USAGE_TIMELINE_TOOL_NAME,
	type GenerationUsageTimelinePayload,
} from "./timeline";
export { TOKEN_USAGE_FALLBACK_TOTAL } from "./token-usage";
