import type { Database } from "@api/db";
import type { OpenRouterByokRetryState } from "@cossistant/jobs";
import type { GenerationTokenUsage } from "../shared/generation/contracts";

export type PrimaryPipelineInput = {
	conversationId: string;
	messageId: string;
	messageCreatedAt: string;
	websiteId: string;
	organizationId: string;
	visitorId: string;
	aiAgentId: string;
	workflowRunId: string;
	jobId: string;
	openRouterByokRetry?: OpenRouterByokRetryState;
};

export type PrimaryPipelineMetrics = {
	intakeMs: number;
	decisionMs: number;
	generationMs: number;
	totalMs: number;
};

export type PrimaryPipelineResult = {
	status: "completed" | "skipped" | "error";
	action?: string;
	reason?: string;
	error?: string;
	cursorDisposition: "advance" | "retry";
	publicMessagesSent: number;
	retryable: boolean;
	usageTokens?: GenerationTokenUsage;
	creditUsage?: {
		totalCredits: number;
		thinkingCredits: number;
		mode: "normal" | "outage";
		ingestStatus:
			| "ingested"
			| "failed"
			| "skipped_backoff"
			| "skipped_disabled"
			| "skipped_customer_openrouter"
			| "skipped_cossistant_platform"
			| "skipped_zero"
			| "skipped";
		billingSource: "cossistant" | "customer_openrouter" | "cossistant_platform";
	};
	openRouterByokRetry?: OpenRouterByokRetryState;
	metrics: PrimaryPipelineMetrics;
};

export type PrimaryPipelineContext = {
	db: Database;
	input: PrimaryPipelineInput;
};

export type SenderType = "visitor" | "human_agent" | "ai_agent";

export type RoleAwareMessage = {
	messageId: string;
	content: string;
	senderType: SenderType;
	senderId: string | null;
	senderName: string | null;
	timestamp: string | null;
	visibility: "public" | "private";
};

export type ConversationToolAction = {
	kind: "tool";
	itemId: string;
	toolName: string;
	content: string;
	timestamp: string | null;
	visibility: "public" | "private";
};

export type ConversationTranscriptEntry =
	| RoleAwareMessage
	| ConversationToolAction;

export type ConversationContextSegment =
	| "before_trigger"
	| "trigger"
	| "after_trigger";

export type SegmentedConversationMessage = RoleAwareMessage & {
	segment: ConversationContextSegment;
};

export type SegmentedConversationToolAction = ConversationToolAction & {
	segment: ConversationContextSegment;
};

export type SegmentedConversationEntry =
	| SegmentedConversationMessage
	| SegmentedConversationToolAction;

export function isConversationToolAction(
	entry: ConversationTranscriptEntry
): entry is ConversationToolAction {
	return "kind" in entry && entry.kind === "tool";
}

export function isConversationMessage(
	entry: ConversationTranscriptEntry
): entry is RoleAwareMessage {
	return !isConversationToolAction(entry);
}

export type VisitorContext = {
	name: string | null;
	email: string | null;
	isIdentified: boolean;
	country: string | null;
	city: string | null;
	language: string | null;
	timezone: string | null;
	browser: string | null;
	device: string | null;
	metadata: Record<string, unknown> | null;
};

export type ConversationState = {
	hasHumanAssignee: boolean;
	assigneeIds: string[];
	participantIds: string[];
	isEscalated: boolean;
	escalationReason: string | null;
};

export type ModelResolution = {
	modelIdOriginal: string;
	modelIdResolved: string;
	modelMigrationApplied: boolean;
};
