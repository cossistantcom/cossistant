import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { MemberNotificationChannel } from "@cossistant/types";

const dbMock = {} as never;

const getNotificationDataMock = mock(async () => ({
	websiteInfo: {
		name: "Acme Support",
		slug: "acme",
		logo: null,
	},
	participants: [
		{
			userId: "user-1",
			memberId: "member-1",
			userEmail: "member@example.com",
		},
	],
}));
const getMemberNotificationPreferenceMock = mock(
	async (): Promise<{ enabled: boolean } | undefined> => ({
		enabled: true,
	})
);
const sendMemberPushNotificationMock = mock(async () => ({ sent: true }));
const sendEmailMock = mock(async () => ({ data: { id: "email-1" } }));
const escalationNotificationMock = mock((props: unknown) => ({
	type: "EscalationNotification",
	props,
}));

mock.module("@api/utils/notification-helpers", () => ({
	getMemberNotificationPreference: getMemberNotificationPreferenceMock,
	getNotificationData: getNotificationDataMock,
}));

mock.module("@api/workflows/message/member-push-notifier", () => ({
	sendMemberPushNotification: sendMemberPushNotificationMock,
}));

mock.module("@cossistant/transactional", () => ({
	EscalationNotification: escalationNotificationMock,
	sendEmail: sendEmailMock,
}));

const modulePromise = import("./send-escalation-notification");

const defaultParams = {
	db: dbMock,
	conversationId: "conv-1",
	websiteId: "site-1",
	organizationId: "org-1",
	escalationReason: "The visitor asked for a person",
	summary: null,
	aiAgentName: "Cossistant",
	visitorName: "Visitor",
};

describe("sendEscalationNotifications", () => {
	beforeEach(() => {
		getNotificationDataMock.mockReset();
		getMemberNotificationPreferenceMock.mockReset();
		sendMemberPushNotificationMock.mockReset();
		sendEmailMock.mockReset();
		escalationNotificationMock.mockReset();

		getNotificationDataMock.mockResolvedValue({
			websiteInfo: {
				name: "Acme Support",
				slug: "acme",
				logo: null,
			},
			participants: [
				{
					userId: "user-1",
					memberId: "member-1",
					userEmail: "member@example.com",
				},
			],
		});
		getMemberNotificationPreferenceMock.mockResolvedValue({ enabled: true });
		sendMemberPushNotificationMock.mockResolvedValue({ sent: true });
		sendEmailMock.mockResolvedValue({ data: { id: "email-1" } });
		escalationNotificationMock.mockReturnValue({
			type: "EscalationNotification",
			props: {},
		});
	});

	it("sends escalation email when the setting is enabled", async () => {
		const { sendEscalationNotifications } = await modulePromise;

		await sendEscalationNotifications(defaultParams);

		expect(getMemberNotificationPreferenceMock).toHaveBeenCalledWith(dbMock, {
			memberId: "member-1",
			organizationId: "org-1",
			channel: MemberNotificationChannel.EMAIL_ESCALATION,
		});
		expect(sendEmailMock).toHaveBeenCalledTimes(1);
		expect(sendMemberPushNotificationMock).toHaveBeenCalledTimes(1);
	});

	it("sends escalation email when no explicit setting exists", async () => {
		const { sendEscalationNotifications } = await modulePromise;
		getMemberNotificationPreferenceMock.mockResolvedValue(undefined);

		await sendEscalationNotifications(defaultParams);

		expect(sendEmailMock).toHaveBeenCalledTimes(1);
		expect(sendMemberPushNotificationMock).toHaveBeenCalledTimes(1);
	});

	it("skips escalation email when disabled without disabling push", async () => {
		const { sendEscalationNotifications } = await modulePromise;
		getMemberNotificationPreferenceMock.mockResolvedValue({ enabled: false });

		await sendEscalationNotifications(defaultParams);

		expect(sendEmailMock).not.toHaveBeenCalled();
		expect(sendMemberPushNotificationMock).toHaveBeenCalledTimes(1);
	});
});

afterAll(() => {
	mock.restore();
});
