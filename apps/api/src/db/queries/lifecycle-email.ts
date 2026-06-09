import type { Database } from "@api/db";
import { getOrganizationOwnerEmailRecipients } from "@api/db/queries/openrouter-byok";
import {
	type LifecycleEmailEventInsert,
	type LifecycleEmailEventSelect,
	lifecycleEmailEvent,
	organization,
	website,
} from "@api/db/schema";
import {
	LIFECYCLE_EMAIL_KEYS,
	type LifecycleEmailKey,
	type LifecycleEmailMetadata,
} from "@api/lifecycle-email/types";
import { WebsiteStatus } from "@cossistant/types";
import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";

const DAY_MS = 24 * 60 * 60 * 1000;

export type LifecycleEmailOwnerRecipient = {
	memberId: string;
	userId: string;
	name: string;
	email: string;
};

export async function getOrganizationLifecycleOwnerRecipient(
	db: Database,
	params: { organizationId: string }
): Promise<LifecycleEmailOwnerRecipient | null> {
	const [recipient] = await getOrganizationOwnerEmailRecipients(db, {
		organizationId: params.organizationId,
	});

	return recipient ?? null;
}

export async function scheduleLifecycleEmailEvent(
	db: Database,
	params: {
		dedupeKey: string;
		emailKey: LifecycleEmailKey;
		recipientUserId: string;
		recipientMemberId: string;
		recipientEmail: string;
		organizationId: string;
		websiteId?: string | null;
		scheduledAt: Date;
		metadata?: LifecycleEmailMetadata;
	}
): Promise<LifecycleEmailEventSelect | null> {
	const now = new Date();
	const values: LifecycleEmailEventInsert = {
		dedupeKey: params.dedupeKey,
		emailKey: params.emailKey,
		status: "scheduled",
		recipientUserId: params.recipientUserId,
		recipientMemberId: params.recipientMemberId,
		recipientEmail: params.recipientEmail,
		organizationId: params.organizationId,
		websiteId: params.websiteId ?? null,
		scheduledAt: params.scheduledAt,
		metadata: params.metadata ?? null,
		createdAt: now,
		updatedAt: now,
	};

	const [event] = await db
		.insert(lifecycleEmailEvent)
		.values(values)
		.onConflictDoNothing({
			target: lifecycleEmailEvent.dedupeKey,
		})
		.returning();

	return event ?? null;
}

export async function scheduleWelcomeLifecycleEmail(
	db: Database,
	params: {
		organizationId: string;
		organizationName: string;
		scheduledAt?: Date;
	}
) {
	const recipient = await getOrganizationLifecycleOwnerRecipient(db, {
		organizationId: params.organizationId,
	});

	if (!recipient) {
		return null;
	}

	return scheduleLifecycleEmailEvent(db, {
		dedupeKey: `${LIFECYCLE_EMAIL_KEYS.WELCOME}:${params.organizationId}`,
		emailKey: LIFECYCLE_EMAIL_KEYS.WELCOME,
		recipientUserId: recipient.userId,
		recipientMemberId: recipient.memberId,
		recipientEmail: recipient.email,
		organizationId: params.organizationId,
		scheduledAt: params.scheduledAt ?? new Date(),
		metadata: {
			organizationName: params.organizationName,
		},
	});
}

export async function scheduleWebsiteLifecycleSequence(
	db: Database,
	params: {
		organizationId: string;
		websiteId: string;
		websiteName: string;
		websiteSlug: string;
		now?: Date;
	}
) {
	const recipient = await getOrganizationLifecycleOwnerRecipient(db, {
		organizationId: params.organizationId,
	});

	if (!recipient) {
		return [];
	}

	const now = params.now ?? new Date();
	const metadata = {
		websiteId: params.websiteId,
		websiteName: params.websiteName,
		websiteSlug: params.websiteSlug,
	} satisfies LifecycleEmailMetadata;
	const sequence: Array<{
		emailKey: LifecycleEmailKey;
		delayDays: number;
	}> = [
		{ emailKey: LIFECYCLE_EMAIL_KEYS.SETUP_WIDGET, delayDays: 1 },
		{ emailKey: LIFECYCLE_EMAIL_KEYS.CUSTOMIZE_WIDGET, delayDays: 3 },
		{ emailKey: LIFECYCLE_EMAIL_KEYS.COLLECT_FEEDBACK, delayDays: 5 },
		{ emailKey: LIFECYCLE_EMAIL_KEYS.AI_AGENT_HELP, delayDays: 7 },
	];

	return Promise.all(
		sequence.map((item) =>
			scheduleLifecycleEmailEvent(db, {
				dedupeKey: `${item.emailKey}:${params.websiteId}`,
				emailKey: item.emailKey,
				recipientUserId: recipient.userId,
				recipientMemberId: recipient.memberId,
				recipientEmail: recipient.email,
				organizationId: params.organizationId,
				websiteId: params.websiteId,
				scheduledAt: new Date(now.getTime() + item.delayDays * DAY_MS),
				metadata,
			})
		)
	);
}

export async function scheduleAiAgentLifecycleEmail(
	db: Database,
	params: {
		organizationId: string;
		websiteId: string;
		websiteName: string;
		websiteSlug: string;
		scheduledAt?: Date;
	}
) {
	const recipient = await getOrganizationLifecycleOwnerRecipient(db, {
		organizationId: params.organizationId,
	});

	if (!recipient) {
		return null;
	}

	return scheduleLifecycleEmailEvent(db, {
		dedupeKey: `ai-agent-live:${params.websiteId}`,
		emailKey: LIFECYCLE_EMAIL_KEYS.AI_AGENT_HELP,
		recipientUserId: recipient.userId,
		recipientMemberId: recipient.memberId,
		recipientEmail: recipient.email,
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		scheduledAt: params.scheduledAt ?? new Date(),
		metadata: {
			websiteId: params.websiteId,
			websiteName: params.websiteName,
			websiteSlug: params.websiteSlug,
		},
	});
}

