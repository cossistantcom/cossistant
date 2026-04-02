import type { AiAgentToolId } from "@plasma/types";

export const BACKGROUND_ONE_SHOT_TOOL_NAMES = [
	"requestKnowledgeClarification",
	"updateConversationTitle",
	"updateSentiment",
	"setPriority",
	"categorizeConversation",
] as const satisfies readonly AiAgentToolId[];

const BACKGROUND_ONE_SHOT_TOOL_NAME_SET = new Set<string>(
	BACKGROUND_ONE_SHOT_TOOL_NAMES
);

export function isBackgroundOneShotToolName(
	toolName: string
): toolName is (typeof BACKGROUND_ONE_SHOT_TOOL_NAMES)[number] {
	return BACKGROUND_ONE_SHOT_TOOL_NAME_SET.has(toolName);
}
