import type { Database } from "@api/db";
import { getAiAgentById } from "@api/db/queries/ai-agent";
import type { ConversationSelect } from "@api/db/schema/conversation";
import type { KnowledgeClarificationContextSnapshot } from "@api/lib/knowledge-clarification-context";
import {
	emitConversationClarificationUpdate,
	startConversationKnowledgeClarification,
} from "@api/services/knowledge-clarification";
import type { KnowledgeClarificationStatus } from "@plasma/types";

type RequestKnowledgeClarificationParams = {
	db: Database;
	conversation: ConversationSelect;
	organizationId: string;
	websiteId: string;
	aiAgentId: string;
	topicSummary: string;
	contextSnapshot?: KnowledgeClarificationContextSnapshot | null;
};

export async function requestKnowledgeClarification(
	params: RequestKnowledgeClarificationParams
): Promise<{
	requestId: string;
	created: boolean;
	resolution: "created" | "reused" | "suppressed_duplicate";
	status: KnowledgeClarificationStatus;
}> {
	const aiAgent = await getAiAgentById(params.db, {
		aiAgentId: params.aiAgentId,
	});
	if (!aiAgent) {
		throw new Error("AI agent not found");
	}

	const result = await startConversationKnowledgeClarification({
		db: params.db,
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		aiAgent,
		conversation: params.conversation,
		topicSummary: params.topicSummary,
		actor: { aiAgentId: params.aiAgentId },
		contextSnapshot: params.contextSnapshot ?? null,
		creationMode: "automation",
	});

	if (result.step) {
		await emitConversationClarificationUpdate({
			db: params.db,
			conversation: params.conversation,
			request: result.step.request,
			aiAgentId: params.aiAgentId,
		});
	}

	return {
		requestId: result.request.id,
		created: result.created,
		resolution: result.resolution,
		status: result.request.status,
	};
}
