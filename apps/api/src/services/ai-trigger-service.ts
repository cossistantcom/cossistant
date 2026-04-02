import { db } from "@api/db";
import { getActiveAiAgentForWebsite } from "@api/db/queries/ai-agent";
import { getAiAgentQueueTriggers } from "@api/utils/queue-triggers";
import { AI_AGENT_INITIAL_DELAY_MS } from "@plasma/jobs";

export type EnqueueAiTriggerParams = {
	conversationId: string;
	messageId: string;
	messageCreatedAt: string;
	websiteId: string;
	organizationId: string;
};

export type EnqueueAiTriggerResult = {
	status: "queued" | "alreadyQueued" | "skipped";
	reason?: "no_active_agent";
	aiAgentId?: string;
};

export async function enqueueAiAgentTrigger(
	params: EnqueueAiTriggerParams
): Promise<EnqueueAiTriggerResult> {
	const aiAgent = await getActiveAiAgentForWebsite(db, {
		websiteId: params.websiteId,
		organizationId: params.organizationId,
	});

	if (!aiAgent) {
		return {
			status: "skipped",
			reason: "no_active_agent",
		};
	}

	const queueResult = await getAiAgentQueueTriggers().enqueueAiAgentJob(
		{
			conversationId: params.conversationId,
			websiteId: params.websiteId,
			organizationId: params.organizationId,
			aiAgentId: aiAgent.id,
			messageId: params.messageId,
			messageCreatedAt: params.messageCreatedAt,
			runAttempt: 0,
		},
		{ delayMs: AI_AGENT_INITIAL_DELAY_MS }
	);

	if (queueResult.status === "created") {
		return {
			status: "queued",
			aiAgentId: aiAgent.id,
		};
	}

	return {
		status: "alreadyQueued",
		aiAgentId: aiAgent.id,
	};
}
