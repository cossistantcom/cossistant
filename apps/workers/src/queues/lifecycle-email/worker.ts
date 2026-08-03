import {
	claimDueLifecycleEmailEvents,
	getLifecycleEmailEventsByIds,
	getOrganizationLifecycleOwnerRecipient,
	getWeeklyDigestWebsiteForEvent,
	listLifecycleLimitCandidateWebsites,
	listWeeklyDigestCandidateWebsites,
	markLifecycleEmailEventsFailed,
	markLifecycleEmailEventsSent,
	markLifecycleEmailEventsSkipped,
	requeueLifecycleEmailEvents,
	scheduleLifecycleEmailEvent,
} from "@api/db/queries/lifecycle-email";
import {
	getContactCount,
	getRollingWindowConversationCount,
	getRollingWindowMessageCount,
	HARD_LIMIT_ROLLING_WINDOW_DAYS,
} from "@api/db/queries/usage";
import { organization } from "@api/db/schema";
import { getPlanForWebsite, type PlanInfo } from "@api/lib/plans/access";
import { queryWeeklyDigestStats } from "@api/lib/tinybird-sdk";
import { buildLifecycleEmail } from "@api/lifecycle-email/content";
import { getLifecycleEmailEligibility } from "@api/lifecycle-email/eligibility";
import {
	getLocalWeekKey,
	getWeeklyDigestDedupeKey,
	shouldScanWeeklyDigestForTimezone,
} from "@api/lifecycle-email/scheduling";
import {
	LIFECYCLE_EMAIL_KEYS,
	type LifecycleEmailMetadata,
} from "@api/lifecycle-email/types";
import { type LifecycleEmailJobData, QUEUE_NAMES } from "@cossistant/jobs";
import { getSafeRedisUrl, type RedisOptions } from "@cossistant/redis";
import { sendBatchEmail } from "@cossistant/transactional";
import type { ResendEmailOptions } from "@cossistant/transactional/send";
import { type Job, Queue, QueueEvents, Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { env } from "../../env";

const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 10_000;
const SCAN_CLAIM_LIMIT = 250;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WORKER_CONFIG = {
	concurrency: 2,
	lockDuration: 60_000,
	stalledInterval: 30_000,
	maxStalledCount: 2,
};

const SEND_BATCH_JOB_OPTIONS = {
	removeOnComplete: true,
	removeOnFail: 1000,
	attempts: 5,
	backoff: {
		type: "exponential" as const,
		delay: 60_000,
	},
};

type WorkerConfig = {
	connectionOptions: RedisOptions;
	redisUrl: string;
};

type DeliverableLifecycleEmail = {
	eventId: string;
	options: ResendEmailOptions;
};

function chunk<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];

	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}

	return chunks;
}

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function isFinalAttempt(job: Job<LifecycleEmailJobData>) {
	const attempts = job.opts.attempts ?? 1;
	return job.attemptsMade + 1 >= attempts;
}

function getWeeklyDigestDateRanges(now: Date) {
	const currentEnd = now;
	const currentStart = new Date(currentEnd.getTime() - WEEK_MS);
	const previousEnd = currentStart;
	const previousStart = new Date(previousEnd.getTime() - WEEK_MS);

	return {
		date_from: currentStart.toISOString(),
		date_to: currentEnd.toISOString(),
		prev_date_from: previousStart.toISOString(),
		prev_date_to: previousEnd.toISOString(),
	};
}

export function shouldEvaluateLifecycleLimitWarnings(
	plan: Pick<PlanInfo, "hardLimitsEnforced">
) {
	return plan.hardLimitsEnforced;
}

