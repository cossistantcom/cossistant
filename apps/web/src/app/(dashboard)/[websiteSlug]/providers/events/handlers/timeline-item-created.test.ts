import { beforeEach, describe, expect, it, mock } from "bun:test";

const clearTypingFromTimelineItemMock = mock((_event: unknown) => {});
const forEachConversationHeadersQueryMock = mock(
	(
		_queryClient: unknown,
		_websiteSlug: string,
		callback: (queryKey: readonly unknown[]) => void
	) => {
		callback(["headers-query"]);
	}
);
const updateConversationHeaderInCacheMock = mock(
	(
		_queryClient: unknown,
		_queryKey: readonly unknown[],
		_conversationId: string,
		_updater: unknown
	) => {}
);
const reconcileOptimisticConversationTimelineItemInCacheMock = mock(
	(_queryClient: unknown, _queryKey: readonly unknown[], _item: unknown) => {}
);
const upsertConversationTimelineItemInCacheMock = mock(
	(_queryClient: unknown, _queryKey: readonly unknown[], _item: unknown) => {}
);

mock.module("@plasma/react/realtime/typing-store", () => ({
	clearTypingFromTimelineItem: clearTypingFromTimelineItemMock,
}));

mock.module("@/data/conversation-header-cache", () => ({
	forEachConversationHeadersQuery: forEachConversationHeadersQueryMock,
	updateConversationHeaderInCache: updateConversationHeaderInCacheMock,
}));

mock.module("@/data/conversation-message-cache", () => ({
	reconcileOptimisticConversationTimelineItemInCache:
		reconcileOptimisticConversationTimelineItemInCacheMock,
	upsertConversationTimelineItemInCache:
		upsertConversationTimelineItemInCacheMock,
}));

const timelineItemCreatedModulePromise = import("./timeline-item-created");

