import type { ConversationSelect } from "@api/db/schema/conversation";
import type { ToolSet } from "ai";
import type {
	CapturedFinalAction,
	GenerationMode,
	PipelineKind,
} from "../generation/contracts";

export type PipelineToolResult<T = unknown> = {
	success: boolean;
	changed?: boolean;
	error?: string;
	data?: T;
};

export type ToolRuntimeError = {
	toolName: string;
	error: string;
	fatal: boolean;
};

export type ToolExecutionSnapshot = {
	toolName: string;
	state: "result" | "error";
	input: Record<string, unknown>;
	output?: unknown;
	errorText?: string;
};

export type PublicMessageToolName = "sendMessage";

export type ToolRuntimeState = {
	finalAction: CapturedFinalAction | null;
	publicMessagesSent: number;
	/** Total tool attempts (includes failed/throwing calls). */
	toolCallCounts: Record<string, number>;
	/** Successful tool calls that changed durable conversation state. */
	mutationToolCallCounts: Record<string, number>;
	/** Successful tool calls (result state). */
	successfulToolCallCounts: Record<string, number>;
	/** Failed tool calls (error state or thrown). */
	failedToolCallCounts: Record<string, number>;
	/** Successful calls used for credit accounting. */
	chargeableToolCallCounts: Record<string, number>;
	toolExecutions: ToolExecutionSnapshot[];
	immediateKnowledgeGapClarificationHandled: boolean;
	publicSendSequence: number;
	privateSendSequence: number;
	sentPublicMessageIds: Set<string>;
	lastToolError: ToolRuntimeError | null;
};

export type ToolTracePayloadMode = "raw" | "sanitized" | "metadata";

export type PipelineToolLogger = {
	log: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	error: (...args: unknown[]) => void;
};

export type ToolTelemetryTextParams = {
	toolName: string;
	input: Record<string, unknown>;
	output?: unknown;
	errorText?: string;
};

export type ToolTelemetryText =
	| string
	| ((params: ToolTelemetryTextParams) => string);

export type ToolTelemetrySpec = {
	summary: {
		partial: ToolTelemetryText;
		result: ToolTelemetryText;
		error: ToolTelemetryText;
	};
	progress: {
		partial?: ToolTelemetryText;
		result?: ToolTelemetryText;
		error?: ToolTelemetryText;
		/**
		 * "auto" maps customer-facing tools to audience=all and internal tools to dashboard.
		 */
		audience?: "auto" | "all" | "dashboard";
	};
	sanitizeInput?: (input: unknown) => Record<string, unknown>;
	sanitizeOutput?: (output: unknown) => unknown;
};

export type PipelineAvailableView = {
	id: string;
	name: string;
	description: string | null;
	prompt: string | null;
};

export type PipelineToolContext = {
	db: import("@api/db").Database;
	conversation: ConversationSelect;
	conversationId: string;
	organizationId: string;
	websiteId: string;
	visitorId: string;
	aiAgentId: string;
	aiAgentName: string;
	visitorName: string;
	workflowRunId: string;
	triggerMessageId: string;
	triggerMessageText?: string | null;
	triggerMessageCreatedAt?: string;
	triggerSenderType?: "visitor" | "human_agent" | "ai_agent";
	triggerVisibility?: "public" | "private";
	allowPublicMessages: boolean;
	pipelineKind: PipelineKind;
	mode: GenerationMode;
	isEscalated: boolean;
	canCategorize: boolean;
	canRequestKnowledgeClarification: boolean;
	availableViews: PipelineAvailableView[];
	stopTyping?: () => Promise<void>;
	runtimeState: ToolRuntimeState;
	debugLogger?: PipelineToolLogger;
	deepTraceEnabled?: boolean;
	tracePayloadMode?: ToolTracePayloadMode;
};

export type PipelineToolFactory = (
	ctx: PipelineToolContext
) => ToolSet[string] | null;

export type PipelineToolDefinition = {
	id: import("@plasma/types").AiAgentToolId;
	factory: PipelineToolFactory;
	availability: ToolAvailability;
	behaviorSettingKey:
		| import("@plasma/types").AiAgentBehaviorSettingKey
		| null;
	telemetry: ToolTelemetrySpec;
};

export type ToolAvailability = {
	primary: boolean;
	background: boolean;
	publicOnly?: boolean;
};
