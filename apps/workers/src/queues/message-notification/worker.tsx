import {
	generateInboundReplyAddress,
	generateThreadingHeaders,
} from "@plasma/api/email-threading";
import {
	getMemberNotificationPreference,
	getMessagesForEmail,
	getNotificationData,
	getVisitorEmailForNotification,
	isVisitorEmailNotificationEnabled,
} from "@plasma/api/notification-helpers";
import { type MessageNotificationJobData, QUEUE_NAMES } from "@plasma/jobs";
import { getSafeRedisUrl, type RedisOptions } from "@plasma/redis";
import { NewMessageInConversation, sendEmail } from "@plasma/transactional";
import { type Job, QueueEvents, Worker } from "bullmq";
import React from "react";
import { db } from "../../db";

// Constants
const MAX_MESSAGES_IN_EMAIL = 3;

const WORKER_CONFIG = {
	concurrency: 10,
	lockDuration: 60_000,
	stalledInterval: 30_000,
	maxStalledCount: 2,
};

type MemberRecipient = {
	kind: "member";
	userId: string;
	memberId: string;
	email: string;
};

type VisitorRecipient = {
	kind: "visitor";
	visitorId: string;
	email: string;
};

/**
 * Create the message notification worker
 */
type WorkerConfig = {
	connectionOptions: RedisOptions;
	redisUrl: string;
};

export function createMessageNotificationWorker({
	connectionOptions,
	redisUrl,
}: WorkerConfig) {
	const queueName = QUEUE_NAMES.MESSAGE_NOTIFICATION;
	let worker: Worker<MessageNotificationJobData> | null = null;
	let events: QueueEvents | null = null;
	const safeRedisUrl = getSafeRedisUrl(redisUrl);

	const buildConnectionOptions = (): RedisOptions => ({
		...connectionOptions,
		tls: connectionOptions.tls ? { ...connectionOptions.tls } : undefined,
	});

	return {
		start: async () => {
			if (worker) {
				return;
			}

			console.log(
				`[worker:message-notification] Using queue=${queueName} redis=${safeRedisUrl}`
			);

			events = new QueueEvents(queueName, {
				connection: buildConnectionOptions(),
			});
			events.on("failed", ({ jobId, failedReason }) => {
				console.error(
					`[worker:message-notification] Job ${jobId} failed: ${failedReason}`
				);
			});
			await events.waitUntilReady();

			worker = new Worker<MessageNotificationJobData>(
				queueName,
				async (job: Job<MessageNotificationJobData>) => {
					const startTime = Date.now();

					try {
						await processMessageNotification(job.data);
					} catch (error) {
						const duration = Date.now() - startTime;
						console.error(
							`[worker:message-notification] Job ${job.id} failed after ${duration}ms:`,
							error
						);
						throw error;
					}
				},
				{
					connection: buildConnectionOptions(),
					concurrency: WORKER_CONFIG.concurrency,
					lockDuration: WORKER_CONFIG.lockDuration,
					stalledInterval: WORKER_CONFIG.stalledInterval,
					maxStalledCount: WORKER_CONFIG.maxStalledCount,
				}
			);

			worker.on("failed", (job, err) => {
				console.error(
					`[worker:message-notification] Job ${job?.id} failed:`,
					err.message
				);
			});

			worker.on("error", (err) => {
				console.error("[worker:message-notification] Worker error:", err);
			});

			await worker.waitUntilReady();
			console.log("[worker:message-notification] Worker started");
		},

		stop: async () => {
			await Promise.all([
				(async () => {
					if (worker) {
						await worker.close();
						worker = null;
						console.log("[worker:message-notification] Worker stopped");
					}
				})(),
				(async () => {
					if (events) {
						await events.close();
						events = null;
					}
				})(),
			]);
		},
	};
}

/**
 * Process a message notification job
 */
