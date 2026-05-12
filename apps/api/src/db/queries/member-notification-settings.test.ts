import { describe, expect, it } from "bun:test";
import { MemberNotificationChannel } from "@cossistant/types";
import { getMemberNotificationSettings } from "./member-notification-settings";

function createSelectDb(rows: Record<string, unknown>[]) {
	return {
		select: () => ({
			from: () => ({
				where: async () => rows,
			}),
		}),
	};
}

function createStoredSetting(
	overrides: Partial<{
		channel: string;
		enabled: boolean;
		delaySeconds: number;
		priority: number;
		config: Record<string, unknown> | null;
	}> = {}
) {
	return {
		channel: MemberNotificationChannel.EMAIL_NEW_MESSAGE,
		enabled: true,
		delaySeconds: 300,
		priority: 10,
		config: null,
		...overrides,
	};
}

describe("getMemberNotificationSettings", () => {
	it("includes human help needed emails as enabled by default", async () => {
		const db = createSelectDb([]);

		const result = await getMemberNotificationSettings(db as never, {
			organizationId: "01H00000000000000000000000",
			memberId: "01H00000000000000000000001",
		});

		const escalationSetting = result.settings.find(
			(setting) =>
				setting.channel === MemberNotificationChannel.EMAIL_ESCALATION
		);

		expect(escalationSetting).toMatchObject({
			channel: MemberNotificationChannel.EMAIL_ESCALATION,
			label: "Human help needed emails",
			enabled: true,
			delaySeconds: 0,
			priority: 0,
		});
	});

	it("inherits disabled new-message email state when escalation is missing", async () => {
		const db = createSelectDb([
			createStoredSetting({
				channel: MemberNotificationChannel.EMAIL_NEW_MESSAGE,
				enabled: false,
			}),
		]);

		const result = await getMemberNotificationSettings(db as never, {
			organizationId: "01H00000000000000000000000",
			memberId: "01H00000000000000000000001",
		});

		const escalationSetting = result.settings.find(
			(setting) =>
				setting.channel === MemberNotificationChannel.EMAIL_ESCALATION
		);

		expect(escalationSetting?.enabled).toBe(false);
	});
});
