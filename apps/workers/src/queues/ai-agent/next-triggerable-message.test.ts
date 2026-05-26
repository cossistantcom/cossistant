import { beforeEach, describe, expect, it, mock } from "bun:test";

const getConversationMessagesAfterCursorMock = mock(
	async (): Promise<Array<{ id: string; createdAt: string }>> => []
);

mock.module("@api/db/queries/conversation", () => ({
	getConversationById: mock(async () => null),
	getConversationMessagesAfterCursor: getConversationMessagesAfterCursorMock,
	getMessageMetadata: mock(async () => null),
}));

const modulePromise = import("./next-triggerable-message");

describe("findNextTriggerableMessageAfterCursor", () => {
	beforeEach(() => {
		getConversationMessagesAfterCursorMock.mockReset();
		getConversationMessagesAfterCursorMock.mockResolvedValue([]);
	});

	it("returns the earliest message after the cursor", async () => {
		getConversationMessagesAfterCursorMock.mockResolvedValue([
			{ id: "msg-team", createdAt: "2026-03-04T10:00:01.000Z" },
			{ id: "msg-visitor", createdAt: "2026-03-04T10:00:02.000Z" },
		]);

		const { findNextTriggerableMessageAfterCursor } = await modulePromise;
		const result = await findNextTriggerableMessageAfterCursor({
			db: {} as never,
			organizationId: "org-1",
			conversationId: "conv-1",
			afterCreatedAt: "2026-03-04T10:00:00.000Z",
			afterId: "msg-0",
		});

		expect(result).toEqual({
			id: "msg-team",
			createdAt: "2026-03-04T10:00:01.000Z",
		});
	});

	it("returns null when no later triggerable message exists", async () => {
		const { findNextTriggerableMessageAfterCursor } = await modulePromise;
		const result = await findNextTriggerableMessageAfterCursor({
			db: {} as never,
			organizationId: "org-1",
			conversationId: "conv-1",
			afterCreatedAt: "2026-03-04T10:00:00.000Z",
			afterId: "msg-0",
		});

		expect(result).toBeNull();
	});
});