export function createLifecycleEmailWorker({
	connectionOptions,
	redisUrl,
}: WorkerConfig) {
	const queueName = QUEUE_NAMES.LIFECYCLE_EMAIL;
	let queue: Queue<LifecycleEmailJobData> | null = null;
	let worker: Worker<LifecycleEmailJobData> | null = null;
	let events: QueueEvents | null = null;
	const safeRedisUrl = getSafeRedisUrl(redisUrl);

	const buildConnectionOptions = (): RedisOptions => ({
		...connectionOptions,
		tls: connectionOptions.tls ? { ...connectionOptions.tls } : undefined,
	});

	async function getQueue() {
		if (!queue) {
			queue = new Queue<LifecycleEmailJobData>(queueName, {
				connection: buildConnectionOptions(),
				defaultJobOptions: {
					removeOnComplete: true,
					removeOnFail: 1000,
				},
			});
			await queue.waitUntilReady();
		}

		return queue;
	}

	async function upsertSchedulers(q: Queue<LifecycleEmailJobData>) {
		await Promise.all([
			q.upsertJobScheduler(
				"lifecycle-email-scan",
				{ every: 5 * 60 * 1000 },
				{
					name: "scan",
					data: { kind: "scan" },
					opts: { removeOnComplete: true, removeOnFail: 1000 },
				}
			),
			q.upsertJobScheduler(
				"weekly-digest-scan",
				{ every: 15 * 60 * 1000 },
				{
					name: "weekly_digest_scan",
					data: { kind: "weekly_digest_scan" },
					opts: { removeOnComplete: true, removeOnFail: 1000 },
				}
			),
			q.upsertJobScheduler(
				"limit-scan",
				{ every: 60 * 60 * 1000 },
				{
					name: "limit_scan",
					data: { kind: "limit_scan" },
					opts: { removeOnComplete: true, removeOnFail: 1000 },
				}
			),
		]);
	}

	return {
		start: async () => {
			if (worker) {
				return;
			}

			console.log(
				`[worker:lifecycle-email] Using queue=${queueName} redis=${safeRedisUrl}`
			);

			const q = await getQueue();
			await upsertSchedulers(q);

			events = new QueueEvents(queueName, {
				connection: buildConnectionOptions(),
			});
			events.on("failed", ({ jobId, failedReason }) => {
				console.error(
					`[worker:lifecycle-email] Job ${jobId} failed: ${failedReason}`
				);
			});
			await events.waitUntilReady();

			worker = new Worker<LifecycleEmailJobData>(
				queueName,
				async (job) => {
					switch (job.data.kind) {
						case "scan":
							await processScan(q);
							return;
						case "weekly_digest_scan":
							await processWeeklyDigestScan();
							return;
						case "limit_scan":
							await processLimitScan();
							return;
						case "send_batch":
							await processSendBatch(job);
							return;
						default:
							return;
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
					`[worker:lifecycle-email] Job ${job?.id} failed:`,
					err.message
				);
			});

			worker.on("error", (err) => {
				console.error("[worker:lifecycle-email] Worker error:", err);
			});

			await worker.waitUntilReady();
			console.log("[worker:lifecycle-email] Worker started");
		},

		stop: async () => {
			await Promise.all([
				(async () => {
					if (worker) {
						await worker.close();
						worker = null;
						console.log("[worker:lifecycle-email] Worker stopped");
					}
				})(),
				(async () => {
					if (events) {
						await events.close();
						events = null;
					}
				})(),
				(async () => {
					if (queue) {
						await queue.close();
						queue = null;
					}
				})(),
			]);
		},
	};
}

async function processScan(queue: Queue<LifecycleEmailJobData>) {
	const claimed = await claimDueLifecycleEmailEvents(db, {
		now: new Date(),
		limit: SCAN_CLAIM_LIMIT,
	});

	if (claimed.length === 0) {
		return;
	}

	const batches = chunk(claimed, BATCH_SIZE);

	try {
		await Promise.all(
			batches.map((batch, index) =>
				queue.add(
					"send_batch",
					{
						kind: "send_batch",
						eventIds: batch.map((event) => event.id),
						batchId: `${Date.now()}-${index}`,
					},
					{
						...SEND_BATCH_JOB_OPTIONS,
						delay: index * BATCH_DELAY_MS,
						jobId: `lifecycle-email-send-${Date.now()}-${index}`,
					}
				)
			)
		);
	} catch (error) {
		await requeueLifecycleEmailEvents(db, {
			eventIds: claimed.map((event) => event.id),
			scheduledAt: new Date(Date.now() + 60_000),
			error: errorMessage(error),
		});
		throw error;
	}
}

