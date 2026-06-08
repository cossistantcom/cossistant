import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Database } from "@api/db";

const getConversationByIdMock = mock(
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
const getConversationMessageTimelineItemForTranslationMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const listConversationMessageTimelineItemsForTranslationMock = mock(
	(async () => []) as (...args: unknown[]) => Promise<unknown>
);
const getWebsiteBySlugWithAccessMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const getPlanForWebsiteMock = mock((async () => ({
	features: {
		"auto-translate": true,
	},
})) as (...args: unknown[]) => Promise<unknown>);
const prepareInboundVisitorTranslationMock = mock((async () => ({
	visitorLanguage: "es",
	translationPart: null,
	translationResult: {
		status: "skipped" as const,
		reason: "missing_language" as const,
		sourceLanguage: "es",
		targetLanguage: "en",
	},
})) as (...args: unknown[]) => Promise<unknown>);
const prepareOutboundVisitorTranslationMock = mock((async () => ({
	sourceLanguage: "en",
	translationPart: null,
	translationResult: {
		status: "skipped" as const,
		reason: "missing_language" as const,
		sourceLanguage: "en",
		targetLanguage: "es",
	},
})) as (...args: unknown[]) => Promise<unknown>);
const finalizeConversationTranslationMock = mock((async () => ({
	status: "activated" as const,
	visitorLanguage: "es",
	translationActivatedAt: "2026-04-13T09:00:01.000Z",
	translationChargedAt: "2026-04-13T09:00:01.000Z",
	visitorTitle: null,
	visitorTitleLanguage: "es",
})) as (...args: unknown[]) => Promise<unknown>);
const updateTimelineItemMock = mock(
	async (params: {
		itemId: string;
		item: {
			text?: string | null;
			parts?: unknown[];
		};
	}) => ({
		id: params.itemId,
		conversationId: "conv-1",
		organizationId: "org-1",
		visibility: "public",
		type: "message",
		text: params.item.text ?? null,
		parts: params.item.parts ?? [],
		userId: null,
		visitorId: params.itemId === "msg-visitor" ? "visitor-1" : null,
		aiAgentId: params.itemId === "msg-ai" ? "ai-1" : null,
		createdAt: "2026-04-13T09:00:00.000Z",
		deletedAt: null,
		tool: null,
	})
);

mock.module("@api/ai-pipeline/shared/safety/kill-switch", () => ({
	isAiPausedForConversation: mock(async () => false),
	pauseAiForConversation: mock(async () => null),
	recordOutboundPublicAiMessageAndMaybePause: mock(async () => ({
		paused: false,
		messageCount: 1,
	})),
	resumeAiForConversation: mock(async () => null),
}));

mock.module("@api/db/mutations/conversation", () => ({
	archiveConversation: mock(async () => null),
	joinEscalation: mock(async () => null),
	markConversationAsNotSpam: mock(async () => null),
	markConversationAsRead: mock(async () => ({
		conversation: null,
		lastSeenAt: null,
	})),
	markConversationAsSpam: mock(async () => null),
	markConversationAsUnread: mock(async () => null),
	reopenConversation: mock(async () => null),
	resolveConversation: mock(async () => null),
	unarchiveConversation: mock(async () => null),
	updateConversationPriority: mock(async () => null),
	updateConversationSentiment: mock(async () => null),
	updateConversationTitle: mock(async () => null),
}));

mock.module("@api/db/queries/conversation", () => ({
	getConversationById: getConversationByIdMock,
	getConversationMessageTimelineItemForTranslation:
		getConversationMessageTimelineItemForTranslationMock,
	getConversationSentimentSatisfactionAggregate: mock(async () => ({
		average: null,
		count: 0,
	})),
	getConversationTimelineItems: getConversationTimelineItemsMock,
	listConversationMessageTimelineItemsForTranslation:
		listConversationMessageTimelineItemsForTranslationMock,
	listConversationsHeaders: listConversationsHeadersMock,
}));

mock.module("@api/db/queries/visitor", () => ({
	getCompleteVisitorWithContact: mock(async () => null),
}));

mock.module("@api/db/queries/website", () => ({
	createWebsite: mock(async () => null),
	findVerifiedWebsiteByDomain: mock(async () => null),
	getActiveWebsiteBySlug: mock(async () => null),
	getWebsiteApiKeyScope: mock(async () => null),
	getWebsiteById: mock(async () => null),
	getWebsiteByIdWithAccess: mock(async () => null),
	getWebsiteBySlugWithAccess: getWebsiteBySlugWithAccessMock,
	listWebsiteListItemsForOrganization: mock(async () => []),
	permanentlyDeleteWebsite: mock(async () => null),
	updateWebsite: mock(async () => null),
	WebsiteSlugConflictError: class WebsiteSlugConflictError extends Error {},
}));

mock.module("@api/lib/hard-limits/dashboard", () => ({
	applyDashboardConversationHardLimit: mock(
		({ conversation }: { conversation: unknown }) => conversation
	),
	getDashboardConversationLockCutoff: mock(async () => null),
	isDashboardConversationLocked: mock(() => false),
	isDashboardMessageLimitReached: mock(async () => false),
	resolveDashboardHardLimitPolicy: mock(() => ({
		enforced: false,
		messageLimit: null,
	})),
}));

mock.module("@api/lib/plans/access", () => ({
	getPlanForWebsite: getPlanForWebsiteMock,
}));

mock.module("@api/lib/translation", () => ({
	finalizeConversationTranslation: finalizeConversationTranslationMock,
	isAutomaticTranslationEnabled: mock(() => true),
	prepareInboundVisitorTranslation: prepareInboundVisitorTranslationMock,
	prepareOutboundVisitorTranslation: prepareOutboundVisitorTranslationMock,
	syncConversationVisitorTitle: mock(async () => ({
		visitorTitle: null,
		visitorTitleLanguage: null,
	})),
}));

mock.module("@api/realtime/emitter", () => ({
	realtime: {
		emit: mock(async () => {}),
	},
}));

mock.module("@api/utils/conversation-event", () => ({
	createConversationEvent: mock(async () => null),
}));

mock.module("@api/utils/conversation-events", () => ({
	createParticipantJoinedEvent: mock(async () => null),
}));

mock.module("@api/utils/conversation-export", () => ({
	buildConversationExport: mock(async () => null),
}));

mock.module("@api/utils/send-message-with-notification", () => ({
	triggerMessageNotificationWorkflow: mock(async () => null),
}));

mock.module("@api/utils/timeline-item", () => ({
	createMessageTimelineItem: mock(async () => null),
	updateTimelineItem: updateTimelineItemMock,
}));

const modulePromise = Promise.all([
	import("../init"),
	import("./conversation"),
]);

const baseWebsite = {
	id: "site-1",
	organizationId: "org-1",
	slug: "acme",
	defaultLanguage: "en",
	autoTranslateEnabled: true,
};

const baseConversation = {
	id: "conv-1",
	organizationId: "org-1",
	websiteId: "site-1",
	visitorId: "visitor-1",
	channel: "widget",
	metadata: null,
	status: "open",
	title: "Need help",
	visitorTitle: null,
	visitorTitleLanguage: null,
	visitorLanguage: "es",
	translationActivatedAt: null,
	translationChargedAt: null,
	createdAt: "2026-04-13T09:00:00.000Z",
	updatedAt: "2026-04-13T09:00:00.000Z",
	deletedAt: null,
	visitorRating: null,
	visitorRatingAt: null,
};

function createDb(): Database {
	return {} as Database;
}

async function createCaller(db: Database) {
	const [{ createCallerFactory }, { conversationRouter }] = await modulePromise;
	const createCallerFactoryForRouter = createCallerFactory(conversationRouter);

	return createCallerFactoryForRouter({
		db,
		user: {
			id: "user-1",
			name: "Anthony",
			email: "anthony@example.com",
		} as never,
		session: { id: "session-1" } as never,
		geo: {} as never,
		headers: new Headers(),
	});
}

describe("conversation router translateMessageGroup", () => {
	beforeEach(() => {
		getConversationByIdMock.mockReset();
		getConversationMessageTimelineItemForTranslationMock.mockReset();
		getConversationTimelineItemsMock.mockReset();
		listConversationMessageTimelineItemsForTranslationMock.mockReset();
		listConversationsHeadersMock.mockReset();
		getWebsiteBySlugWithAccessMock.mockReset();
		getPlanForWebsiteMock.mockReset();
		prepareInboundVisitorTranslationMock.mockReset();
		prepareOutboundVisitorTranslationMock.mockReset();
		finalizeConversationTranslationMock.mockReset();
		updateTimelineItemMock.mockReset();

		getConversationByIdMock.mockResolvedValue(baseConversation);
		getConversationMessageTimelineItemForTranslationMock.mockResolvedValue(
			null
		);
		getConversationTimelineItemsMock.mockResolvedValue({
			items: [],
			nextCursor: null,
			hasNextPage: false,
		});
		listConversationMessageTimelineItemsForTranslationMock.mockResolvedValue(
			[]
		);
		listConversationsHeadersMock.mockResolvedValue({
			items: [],
			nextCursor: null,
		});
		getWebsiteBySlugWithAccessMock.mockResolvedValue(baseWebsite);
		getPlanForWebsiteMock.mockResolvedValue({
			features: {
				"auto-translate": true,
			},
		});
		prepareInboundVisitorTranslationMock.mockResolvedValue({
			visitorLanguage: "es",
			translationPart: null,
			translationResult: {
				status: "skipped" as const,
				reason: "missing_language" as const,
				sourceLanguage: "es",
				targetLanguage: "en",
			},
		});
		prepareOutboundVisitorTranslationMock.mockResolvedValue({
			sourceLanguage: "en",
			translationPart: null,
			translationResult: {
				status: "skipped" as const,
				reason: "missing_language" as const,
				sourceLanguage: "en",
				targetLanguage: "es",
			},
		});
		finalizeConversationTranslationMock.mockResolvedValue({
			status: "activated" as const,
			visitorLanguage: "es",
			translationActivatedAt: "2026-04-13T09:00:01.000Z",
			translationChargedAt: "2026-04-13T09:00:01.000Z",
			visitorTitle: null,
			visitorTitleLanguage: "es",
		});
		updateTimelineItemMock.mockImplementation(
			async (params: {
				itemId: string;
				item: {
					text?: string | null;
					parts?: unknown[];
				};
			}) => ({
				id: params.itemId,
				conversationId: "conv-1",
				organizationId: "org-1",
				visibility: "public",
				type: "message",
				text: params.item.text ?? null,
				parts: params.item.parts ?? [],
				userId: params.itemId === "msg-ai" ? null : null,
				visitorId: params.itemId.startsWith("msg-visitor") ? "visitor-1" : null,
				aiAgentId: params.itemId === "msg-ai" ? "ai-1" : null,
				createdAt: "2026-04-13T09:00:00.000Z",
				deletedAt: null,
				tool: null,
			})
		);
	});

	it("translates multiple rows and replaces only the matching audience part", async () => {
		const rows = [
			{
				id: "msg-visitor",
				text: "Hola equipo",
				parts: [
					{
						type: "translation",
						text: "old team copy",
						sourceLanguage: "es",
						targetLanguage: "en",
						audience: "team",
						mode: "manual",
						modelId: "old-model",
					},
					{ type: "metadata", source: "email" },
				],
				userId: null,
				visitorId: "visitor-1",
				aiAgentId: null,
			},
			{
				id: "msg-ai",
				text: "Welcome",
				parts: [
					{
						type: "translation",
						text: "old visitor copy",
						sourceLanguage: "en",
						targetLanguage: "es",
						audience: "visitor",
						mode: "manual",
						modelId: "old-model",
					},
					{
						type: "translation",
						text: "team-visible copy",
						sourceLanguage: "fr",
						targetLanguage: "en",
						audience: "team",
						mode: "manual",
						modelId: "old-model",
					},
				],
				userId: null,
				visitorId: null,
				aiAgentId: "ai-1",
			},
		];
		listConversationMessageTimelineItemsForTranslationMock.mockResolvedValue(
			rows
		);
		prepareInboundVisitorTranslationMock.mockResolvedValue({
			visitorLanguage: "es",
			translationPart: {
				type: "translation",
				text: "new team copy",
				sourceLanguage: "es",
				targetLanguage: "en",
				audience: "team",
				mode: "manual",
				modelId: "test-model",
			},
			translationResult: {
				status: "translated",
				text: "new team copy",
				sourceLanguage: "es",
				targetLanguage: "en",
				modelId: "test-model",
			},
		});
		prepareOutboundVisitorTranslationMock.mockResolvedValue({
			sourceLanguage: "en",
			translationPart: {
				type: "translation",
				text: "nuevo visitante",
				sourceLanguage: "en",
				targetLanguage: "es",
				audience: "visitor",
				mode: "manual",
				modelId: "test-model",
			},
			translationResult: {
				status: "translated",
				text: "nuevo visitante",
				sourceLanguage: "en",
				targetLanguage: "es",
				modelId: "test-model",
			},
		});

		const caller = await createCaller(createDb());
		const result = await caller.translateMessageGroup({
			conversationId: "conv-1",
			websiteSlug: "acme",
			timelineItemIds: ["msg-visitor", "msg-ai"],
		});

		expect(result.translatedCount).toBe(2);
		expect(result.skippedCount).toBe(0);
		expect(updateTimelineItemMock).toHaveBeenCalledTimes(2);
		expect(updateTimelineItemMock.mock.calls[0]?.[0]).toMatchObject({
			itemId: "msg-visitor",
			item: {
				parts: [
					{ type: "metadata", source: "email" },
					expect.objectContaining({
						text: "new team copy",
						audience: "team",
					}),
				],
			},
		});
		expect(updateTimelineItemMock.mock.calls[1]?.[0]).toMatchObject({
			itemId: "msg-ai",
			item: {
				parts: [
					expect.objectContaining({
						text: "team-visible copy",
						audience: "team",
					}),
					expect.objectContaining({
						text: "nuevo visitante",
						audience: "visitor",
					}),
				],
			},
		});
		expect(finalizeConversationTranslationMock).toHaveBeenCalledTimes(1);
	});

	it("returns partial success when some selected rows cannot be translated", async () => {
		const rows = [
			{
				id: "msg-visitor-skip",
				text: "ok",
				parts: [],
				userId: null,
				visitorId: "visitor-1",
				aiAgentId: null,
			},
			{
				id: "msg-visitor-translate",
				text: "Hola equipo",
				parts: [],
				userId: null,
				visitorId: "visitor-1",
				aiAgentId: null,
			},
		];
		listConversationMessageTimelineItemsForTranslationMock.mockResolvedValue(
			rows
		);
		prepareInboundVisitorTranslationMock
			.mockResolvedValueOnce({
				visitorLanguage: "es",
				translationPart: null,
				translationResult: {
					status: "skipped" as const,
					reason: "too_short" as const,
					sourceLanguage: "es",
					targetLanguage: "en",
				},
			})
			.mockResolvedValueOnce({
				visitorLanguage: "es",
				translationPart: {
					type: "translation",
					text: "Hello team",
					sourceLanguage: "es",
					targetLanguage: "en",
					audience: "team",
					mode: "manual",
					modelId: "test-model",
				},
				translationResult: {
					status: "translated",
					text: "Hello team",
					sourceLanguage: "es",
					targetLanguage: "en",
					modelId: "test-model",
				},
			});

		const caller = await createCaller(createDb());
		const result = await caller.translateMessageGroup({
			conversationId: "conv-1",
			websiteSlug: "acme",
			timelineItemIds: [
				"msg-visitor-skip",
				"msg-visitor-translate",
				"missing-id",
			],
		});

		expect(result.translatedCount).toBe(1);
		expect(result.skippedCount).toBe(2);
		expect(result.skippedIds).toEqual(["msg-visitor-skip", "missing-id"]);
		expect(updateTimelineItemMock).toHaveBeenCalledTimes(1);
		expect(finalizeConversationTranslationMock).toHaveBeenCalledTimes(1);
	});
});
