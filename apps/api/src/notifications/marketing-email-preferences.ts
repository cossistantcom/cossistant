import type { Database } from "@api/db";
import { member, memberNotificationSetting } from "@api/db/schema";
import {
	RESEND_AUDIENCE_ID,
	updateContactSubscriptionStatus,
} from "@cossistant/transactional";
import { MemberNotificationChannel } from "@cossistant/types";
import { and, eq } from "drizzle-orm";

type UpdateContactSubscriptionStatus = typeof updateContactSubscriptionStatus;

export type SyncMarketingEmailAudienceDeps = {
	audienceId: string;
	hasExplicitMarketingEmailOptOut: (
		db: Database,
		params: { userId: string }
	) => Promise<boolean>;
	updateContactSubscriptionStatus: UpdateContactSubscriptionStatus;
};

export type SyncMarketingEmailAudienceResult =
	| {
			synced: true;
			unsubscribed: boolean;
	  }
	| {
			synced: false;
			reason: "missing_email" | "user_has_marketing_opt_out";
	  };

export async function hasExplicitMarketingEmailOptOut(
	db: Database,
	params: { userId: string }
) {
	const [row] = await db
		.select({ id: memberNotificationSetting.id })
		.from(memberNotificationSetting)
		.innerJoin(member, eq(memberNotificationSetting.memberId, member.id))
		.where(
			and(
				eq(member.userId, params.userId),
				eq(
					memberNotificationSetting.channel,
					MemberNotificationChannel.EMAIL_MARKETING
				),
				eq(memberNotificationSetting.enabled, false)
			)
		)
		.limit(1);

	return Boolean(row);
}

const defaultDeps: SyncMarketingEmailAudienceDeps = {
	audienceId: RESEND_AUDIENCE_ID,
	hasExplicitMarketingEmailOptOut,
	updateContactSubscriptionStatus,
};

export async function syncMarketingEmailAudienceSubscription(
	db: Database,
	params: {
		email: string | null | undefined;
		enabled: boolean;
		userId: string;
	},
	deps: SyncMarketingEmailAudienceDeps = defaultDeps
): Promise<SyncMarketingEmailAudienceResult> {
	const email = params.email?.trim();

	if (!email) {
		return { synced: false, reason: "missing_email" };
	}

	if (!params.enabled) {
		const success = await deps.updateContactSubscriptionStatus(
			deps.audienceId,
			email,
			true
		);

		if (!success) {
			throw new Error("Failed to unsubscribe contact from marketing emails.");
		}

		return { synced: true, unsubscribed: true };
	}

	const hasOptOut = await deps.hasExplicitMarketingEmailOptOut(db, {
		userId: params.userId,
	});

	if (hasOptOut) {
		return { synced: false, reason: "user_has_marketing_opt_out" };
	}

	const success = await deps.updateContactSubscriptionStatus(
		deps.audienceId,
		email,
		false
	);

	if (!success) {
		throw new Error("Failed to resubscribe contact to marketing emails.");
	}

	return { synced: true, unsubscribed: false };
}
