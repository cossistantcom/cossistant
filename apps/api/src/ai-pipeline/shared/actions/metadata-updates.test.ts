import { beforeEach, describe, expect, it, mock } from "bun:test";

type MockConversationState = {
	id: string;
	visitorId: string;
	title?: string | null;
	titleSource?: string | null;
	priority?: string;
	prioritySource?: string | null;
	sentiment?: string | null;
	sentimentConfidence?: number | null;
	sentimentSource?: string | null;
};

const realtimeEmitMock = mock(async () => {});
const createTimelineItemMock = mock(async () => {});
const createConversationEventMock = mock(async () => {});
const syncConversationVisitorTitleMock = mock((async () => ({
	visitorTitle: null,
	visitorTitleLanguage: null,
})) as (...args: unknown[]) => Promise<{
	visitorTitle: string | null;
	visitorTitleLanguage: string | null;
}>);
const loadCurrentConversationMock = mock(
	(async (): Promise<MockConversationState | null> => null) as (
		...args: unknown[]
	) => Promise<MockConversationState | null>
);

mock.module("@api/realtime/emitter", () => ({
	realtime: {
		emit: realtimeEmitMock,
	},
}));

mock.module("@api/utils/timeline-item", () => ({
	createTimelineItem: createTimelineItemMock,
}));

mock.module("@api/utils/conversation-event", () => ({
	createConversationEvent: createConversationEventMock,
}));

mock.module("@api/lib/translation", () => ({
	syncConversationVisitorTitle: syncConversationVisitorTitleMock,
}));

mock.module("./load-current-conversation", () => ({
	loadCurrentConversation: loadCurrentConversationMock,
}));

const modulePromise = Promise.all([
	import("./update-title"),
	import("./update-priority"),
	import("./update-sentiment"),
]);

function createDbMock() {
	const returningMock = mock(
		(async (): Promise<Record<string, unknown>[]> => []) as (
			...args: unknown[]
		) => Promise<Record<string, unknown>[]>
	);
	const whereMock = mock(() => ({
		returning: returningMock,
	}));
	const setMock = mock(() => ({
		where: whereMock,
	}));
	const updateMock = mock(() => ({
		set: setMock,
	}));

	return {
		db: {
			update: updateMock,
		},
		updateMock,
		returningMock,
		whereMock,
		setMock,
	};
}

