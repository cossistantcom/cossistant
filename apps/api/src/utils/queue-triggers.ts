/**
 * Queue trigger utilities for API
 *
 * Creates job triggers bound to BullMQ connection options. The actual job
 * processing happens in the workers app.
 */

import { env } from "@api/env";
import {
	type AiAgentBackgroundJobData,
	type AiTrainingJobData,
	createAiAgentBackgroundTriggers,
	createAiAgentTriggers,
	createAiTrainingTriggers,
	createLifecycleEmailTriggers,
	createMessageNotificationTriggers,
	createWebCrawlTriggers,
	type WebCrawlJobData,
} from "@cossistant/jobs";
import { getBullConnectionOptions } from "@cossistant/redis";

// Lazily initialized triggers
let messageNotificationTriggers: ReturnType<
	typeof createMessageNotificationTriggers
> | null = null;
let aiAgentTriggers: ReturnType<typeof createAiAgentTriggers> | null = null;
let aiAgentBackgroundTriggers: ReturnType<
	typeof createAiAgentBackgroundTriggers
> | null = null;
let aiTrainingTriggers: ReturnType<typeof createAiTrainingTriggers> | null =
	null;
let lifecycleEmailTriggers: ReturnType<
	typeof createLifecycleEmailTriggers
> | null = null;
let webCrawlTriggers: ReturnType<typeof createWebCrawlTriggers> | null = null;

let bullConnectionOptions: ReturnType<typeof getBullConnectionOptions> | null =
	null;

function getRedisUrlOrThrow(): string {
	const redisUrl = env.REDIS_URL.trim();
	if (!redisUrl) {
		throw new Error(
			"[queue-triggers] REDIS_URL is required when queue triggers are invoked"
		);
	}

	return redisUrl;
}

function getBullOptions() {
	if (!bullConnectionOptions) {
		bullConnectionOptions = getBullConnectionOptions(getRedisUrlOrThrow());
	}

	return bullConnectionOptions;
}

function getMessageNotificationTriggers() {
	if (!messageNotificationTriggers) {
		const redisUrl = getRedisUrlOrThrow();
		messageNotificationTriggers = createMessageNotificationTriggers({
			connection: getBullOptions(),
			redisUrl,
		});
	}
	return messageNotificationTriggers;
}

export function getAiAgentQueueTriggers() {
	if (!aiAgentTriggers) {
		const redisUrl = getRedisUrlOrThrow();
		aiAgentTriggers = createAiAgentTriggers({
			connection: getBullOptions(),
			redisUrl,
		});
	}
	return aiAgentTriggers;
}

export function getAiAgentBackgroundQueueTriggers() {
	if (!aiAgentBackgroundTriggers) {
		const redisUrl = getRedisUrlOrThrow();
		aiAgentBackgroundTriggers = createAiAgentBackgroundTriggers({
			connection: getBullOptions(),
			redisUrl,
		});
	}
	return aiAgentBackgroundTriggers;
}

function getAiTrainingTriggers() {
	if (!aiTrainingTriggers) {
		const redisUrl = getRedisUrlOrThrow();
		aiTrainingTriggers = createAiTrainingTriggers({
			connection: getBullOptions(),
			redisUrl,
		});
	}
	return aiTrainingTriggers;
}

function getWebCrawlTriggers() {
	if (!webCrawlTriggers) {
		const redisUrl = getRedisUrlOrThrow();
		webCrawlTriggers = createWebCrawlTriggers({
			connection: getBullOptions(),
			redisUrl,
		});
	}
	return webCrawlTriggers;
}

export function getLifecycleEmailQueueTriggers() {
	if (!lifecycleEmailTriggers) {
		const redisUrl = getRedisUrlOrThrow();
		lifecycleEmailTriggers = createLifecycleEmailTriggers({
			connection: getBullOptions(),
			redisUrl,
		});
	}
	return lifecycleEmailTriggers;
}

export async function triggerLifecycleEmailScan(): Promise<string> {
	try {
		return await getLifecycleEmailQueueTriggers().enqueueScan();
	} catch (error) {
		console.error("[queue-triggers] triggerLifecycleEmailScan FAILED:", error);
		throw error;
	}
}

export async function triggerMemberMessageNotification(data: {
	conversationId: string;
	messageId: string;
	websiteId: string;
	organizationId: string;
	senderId: string;
	initialMessageCreatedAt: string;
}): Promise<void> {
	console.log(
		`[queue-triggers] triggerMemberMessageNotification called for conversation ${data.conversationId}, message ${data.messageId}`
	);
	try {
		await getMessageNotificationTriggers().triggerMemberMessageNotification(
			data
		);
		console.log(
			`[queue-triggers] triggerMemberMessageNotification completed for conversation ${data.conversationId}`
		);
	} catch (error) {
		console.error(
			`[queue-triggers] triggerMemberMessageNotification FAILED for conversation ${data.conversationId}:`,
			error
		);
		throw error;
	}
}

