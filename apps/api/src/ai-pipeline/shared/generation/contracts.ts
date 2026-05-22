import type { Database } from "@api/db";
import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import type { ConversationSelect } from "@api/db/schema/conversation";
import type { OpenRouterBillingSource } from "@api/lib/openrouter-byok/resolver";
import type { AiAgentToolId } from "@cossistant/types";
import type {
	ConversationState,
	SegmentedConversationEntry,
	VisitorContext,
} from "../../primary-pipeline/contracts";
import type {
	PipelineAvailableView,
	PipelineToolLogger,
	ToolExecutionSnapshot,
	ToolTracePayloadMode,
} from "../tools/contracts";

export type PipelineKind = "primary" | "background";

export type GenerationMode =
	| "respond_to_visitor"
	| "respond_to_command"
	| "background_only";

export type FinalActionType =
	| "respond"
	| "escalate"
	| "resolve"
	| "mark_spam"
	| "skip";

export type CapturedFinalAction = {
	action: FinalActionType;
	reasoning: string;
	confidence: number;
	escalation?: {
		reason: string;
		urgency?: "normal" | "high" | "urgent";
	};
};

export type GenerationTokenUsage = {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	source: "provider" | "fallback_constant";
};

export type GenerationRuntimeInput = {
	db: Database;
	pipelineKind: PipelineKind;
	mode: GenerationMode;
	aiAgent: AiAgentSelect;
	conversation: ConversationSelect;
	websiteDefaultLanguage: string;
	visitorLanguage: string | null;
	autoTranslateEnabled?: boolean;
	generationEntries: SegmentedConversationEntry[];
	visitorContext: VisitorContext | null;
	conversationState: ConversationState;
	humanCommand: string | null;
	workflowRunId: string;
	triggerMessageId: string;
	triggerMessageText?: string | null;
	triggerMessageCreatedAt?: string;
	triggerSenderType?: "visitor" | "human_agent" | "ai_agent";
	triggerVisibility?: "public" | "private";
	hasLaterHumanMessage?: boolean;
	hasLaterAiMessage?: boolean;
	allowPublicMessages: boolean;
	availableViews?: PipelineAvailableView[];
	stopTyping?: () => Promise<void>;
	abortSignal?: AbortSignal;
	debugLogger?: PipelineToolLogger;
	deepTraceEnabled?: boolean;
	tracePayloadMode?: ToolTracePayloadMode;
	toolAllowlist?: AiAgentToolId[];
};

export type GenerationRuntimeResult = {
	status: "completed" | "error";
	action: CapturedFinalAction;
	publicMessagesSent: number;
	toolCallsByName: Record<string, number>;
	mutationToolCallsByName?: Record<string, number>;
	chargeableToolCallsByName?: Record<string, number>;
	toolExecutions?: ToolExecutionSnapshot[];
	totalToolCalls: number;
	usage?: {
		inputTokens?: number;
		outputTokens?: number;
		totalTokens?: number;
	};
	billingSource?: OpenRouterBillingSource;
	error?: string;
	aborted?: boolean;
	failureCode?:
		| "timeout"
		| "abort_signal"
		| "missing_finish_action"
		| "runtime_error";
	attempts?: Array<{
		modelId: string;
		attempt: number;
		outcome: "completed" | "timeout" | "error";
		durationMs: number;
	}>;
};
