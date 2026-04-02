import { getRedis } from "@api/redis";
import { triggerWorkflow } from "@api/utils/workflow";
import type {
	MemberSentMessageData,
	VisitorSentMessageData,
	WorkflowDataMap,
} from "@api/workflows/types";
import {
	generateWorkflowRunId,
	isWorkflowRunActive,
	clearWorkflowPending as sharedClearWorkflowPending,
	clearWorkflowState as sharedClearWorkflowState,
	getWorkflowPending as sharedGetWorkflowPending,
	getWorkflowState as sharedGetWorkflowState,
	setWorkflowPending as sharedSetWorkflowPending,
	setWorkflowState as sharedSetWorkflowState,
	type WorkflowDirection,
	type WorkflowPendingJob,
	type WorkflowState,
} from "@plasma/jobs/workflow-state";
import type { Client } from "@upstash/workflow";
import type { Redis } from "ioredis";

export type {
	WorkflowDirection,
	WorkflowPendingJob,
	WorkflowState,
} from "@plasma/jobs/workflow-state";
export { generateWorkflowRunId } from "@plasma/jobs/workflow-state";

function getRedisClient(): Redis {
	return getRedis();
}

export async function getWorkflowState(
	conversationId: string,
	direction: WorkflowDirection
): Promise<WorkflowState | null> {
	return sharedGetWorkflowState(getRedisClient(), conversationId, direction);
}

export async function setWorkflowState(
	state: WorkflowState,
	ttlSeconds?: number
): Promise<void> {
	await sharedSetWorkflowState(getRedisClient(), state, ttlSeconds);
}

export async function clearWorkflowState(
	conversationId: string,
	direction: WorkflowDirection
): Promise<void> {
	await sharedClearWorkflowState(getRedisClient(), conversationId, direction);
}

export async function getWorkflowPending(
	conversationId: string,
	direction: WorkflowDirection
): Promise<WorkflowPendingJob | null> {
	return sharedGetWorkflowPending(getRedisClient(), conversationId, direction);
}

export async function setWorkflowPending(
	pending: WorkflowPendingJob,
	ttlSeconds?: number
): Promise<void> {
	await sharedSetWorkflowPending(getRedisClient(), pending, ttlSeconds);
}

export async function clearWorkflowPending(
	conversationId: string,
	direction: WorkflowDirection,
	workflowRunId?: string
): Promise<boolean> {
	return sharedClearWorkflowPending(
		getRedisClient(),
		conversationId,
		direction,
		workflowRunId
	);
}

/**
 * Cancel a workflow run using Upstash client
 */
async function cancelWorkflow(
	client: Client,
	workflowRunId: string
): Promise<void> {
	try {
		await client.cancel({ ids: workflowRunId });
	} catch (error) {
		// Log but don't throw - workflow might already be completed
		console.warn(`Failed to cancel workflow ${workflowRunId}:`, error);
	}
}

/**
 * Trigger a deduplicated message workflow
 * Cancels any existing workflow for the same conversation/direction and replaces it
 * Returns the workflow run ID and whether this is a new workflow or a replacement
 */
export async function triggerDeduplicatedWorkflow<
	T extends keyof WorkflowDataMap,
>(params: {
	client: Client;
	path: T;
	data: WorkflowDataMap[T];
	conversationId: string;
	direction: WorkflowDirection;
	messageId: string;
	messageCreatedAt: string;
}): Promise<{ workflowRunId: string; isReplacement: boolean }> {
	const {
		client,
		path,
		data,
		conversationId,
		direction,
		messageId,
		messageCreatedAt,
	} = params;

	// Check for existing workflow
	const existingState = await getWorkflowState(conversationId, direction);

	if (existingState) {
		// Cancel the existing workflow
		await cancelWorkflow(client, existingState.workflowRunId);

		const workflowRunId = generateWorkflowRunId(conversationId, direction);

		// Update state but keep the original message ID
		const newState: WorkflowState = {
			workflowRunId,
			initialMessageId: existingState.initialMessageId, // Keep original
			initialMessageCreatedAt: existingState.initialMessageCreatedAt, // Keep original
			conversationId,
			direction,
			createdAt: existingState.createdAt, // Keep original
			updatedAt: new Date().toISOString(),
		};

		await setWorkflowState(newState);

		try {
			await triggerWorkflow({
				path,
				data,
				workflowRunId,
			});
		} catch (error) {
			await setWorkflowState(existingState);
			throw error;
		}

		return { workflowRunId, isReplacement: true };
	}

	const workflowRunId = generateWorkflowRunId(conversationId, direction);

	// No existing workflow, create new one
	// Store state with this message as the initial trigger
	const newState: WorkflowState = {
		workflowRunId,
		initialMessageId: messageId,
		initialMessageCreatedAt: messageCreatedAt,
		conversationId,
		direction,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};

	await setWorkflowState(newState);

	try {
		await triggerWorkflow({
			path,
			data,
			workflowRunId,
		});
	} catch (error) {
		await clearWorkflowState(conversationId, direction);
		throw error;
	}

	return { workflowRunId, isReplacement: false };
}

/**
 * Check if a workflow run ID matches the current active workflow
 * Used by workflow handlers to determine if they should proceed
 */
export async function isActiveWorkflow(
	conversationId: string,
	direction: WorkflowDirection,
	workflowRunId: string
): Promise<boolean> {
	return isWorkflowRunActive(
		getRedisClient(),
		conversationId,
		direction,
		workflowRunId
	);
}
