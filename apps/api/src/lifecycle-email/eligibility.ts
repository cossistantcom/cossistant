import type { Database } from "@api/db";
import { getMemberNotificationSettings } from "@api/db/queries";
import { isEmailSuppressed } from "@api/db/queries/email-bounce";
import { organization } from "@api/db/schema";
import { MemberNotificationChannel } from "@cossistant/types";
import { and, eq } from "drizzle-orm";
import { LIFECYCLE_EMAIL_KEYS } from "./types";

export type LifecycleEmailEligibilityEvent = {
	emailKey: string;
	recipientEmail: string;
	recipientMemberId: string | null;
	recipientUserId: string | null;
	organizationId: string;
};

type LifecycleEmailEligibilityDeps = {
	getMemberNotificationSettings: typeof getMemberNotificationSettings;
	getRecipientName: (
		db: Database,
		params: { recipientUserId: string }
	) => Promise<string | null>;
	isEmailSuppressed: typeof isEmailSuppressed;
	isWeeklyDigestEnabled: (
		db: Database,
		params: { organizationId: string }
	) => Promise<boolean>;
};

export type LifecycleEmailEligibilityResult =
	| {
			ok: true;
			recipientName: string | null;
	  }
	| {
			ok: false;
			reason:
				| "email_suppressed"
				| "marketing_email_disabled"
				| "missing_recipient"
				| "missing_recipient_email"
				| "weekly_digest_disabled";
	  };

async function getRecipientName(
	db: Database,
	params: { recipientUserId: string }
) {
	const row = await db.query.user.findFirst({
		where: (user, { eq: eqUser }) => eqUser(user.id, params.recipientUserId),
		columns: {
			name: true,
		},
	});

	return row?.name ?? null;
}

async function isWeeklyDigestEnabled(
	db: Database,
	params: { organizationId: string }
) {
	const row = await db.query.organization.findFirst({
		where: and(
			eq(organization.id, params.organizationId),
			eq(organization.weeklyDigestEnabled, true)
		),
		columns: {
			id: true,
		},
	});

	return Boolean(row);
}

const defaultDeps: LifecycleEmailEligibilityDeps = {
	getMemberNotificationSettings,
	getRecipientName,
	isEmailSuppressed,
	isWeeklyDigestEnabled,
};

export async function getLifecycleEmailEligibility(
	db: Database,
	event: LifecycleEmailEligibilityEvent,
	deps: LifecycleEmailEligibilityDeps = defaultDeps
): Promise<LifecycleEmailEligibilityResult> {
	if (!event.recipientEmail.trim()) {
		return { ok: false, reason: "missing_recipient_email" };
	}

	if (!(event.recipientMemberId && event.recipientUserId)) {
		return { ok: false, reason: "missing_recipient" };
	}

	const recipientUserId = event.recipientUserId;
	const recipientMemberId = event.recipientMemberId;

	const [suppressed, settings, weeklyDigestEnabled, recipientName] =
		await Promise.all([
			deps.isEmailSuppressed(db, {
				email: event.recipientEmail,
				organizationId: event.organizationId,
			}),
			deps.getMemberNotificationSettings(db, {
				organizationId: event.organizationId,
				memberId: recipientMemberId,
			}),
			event.emailKey === LIFECYCLE_EMAIL_KEYS.WEEKLY_DIGEST
				? deps.isWeeklyDigestEnabled(db, {
						organizationId: event.organizationId,
					})
				: Promise.resolve(true),
			deps.getRecipientName(db, { recipientUserId }),
		]);

	if (suppressed) {
		return { ok: false, reason: "email_suppressed" };
	}

	if (!weeklyDigestEnabled) {
		return { ok: false, reason: "weekly_digest_disabled" };
	}

	const marketingSetting = settings.settings.find(
		(setting) => setting.channel === MemberNotificationChannel.EMAIL_MARKETING
	);

	if (marketingSetting?.enabled === false) {
		return { ok: false, reason: "marketing_email_disabled" };
	}

	return {
		ok: true,
		recipientName,
	};
}
