import { beforeEach, describe, expect, it, mock } from "bun:test";

const applyConversationTypingEventMock = mock(
	(_event: unknown, _options: unknown) => {}
);

mock.module("@cossistant/react/realtime/typing-store", () => ({
	applyConversationTypingEvent: applyConversationTypingEventMock,
	clearTypingFromTimelineItem: () => {},
}));

const modulePromise = import("./conversation-typing");

describe("handleConversationTyping", () => {
	beforeEach(() => {
		applyConversationTypingEventMock.mockClear();
	});

	it("applies typing events with the current user excluded", async () => {
		const { handleConversationTyping } = await modulePromise;
		const event = {
			type: "conversationTyping",
			payload: {
				websiteId: "site-1",
				organizationId: "org-1",
				conversationId: "conv-1",
				visitorId: "visitor-1",
				userId: null,
				aiAgentId: null,
				isTyping: true,
				visitorPreview: "Hello",
			},
		} as const;

		handleConversationTyping({
			event: event as never,
			context: {
				userId: "user-1",
				website: {
					id: "other-site",
					slug: "acme",
				},
			} as never,
		});

		expect(applyConversationTypingEventMock).toHaveBeenCalledTimes(1);
		expect(applyConversationTypingEventMock).toHaveBeenCalledWith(event, {
			ignoreUserId: "user-1",
		});
	});
});
