import { logAiPipeline } from "../../logger";
import type { GenerationRuntimeResult } from "../../shared/generation";
import { getBehaviorSettings } from "../../shared/settings";
import { trackGenerationUsage } from "../../shared/usage";
import type { PrimaryPipelineResult } from "../contracts";
import type { IntakeReadyContext } from "../steps/intake/types";

export type PrimaryUsageTelemetry = {
	usageTokens: PrimaryPipelineResult["usageTokens"];
	creditUsage: PrimaryPipelineResult["creditUsage"];
};

export async function trackPrimaryGenerationUsage(params: {
	db: import("@api/db").Database;
	organizationId: string;
	websiteId: string;
	conversationId: string;
	visitorId: string;
	workflowRunId: string;
	triggerMessageId: string;
	intake: IntakeReadyContext;
	generationResult: GenerationRuntimeResult;
	mode?: "normal" | "outage";
}): Promise<PrimaryUsageTelemetry | undefined> {
	try {
		const behaviorSettings = getBehaviorSettings(params.intake.aiAgent);

		return await trackGenerationUsage({
			db: params.db,
			organizationId: params.organizationId,
			websiteId: params.websiteId,
			conversationId: params.conversationId,
			visitorId: params.visitorId,
			aiAgentId: params.intake.aiAgent.id,
			workflowRunId: params.workflowRunId,
			triggerMessageId: params.triggerMessageId,
			triggerVisibility: params.intake.triggerMessage?.visibility,
			modelId: params.intake.modelResolution.modelIdResolved,
			modelIdOriginal: params.intake.modelResolution.modelIdOriginal,
			modelMigrationApplied:
				params.intake.modelResolution.modelMigrationApplied,
			mode: params.mode,
			providerUsage: params.generationResult.usage,
			billingSource: params.generationResult.billingSource,
			toolCallsByName: params.generationResult.toolCallsByName,
			chargeableToolCallsByName:
				params.generationResult.chargeableToolCallsByName,
			aiThinkingEnabled: behaviorSettings.aiThinkingEnabled,
		});
	} catch (error) {
		logAiPipeline({
			area: "primary",
			event: "usage_track_failed",
			level: "warn",
			conversationId: params.conversationId,
			fields: {
				stage: "usage",
			},
			error,
		});
		return;
	}
}