describe("metadata update actions", () => {
	const translationContext = {
		websiteDefaultLanguage: "en",
		visitorLanguage: "es",
		autoTranslateEnabled: true,
	} as const;

	beforeEach(() => {
		realtimeEmitMock.mockReset();
		createTimelineItemMock.mockReset();
		createConversationEventMock.mockReset();
		syncConversationVisitorTitleMock.mockReset();
		loadCurrentConversationMock.mockReset();

		realtimeEmitMock.mockResolvedValue(undefined);
		createTimelineItemMock.mockResolvedValue(undefined);
		createConversationEventMock.mockResolvedValue(undefined);
		syncConversationVisitorTitleMock.mockResolvedValue({
			visitorTitle: null,
			visitorTitleLanguage: null,
		});
		loadCurrentConversationMock.mockResolvedValue({
			id: "conv-1",
			visitorId: "visitor-1",
			title: null,
			titleSource: null,
			priority: "normal",
			prioritySource: null,
			sentiment: null,
			sentimentConfidence: null,
			sentimentSource: null,
		});
	});

	it("does not rewrite the title when the normalized title is unchanged", async () => {
		const [{ updateTitle }] = await modulePromise;
		const { db, updateMock } = createDbMock();
		loadCurrentConversationMock.mockResolvedValueOnce({
			id: "conv-1",
			visitorId: "visitor-1",
			title: "Billing issue",
			titleSource: null,
		});

		await updateTitle({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				title: "Billing issue",
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			title: "  billing   issue  ",
			translationContext,
		});

		expect(loadCurrentConversationMock).toHaveBeenCalledWith(db, "conv-1");
		expect(updateMock).not.toHaveBeenCalled();
		expect(createTimelineItemMock).not.toHaveBeenCalled();
		expect(realtimeEmitMock).not.toHaveBeenCalled();
	});

	it("rejects blank titles before writing", async () => {
		const [{ updateTitle }] = await modulePromise;
		const { db, updateMock } = createDbMock();

		const result = await updateTitle({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				title: null,
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			title: "    ",
			translationContext,
		});

		expect(result).toEqual({
			changed: false,
			reason: "invalid_title",
		});
		expect(updateMock).not.toHaveBeenCalled();
		expect(loadCurrentConversationMock).not.toHaveBeenCalled();
	});

	it("normalizes title spacing before saving", async () => {
		const [{ updateTitle }] = await modulePromise;
		const { db, returningMock, setMock } = createDbMock();
		returningMock.mockResolvedValueOnce([
			{
				id: "conv-1",
				visitorId: "visitor-1",
				titleSource: "ai",
			},
		]);

		const result = await updateTitle({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				title: null,
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			title: "  invoice    export   issue  ",
			translationContext,
		});

		expect(result).toEqual({ changed: true });
		expect(setMock).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "invoice export issue",
				titleSource: "ai",
			})
		);
		expect(syncConversationVisitorTitleMock).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "invoice export issue",
			})
		);
	});

	it("does not let AI overwrite a manually owned title", async () => {
		const [{ updateTitle }] = await modulePromise;
		const { db, updateMock } = createDbMock();
		loadCurrentConversationMock.mockResolvedValueOnce({
			id: "conv-1",
			visitorId: "visitor-1",
			title: "Manual title",
			titleSource: "user",
		});

		const result = await updateTitle({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				title: "Manual title",
				titleSource: "user",
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			title: "AI title",
			translationContext,
		});

		expect(result).toEqual({
			changed: false,
			reason: "manual_title",
		});
		expect(updateMock).not.toHaveBeenCalled();
		expect(createTimelineItemMock).not.toHaveBeenCalled();
		expect(realtimeEmitMock).not.toHaveBeenCalled();
	});

	it("does not rewrite the priority when it already matches", async () => {
		const [, { updatePriority }] = await modulePromise;
		const { db, updateMock } = createDbMock();
		loadCurrentConversationMock.mockResolvedValueOnce({
			id: "conv-1",
			visitorId: "visitor-1",
			priority: "high",
		});

		await updatePriority({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				priority: "high",
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			newPriority: "high",
		});

		expect(updateMock).not.toHaveBeenCalled();
		expect(createConversationEventMock).not.toHaveBeenCalled();
		expect(realtimeEmitMock).not.toHaveBeenCalled();
	});

	it("does not rewrite sentiment when the change is within the idempotency threshold", async () => {
		const [, , { updateSentiment }] = await modulePromise;
		const { db, updateMock } = createDbMock();
		loadCurrentConversationMock.mockResolvedValueOnce({
			id: "conv-1",
			visitorId: "visitor-1",
			sentiment: "neutral",
			sentimentConfidence: 0.5,
		});

		await updateSentiment({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				sentiment: "neutral",
				sentimentConfidence: 0.5,
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			sentiment: "neutral",
			confidence: 0.505,
		});

		expect(updateMock).not.toHaveBeenCalled();
		expect(createTimelineItemMock).not.toHaveBeenCalled();
		expect(realtimeEmitMock).not.toHaveBeenCalled();
	});

	it("does not let AI overwrite a manually owned priority", async () => {
		const [, { updatePriority }] = await modulePromise;
		const { db, updateMock } = createDbMock();
		loadCurrentConversationMock.mockResolvedValueOnce({
			id: "conv-1",
			visitorId: "visitor-1",
			priority: "normal",
			prioritySource: "user",
		});

		const result = await updatePriority({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				priority: "normal",
				prioritySource: "user",
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			newPriority: "urgent",
		});

		expect(result).toEqual({
			changed: false,
			reason: "manual_priority",
		});
		expect(updateMock).not.toHaveBeenCalled();
		expect(createConversationEventMock).not.toHaveBeenCalled();
		expect(realtimeEmitMock).not.toHaveBeenCalled();
	});

	it("does not let AI overwrite a manually owned sentiment", async () => {
		const [, , { updateSentiment }] = await modulePromise;
		const { db, updateMock } = createDbMock();
		loadCurrentConversationMock.mockResolvedValueOnce({
			id: "conv-1",
			visitorId: "visitor-1",
			sentiment: "neutral",
			sentimentConfidence: null,
			sentimentSource: "user",
		});

		const result = await updateSentiment({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				sentiment: "neutral",
				sentimentConfidence: null,
				sentimentSource: "user",
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			sentiment: "negative",
			confidence: 0.9,
		});

		expect(result).toEqual({
			changed: false,
			reason: "manual_sentiment",
		});
		expect(updateMock).not.toHaveBeenCalled();
		expect(createTimelineItemMock).not.toHaveBeenCalled();
		expect(realtimeEmitMock).not.toHaveBeenCalled();
	});

	it("does not rewrite the title on a second call when the caller snapshot is stale", async () => {
		const [{ updateTitle }] = await modulePromise;
		const { db, updateMock, returningMock } = createDbMock();

		loadCurrentConversationMock
			.mockResolvedValueOnce({
				id: "conv-1",
				visitorId: "visitor-1",
				title: null,
				titleSource: null,
			})
			.mockResolvedValueOnce({
				id: "conv-1",
				visitorId: "visitor-1",
				title: "Help with billing",
				titleSource: "ai",
			});
		returningMock.mockResolvedValueOnce([
			{
				id: "conv-1",
				visitorId: "visitor-1",
				titleSource: "ai",
			},
		]);

		await updateTitle({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				title: null,
				titleSource: null,
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			title: "Help with billing",
			translationContext,
		});
		const secondResult = await updateTitle({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				title: null,
				titleSource: null,
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			title: "Help with billing",
			translationContext,
		});

		expect(updateMock).toHaveBeenCalledTimes(1);
		expect(secondResult).toEqual({
			changed: false,
			reason: "unchanged",
		});
	});

	it("does not overwrite a title that became user-owned between read and write", async () => {
		const [{ updateTitle }] = await modulePromise;
		const { db, updateMock, returningMock } = createDbMock();

		loadCurrentConversationMock.mockResolvedValueOnce({
			id: "conv-1",
			visitorId: "visitor-1",
			title: "AI draft",
			titleSource: "ai",
		});
		returningMock.mockResolvedValueOnce([]);

		const result = await updateTitle({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				title: "AI draft",
				titleSource: "ai",
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			title: "User-owned title",
			translationContext,
		});

		expect(updateMock).toHaveBeenCalledTimes(1);
		expect(result).toEqual({
			changed: false,
			reason: "manual_title",
		});
		expect(syncConversationVisitorTitleMock).not.toHaveBeenCalled();
		expect(realtimeEmitMock).not.toHaveBeenCalled();
	});

	it("does not overwrite priority when it becomes user-owned between read and write", async () => {
		const [, { updatePriority }] = await modulePromise;
		const { db, updateMock, returningMock } = createDbMock();

		loadCurrentConversationMock.mockResolvedValueOnce({
			id: "conv-1",
			visitorId: "visitor-1",
			priority: "normal",
			prioritySource: null,
		});
		returningMock.mockResolvedValueOnce([]);

		const result = await updatePriority({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				priority: "normal",
				prioritySource: null,
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			newPriority: "urgent",
			emitTimelineEvent: false,
		});

		expect(updateMock).toHaveBeenCalledTimes(1);
		expect(result).toEqual({
			changed: false,
			reason: "manual_priority",
		});
		expect(realtimeEmitMock).not.toHaveBeenCalled();
	});

	it("does not overwrite sentiment when it becomes user-owned between read and write", async () => {
		const [, , { updateSentiment }] = await modulePromise;
		const { db, updateMock, returningMock } = createDbMock();

		loadCurrentConversationMock.mockResolvedValueOnce({
			id: "conv-1",
			visitorId: "visitor-1",
			sentiment: null,
			sentimentConfidence: null,
			sentimentSource: null,
		});
		returningMock.mockResolvedValueOnce([]);

		const result = await updateSentiment({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				sentiment: null,
				sentimentConfidence: null,
				sentimentSource: null,
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			sentiment: "negative",
			confidence: 0.9,
		});

		expect(updateMock).toHaveBeenCalledTimes(1);
		expect(result).toEqual({
			changed: false,
			reason: "manual_sentiment",
		});
		expect(realtimeEmitMock).not.toHaveBeenCalled();
	});

	it("syncs visitor-facing title data from precomputed translation context", async () => {
		const [{ updateTitle }] = await modulePromise;
		const { db, returningMock } = createDbMock();

		loadCurrentConversationMock.mockResolvedValueOnce({
			id: "conv-1",
			visitorId: "visitor-1",
			title: null,
			titleSource: null,
		});
		returningMock.mockResolvedValueOnce([
			{
				id: "conv-1",
				visitorId: "visitor-1",
				titleSource: "ai",
			},
		]);
		syncConversationVisitorTitleMock.mockResolvedValueOnce({
			visitorTitle: "Pregunta de facturacion",
			visitorTitleLanguage: "es",
		});

		const result = await updateTitle({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				title: null,
				titleSource: null,
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			title: "Billing question",
			translationContext,
		});

		expect(result).toEqual({ changed: true });
		expect(syncConversationVisitorTitleMock).toHaveBeenCalledWith({
			db,
			conversationId: "conv-1",
			organizationId: "org-1",
			websiteId: "site-1",
			title: "Billing question",
			websiteDefaultLanguage: "en",
			visitorLanguage: "es",
			autoTranslateEnabled: true,
			aiContext: { db, organizationId: "org-1", websiteId: "site-1" },
		});
		expect(realtimeEmitMock).toHaveBeenCalledWith("conversationUpdated", {
			websiteId: "site-1",
			organizationId: "org-1",
			visitorId: "visitor-1",
			userId: null,
			conversationId: "conv-1",
			updates: {
				title: "Billing question",
				titleSource: "ai",
				visitorTitle: "Pregunta de facturacion",
				visitorTitleLanguage: "es",
			},
			aiAgentId: "ai-1",
		});
	});

	it("does not rewrite the priority on a second call when the caller snapshot is stale", async () => {
		const [, { updatePriority }] = await modulePromise;
		const { db, updateMock, returningMock } = createDbMock();

		loadCurrentConversationMock
			.mockResolvedValueOnce({
				id: "conv-1",
				visitorId: "visitor-1",
				priority: "normal",
			})
			.mockResolvedValueOnce({
				id: "conv-1",
				visitorId: "visitor-1",
				priority: "high",
			});
		returningMock.mockResolvedValueOnce([
			{
				id: "conv-1",
				priority: "high",
			},
		]);

		await updatePriority({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				priority: "normal",
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			newPriority: "high",
			emitTimelineEvent: false,
		});
		const secondResult = await updatePriority({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				priority: "normal",
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			newPriority: "high",
			emitTimelineEvent: false,
		});

		expect(updateMock).toHaveBeenCalledTimes(1);
		expect(secondResult).toEqual({
			changed: false,
			reason: "unchanged",
		});
	});

	it("does not rewrite sentiment on a second call when the caller snapshot is stale", async () => {
		const [, , { updateSentiment }] = await modulePromise;
		const { db, updateMock, returningMock } = createDbMock();

		loadCurrentConversationMock
			.mockResolvedValueOnce({
				id: "conv-1",
				visitorId: "visitor-1",
				sentiment: null,
				sentimentConfidence: null,
			})
			.mockResolvedValueOnce({
				id: "conv-1",
				visitorId: "visitor-1",
				sentiment: "positive",
				sentimentConfidence: 0.9,
			});
		returningMock.mockResolvedValueOnce([
			{
				id: "conv-1",
				sentiment: "positive",
				sentimentConfidence: 0.9,
				sentimentSource: "ai",
			},
		]);

		await updateSentiment({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				sentiment: null,
				sentimentConfidence: null,
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			sentiment: "positive",
			confidence: 0.9,
		});
		const secondResult = await updateSentiment({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				sentiment: null,
				sentimentConfidence: null,
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			sentiment: "positive",
			confidence: 0.9,
		});

		expect(updateMock).toHaveBeenCalledTimes(1);
		expect(secondResult).toEqual({
			changed: false,
			reason: "unchanged",
		});
	});
});