async function processMessageNotification(
	data: MessageNotificationJobData
): Promise<void> {
	const {
		conversationId,
		websiteId,
		organizationId,
		direction,
		senderId,
		initialMessageCreatedAt,
	} = data;

	// Fetch notification data using API helpers
	const { conversation, websiteInfo, participants } = await getNotificationData(
		db,
		{
			conversationId,
			websiteId,
			organizationId,
			excludeUserId: direction === "member-to-visitor" ? senderId : undefined,
		}
	);

	if (!(conversation && websiteInfo)) {
		console.log(
			`[worker:message-notification] Conversation or website not found for ${conversationId}`
		);
		return;
	}

	// Send emails to member recipients
	for (const participant of participants) {
		const recipient: MemberRecipient = {
			kind: "member",
			userId: participant.userId,
			memberId: participant.memberId,
			email: participant.userEmail,
		};

		await sendMemberEmailNotification({
			recipient,
			conversationId,
			organizationId,
			websiteInfo: {
				name: websiteInfo.name,
				slug: websiteInfo.slug,
				logo: websiteInfo.logo,
			},
			initialMessageCreatedAt,
		});
	}

	// If member sent message, also notify visitor
	if (direction === "member-to-visitor" && conversation.visitorId) {
		const visitorInfo = await getVisitorEmailForNotification(db, {
			visitorId: conversation.visitorId,
			websiteId,
		});

		if (visitorInfo?.contactEmail) {
			const visitorNotificationsEnabled =
				await isVisitorEmailNotificationEnabled(db, {
					visitorId: conversation.visitorId,
					websiteId,
				});

			if (visitorNotificationsEnabled) {
				const recipient: VisitorRecipient = {
					kind: "visitor",
					visitorId: conversation.visitorId,
					email: visitorInfo.contactEmail,
				};

				await sendVisitorEmailNotification({
					recipient,
					conversationId,
					organizationId,
					websiteInfo: {
						name: websiteInfo.name,
						slug: websiteInfo.slug,
						logo: websiteInfo.logo,
					},
					initialMessageCreatedAt,
				});
			}
		}
	}
}

// ============================================================================
// Email sending helpers
// ============================================================================

async function sendMemberEmailNotification(params: {
	recipient: MemberRecipient;
	conversationId: string;
	organizationId: string;
	websiteInfo: { name: string; slug: string; logo: string | null };
	initialMessageCreatedAt: string;
}): Promise<void> {
	const {
		recipient,
		conversationId,
		organizationId,
		websiteInfo,
		initialMessageCreatedAt,
	} = params;

	if (!recipient.email) {
		return;
	}

	// Check preferences using API helper
	const preference = await getMemberNotificationPreference(db, {
		memberId: recipient.memberId,
		organizationId,
	});

	if (preference !== undefined && !preference.enabled) {
		return;
	}

	// Get messages using API helper
	const { messages, totalCount } = await getMessagesForEmail(db, {
		conversationId,
		organizationId,
		recipientUserId: recipient.userId,
		maxMessages: MAX_MESSAGES_IN_EMAIL,
		earliestCreatedAt: initialMessageCreatedAt,
	});

	if (messages.length === 0) {
		return;
	}

	// Generate email threading headers and reply-to address
	const threadingHeaders = generateThreadingHeaders({ conversationId });
	const replyTo = generateInboundReplyAddress({ conversationId });

	// Send email
	await sendEmail(
		{
			to: recipient.email,
			replyTo,
			subject:
				totalCount > 1
					? `${totalCount} new messages from ${websiteInfo.name}`
					: `New message from ${websiteInfo.name}`,
			react: (
				<NewMessageInConversation
					conversationId={conversationId}
					email={recipient.email}
					isReceiverVisitor={false}
					messages={messages}
					totalCount={totalCount}
					website={websiteInfo}
				/>
			),
			variant: "notifications",
			headers: threadingHeaders,
		},
		{}
	);

	console.log(
		`[worker:message-notification] Sent email to member ${recipient.memberId}`
	);
}

async function sendVisitorEmailNotification(params: {
	recipient: VisitorRecipient;
	conversationId: string;
	organizationId: string;
	websiteInfo: { name: string; slug: string; logo: string | null };
	initialMessageCreatedAt: string;
}): Promise<void> {
	const {
		recipient,
		conversationId,
		organizationId,
		websiteInfo,
		initialMessageCreatedAt,
	} = params;

	if (!recipient.email) {
		return;
	}

	// Get messages using API helper
	const { messages, totalCount } = await getMessagesForEmail(db, {
		conversationId,
		organizationId,
		recipientVisitorId: recipient.visitorId,
		maxMessages: MAX_MESSAGES_IN_EMAIL,
		earliestCreatedAt: initialMessageCreatedAt,
	});

	if (messages.length === 0) {
		return;
	}

	// Generate email threading headers and reply-to address
	const threadingHeaders = generateThreadingHeaders({ conversationId });
	const replyTo = generateInboundReplyAddress({ conversationId });

	// Send email
	await sendEmail(
		{
			to: recipient.email,
			replyTo,
			subject:
				totalCount > 1
					? `${totalCount} new messages from ${websiteInfo.name}`
					: `New message from ${websiteInfo.name}`,
			react: (
				<NewMessageInConversation
					conversationId={conversationId}
					email={recipient.email}
					isReceiverVisitor={true}
					messages={messages}
					totalCount={totalCount}
					website={websiteInfo}
				/>
			),
			variant: "notifications",
			headers: threadingHeaders,
		},
		{}
	);

	console.log(
		`[worker:message-notification] Sent email to visitor ${recipient.visitorId}`
	);
}
