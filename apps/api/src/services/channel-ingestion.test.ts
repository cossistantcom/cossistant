import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import type { ChannelMessage } from "@plasma/channels";

const getWebsiteByIdMock = mock(async () => ({
	id: "site-1",
	organizationId: "org-1",
	defaultParticipantIds: [],
}));
const upsertVisitorMock = mock(async () => ({ id: "visitor-ulid" }));
const upsertContactByExternalIdMock = mock(async () => ({
	status: "created",
	contact: { id: "contact-1" },
}));
const linkVisitorToContactMock = mock(async () => {});
const upsertConversationMock = mock(
	(async () => ({
		status: "created" as const,
		conversation: { id: "conv-1", visitorId: "visitor-ulid" },
	})) as () => Promise<
		| {
				status: "created";
				conversation: { id: string; visitorId: string };
		  }
		| {
				status: "existing";
				conversation: { id: string; visitorId: string };
		  }
	>,
);
const getDefaultParticipantsMock = mock(async () => ["user-1"]);
const addConversationParticipantsMock = mock(async () => ["participant-1"]);
const createMessageTimelineItemMock = mock(async () => ({
	item: { id: "timeline-1" },
}));
const triggerMessageNotificationWorkflowMock = mock(async () => {});

mock.module("@api/db/queries/website", () => ({
	getWebsiteById: getWebsiteByIdMock,
}));

mock.module("@api/db/queries/visitor", () => ({
	upsertVisitor: upsertVisitorMock,
}));

mock.module("@api/db/queries/contact", () => ({
	upsertContactByExternalId: upsertContactByExternalIdMock,
	linkVisitorToContact: linkVisitorToContactMock,
}));

mock.module("@api/db/queries/conversation", () => ({
	upsertConversation: upsertConversationMock,
}));

mock.module("@api/utils/participant-helpers", () => ({
	getDefaultParticipants: getDefaultParticipantsMock,
	addConversationParticipants: addConversationParticipantsMock,
}));

mock.module("@api/utils/timeline-item", () => ({
	createMessageTimelineItem: createMessageTimelineItemMock,
}));

mock.module("@api/utils/send-message-with-notification", () => ({
	triggerMessageNotificationWorkflow: triggerMessageNotificationWorkflowMock,
}));

const modulePromise = import("./channel-ingestion");

const baseMessage: ChannelMessage = {
	channelType: "telegram",
	externalId: "msg-1",
	visitorExternalId: "visitor-ext-1",
	visitorName: "Visitor One",
	content: "Hello from Telegram",
	timestamp: "2026-04-09T12:00:00.000Z",
	metadata: {
		chatId: 42,
	},
};

describe("ingestInboundChannelMessage", () => {
	beforeEach(() => {
		getWebsiteByIdMock.mockReset();
		upsertVisitorMock.mockReset();
		upsertContactByExternalIdMock.mockReset();
		linkVisitorToContactMock.mockReset();
		upsertConversationMock.mockReset();
		getDefaultParticipantsMock.mockReset();
		addConversationParticipantsMock.mockReset();
		createMessageTimelineItemMock.mockReset();
		triggerMessageNotificationWorkflowMock.mockReset();

		getWebsiteByIdMock.mockResolvedValue({
			id: "site-1",
			organizationId: "org-1",
			defaultParticipantIds: [],
		});
		upsertVisitorMock.mockResolvedValue({ id: "visitor-ulid" });
		upsertContactByExternalIdMock.mockResolvedValue({
			status: "created",
			contact: { id: "contact-1" },
		});
		upsertConversationMock.mockResolvedValue({
			status: "created",
			conversation: { id: "conv-1", visitorId: "visitor-ulid" },
		});
		getDefaultParticipantsMock.mockResolvedValue(["user-1"]);
		addConversationParticipantsMock.mockResolvedValue(["participant-1"]);
		createMessageTimelineItemMock.mockResolvedValue({
			item: { id: "timeline-1" },
		});
	});

	afterAll(() => {
		mock.restore();
	});

	it("creates or reuses visitor/contact/conversation state and triggers the existing notification flow", async () => {
		const { ingestInboundChannelMessage } = await modulePromise;

		const result = await ingestInboundChannelMessage({
			db: {} as never,
			target: {
				websiteId: "site-1",
				organizationId: "org-1",
			},
			message: baseMessage,
		});

		expect(result).toEqual({
			conversationId: expect.any(String),
			messageId: "timeline-1",
			createdConversation: true,
		});
		expect(upsertVisitorMock).toHaveBeenCalledTimes(1);
		expect(upsertContactByExternalIdMock).toHaveBeenCalledWith(
			{} as never,
			expect.objectContaining({
				externalId: "telegram:visitor-ext-1",
				name: "Visitor One",
			}),
		);
		expect(addConversationParticipantsMock).toHaveBeenCalledTimes(1);
		expect(createMessageTimelineItemMock).toHaveBeenCalledWith(
			expect.objectContaining({
				text: "Hello from Telegram",
				visibility: "public",
			}),
		);
		expect(triggerMessageNotificationWorkflowMock).toHaveBeenCalledWith(
			expect.objectContaining({
				websiteId: "site-1",
				organizationId: "org-1",
				messageId: "timeline-1",
				actor: expect.objectContaining({
					type: "visitor",
				}),
			}),
		);
	});

	it("skips default participant creation when the conversation already exists", async () => {
		upsertConversationMock.mockResolvedValueOnce({
			status: "existing",
			conversation: { id: "conv-1", visitorId: "visitor-ulid" },
		});
		const { ingestInboundChannelMessage } = await modulePromise;

		const result = await ingestInboundChannelMessage({
			db: {} as never,
			target: {
				websiteId: "site-1",
				organizationId: "org-1",
			},
			message: {
				...baseMessage,
				channelType: "slack",
				metadata: {
					channelId: "C123",
					threadTs: "1712664000.000100",
				},
			},
		});

		expect(result.createdConversation).toBe(false);
		expect(addConversationParticipantsMock).not.toHaveBeenCalled();
	});
});
