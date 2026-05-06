import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const dbMock = {} as never;

const getConversationByIdMock = mock(async () => ({
	visitorId: "visitor-1",
}));
const getMessageMetadataMock = mock(async () => ({
	id: "msg-1",
	createdAt: "2026-03-04T10:00:00.000Z",
}));
const enqueueAiAgentTriggerMock = mock(async () => ({
	status: "queued",
}));
const getLatestMessageForPushMock = mock(async () => null);
const getNotificationDataMock = mock(async () => ({
	websiteInfo: null,
	participants: [],
}));
const triggerMemberMessageNotificationMock = mock(async () => {});
const triggerVisitorMessageNotificationMock = mock(async () => {});
const sendMemberPushNotificationMock = mock(async () => ({ sent: false }));

mock.module("@api/db", () => ({
	db: dbMock,
}));

mock.module("@api/db/queries/conversation", () => ({
	getConversationById: getConversationByIdMock,
	getMessageMetadata: getMessageMetadataMock,
}));

mock.module("@api/services/ai-trigger-service", () => ({
	enqueueAiAgentTrigger: enqueueAiAgentTriggerMock,
}));

mock.module("@api/utils/notification-helpers", () => ({
	getLatestMessageForPush: getLatestMessageForPushMock,
	getNotificationData: getNotificationDataMock,
}));

mock.module("@api/utils/queue-triggers", () => ({
	triggerMemberMessageNotification: triggerMemberMessageNotificationMock,
	triggerVisitorMessageNotification: triggerVisitorMessageNotificationMock,
}));

mock.module("@api/workflows/message/member-push-notifier", () => ({
	sendMemberPushNotification: sendMemberPushNotificationMock,
}));

const modulePromise = import("./send-message-with-notification");

const defaultParams = {
	conversationId: "conv-1",
	messageId: "msg-1",
	websiteId: "site-1",
	organizationId: "org-1",
};

describe("triggerMessageNotificationWorkflow AI enqueue behavior", () => {
	beforeEach(() => {
		getConversationByIdMock.mockReset();
		getMessageMetadataMock.mockReset();
		enqueueAiAgentTriggerMock.mockReset();
		getLatestMessageForPushMock.mockReset();
		getNotificationDataMock.mockReset();
		triggerMemberMessageNotificationMock.mockReset();
		triggerVisitorMessageNotificationMock.mockReset();
		sendMemberPushNotificationMock.mockReset();

		getConversationByIdMock.mockResolvedValue({
			visitorId: "visitor-1",
		});
		getMessageMetadataMock.mockResolvedValue({
			id: "msg-1",
			createdAt: "2026-03-04T10:00:00.000Z",
		});
		enqueueAiAgentTriggerMock.mockResolvedValue({
			status: "queued",
		});
		getLatestMessageForPushMock.mockResolvedValue(null);
		getNotificationDataMock.mockResolvedValue({
			websiteInfo: null,
			participants: [],
		});
		triggerMemberMessageNotificationMock.mockResolvedValue(undefined);
		triggerVisitorMessageNotificationMock.mockResolvedValue(undefined);
		sendMemberPushNotificationMock.mockResolvedValue({ sent: false });
	});

	it("enqueues AI handling for member-authored messages", async () => {
		const { triggerMessageNotificationWorkflow } = await modulePromise;

		await triggerMessageNotificationWorkflow({
			...defaultParams,
			actor: { type: "user", userId: "user-1" },
		});

		expect(enqueueAiAgentTriggerMock).toHaveBeenCalledWith({
			conversationId: "conv-1",
			websiteId: "site-1",
			organizationId: "org-1",
			messageId: "msg-1",
			messageCreatedAt: "2026-03-04T10:00:00.000Z",
		});
		expect(getConversationByIdMock).not.toHaveBeenCalled();
	});

	it("enqueues AI handling for visitor-authored messages", async () => {
		const { triggerMessageNotificationWorkflow } = await modulePromise;

		await triggerMessageNotificationWorkflow({
			...defaultParams,
			actor: { type: "visitor", visitorId: "visitor-1" },
		});

		expect(enqueueAiAgentTriggerMock).toHaveBeenCalledWith({
			conversationId: "conv-1",
			websiteId: "site-1",
			organizationId: "org-1",
			messageId: "msg-1",
			messageCreatedAt: "2026-03-04T10:00:00.000Z",
		});
		expect(getConversationByIdMock).not.toHaveBeenCalled();
	});

	it("never re-enqueues AI-authored messages", async () => {
		const { triggerMessageNotificationWorkflow } = await modulePromise;

		await triggerMessageNotificationWorkflow({
			...defaultParams,
			actor: { type: "ai_agent", aiAgentId: "ai-1" },
		});

		expect(enqueueAiAgentTriggerMock).not.toHaveBeenCalled();
	});

	it("keeps member notification helper notification-only", async () => {
		const { triggerMemberSentMessageWorkflow } = await modulePromise;

		await triggerMemberSentMessageWorkflow({
			...defaultParams,
			senderId: "user-1",
		});

		expect(enqueueAiAgentTriggerMock).not.toHaveBeenCalled();
	});

	it("keeps visitor notification helper notification-only", async () => {
		const { triggerVisitorSentMessageWorkflow } = await modulePromise;

		await triggerVisitorSentMessageWorkflow({
			...defaultParams,
			visitorId: "visitor-1",
		});

		expect(enqueueAiAgentTriggerMock).not.toHaveBeenCalled();
	});
});

afterAll(() => {
	mock.restore();
});
