import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const getConversationHeaderMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const getConversationTimelineItemsMock = mock((async () => ({
	items: [],
	nextCursor: null,
	hasNextPage: false,
})) as (...args: unknown[]) => Promise<unknown>);
const listConversationsHeadersMock = mock((async () => ({
	items: [],
	nextCursor: null,
})) as (...args: unknown[]) => Promise<unknown>);
const listFeedbackMock = mock((async () => ({
	items: [],
	pagination: {
		page: 1,
		limit: 10,
		total: 0,
		totalPages: 0,
		hasMore: false,
	},
})) as (...args: unknown[]) => Promise<unknown>);
const getPlanForWebsiteMock = mock((async () => ({
	hardLimitsEnforced: false,
	hardLimitsUnavailableReason: null,
	features: {
		messages: null,
		conversations: null,
	},
})) as (...args: unknown[]) => Promise<unknown>);
const getDashboardConversationLockCutoffMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);

mock.module("@api/db/queries/conversation", () => ({
	getConversationHeader: getConversationHeaderMock,
	getConversationTimelineItems: getConversationTimelineItemsMock,
	listConversationsHeaders: listConversationsHeadersMock,
}));

mock.module("@api/db/queries/feedback", () => ({
	listFeedback: listFeedbackMock,
}));

mock.module("@api/lib/plans/access", () => ({
	getPlanForWebsite: getPlanForWebsiteMock,
}));

mock.module("@api/lib/hard-limits/dashboard", () => ({
	applyDashboardConversationHardLimit: ({
		conversation,
	}: {
		conversation: unknown;
	}) => conversation,
	getDashboardConversationLockCutoff: getDashboardConversationLockCutoffMock,
	resolveDashboardHardLimitPolicy: () => ({
		enforced: false,
		unavailableReason: null,
		windowStart: "2026-01-01T00:00:00.000Z",
		messageLimit: null,
		conversationLimit: null,
	}),
}));

mock.module("@api/rest/routers/feedback-shared", () => ({
	formatFeedbackResponse: (entry: unknown) => entry,
}));

const modulePromise = import("./conversations");

const website = {
	id: "site-1",
	name: "Acme Support",
	slug: "acme",
	domain: "acme.test",
	defaultLanguage: "en",
	organizationId: "org-1",
	teamId: "team-1",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	deletedAt: null,
} as never;

describe("support conversation capabilities", () => {
	afterAll(() => {
		mock.restore();
	});

	beforeEach(() => {
		getConversationHeaderMock.mockReset();
		getConversationTimelineItemsMock.mockReset();
		listConversationsHeadersMock.mockReset();
		listFeedbackMock.mockReset();
		getPlanForWebsiteMock.mockReset();
		getDashboardConversationLockCutoffMock.mockReset();

		getConversationHeaderMock.mockResolvedValue(null);
		getConversationTimelineItemsMock.mockResolvedValue({
			items: [],
			nextCursor: null,
			hasNextPage: false,
		});
		listConversationsHeadersMock.mockResolvedValue({
			items: [],
			nextCursor: null,
		});
		listFeedbackMock.mockResolvedValue({
			items: [],
			pagination: {
				page: 1,
				limit: 10,
				total: 0,
				totalPages: 0,
				hasMore: false,
			},
		});
		getPlanForWebsiteMock.mockResolvedValue({
			hardLimitsEnforced: false,
			hardLimitsUnavailableReason: null,
			features: {
				messages: null,
				conversations: null,
			},
		});
		getDashboardConversationLockCutoffMock.mockResolvedValue(null);
	});

	it("lists conversations through the shared query path", async () => {
		const { listSupportConversations } = await modulePromise;
		await expect(
			listSupportConversations({} as never, {
				website,
				actorUserId: "user-1",
				limit: 10,
				cursor: null,
				orderBy: "updatedAt",
				order: "desc",
			})
		).resolves.toEqual({ items: [], nextCursor: null });

		expect(listConversationsHeadersMock).toHaveBeenCalledWith(
			{},
			expect.objectContaining({
				organizationId: "org-1",
				websiteId: "site-1",
				userId: "user-1",
				limit: 10,
			})
		);
	});

	it("rejects inaccessible conversation context", async () => {
		const { getSupportConversation } = await modulePromise;
		await expect(
			getSupportConversation({} as never, {
				website,
				actorUserId: "user-1",
				conversationId: "conv-1",
				timelineLimit: 25,
				timelineCursor: null,
				feedbackLimit: 10,
			})
		).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
	});
});
