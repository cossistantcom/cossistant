import { beforeEach, describe, expect, it, mock } from "bun:test";
import { APIKeyType } from "@cossistant/types";

const safelyExtractRequestDataMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);
const safelyExtractRequestQueryMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);
const validateResponseMock = mock(<T>(value: T) => value);

const getVisitorMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const getConversationByIdWithLastMessageMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const getConversationTimelineItemsMock = mock((async () => ({
	items: [],
	nextCursor: null,
	hasNextPage: false,
})) as (...args: unknown[]) => Promise<unknown>);
const getConversationSeenDataMock = mock((async () => []) as (
	...args: unknown[]
) => Promise<unknown>);
const listConversationsHeadersMock = mock((async () => ({
	items: [],
	nextCursor: null,
})) as (...args: unknown[]) => Promise<unknown>);

mock.module("@api/utils/validate", () => ({
	safelyExtractRequestData: safelyExtractRequestDataMock,
	safelyExtractRequestQuery: safelyExtractRequestQueryMock,
	validateResponse: validateResponseMock,
}));

mock.module("@api/db/queries", () => ({
	getVisitor: getVisitorMock,
	upsertVisitor: mock(async () => null),
}));

mock.module("@api/db/queries/conversation", () => ({
	getConversationByIdWithLastMessage: getConversationByIdWithLastMessageMock,
	getConversationHeader: mock(async () => null),
	getConversationSeenData: getConversationSeenDataMock,
	getConversationTimelineItems: getConversationTimelineItemsMock,
	listConversations: mock(async () => ({
		conversations: [],
		pagination: {
			page: 1,
			limit: 10,
			total: 0,
			totalPages: 0,
			hasMore: false,
		},
	})),
	listConversationsHeaders: listConversationsHeadersMock,
	upsertConversation: mock(async () => ({
		status: "existing",
		conversation: {
			id: "conv-1",
			organizationId: "org-1",
			websiteId: "site-1",
			visitorId: "visitor-1",
			status: "open",
			createdAt: "2026-04-07T10:00:00.000Z",
			updatedAt: "2026-04-07T10:00:00.000Z",
			deletedAt: null,
		},
	})),
}));

mock.module("@api/db/mutations/conversation", () => ({
	markConversationAsSeenByVisitor: mock(async () => ({
		conversationId: "conv-1",
		lastSeenAt: "2026-04-07T12:00:00.000Z",
	})),
}));

mock.module("@api/utils/participant-helpers", () => ({
	addConversationParticipants: mock(async () => []),
	getDefaultParticipants: mock(async () => []),
}));

mock.module("@api/utils/timeline-item", () => ({
	createMessageTimelineItem: mock(async () => ({
		item: {
			id: "msg-1",
			type: "message",
			conversationId: "conv-1",
			organizationId: "org-1",
			visibility: "public",
			text: "hello",
			parts: [],
			userId: null,
			aiAgentId: null,
			visitorId: "visitor-1",
			createdAt: "2026-04-07T10:00:00.000Z",
			deletedAt: null,
			tool: null,
		},
		actor: { type: "visitor", visitorId: "visitor-1" },
	})),
	createTimelineItem: mock(async () => null),
	resolveMessageTimelineActor: mock(() => null),
}));

mock.module("@api/utils/send-message-with-notification", () => ({
	triggerMessageNotificationWorkflow: mock(async () => {}),
}));

mock.module("@api/utils/conversation-realtime", () => ({
	emitConversationCreatedEvent: mock(async () => {}),
	emitConversationSeenEvent: mock(async () => {}),
	emitConversationTypingEvent: mock(async () => {}),
}));

mock.module("@api/lib/plans/access", () => ({
	getPlanForWebsite: mock(async () => ({})),
}));

mock.module("@api/lib/hard-limits/dashboard", () => ({
	applyDashboardConversationHardLimit: mock(
		({ conversation }: { conversation: unknown }) => conversation
	),
	getDashboardConversationLockCutoff: mock(async () => null),
	resolveDashboardHardLimitPolicy: mock(() => ({})),
}));

mock.module("@api/services/presence", () => ({
	markVisitorPresence: mock(async () => {}),
}));

mock.module("@api/utils/geo-helpers", () => ({
	extractGeoFromVisitor: mock(() => ({})),
}));

mock.module("./feedback-shared", () => ({
	persistFeedbackSubmission: mock(async () => ({
		ratedAt: "2026-04-07T12:00:00.000Z",
	})),
}));

mock.module("../middleware", () => ({
	protectedPublicApiKeyMiddleware: [],
}));

const conversationRouterModulePromise = import("./conversation");

const visitorId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const otherVisitorId = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
const conversationId = "conv-1";