async function processWeeklyDigestScan() {
	const now = new Date();
	const pageSize = 500;
	let offset = 0;

	while (true) {
		const websites = await listWeeklyDigestCandidateWebsites(db, {
			limit: pageSize,
			offset,
		});

		if (websites.length === 0) {
			return;
		}

		for (const site of websites) {
			if (
				!shouldScanWeeklyDigestForTimezone({
					now,
					timezone: site.timezone,
				})
			) {
				continue;
			}

			const recipient = await getOrganizationLifecycleOwnerRecipient(db, {
				organizationId: site.organizationId,
			});

			if (!recipient) {
				continue;
			}

			const weekKey = getLocalWeekKey(now, site.timezone);
			await scheduleLifecycleEmailEvent(db, {
				dedupeKey: getWeeklyDigestDedupeKey({
					websiteId: site.websiteId,
					weekKey,
				}),
				emailKey: LIFECYCLE_EMAIL_KEYS.WEEKLY_DIGEST,
				recipientUserId: recipient.userId,
				recipientMemberId: recipient.memberId,
				recipientEmail: recipient.email,
				organizationId: site.organizationId,
				websiteId: site.websiteId,
				scheduledAt: now,
				metadata: {
					organizationName: site.organizationName,
					websiteId: site.websiteId,
					websiteName: site.websiteName,
					websiteSlug: site.websiteSlug,
					weekKey,
				},
			});
		}

		offset += websites.length;
	}
}

async function processLimitScan() {
	const now = new Date();
	const pageSize = 200;
	let offset = 0;

	while (true) {
		const websites = await listLifecycleLimitCandidateWebsites(db, {
			limit: pageSize,
			offset,
		});

		if (websites.length === 0) {
			return;
		}

		for (const site of websites) {
			const plan = await getPlanForWebsite(site);
			if (!shouldEvaluateLifecycleLimitWarnings(plan)) {
				continue;
			}

			const org = await db.query.organization.findFirst({
				where: eq(organization.id, site.organizationId),
				columns: {
					timezone: true,
				},
			});
			const weekKey = getLocalWeekKey(now, org?.timezone ?? "UTC");
			const windowStart = new Date(
				now.getTime() - HARD_LIMIT_ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000
			).toISOString();
			const [conversationCount, messageCount, contactCount] = await Promise.all(
				[
					getRollingWindowConversationCount(db, {
						websiteId: site.id,
						organizationId: site.organizationId,
						windowStart,
					}),
					getRollingWindowMessageCount(db, {
						websiteId: site.id,
						organizationId: site.organizationId,
						windowStart,
					}),
					getContactCount(db, {
						websiteId: site.id,
						organizationId: site.organizationId,
					}),
				]
			);

			await scheduleLimitWarningIfClose({
				organizationId: site.organizationId,
				websiteId: site.id,
				websiteName: site.name,
				websiteSlug: site.slug,
				weekKey,
				limitName: "conversation",
				limitUnit: "conversations",
				limitValue: plan.features.conversations,
				limitUsed: conversationCount,
			});
			await scheduleLimitWarningIfClose({
				organizationId: site.organizationId,
				websiteId: site.id,
				websiteName: site.name,
				websiteSlug: site.slug,
				weekKey,
				limitName: "message",
				limitUnit: "messages",
				limitValue: plan.features.messages,
				limitUsed: messageCount,
			});
			await scheduleLimitWarningIfClose({
				organizationId: site.organizationId,
				websiteId: site.id,
				websiteName: site.name,
				websiteSlug: site.slug,
				weekKey,
				limitName: "contact",
				limitUnit: "contacts",
				limitValue: plan.features.contacts,
				limitUsed: contactCount,
			});
		}

		offset += websites.length;
	}
}

async function scheduleLimitWarningIfClose(params: {
	organizationId: string;
	websiteId: string;
	websiteName: string;
	websiteSlug: string;
	weekKey: string;
	limitName: string;
	limitUnit: string;
	limitValue: number | boolean | null;
	limitUsed: number;
}) {
	if (typeof params.limitValue !== "number" || params.limitValue <= 0) {
		return;
	}

	const usageRatio = params.limitUsed / params.limitValue;
	if (usageRatio < 0.8) {
		return;
	}

	const recipient = await getOrganizationLifecycleOwnerRecipient(db, {
		organizationId: params.organizationId,
	});

	if (!recipient) {
		return;
	}

	await scheduleLifecycleEmailEvent(db, {
		dedupeKey: `${LIFECYCLE_EMAIL_KEYS.LIMIT_WARNING}:${params.websiteId}:${params.limitName}:${params.weekKey}`,
		emailKey: LIFECYCLE_EMAIL_KEYS.LIMIT_WARNING,
		recipientUserId: recipient.userId,
		recipientMemberId: recipient.memberId,
		recipientEmail: recipient.email,
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		scheduledAt: new Date(),
		metadata: {
			websiteId: params.websiteId,
			websiteName: params.websiteName,
			websiteSlug: params.websiteSlug,
			limitName: params.limitName,
			limitUsed: params.limitUsed,
			limitValue: params.limitValue,
			limitUnit: params.limitUnit,
		},
	});
}

