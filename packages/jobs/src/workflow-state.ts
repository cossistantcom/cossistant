import type { Redis } from "@plasma/redis";

export type WorkflowDirection =
	| "member-to-visitor"
	| "visitor-to-member"
	| "ai-agent-response";

export type WorkflowState = {
	workflowRunId: string;
	initialMessageId: string;
	initialMessageCreatedAt: string;
	conversationId: string;
	direction: WorkflowDirection;
	createdAt: string;
	updatedAt: string;
};

const WORKFLOW_STATE_TTL_SECONDS = 86_400; // 24h
const WORKFLOW_PENDING_TTL_SECONDS = 900; // 15m

function getWorkflowKey(
	conversationId: string,
	direction: WorkflowDirection
): string {
	return `workflow:message:${conversationId}:${direction}`;
}

function getWorkflowPendingKey(
	conversationId: string,
	direction: WorkflowDirection
): string {
	return `workflow:message:${conversationId}:${direction}:pending`;
}

export function generateWorkflowRunId(
	conversationId: string,
	direction: WorkflowDirection
): string {
	return `msg-workflow-${conversationId}-${direction}-${Date.now()}`;
}

export async function getWorkflowState(
	redis: Redis,
	conversationId: string,
	direction: WorkflowDirection
): Promise<WorkflowState | null> {
	const key = getWorkflowKey(conversationId, direction);
	const data = await redis.get(key);

	if (!data) {
		return null;
	}

	return JSON.parse(data as string) as WorkflowState;
}

export async function setWorkflowState(
	redis: Redis,
	state: WorkflowState,
	ttlSeconds = WORKFLOW_STATE_TTL_SECONDS
): Promise<void> {
	const key = getWorkflowKey(state.conversationId, state.direction);
	await redis.setex(key, ttlSeconds, JSON.stringify(state));
}

export async function clearWorkflowState(
	redis: Redis,
	conversationId: string,
	direction: WorkflowDirection
): Promise<void> {
	const key = getWorkflowKey(conversationId, direction);
	await redis.del(key);
}

export type WorkflowPendingJob = {
	workflowRunId: string;
	conversationId: string;
	direction: WorkflowDirection;
	messageId: string;
	messageCreatedAt: string;
	organizationId: string;
	websiteId: string;
	visitorId: string;
	aiAgentId: string;
	createdAt: string;
};

export async function getWorkflowPending(
	redis: Redis,
	conversationId: string,
	direction: WorkflowDirection
): Promise<WorkflowPendingJob | null> {
	const key = getWorkflowPendingKey(conversationId, direction);
	const data = await redis.get(key);

	if (!data) {
		return null;
	}

	return JSON.parse(data as string) as WorkflowPendingJob;
}

export async function setWorkflowPending(
	redis: Redis,
	pending: WorkflowPendingJob,
	ttlSeconds = WORKFLOW_PENDING_TTL_SECONDS
): Promise<void> {
	const key = getWorkflowPendingKey(pending.conversationId, pending.direction);
	await redis.setex(key, ttlSeconds, JSON.stringify(pending));
}

export async function clearWorkflowPending(
	redis: Redis,
	conversationId: string,
	direction: WorkflowDirection,
	workflowRunId?: string
): Promise<boolean> {
	const key = getWorkflowPendingKey(conversationId, direction);
	if (!workflowRunId) {
		await redis.del(key);
		return true;
	}

	const pending = await getWorkflowPending(redis, conversationId, direction);
	if (pending?.workflowRunId !== workflowRunId) {
		return false;
	}

	await redis.del(key);
	return true;
}

export async function clearWorkflowStateIfActive(
	redis: Redis,
	conversationId: string,
	direction: WorkflowDirection,
	workflowRunId: string
): Promise<boolean> {
	const state = await getWorkflowState(redis, conversationId, direction);
	if (state?.workflowRunId !== workflowRunId) {
		return false;
	}

	await clearWorkflowState(redis, conversationId, direction);
	return true;
}

export async function isWorkflowRunActive(
	redis: Redis,
	conversationId: string,
	direction: WorkflowDirection,
	workflowRunId: string
): Promise<boolean> {
	const state = await getWorkflowState(redis, conversationId, direction);
	return state?.workflowRunId === workflowRunId;
}
