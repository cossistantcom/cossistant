import { logAiPipeline } from "../../logger";
import type { GenerationRuntimeResult } from "../../shared/generation";
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
}): Promise<PrimaryUsageTelemetry | undefined> {
	try {
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
			providerUsage: params.generationResult.usage,
			billingSource: params.generationResult.billingSource,
			toolCallsByName: params.generationResult.toolCallsByName,
			chargeableToolCallsByName:
				params.generationResult.chargeableToolCallsByName,
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
