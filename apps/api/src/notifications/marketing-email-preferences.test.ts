import { describe, expect, it, mock } from "bun:test";
import type { Database } from "@api/db";
import { syncMarketingEmailAudienceSubscription } from "./marketing-email-preferences";

const db = {} as Database;

function createDeps(params?: {
	hasOptOut?: boolean;
	updateSucceeded?: boolean;
}) {
	return {
		audienceId: "audience_1",
		hasExplicitMarketingEmailOptOut: mock(
			async () => params?.hasOptOut ?? false
		),
		updateContactSubscriptionStatus: mock(
			async () => params?.updateSucceeded ?? true
		),
	};
}

describe("syncMarketingEmailAudienceSubscription", () => {
	it("unsubscribes the email from Resend when marketing emails are disabled", async () => {
		const deps = createDeps();

		const result = await syncMarketingEmailAudienceSubscription(
			db,
			{
				email: " person@example.com ",
				enabled: false,
				userId: "user_1",
			},
			deps
		);

		expect(result).toEqual({ synced: true, unsubscribed: true });
		expect(deps.updateContactSubscriptionStatus).toHaveBeenCalledWith(
			"audience_1",
			"person@example.com",
			true
		);
		expect(deps.hasExplicitMarketingEmailOptOut).not.toHaveBeenCalled();
	});

	it("does not resubscribe when another organization membership is explicitly opted out", async () => {
		const deps = createDeps({ hasOptOut: true });

		const result = await syncMarketingEmailAudienceSubscription(
			db,
			{
				email: "person@example.com",
				enabled: true,
				userId: "user_1",
			},
			deps
		);

		expect(result).toEqual({
			synced: false,
			reason: "user_has_marketing_opt_out",
		});
		expect(deps.hasExplicitMarketingEmailOptOut).toHaveBeenCalledWith(db, {
			userId: "user_1",
		});
		expect(deps.updateContactSubscriptionStatus).not.toHaveBeenCalled();
	});

	it("surfaces Resend sync failures", async () => {
		const deps = createDeps({ updateSucceeded: false });

		await expect(
			syncMarketingEmailAudienceSubscription(
				db,
				{
					email: "person@example.com",
					enabled: false,
					userId: "user_1",
				},
				deps
			)
		).rejects.toThrow("Failed to unsubscribe contact from marketing emails.");
	});
});
