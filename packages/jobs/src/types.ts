// Queue names registry
export const QUEUE_NAMES = {
	MESSAGE_NOTIFICATION: "message-notification",
	AI_AGENT: "ai-agent",
	AI_AGENT_BACKGROUND: "ai-agent-background",
	WEB_CRAWL: "web-crawl",
	AI_TRAINING: "ai-training",
	LIFECYCLE_EMAIL: "lifecycle-email",
} as const;

/**
 * Direction of the message notification
 */
export type MessageNotificationDirection =
	| "member-to-visitor"
	| "visitor-to-member";

/**
 * Job data for message notification queue
 */
export type MessageNotificationJobData = {
	conversationId: string;
	messageId: string;
	websiteId: string;
	organizationId: string;
	direction: MessageNotificationDirection;
	senderId?: string;
	visitorId?: string;
	initialMessageCreatedAt: string;
};

/**
 * Generate a unique job ID for message notification
 */
export function generateMessageNotificationJobId(
	conversationId: string,
	direction: MessageNotificationDirection
): string {
	return `msg-notif-${conversationId}-${direction}`;
}

/**
 * Job data for AI Agent queue
 *
 * The AI agent can:
 * - Respond to visitor messages
 * - Analyze conversations (sentiment, title)
 * - Escalate to humans
 * - Execute background tasks
 */
export type AiAgentJobData = {
	conversationId: string;
	websiteId: string;
	organizationId: string;
	aiAgentId: string;
	messageId: string;
	messageCreatedAt: string;
	runAttempt?: number;
	openRouterByokRetry?: OpenRouterByokRetryState;
};

export type OpenRouterByokRetryMode = "customer" | "cossistant";

export type OpenRouterByokRetryState = {
	mode: OpenRouterByokRetryMode;
	customerFailureCount: number;
	lastErrorCode?: string;
	lastFailedAt?: string;
};

export function generateAiAgentJobId(conversationId: string): string {
	return `ai-agent-${conversationId}`;
}

/**
 * Job data for AI Agent background queue
 *
 * Runs delayed non-public conversation maintenance tasks such as:
 * - triage and metadata updates
 * - title/priority/sentiment adjustments
 * - categorization
 */
export type AiAgentBackgroundJobData = {
	conversationId: string;
	websiteId: string;
	organizationId: string;
	aiAgentId: string;
	sourceMessageId: string;
	sourceMessageCreatedAt: string;
};

export function generateAiAgentBackgroundJobId(conversationId: string): string {
	return `ai-agent-background-${conversationId}`;
}

/**
 * Job data for web crawl queue
 */
export type WebCrawlJobData = {
	linkSourceId: string;
	websiteId: string;
	organizationId: string;
	aiAgentId: string | null;
	url: string;
	crawlLimit: number;
	createdBy: string; // userId who triggered
	// Path filters
	includePaths?: string[] | null;
	excludePaths?: string[] | null;
	// Firecrawl v2 parameters
	/** Maximum depth of links to follow from the starting URL. Link source create flows default to 1. */
	maxDepth?: number;
};

/**
 * Generate a unique job ID for web crawl
 */
export function generateWebCrawlJobId(linkSourceId: string): string {
	return `web-crawl-${linkSourceId}`;
}

/**
 * Job data for AI training queue
 *
 * Processes knowledge base items to generate embeddings
 * and store them in the vector database for RAG.
 */
export type AiTrainingJobData = {
	websiteId: string;
	organizationId: string;
	aiAgentId: string;
	triggeredBy: string; // userId who triggered
};

/**
 * Generate a unique job ID for AI training
 */
export function generateAiTrainingJobId(aiAgentId: string): string {
	return `ai-training-${aiAgentId}`;
}

export type LifecycleEmailJobData =
	| { kind: "scan" }
	| { kind: "weekly_digest_scan" }
	| { kind: "limit_scan" }
	| { kind: "send_batch"; eventIds: string[]; batchId: string };

export function generateLifecycleEmailJobId(
	kind: LifecycleEmailJobData["kind"],
	suffix?: string
): string {
	return suffix
		? `lifecycle-email-${kind}-${suffix}`
		: `lifecycle-email-${kind}`;
}