export async function triggerVisitorMessageNotification(data: {
	conversationId: string;
	messageId: string;
	websiteId: string;
	organizationId: string;
	visitorId: string;
	initialMessageCreatedAt: string;
}): Promise<void> {
	console.log(
		`[queue-triggers] triggerVisitorMessageNotification called for conversation ${data.conversationId}, message ${data.messageId}`
	);
	try {
		await getMessageNotificationTriggers().triggerVisitorMessageNotification(
			data
		);
		console.log(
			`[queue-triggers] triggerVisitorMessageNotification completed for conversation ${data.conversationId}`
		);
	} catch (error) {
		console.error(
			`[queue-triggers] triggerVisitorMessageNotification FAILED for conversation ${data.conversationId}:`,
			error
		);
		throw error;
	}
}

export async function triggerWebCrawl(data: WebCrawlJobData): Promise<string> {
	console.log(
		`[queue-triggers] triggerWebCrawl called for link source ${data.linkSourceId}, url ${data.url}`
	);
	try {
		const jobId = await getWebCrawlTriggers().enqueueWebCrawl(data);
		console.log(
			`[queue-triggers] triggerWebCrawl completed for link source ${data.linkSourceId}, jobId ${jobId}`
		);
		return jobId;
	} catch (error) {
		console.error(
			`[queue-triggers] triggerWebCrawl FAILED for link source ${data.linkSourceId}:`,
			error
		);
		throw error;
	}
}

export async function cancelWebCrawl(linkSourceId: string): Promise<boolean> {
	console.log(
		`[queue-triggers] cancelWebCrawl called for link source ${linkSourceId}`
	);
	try {
		const cancelled = await getWebCrawlTriggers().cancelWebCrawl(linkSourceId);
		console.log(
			`[queue-triggers] cancelWebCrawl completed for link source ${linkSourceId}, cancelled: ${cancelled}`
		);
		return cancelled;
	} catch (error) {
		console.error(
			`[queue-triggers] cancelWebCrawl FAILED for link source ${linkSourceId}:`,
			error
		);
		throw error;
	}
}

export async function triggerAiTraining(
	data: AiTrainingJobData
): Promise<string> {
	console.log(
		`[queue-triggers] triggerAiTraining called for AI agent ${data.aiAgentId}`
	);
	try {
		const jobId = await getAiTrainingTriggers().enqueueAiTraining(data);
		console.log(
			`[queue-triggers] triggerAiTraining completed for AI agent ${data.aiAgentId}, jobId ${jobId}`
		);
		return jobId;
	} catch (error) {
		console.error(
			`[queue-triggers] triggerAiTraining FAILED for AI agent ${data.aiAgentId}:`,
			error
		);
		throw error;
	}
}

export async function triggerAiAgentBackgroundJob(
	data: AiAgentBackgroundJobData,
	overrides?: { delayMs?: number }
) {
	console.log(
		`[queue-triggers] triggerAiAgentBackgroundJob called for conversation ${data.conversationId}`
	);
	try {
		const result =
			await getAiAgentBackgroundQueueTriggers().enqueueAiAgentBackgroundJob(
				data,
				overrides
			);
		console.log(
			`[queue-triggers] triggerAiAgentBackgroundJob completed for conversation ${data.conversationId}, status=${result.status}`
		);
		return result;
	} catch (error) {
		console.error(
			`[queue-triggers] triggerAiAgentBackgroundJob FAILED for conversation ${data.conversationId}:`,
			error
		);
		throw error;
	}
}

export async function cancelAiTraining(aiAgentId: string): Promise<boolean> {
	console.log(
		`[queue-triggers] cancelAiTraining called for AI agent ${aiAgentId}`
	);
	try {
		const cancelled = await getAiTrainingTriggers().cancelAiTraining(aiAgentId);
		console.log(
			`[queue-triggers] cancelAiTraining completed for AI agent ${aiAgentId}, cancelled: ${cancelled}`
		);
		return cancelled;
	} catch (error) {
		console.error(
			`[queue-triggers] cancelAiTraining FAILED for AI agent ${aiAgentId}:`,
			error
		);
		throw error;
	}
}

export async function closeQueueProducers(): Promise<void> {
	await Promise.all([
		(async () => {
			if (messageNotificationTriggers) {
				await messageNotificationTriggers.close();
				messageNotificationTriggers = null;
			}
		})(),
		(async () => {
			if (aiAgentTriggers) {
				await aiAgentTriggers.close();
				aiAgentTriggers = null;
			}
		})(),
		(async () => {
			if (aiAgentBackgroundTriggers) {
				await aiAgentBackgroundTriggers.close();
				aiAgentBackgroundTriggers = null;
			}
		})(),
		(async () => {
			if (aiTrainingTriggers) {
				await aiTrainingTriggers.close();
				aiTrainingTriggers = null;
			}
		})(),
		(async () => {
			if (webCrawlTriggers) {
				await webCrawlTriggers.close();
				webCrawlTriggers = null;
			}
		})(),
		(async () => {
			if (lifecycleEmailTriggers) {
				await lifecycleEmailTriggers.close();
				lifecycleEmailTriggers = null;
			}
		})(),
	]);
}