describe("handleMessageCreated", () => {
	beforeEach(() => {
		clearTypingFromTimelineItemMock.mockClear();
		forEachConversationHeadersQueryMock.mockClear();
		updateConversationHeaderInCacheMock.mockClear();
		reconcileOptimisticConversationTimelineItemInCacheMock.mockClear();
		upsertConversationTimelineItemInCacheMock.mockClear();
	});

	it("does not mutate conversation headers for tool items", async () => {
		const { handleMessageCreated } = await timelineItemCreatedModulePromise;

		const getObjectByIdMock = mock((_id: string) => ({ id: "conv-1" }));
		const setNormalizedDataMock = mock((_value: unknown) => {});
		const invalidateQueriesMock = mock(async (_args: unknown) => {});

		handleMessageCreated({
			event: {
				type: "timelineItemCreated",
				payload: {
					websiteId: "site-1",
					organizationId: "org-1",
					visitorId: "visitor-1",
					userId: null,
					conversationId: "conv-1",
					item: {
						id: "tool-1",
						conversationId: "conv-1",
						organizationId: "org-1",
						visibility: "public",
						type: "tool",
						text: "Tool call: searchKnowledgeBase",
						parts: [],
						userId: null,
						visitorId: "visitor-1",
						aiAgentId: "ai-1",
						createdAt: "2026-01-01T00:00:00.000Z",
						deletedAt: null,
						tool: "searchKnowledgeBase",
					},
				},
			} as never,
			context: {
				queryClient: {
					invalidateQueries: invalidateQueriesMock,
					getQueryCache: () => ({
						findAll: () => [
							{
								queryKey: [
									["conversation", "getConversationTimelineItems"],
									{
										input: {
											conversationId: "conv-1",
											websiteSlug: "acme",
										},
									},
									{ type: "infinite" },
								],
							},
						],
					}),
				} as never,
				queryNormalizer: {
					getObjectById: getObjectByIdMock,
					setNormalizedData: setNormalizedDataMock,
				} as never,
				website: {
					id: "site-1",
					slug: "acme",
				},
			} as never,
		});

		expect(clearTypingFromTimelineItemMock).toHaveBeenCalledTimes(1);
		expect(
			reconcileOptimisticConversationTimelineItemInCacheMock
		).toHaveBeenCalledTimes(1);
		expect(upsertConversationTimelineItemInCacheMock).toHaveBeenCalledTimes(1);
		expect(updateConversationHeaderInCacheMock).toHaveBeenCalledTimes(0);
		expect(forEachConversationHeadersQueryMock).toHaveBeenCalledTimes(0);
		expect(getObjectByIdMock).toHaveBeenCalledTimes(0);
		expect(setNormalizedDataMock).toHaveBeenCalledTimes(0);
		expect(invalidateQueriesMock).toHaveBeenCalledTimes(0);
	});

	it("still updates conversation headers for regular message items", async () => {
		const { handleMessageCreated } = await timelineItemCreatedModulePromise;

		const header = {
			id: "conv-1",
			lastTimelineItem: null,
			lastMessageTimelineItem: null,
			lastMessageAt: null,
			updatedAt: "2025-01-01T00:00:00.000Z",
		};

		const getObjectByIdMock = mock((_id: string) => header);
		const setNormalizedDataMock = mock((_value: unknown) => {});

		handleMessageCreated({
			event: {
				type: "timelineItemCreated",
				payload: {
					websiteId: "site-1",
					organizationId: "org-1",
					visitorId: "visitor-1",
					userId: null,
					conversationId: "conv-1",
					item: {
						id: "msg-1",
						conversationId: "conv-1",
						organizationId: "org-1",
						visibility: "public",
						type: "message",
						text: "Hello",
						parts: [{ type: "text", text: "Hello" }],
						userId: null,
						visitorId: "visitor-1",
						aiAgentId: null,
						createdAt: "2026-01-02T00:00:00.000Z",
						deletedAt: null,
						tool: null,
					},
				},
			} as never,
			context: {
				queryClient: {
					getQueryCache: () => ({
						findAll: () => [
							{
								queryKey: [
									["conversation", "getConversationTimelineItems"],
									{
										input: {
											conversationId: "conv-1",
											websiteSlug: "acme",
										},
									},
									{ type: "infinite" },
								],
							},
						],
					}),
				} as never,
				queryNormalizer: {
					getObjectById: getObjectByIdMock,
					setNormalizedData: setNormalizedDataMock,
				} as never,
				website: {
					id: "site-1",
					slug: "acme",
				},
			} as never,
		});

		expect(updateConversationHeaderInCacheMock).toHaveBeenCalledTimes(1);
		expect(setNormalizedDataMock).toHaveBeenCalledTimes(1);
	});

	it("keeps locked headers redacted when new messages arrive", async () => {
		const { handleMessageCreated } = await timelineItemCreatedModulePromise;

		const header = {
			id: "conv-1",
			title: "Visible title",
			dashboardLocked: true,
			dashboardLockReason: "conversation_limit",
			lastTimelineItem: null,
			lastMessageTimelineItem: null,
			lastMessageAt: null,
			updatedAt: "2025-01-01T00:00:00.000Z",
		};

		const getObjectByIdMock = mock((_id: string) => header);
		const setNormalizedDataMock = mock((_value: unknown) => {});

		handleMessageCreated({
			event: {
				type: "timelineItemCreated",
				payload: {
					websiteId: "site-1",
					organizationId: "org-1",
					visitorId: "visitor-1",
					userId: null,
					conversationId: "conv-1",
					item: {
						id: "msg-2",
						conversationId: "conv-1",
						organizationId: "org-1",
						visibility: "public",
						type: "message",
						text: "Should stay hidden",
						parts: [{ type: "text", text: "Should stay hidden" }],
						userId: null,
						visitorId: "visitor-1",
						aiAgentId: null,
						createdAt: "2026-01-03T00:00:00.000Z",
						deletedAt: null,
						tool: null,
					},
				},
			} as never,
			context: {
				queryClient: {
					getQueryCache: () => ({
						findAll: () => [
							{
								queryKey: [
									["conversation", "getConversationTimelineItems"],
									{
										input: {
											conversationId: "conv-1",
											websiteSlug: "acme",
										},
									},
									{ type: "infinite" },
								],
							},
						],
					}),
				} as never,
				queryNormalizer: {
					getObjectById: getObjectByIdMock,
					setNormalizedData: setNormalizedDataMock,
				} as never,
				website: {
					id: "site-1",
					slug: "acme",
				},
			} as never,
		});

		expect(updateConversationHeaderInCacheMock).toHaveBeenCalledTimes(1);
		const [_, __, ___, updater] =
			updateConversationHeaderInCacheMock.mock.calls[0] ?? [];
		const updatedHeader = (updater as (value: typeof header) => typeof header)(
			header
		);

		expect(updatedHeader.dashboardLocked).toBe(true);
		expect(updatedHeader.dashboardLockReason).toBe("conversation_limit");
		expect(updatedHeader.title).toBe("Visible title");
		expect(updatedHeader.lastTimelineItem).toBeNull();
		expect(updatedHeader.lastMessageTimelineItem).toBeNull();
		expect(updatedHeader.lastMessageAt).toBeNull();
	});
});
