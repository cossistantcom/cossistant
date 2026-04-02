import type {
	AiAgentBehaviorSettingKey,
	AiAgentToolId,
} from "@plasma/types";
import {
	CATEGORIZE_CONVERSATION_TELEMETRY,
	createCategorizeConversationTool,
	createSetPriorityTool,
	createUpdateConversationTitleTool,
	createUpdateSentimentTool,
	SET_PRIORITY_TELEMETRY,
	UPDATE_CONVERSATION_TITLE_TELEMETRY,
	UPDATE_SENTIMENT_TELEMETRY,
} from "./analysis";
import {
	createIdentifyVisitorTool,
	createSearchKnowledgeBaseTool,
	IDENTIFY_VISITOR_TELEMETRY,
	SEARCH_KNOWLEDGE_BASE_TELEMETRY,
} from "./context";
import type {
	PipelineToolDefinition,
	PipelineToolFactory,
	ToolAvailability,
	ToolTelemetrySpec,
} from "./contracts";
import {
	createEscalateTool,
	createMarkSpamTool,
	createResolveTool,
	createRespondTool,
	createSkipTool,
	ESCALATE_TELEMETRY,
	MARK_SPAM_TELEMETRY,
	RESOLVE_TELEMETRY,
	RESPOND_TELEMETRY,
	SKIP_TELEMETRY,
} from "./finish";
import {
	createRequestKnowledgeClarificationTool,
	REQUEST_KNOWLEDGE_CLARIFICATION_TELEMETRY,
} from "./knowledge-clarification";
import {
	createSendMessageTool,
	createSendPrivateMessageTool,
	SEND_MESSAGE_TELEMETRY,
	SEND_PRIVATE_MESSAGE_TELEMETRY,
} from "./messaging";

export const FINISH_TOOL_IDS = [
	"respond",
	"escalate",
	"resolve",
	"markSpam",
	"skip",
] as const;

export type FinishToolId = (typeof FINISH_TOOL_IDS)[number];

export type ToolCatalogEntry = {
	id: AiAgentToolId;
	factory: PipelineToolFactory;
	availability: ToolAvailability;
	behaviorSettingKey: AiAgentBehaviorSettingKey | null;
	telemetry: ToolTelemetrySpec;
};

export const SHARED_PIPELINE_TOOL_CATALOG: readonly PipelineToolDefinition[] = [
	{
		id: "searchKnowledgeBase",
		factory: createSearchKnowledgeBaseTool,
		availability: { primary: true, background: true },
		behaviorSettingKey: null,
		telemetry: SEARCH_KNOWLEDGE_BASE_TELEMETRY,
	},
	{
		id: "identifyVisitor",
		factory: createIdentifyVisitorTool,
		availability: { primary: true, background: true },
		behaviorSettingKey: null,
		telemetry: IDENTIFY_VISITOR_TELEMETRY,
	},
	{
		id: "requestKnowledgeClarification",
		factory: createRequestKnowledgeClarificationTool,
		availability: { primary: true, background: false },
		behaviorSettingKey: "canRequestKnowledgeClarification",
		telemetry: REQUEST_KNOWLEDGE_CLARIFICATION_TELEMETRY,
	},
	{
		id: "updateConversationTitle",
		factory: createUpdateConversationTitleTool,
		availability: { primary: false, background: true },
		behaviorSettingKey: "autoGenerateTitle",
		telemetry: UPDATE_CONVERSATION_TITLE_TELEMETRY,
	},
	{
		id: "updateSentiment",
		factory: createUpdateSentimentTool,
		availability: { primary: false, background: true },
		behaviorSettingKey: "autoAnalyzeSentiment",
		telemetry: UPDATE_SENTIMENT_TELEMETRY,
	},
	{
		id: "setPriority",
		factory: createSetPriorityTool,
		availability: { primary: false, background: true },
		behaviorSettingKey: "canSetPriority",
		telemetry: SET_PRIORITY_TELEMETRY,
	},
	{
		id: "categorizeConversation",
		factory: createCategorizeConversationTool,
		availability: { primary: false, background: true },
		behaviorSettingKey: "autoCategorize",
		telemetry: CATEGORIZE_CONVERSATION_TELEMETRY,
	},
	{
		id: "sendMessage",
		factory: createSendMessageTool,
		availability: { primary: true, background: false, publicOnly: true },
		behaviorSettingKey: null,
		telemetry: SEND_MESSAGE_TELEMETRY,
	},
	{
		id: "sendPrivateMessage",
		factory: createSendPrivateMessageTool,
		availability: { primary: true, background: true },
		behaviorSettingKey: null,
		telemetry: SEND_PRIVATE_MESSAGE_TELEMETRY,
	},
	{
		id: "respond",
		factory: createRespondTool,
		availability: { primary: true, background: false, publicOnly: true },
		behaviorSettingKey: null,
		telemetry: RESPOND_TELEMETRY,
	},
	{
		id: "escalate",
		factory: createEscalateTool,
		availability: { primary: true, background: false, publicOnly: true },
		behaviorSettingKey: "canEscalate",
		telemetry: ESCALATE_TELEMETRY,
	},
	{
		id: "resolve",
		factory: createResolveTool,
		availability: { primary: true, background: false, publicOnly: true },
		behaviorSettingKey: "canResolve",
		telemetry: RESOLVE_TELEMETRY,
	},
	{
		id: "markSpam",
		factory: createMarkSpamTool,
		availability: { primary: true, background: false, publicOnly: true },
		behaviorSettingKey: "canMarkSpam",
		telemetry: MARK_SPAM_TELEMETRY,
	},
	{
		id: "skip",
		factory: createSkipTool,
		availability: { primary: true, background: true },
		behaviorSettingKey: null,
		telemetry: SKIP_TELEMETRY,
	},
] as const;
