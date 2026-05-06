import { beforeEach, describe, expect, it, mock } from "bun:test";

const forEachConversationHeadersQueryMock = mock(
	(
		_queryClient: unknown,
		_websiteSlug: string,
		callback: (queryKey: readonly unknown[]) => void
	) => {
		callback(["headers-query"]);
	}
);
const prependConversationHeaderInCacheMock = mock(
	(_queryClient: unknown, _queryKey: readonly unknown[], _header: unknown) => {}
);

mock.module("@/data/conversation-header-cache", () => ({
	forEachConversationHeadersQuery: forEachConversationHeadersQueryMock,
	prependConversationHeaderInCache: prependConversationHeaderInCacheMock,
}));

const conversationCreatedModulePromise = import("./conversation-created");

describe("handleConversationCreated", () => {
	beforeEach(() => {
		forEachConversationHeadersQueryMock.mockClear();
		prependConversationHeaderInCacheMock.mockClear();
	});

	it("prepends feedback-started conversations with their feedback timeline item", async () => {
		const { handleConversationCreated } =
			await conversationCreatedModulePromise;
		const setNormalizedDataMock = mock((_value: unknown) => {});

		const feedbackItem = {
			id: "msg-feedback",
			conversationId: "conv-feedback",
			organizationId: "org-1",
			visibility: "public",
			type: "message",
			text: "The drawer closes unexpectedly",
			parts: [
				{ type: "text", text: "The drawer closes unexpectedly" },
				{
					type: "feedback",
					feedbackId: "feedback-1",
					rating: 5,
					topic: "Bug",
					trigger: "dashboard_topbar",
					source: "widget",
				},
			],
			userId: null,
			visitorId: "visitor-1",
			aiAgentId: null,
			createdAt: "2026-03-11T03:00:00.000Z",
			deletedAt: null,
		};
		const header = {
			id: "conv-feedback",
			websiteId: "site-1",
			visitorId: "visitor-1",
			lastTimelineItem: feedbackItem,
			lastMessageTimelineItem: feedbackItem,
			lastMessageAt: "2026-03-11T03:00:00.000Z",
			updatedAt: "2026-03-11T03:00:00.000Z",
		};

		handleConversationCreated({
			event: {
				type: "conversationCreated",
				payload: {
					websiteId: "site-1",
					organizationId: "org-1",
					visitorId: "visitor-1",
					userId: null,
					conversationId: "conv-feedback",
					conversation: {
						id: "conv-feedback",
						websiteId: "site-1",
						visitorId: "visitor-1",
						channel: "widget",
						status: "open",
						createdAt: "2026-03-11T03:00:00.000Z",
						updatedAt: "2026-03-11T03:00:00.000Z",
						deletedAt: null,
						lastTimelineItem: feedbackItem,
					},
					header,
				},
			} as never,
			context: {
				queryClient: {},
				queryNormalizer: {
					setNormalizedData: setNormalizedDataMock,
				},
				website: {
					id: "site-1",
					slug: "acme",
				},
				userId: "user-1",
			} as never,
		});

		expect(setNormalizedDataMock).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "conv-feedback",
				lastTimelineItem: expect.objectContaining({
					id: "msg-feedback",
					parts: expect.arrayContaining([
						expect.objectContaining({
							type: "feedback",
							rating: 5,
						}),
					]),
				}),
			})
		);
		expect(prependConversationHeaderInCacheMock).toHaveBeenCalledWith(
			{},
			["headers-query"],
			expect.objectContaining({
				id: "conv-feedback",
				lastTimelineItem: expect.objectContaining({
					id: "msg-feedback",
				}),
			})
		);
	});
});