function createConversationRecord(
	overrides: Partial<Record<string, unknown>> = {}
) {
	return {
		id: conversationId,
		title: null,
		createdAt: "2026-04-07T10:00:00.000Z",
		updatedAt: "2026-04-07T10:00:00.000Z",
		visitorId,
		websiteId: "site-1",
		status: "open",
		visitorRating: null,
		visitorRatingAt: null,
		deletedAt: null,
		organizationId: "org-1",
		...overrides,
	};
}

function createInboxItem(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: conversationId,
		status: "open",
		priority: "normal",
		organizationId: "org-1",
		visitorId,
		visitor: {
			id: visitorId,
			lastSeenAt: null,
			blockedAt: null,
			blockedByUserId: null,
			isBlocked: false,
			contact: null,
		},
		websiteId: "site-1",
		channel: "widget",
		title: null,
		titleSource: null,
		sentiment: null,
		sentimentConfidence: null,
		resolutionTime: null,
		visitorRating: null,
		visitorRatingAt: null,
		startedAt: null,
		firstResponseAt: null,
		resolvedAt: null,
		resolvedByUserId: null,
		resolvedByAiAgentId: null,
		escalatedAt: null,
		escalatedByAiAgentId: null,
		escalationReason: null,
		escalationHandledAt: null,
		escalationHandledByUserId: null,
		aiPausedUntil: null,
		createdAt: "2026-04-07T10:00:00.000Z",
		updatedAt: "2026-04-07T11:00:00.000Z",
		deletedAt: null,
		lastMessageAt: "2026-04-07T11:00:00.000Z",
		lastSeenAt: null,
		lastMessageTimelineItem: null,
		lastTimelineItem: null,
		activeClarification: null,
		viewIds: [],
		seenData: [],
		...overrides,
	};
}

describe("conversation auth and inbox routes", () => {
	beforeEach(() => {
		safelyExtractRequestDataMock.mockReset();
		safelyExtractRequestQueryMock.mockReset();
		validateResponseMock.mockReset();
		getVisitorMock.mockReset();
		getConversationByIdWithLastMessageMock.mockReset();
		getConversationTimelineItemsMock.mockReset();
		getConversationSeenDataMock.mockReset();
		listConversationsHeadersMock.mockReset();

		validateResponseMock.mockImplementation((value) => value);
		getVisitorMock.mockResolvedValue({
			id: visitorId,
			websiteId: "site-1",
		});
		getConversationByIdWithLastMessageMock.mockResolvedValue(
			createConversationRecord()
		);
		getConversationTimelineItemsMock.mockResolvedValue({
			items: [],
			nextCursor: null,
			hasNextPage: false,
		});
		getConversationSeenDataMock.mockResolvedValue([]);
		listConversationsHeadersMock.mockResolvedValue({
			items: [createInboxItem()],
			nextCursor: "cursor_2",
		});
	});

	it("lists inbox conversations for private API keys", async () => {
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PRIVATE },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			query: {
				limit: 20,
				cursor: null,
			},
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/inbox?limit=20", {
				method: "GET",
			})
		);

		const payload = (await response.json()) as {
			items: Array<{ id: string }>;
			nextCursor: string | null;
		};

		expect(response.status).toBe(200);
		expect(payload.nextCursor).toBe("cursor_2");
		expect(payload.items[0]?.id).toBe(conversationId);
		expect(listConversationsHeadersMock).toHaveBeenCalledWith(
			{},
			{
				organizationId: "org-1",
				websiteId: "site-1",
				userId: null,
				limit: 20,
				cursor: null,
			}
		);
	});

	it("allows private API keys to read a conversation without a visitor header", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PRIVATE },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			visitorIdHeader: null,
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/conv-1", {
				method: "GET",
			})
		);

		expect(response.status).toBe(200);
	});

	it("returns 404 when a public API key reads another visitor's conversation", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PUBLIC },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			visitorIdHeader: visitorId,
		});
		getConversationByIdWithLastMessageMock.mockResolvedValue(
			createConversationRecord({ visitorId: otherVisitorId })
		);

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/conv-1", {
				method: "GET",
			})
		);

		expect(response.status).toBe(404);
	});

	it("returns 404 for timeline reads when a public API key does not own the conversation", async () => {
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PUBLIC },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			visitorIdHeader: visitorId,
			query: {
				limit: 50,
				cursor: null,
			},
		});
		getConversationByIdWithLastMessageMock.mockResolvedValue(
			createConversationRecord({ visitorId: otherVisitorId })
		);

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/conv-1/timeline", {
				method: "GET",
			})
		);

		expect(response.status).toBe(404);
		expect(getConversationTimelineItemsMock).toHaveBeenCalledTimes(0);
	});
});