async function processSendBatch(job: Job<LifecycleEmailJobData>) {
	if (job.data.kind !== "send_batch") {
		return;
	}

	const events = await getLifecycleEmailEventsByIds(db, job.data.eventIds);
	const queuedEvents = events.filter((event) => event.status === "queued");
	const deliverable: DeliverableLifecycleEmail[] = [];
	const skippedByReason = new Map<string, string[]>();
	const now = new Date();

	for (const event of queuedEvents) {
		const eligibility = await getLifecycleEmailEligibility(db, event);
		if (!eligibility.ok) {
			const ids = skippedByReason.get(eligibility.reason) ?? [];
			ids.push(event.id);
			skippedByReason.set(eligibility.reason, ids);
			continue;
		}

		const org = await db.query.organization.findFirst({
			where: eq(organization.id, event.organizationId),
		});

		if (!org) {
			const ids = skippedByReason.get("organization_not_found") ?? [];
			ids.push(event.id);
			skippedByReason.set("organization_not_found", ids);
			continue;
		}

		let weeklyDigestStats:
			| Awaited<ReturnType<typeof queryWeeklyDigestStats>>
			| undefined;
		let eventForContent = event;

		if (event.emailKey === LIFECYCLE_EMAIL_KEYS.WEEKLY_DIGEST) {
			const digestWebsite = await getWeeklyDigestWebsiteForEvent(db, {
				organizationId: event.organizationId,
				websiteId: event.websiteId,
			});

			if (!digestWebsite) {
				const ids = skippedByReason.get("weekly_digest_website_missing") ?? [];
				ids.push(event.id);
				skippedByReason.set("weekly_digest_website_missing", ids);
				continue;
			}

			const metadata = (event.metadata ??
				{}) as NonNullable<LifecycleEmailMetadata>;
			eventForContent = {
				...event,
				metadata: {
					...metadata,
					organizationName: org.name,
					websiteId: digestWebsite.id,
					websiteName: digestWebsite.name,
					websiteSlug: digestWebsite.slug,
				} satisfies NonNullable<LifecycleEmailMetadata>,
			};
			weeklyDigestStats = await queryWeeklyDigestStats({
				website_id: digestWebsite.id,
				...getWeeklyDigestDateRanges(now),
			});
		}

		const content = buildLifecycleEmail({
			appUrl: env.PUBLIC_APP_URL,
			event: eventForContent,
			organizationName: org.name,
			recipientName: eligibility.recipientName,
			weeklyDigestStats,
		});

		deliverable.push({
			eventId: event.id,
			options: {
				to: event.recipientEmail,
				subject: content.subject,
				text: content.text,
				variant: "marketing",
				tags: [
					{ name: "kind", value: "lifecycle" },
					{ name: "email_key", value: event.emailKey },
					{ name: "organization_id", value: event.organizationId },
				],
			},
		});
	}

	await Promise.all(
		Array.from(skippedByReason.entries()).map(([reason, eventIds]) =>
			markLifecycleEmailEventsSkipped(db, { eventIds, reason })
		)
	);

	if (deliverable.length === 0) {
		return;
	}

	try {
		await sendBatchEmail(deliverable.map((item) => item.options));
		await markLifecycleEmailEventsSent(
			db,
			deliverable.map((item) => item.eventId)
		);
	} catch (error) {
		if (isFinalAttempt(job)) {
			await markLifecycleEmailEventsFailed(db, {
				eventIds: deliverable.map((item) => item.eventId),
				error: errorMessage(error),
			});
		}

		throw error;
	}
}