export async function claimDueLifecycleEmailEvents(
	db: Database,
	params: { now: Date; limit: number }
): Promise<LifecycleEmailEventSelect[]> {
	const dueEvents = await db
		.select({ id: lifecycleEmailEvent.id })
		.from(lifecycleEmailEvent)
		.where(
			and(
				eq(lifecycleEmailEvent.status, "scheduled"),
				lte(lifecycleEmailEvent.scheduledAt, params.now)
			)
		)
		.orderBy(
			asc(lifecycleEmailEvent.scheduledAt),
			asc(lifecycleEmailEvent.createdAt)
		)
		.limit(params.limit);

	const eventIds = dueEvents.map((event) => event.id);
	if (eventIds.length === 0) {
		return [];
	}

	return db
		.update(lifecycleEmailEvent)
		.set({
			status: "queued",
			claimedAt: params.now,
			updatedAt: params.now,
			attemptCount: sql`${lifecycleEmailEvent.attemptCount} + 1`,
		})
		.where(
			and(
				inArray(lifecycleEmailEvent.id, eventIds),
				eq(lifecycleEmailEvent.status, "scheduled")
			)
		)
		.returning();
}

export async function getLifecycleEmailEventsByIds(
	db: Database,
	eventIds: string[]
): Promise<LifecycleEmailEventSelect[]> {
	if (eventIds.length === 0) {
		return [];
	}

	return db
		.select()
		.from(lifecycleEmailEvent)
		.where(inArray(lifecycleEmailEvent.id, eventIds));
}

export async function markLifecycleEmailEventsSent(
	db: Database,
	eventIds: string[],
	sentAt = new Date()
) {
	if (eventIds.length === 0) {
		return;
	}

	await db
		.update(lifecycleEmailEvent)
		.set({
			status: "sent",
			sentAt,
			updatedAt: sentAt,
			lastError: null,
		})
		.where(inArray(lifecycleEmailEvent.id, eventIds));
}

export async function markLifecycleEmailEventsSkipped(
	db: Database,
	params: { eventIds: string[]; reason: string; now?: Date }
) {
	if (params.eventIds.length === 0) {
		return;
	}

	const now = params.now ?? new Date();
	await db
		.update(lifecycleEmailEvent)
		.set({
			status: "skipped",
			failedAt: now,
			updatedAt: now,
			lastError: params.reason,
		})
		.where(inArray(lifecycleEmailEvent.id, params.eventIds));
}

export async function markLifecycleEmailEventsFailed(
	db: Database,
	params: { eventIds: string[]; error: string; now?: Date }
) {
	if (params.eventIds.length === 0) {
		return;
	}

	const now = params.now ?? new Date();
	await db
		.update(lifecycleEmailEvent)
		.set({
			status: "failed",
			failedAt: now,
			updatedAt: now,
			lastError: params.error.slice(0, 2000),
		})
		.where(inArray(lifecycleEmailEvent.id, params.eventIds));
}

export async function requeueLifecycleEmailEvents(
	db: Database,
	params: { eventIds: string[]; scheduledAt: Date; error: string }
) {
	if (params.eventIds.length === 0) {
		return;
	}

	await db
		.update(lifecycleEmailEvent)
		.set({
			status: "scheduled",
			scheduledAt: params.scheduledAt,
			updatedAt: new Date(),
			lastError: params.error.slice(0, 2000),
		})
		.where(inArray(lifecycleEmailEvent.id, params.eventIds));
}

export async function listWeeklyDigestCandidateWebsites(
	db: Database,
	params: { limit: number; offset?: number }
) {
	return db
		.select({
			organizationId: organization.id,
			organizationName: organization.name,
			timezone: organization.timezone,
			websiteId: website.id,
			websiteName: website.name,
			websiteSlug: website.slug,
		})
		.from(website)
		.innerJoin(organization, eq(website.organizationId, organization.id))
		.where(
			and(
				eq(organization.weeklyDigestEnabled, true),
				isNull(website.deletedAt),
				eq(website.status, WebsiteStatus.ACTIVE)
			)
		)
		.orderBy(asc(organization.id), asc(website.id))
		.limit(params.limit)
		.offset(params.offset ?? 0);
}

export async function getWeeklyDigestWebsiteForEvent(
	db: Database,
	params: { organizationId: string; websiteId?: string | null }
) {
	const [site] = await db
		.select({
			id: website.id,
			name: website.name,
			slug: website.slug,
			organizationId: website.organizationId,
		})
		.from(website)
		.where(
			params.websiteId
				? and(
						eq(website.organizationId, params.organizationId),
						eq(website.id, params.websiteId),
						isNull(website.deletedAt),
						eq(website.status, WebsiteStatus.ACTIVE)
					)
				: and(
						eq(website.organizationId, params.organizationId),
						isNull(website.deletedAt),
						eq(website.status, WebsiteStatus.ACTIVE)
					)
		)
		.orderBy(asc(website.id))
		.limit(1);

	return site ?? null;
}

export async function listLifecycleLimitCandidateWebsites(
	db: Database,
	params: { limit: number; offset?: number }
) {
	return db
		.select()
		.from(website)
		.where(
			and(isNull(website.deletedAt), eq(website.status, WebsiteStatus.ACTIVE))
		)
		.orderBy(asc(website.id))
		.limit(params.limit)
		.offset(params.offset ?? 0);
}
