import { describe, expect, it, mock } from "bun:test";
import type { Database } from "@api/db";
import { MemberNotificationChannel } from "@cossistant/types";
import { getLifecycleEmailEligibility } from "./eligibility";
import { LIFECYCLE_EMAIL_KEYS } from "./types";

const db = {} as Database;

function createDeps(params?: {
	marketingEnabled?: boolean;
	recipientName?: string | null;
	suppressed?: boolean;
	weeklyDigestEnabled?: boolean;
}) {
	const getMemberNotificationSettings = mock(async () => ({
		organizationId: "org_1",
		memberId: "member_1",
		settings: [
			{
				channel: MemberNotificationChannel.EMAIL_MARKETING,
				label: "Marketing emails",
				description: "Product announcements, tips, and updates.",
				enabled: params?.marketingEnabled ?? true,
				delaySeconds: 0,
				priority: 30,
				requiresSetup: false,
				supportsDelaySeconds: false,
				config: null,
			},
		],
	}));
	const getRecipientName = mock(async () => params?.recipientName ?? "Ada");
	const isEmailSuppressed = mock(async () => params?.suppressed ?? false);
	const isWeeklyDigestEnabled = mock(
		async () => params?.weeklyDigestEnabled ?? true
	);

	return {
		getMemberNotificationSettings,
		getRecipientName,
		isEmailSuppressed,
		isWeeklyDigestEnabled,
	};
}

const baseEvent = {
	emailKey: LIFECYCLE_EMAIL_KEYS.WEEKLY_DIGEST,
	recipientEmail: "person@example.com",
	recipientMemberId: "member_1",
	recipientUserId: "user_1",
	organizationId: "org_1",
};

describe("getLifecycleEmailEligibility", () => {
	it("skips weekly digest emails when the organization has disabled them", async () => {
		const deps = createDeps({ weeklyDigestEnabled: false });

		const result = await getLifecycleEmailEligibility(db, baseEvent, deps);

		expect(result).toEqual({
			ok: false,
			reason: "weekly_digest_disabled",
		});
		expect(deps.isWeeklyDigestEnabled).toHaveBeenCalledWith(db, {
			organizationId: "org_1",
		});
	});

	it("skips lifecycle marketing emails when marketing emails are disabled", async () => {
		const deps = createDeps({ marketingEnabled: false });

		const result = await getLifecycleEmailEligibility(
			db,
			{
				...baseEvent,
				emailKey: LIFECYCLE_EMAIL_KEYS.SETUP_WIDGET,
			},
			deps
		);

		expect(result).toEqual({
			ok: false,
			reason: "marketing_email_disabled",
		});
		expect(deps.isWeeklyDigestEnabled).not.toHaveBeenCalled();
	});

	it("allows eligible lifecycle emails and returns the recipient name", async () => {
		const deps = createDeps({ recipientName: "Ada Lovelace" });

		const result = await getLifecycleEmailEligibility(db, baseEvent, deps);

		expect(result).toEqual({
			ok: true,
			recipientName: "Ada Lovelace",
		});
	});
});
