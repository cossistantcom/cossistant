import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { AuthValidationError } from "@api/lib/auth-validation";
import { APIKeyType } from "@cossistant/types";

mock.restore();

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
const getActiveVisitorForWebsiteMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const getConversationByIdWithLastMessageMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const getConversationByIdMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const canVisitorAccessConversationMock = mock(
	(async () => false) as (...args: unknown[]) => Promise<boolean>
);
const listConversationsMock = mock((async () => ({
	conversations: [],
	pagination: {
		page: 1,
		limit: 10,
		total: 0,
		totalPages: 0,
		hasMore: false,
	},
})) as (...args: unknown[]) => Promise<unknown>);
const getConversationTimelineItemsMock = mock((async () => ({
	items: [],
	nextCursor: null,
	hasNextPage: false,
})) as (...args: unknown[]) => Promise<unknown>);
const getConversationHeaderMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const listFeedbackMock = mock((async () => ({
	items: [],
	pagination: {
		page: 1,
		limit: 20,
		total: 0,
		totalPages: 0,
		hasMore: false,
	},
})) as (...args: unknown[]) => Promise<unknown>);
const buildConversationExportMock = mock((async () => ({
	filename: "conversation-conv-1.txt",
	content: "Conversation Export\nConversation ID: conv-1",
	mimeType: "text/plain; charset=utf-8",
})) as (...args: unknown[]) => Promise<unknown>);
const getConversationSeenDataMock = mock((async () => []) as (
	...args: unknown[]
) => Promise<unknown>);
const listConversationsHeadersMock = mock((async () => ({
	items: [],
	nextCursor: null,
})) as (...args: unknown[]) => Promise<unknown>);
const mergeConversationMetadataMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const updateConversationPriorityMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const updateConversationSentimentMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const resolvePrivateApiKeyActorUserMock = mock((async () => ({
	userId: "user-1",
	member: {
		id: "user-1",
		name: "Alice",
		email: "alice@example.com",
		image: null,
		role: "member",
		createdAt: "2026-04-01T00:00:00.000Z",
		updatedAt: "2026-04-01T00:00:00.000Z",
		lastSeenAt: null,
	},
	source: "linked_key",
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

mock.module("@api/db/queries/conversation-access", () => ({
	canVisitorAccessConversation: canVisitorAccessConversationMock,
	getActiveVisitorForWebsite: getActiveVisitorForWebsiteMock,
	getConversationDeliveryVisitorIds: mock(async () => []),
	getConversationVisibleVisitorIds: mock(async () => []),
	resolveVisitorConversationScope: mock(async () => null),
}));

mock.module("@api/db/queries/conversation", () => ({
	getConversationById: getConversationByIdMock,
	getConversationByIdWithLastMessage: getConversationByIdWithLastMessageMock,
	getConversationHeader: getConversationHeaderMock,
	getConversationSeenData: getConversationSeenDataMock,
	getConversationTimelineItemByIdForOrganization: mock(async () => null),
	getConversationTimelineItems: getConversationTimelineItemsMock,
	listConversations: listConversationsMock,
	listConversationsHeaders: listConversationsHeadersMock,
	upsertConversation: mock(async () => ({
		status: "existing",
		conversation: {
			id: "conv-1",
			organizationId: "org-1",
			websiteId: "site-1",
			visitorId: "visitor-1",
			channel: "widget",
			metadata: null,
			status: "open",
			createdAt: "2026-04-07T10:00:00.000Z",
			updatedAt: "2026-04-07T10:00:00.000Z",
			deletedAt: null,
		},
	})),
}));

mock.module("@api/db/queries/feedback", () => ({
	listFeedback: listFeedbackMock,
}));

mock.module("@api/db/mutations/conversation", () => ({
	archiveConversation: mock(async () => null),
	joinEscalation: mock(async () => null),
	markConversationAsNotSpam: mock(async () => null),
	markConversationAsRead: mock(async () => ({
		conversation: null,
		lastSeenAt: null,
	})),
	markConversationAsSeen: mock(async () => new Date().toISOString()),
	mergeConversationMetadata: mergeConversationMetadataMock,
	markConversationAsSeenByVisitor: mock(async () => ({
		conversationId: "conv-1",
		lastSeenAt: "2026-04-07T12:00:00.000Z",
	})),
	markConversationAsSpam: mock(async () => null),
	markConversationAsUnread: mock(async () => null),
	reopenConversation: mock(async () => null),
	resolveConversation: mock(async () => null),
	unarchiveConversation: mock(async () => null),
	updateConversationPriority: updateConversationPriorityMock,
	updateConversationSentiment: updateConversationSentimentMock,
	updateConversationTitle: mock(async () => null),
}));

mock.module("@api/utils/participant-helpers", () => ({
	addConversationParticipant: mock(async () => null),
	addConversationParticipants: mock(async () => []),
	getDefaultParticipants: mock(async () => []),
	isUserParticipant: mock(() => false),
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
	emitConversationTranslationUpdate: mock(async () => {}),
}));

mock.module("@api/ai-pipeline/shared/safety/kill-switch", () => ({
	pauseAiForConversation: mock(async () => null),
	resumeAiForConversation: mock(async () => null),
}));

mock.module("@api/realtime/emitter", () => ({
	realtime: {
		emit: mock(async () => {}),
	},
}));

mock.module("@api/utils/conversation-export", () => ({
	buildConversationExport: buildConversationExportMock,
}));

mock.module("@api/lib/plans/access", () => ({
	getPlanForWebsite: mock(async () => ({})),
}));

mock.module("@api/lib/private-api-key-actor", () => ({
	resolvePrivateApiKeyActorUser: resolvePrivateApiKeyActorUserMock,
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
	markUserPresence: mock(async () => {}),
}));

mock.module("@api/utils/geo-helpers", () => ({
	extractGeoFromVisitor: mock(() => ({})),
}));

mock.module("./feedback-shared", () => ({
	formatFeedbackResponse: (entry: Record<string, unknown>) => ({
		id: entry.id,
		organizationId: entry.organizationId,
		websiteId: entry.websiteId,
		conversationId: entry.conversationId,
		visitorId: entry.visitorId,
		contactId: entry.contactId,
		rating: entry.rating,
		topic: entry.topic,
		comment: entry.comment,
		trigger: entry.trigger,
		source: entry.source,
		createdAt: entry.createdAt,
		updatedAt: entry.updatedAt,
	}),
	persistFeedbackSubmission: mock(async () => ({
		ratedAt: "2026-04-07T12:00:00.000Z",
	})),
}));

mock.module("../middleware", () => ({
	protectedPublicApiKeyMiddleware: [],
	protectedPrivateApiKeyMiddleware: [],
}));

const conversationRouterModulePromise = import("./conversation");

const visitorId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const otherVisitorId = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
const contactId = "01ARZ3NDEKTSV4RRFFQ69G5FAX";
const conversationId = "conv-1";

function createConversationRecord(
	overrides: Partial<Record<string, unknown>> = {}
) {
	return {
		id: conversationId,
		title: null,
		metadata: null,
		createdAt: "2026-04-07T10:00:00.000Z",
		updatedAt: "2026-04-07T10:00:00.000Z",
		visitorId,
		websiteId: "site-1",
		channel: "widget",
		status: "open",
		visitorRating: null,
		visitorRatingAt: null,
		priority: "normal",
		prioritySource: null,
		sentiment: null,
		sentimentConfidence: null,
		sentimentSource: null,
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
		prioritySource: null,
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
		metadata: null,
		channel: "widget",
		title: null,
		titleSource: null,
		sentiment: null,
		sentimentConfidence: null,
		sentimentSource: null,
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
		getActiveVisitorForWebsiteMock.mockReset();
		getConversationByIdWithLastMessageMock.mockReset();
		getConversationByIdMock.mockReset();
		canVisitorAccessConversationMock.mockReset();
		listConversationsMock.mockReset();
		getConversationTimelineItemsMock.mockReset();
		getConversationHeaderMock.mockReset();
		listFeedbackMock.mockReset();
		buildConversationExportMock.mockReset();
		getConversationSeenDataMock.mockReset();
		listConversationsHeadersMock.mockReset();
		mergeConversationMetadataMock.mockReset();
		updateConversationPriorityMock.mockReset();
		updateConversationSentimentMock.mockReset();
		resolvePrivateApiKeyActorUserMock.mockReset();

		validateResponseMock.mockImplementation((value) => value);
		getVisitorMock.mockResolvedValue({
			id: visitorId,
			websiteId: "site-1",
		});
		getActiveVisitorForWebsiteMock.mockResolvedValue({
			id: visitorId,
			websiteId: "site-1",
			organizationId: "org-1",
			contactId: null,
			language: null,
			deletedAt: null,
		});
		canVisitorAccessConversationMock.mockImplementation(async (_db, params) => {
			const accessParams = params as {
				viewerVisitorId: string;
				conversationVisitorId: string | null;
			};
			return (
				accessParams.viewerVisitorId === accessParams.conversationVisitorId
			);
		});
		getConversationByIdWithLastMessageMock.mockResolvedValue(
			createConversationRecord()
		);
		getConversationByIdMock.mockResolvedValue(createConversationRecord());
		listConversationsMock.mockResolvedValue({
			conversations: [createConversationRecord()],
			pagination: {
				page: 1,
				limit: 10,
				total: 1,
				totalPages: 1,
				hasMore: false,
			},
		});
		getConversationTimelineItemsMock.mockResolvedValue({
			items: [],
			nextCursor: null,
			hasNextPage: false,
		});
		getConversationHeaderMock.mockResolvedValue(createInboxItem());
		listFeedbackMock.mockResolvedValue({
			items: [],
			pagination: {
				page: 1,
				limit: 20,
				total: 0,
				totalPages: 0,
				hasMore: false,
			},
		});
		buildConversationExportMock.mockResolvedValue({
			filename: "conversation-conv-1.txt",
			content: "Conversation Export\nConversation ID: conv-1",
			mimeType: "text/plain; charset=utf-8",
		});
		getConversationSeenDataMock.mockResolvedValue([]);
		listConversationsHeadersMock.mockResolvedValue({
			items: [createInboxItem()],
			nextCursor: "cursor_2",
		});
		mergeConversationMetadataMock.mockResolvedValue(createConversationRecord());
		updateConversationPriorityMock.mockResolvedValue(
			createConversationRecord({
				priority: "high",
				prioritySource: "user",
			})
		);
		updateConversationSentimentMock.mockResolvedValue(
			createConversationRecord({
				sentiment: "negative",
				sentimentConfidence: null,
				sentimentSource: "user",
			})
		);
		resolvePrivateApiKeyActorUserMock.mockResolvedValue({
			userId: "user-1",
			member: {
				id: "user-1",
				name: "Alice",
				email: "alice@example.com",
				image: null,
				role: "member",
				createdAt: "2026-04-01T00:00:00.000Z",
				updatedAt: "2026-04-01T00:00:00.000Z",
				lastSeenAt: null,
			},
			source: "linked_key",
		});
	});

	it("forwards the resolved actor user ID to private inbox queries", async () => {
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PRIVATE, linkedUserId: "user-1" },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1", teamId: "team-1" },
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
		expect(resolvePrivateApiKeyActorUserMock).toHaveBeenCalledWith(
			expect.objectContaining({
				apiKey: expect.objectContaining({
					keyType: APIKeyType.PRIVATE,
					linkedUserId: "user-1",
				}),
				organizationId: "org-1",
				websiteTeamId: "team-1",
				explicitActorUserId: null,
				required: false,
			})
		);
		expect(listConversationsHeadersMock).toHaveBeenCalledWith(
			{},
			expect.objectContaining({
				organizationId: "org-1",
				websiteId: "site-1",
				userId: "user-1",
				limit: 20,
				cursor: null,
			})
		);
	});

	it("keeps private inbox queries best-effort for unlinked keys without an actor header", async () => {
		resolvePrivateApiKeyActorUserMock.mockResolvedValueOnce(null);
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PRIVATE, linkedUserId: null },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1", teamId: "team-1" },
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

		expect(response.status).toBe(200);
		expect(resolvePrivateApiKeyActorUserMock).toHaveBeenCalledWith(
			expect.objectContaining({
				apiKey: expect.objectContaining({
					keyType: APIKeyType.PRIVATE,
					linkedUserId: null,
				}),
				required: false,
			})
		);
		expect(listConversationsHeadersMock).toHaveBeenCalledWith(
			{},
			expect.objectContaining({
				organizationId: "org-1",
				websiteId: "site-1",
				userId: null,
				limit: 20,
				cursor: null,
			})
		);
	});

	it("forwards private inbox filters for agent queries", async () => {
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PRIVATE, linkedUserId: "user-1" },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1", teamId: "team-1" },
			query: {
				limit: 25,
				cursor: "cursor_1",
				status: "open",
				priority: "urgent",
				sentiment: "negative",
				visitorId,
				contactId: "contact-1",
				assignedToUserId: "user-2",
				viewId: "view-1",
				createdAtFrom: "2026-04-01T00:00:00.000Z",
				createdAtTo: "2026-05-01T00:00:00.000Z",
				updatedAtFrom: "2026-04-02T00:00:00.000Z",
				updatedAtTo: "2026-05-02T00:00:00.000Z",
				q: "billing",
				orderBy: "createdAt",
				order: "asc",
			},
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/inbox", {
				method: "GET",
			})
		);

		expect(response.status).toBe(200);
		expect(listConversationsHeadersMock).toHaveBeenCalledWith(
			{},
			{
				organizationId: "org-1",
				websiteId: "site-1",
				userId: "user-1",
				limit: 25,
				cursor: "cursor_1",
				status: "open",
				priority: "urgent",
				sentiment: "negative",
				visitorId,
				contactId: "contact-1",
				assignedToUserId: "user-2",
				viewId: "view-1",
				createdAtFrom: "2026-04-01T00:00:00.000Z",
				createdAtTo: "2026-05-01T00:00:00.000Z",
				updatedAtFrom: "2026-04-02T00:00:00.000Z",
				updatedAtTo: "2026-05-02T00:00:00.000Z",
				q: "billing",
				orderBy: "createdAt",
				order: "asc",
			}
		);
	});

	it("returns 403 when the explicit inbox actor is not allowed for the website", async () => {
		resolvePrivateApiKeyActorUserMock.mockImplementationOnce(async () => {
			throw new AuthValidationError(
				403,
				"Actor user is not allowed for this website"
			);
		});
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PRIVATE, linkedUserId: null },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1", teamId: "team-1" },
			query: {
				limit: 20,
				cursor: null,
			},
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/inbox?limit=20", {
				method: "GET",
				headers: {
					"X-Actor-User-Id": "user-invalid",
				},
			})
		);

		expect(response.status).toBe(403);
		expect(await response.text()).toContain(
			"Actor user is not allowed for this website"
		);
		expect(listConversationsHeadersMock).toHaveBeenCalledTimes(0);
	});

	it("includes conversation metadata in private inbox responses", async () => {
		listConversationsHeadersMock.mockResolvedValue({
			items: [
				createInboxItem({
					metadata: {
						orderId: "ord_123",
						priority: "vip",
						mrr: 299,
					},
				}),
			],
			nextCursor: null,
		});
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PRIVATE, linkedUserId: "user-1" },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1", teamId: "team-1" },
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
			items: Array<{ metadata?: Record<string, unknown> | null }>;
		};

		expect(response.status).toBe(200);
		expect(payload.items[0]?.metadata).toEqual({
			orderId: "ord_123",
			priority: "vip",
			mrr: 299,
		});
	});

	it("returns private conversation context for agent workflows", async () => {
		const timelineItem = {
			id: "item-1",
			conversationId,
			organizationId: "org-1",
			visibility: "private",
			type: "message",
			text: "Internal note",
			parts: [],
			userId: "user-1",
			visitorId: null,
			aiAgentId: null,
			createdAt: "2026-04-07T12:00:00.000Z",
			deletedAt: null,
			tool: null,
		};
		getConversationHeaderMock.mockResolvedValue(
			createInboxItem({
				visitor: {
					id: visitorId,
					lastSeenAt: "2026-04-07T11:00:00.000Z",
					blockedAt: null,
					blockedByUserId: null,
					isBlocked: false,
					contact: {
						id: contactId,
						name: "Ada",
						email: "ada@example.com",
						image: null,
					},
				},
			})
		);
		getConversationTimelineItemsMock.mockResolvedValue({
			items: [timelineItem],
			nextCursor: "timeline_cursor",
			hasNextPage: true,
		});
		listFeedbackMock.mockResolvedValue({
			items: [
				{
					id: "feedback-1",
					organizationId: "org-1",
					websiteId: "site-1",
					conversationId,
					visitorId,
					contactId,
					rating: 5,
					topic: "Bug",
					comment: "Helpful answer",
					trigger: "conversation_resolved",
					source: "widget",
					createdAt: "2026-04-07T12:30:00.000Z",
					updatedAt: "2026-04-07T12:30:00.000Z",
					deletedAt: null,
				},
			],
			pagination: {
				page: 1,
				limit: 1,
				total: 1,
				totalPages: 1,
				hasMore: false,
			},
		});
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PRIVATE, linkedUserId: "user-1" },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1", teamId: "team-1" },
			query: {
				timelineLimit: 2,
				timelineCursor: "timeline_before",
				feedbackLimit: 1,
			},
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/conv-1/context", {
				method: "GET",
			})
		);
		const payload = (await response.json()) as {
			conversation: { id: string };
			visitor: { contact: { email: string } | null };
			timeline: { items: unknown[]; nextCursor: string | null };
			feedback: Array<{ id: string }>;
		};

		expect(response.status).toBe(200);
		expect(getConversationHeaderMock).toHaveBeenCalledWith(
			{},
			{
				organizationId: "org-1",
				websiteId: "site-1",
				conversationId,
				userId: "user-1",
			}
		);
		expect(getConversationTimelineItemsMock).toHaveBeenCalledWith(
			{},
			{
				organizationId: "org-1",
				websiteId: "site-1",
				conversationId,
				limit: 2,
				cursor: "timeline_before",
			}
		);
		expect(listFeedbackMock).toHaveBeenCalledWith(
			{},
			{
				organizationId: "org-1",
				websiteId: "site-1",
				conversationId,
				page: 1,
				limit: 1,
				order: "desc",
			}
		);
		expect(payload.conversation.id).toBe(conversationId);
		expect(payload.visitor.contact?.email).toBe("ada@example.com");
		expect(payload.timeline.items).toHaveLength(1);
		expect(payload.timeline.nextCursor).toBe("timeline_cursor");
		expect(payload.feedback[0]?.id).toBe("feedback-1");
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

	it("includes public metadata in visitor conversation listings", async () => {
		listConversationsMock.mockResolvedValue({
			conversations: [
				createConversationRecord({
					metadata: {
						orderId: "ord_123",
						priority: "vip",
						mrr: 299,
					},
				}),
			],
			pagination: {
				page: 1,
				limit: 10,
				total: 1,
				totalPages: 1,
				hasMore: false,
			},
		});
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PUBLIC },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			visitorIdHeader: visitorId,
			query: {
				visitorId,
				page: 1,
				limit: 10,
				status: undefined,
				orderBy: "updatedAt",
				order: "desc",
			},
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/?visitorId=01ARZ3NDEKTSV4RRFFQ69G5FAV", {
				method: "GET",
			})
		);
		const payload = (await response.json()) as {
			conversations: Array<{ metadata?: Record<string, unknown> | null }>;
		};

		expect(response.status).toBe(200);
		expect(payload.conversations[0]?.metadata).toEqual({
			orderId: "ord_123",
			priority: "vip",
			mrr: 299,
		});
	});

	it("includes conversations from old linked visitors in public listings", async () => {
		listConversationsMock.mockResolvedValue({
			conversations: [
				createConversationRecord({
					visitorId: otherVisitorId,
				}),
			],
			pagination: {
				page: 1,
				limit: 10,
				total: 1,
				totalPages: 1,
				hasMore: false,
			},
		});
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PUBLIC },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			visitorIdHeader: visitorId,
			query: {
				visitorId,
				page: 1,
				limit: 10,
				status: undefined,
				orderBy: "updatedAt",
				order: "desc",
			},
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/?visitorId=01ARZ3NDEKTSV4RRFFQ69G5FAV", {
				method: "GET",
			})
		);
		const payload = (await response.json()) as {
			conversations: Array<{ visitorId: string }>;
		};

		expect(response.status).toBe(200);
		expect(payload.conversations[0]?.visitorId).toBe(otherVisitorId);
		expect(listConversationsMock).toHaveBeenCalledWith(
			{},
			expect.objectContaining({
				visitorId,
			})
		);
	});

	it("returns 400 when listing visitor identifiers mismatch", async () => {
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PUBLIC },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			visitorIdHeader: visitorId,
			query: {
				visitorId: otherVisitorId,
				page: 1,
				limit: 10,
				status: undefined,
				orderBy: "updatedAt",
				order: "desc",
			},
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/?visitorId=other", {
				method: "GET",
			})
		);

		expect(response.status).toBe(400);
		expect(listConversationsMock).toHaveBeenCalledTimes(0);
	});

	it("returns 400 when the current listing visitor is deleted", async () => {
		getActiveVisitorForWebsiteMock.mockResolvedValueOnce(null);
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PUBLIC },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			visitorIdHeader: visitorId,
			query: {
				visitorId,
				page: 1,
				limit: 10,
				status: undefined,
				orderBy: "updatedAt",
				order: "desc",
			},
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/?visitorId=visitor-1", {
				method: "GET",
			})
		);

		expect(response.status).toBe(400);
		expect(listConversationsMock).toHaveBeenCalledTimes(0);
	});

	it("returns public metadata on visitor-owned conversation reads", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PUBLIC },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			visitorIdHeader: visitorId,
		});
		getConversationByIdWithLastMessageMock.mockResolvedValue(
			createConversationRecord({
				metadata: {
					orderId: "ord_123",
					priority: "vip",
					mrr: 299,
				},
			})
		);

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/conv-1", {
				method: "GET",
			})
		);
		const payload = (await response.json()) as {
			conversation: { metadata?: Record<string, unknown> | null };
		};

		expect(response.status).toBe(200);
		expect(payload.conversation.metadata).toEqual({
			orderId: "ord_123",
			priority: "vip",
			mrr: 299,
		});
	});

	it("allows public reads for conversations owned by a linked contact visitor", async () => {
		canVisitorAccessConversationMock.mockResolvedValueOnce(true);
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
		const payload = (await response.json()) as {
			conversation: { visitorId: string };
		};

		expect(response.status).toBe(200);
		expect(payload.conversation.visitorId).toBe(otherVisitorId);
		expect(canVisitorAccessConversationMock).toHaveBeenCalledWith(
			{},
			{
				organizationId: "org-1",
				websiteId: "site-1",
				viewerVisitorId: visitorId,
				conversationVisitorId: otherVisitorId,
			}
		);
	});

	it("allows public timeline reads for conversations owned by a linked contact visitor", async () => {
		canVisitorAccessConversationMock.mockResolvedValueOnce(true);
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

		expect(response.status).toBe(200);
		expect(getConversationTimelineItemsMock).toHaveBeenCalledWith(
			{},
			expect.objectContaining({
				conversationId,
				visibility: ["public"],
			})
		);
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

	it("allows public seen reads for conversations owned by a linked contact visitor", async () => {
		canVisitorAccessConversationMock.mockResolvedValueOnce(true);
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PUBLIC },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			visitorIdHeader: visitorId,
			query: {},
		});
		getConversationByIdWithLastMessageMock.mockResolvedValue(
			createConversationRecord({ visitorId: otherVisitorId })
		);

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/conv-1/seen", {
				method: "GET",
			})
		);

		expect(response.status).toBe(200);
		expect(getConversationSeenDataMock).toHaveBeenCalledWith(
			{},
			{
				conversationId,
				organizationId: "org-1",
			}
		);
	});

	it("allows same-contact visitors to update seen, typing, and rating", async () => {
		const { conversationRouter } = await conversationRouterModulePromise;
		const sharedContext = {
			db: {},
			website: {
				id: "site-1",
				organizationId: "org-1",
				defaultLanguage: "en",
				autoTranslateEnabled: false,
			},
			organization: { id: "org-1" },
			visitorIdHeader: visitorId,
		};

		for (const scenario of [
			{
				path: "/conv-1/seen",
				body: { visitorId },
				conversation: createConversationRecord({ visitorId: otherVisitorId }),
			},
			{
				path: "/conv-1/typing",
				body: { visitorId, isTyping: true, visitorPreview: "hello" },
				conversation: createConversationRecord({ visitorId: otherVisitorId }),
			},
			{
				path: "/conv-1/rating",
				body: { visitorId, rating: 5 },
				conversation: createConversationRecord({
					visitorId: otherVisitorId,
					status: "resolved",
				}),
			},
		]) {
			canVisitorAccessConversationMock.mockResolvedValueOnce(true);
			safelyExtractRequestDataMock.mockResolvedValueOnce({
				...sharedContext,
				body: scenario.body,
			});
			getConversationByIdWithLastMessageMock.mockResolvedValueOnce(
				scenario.conversation
			);

			const response = await conversationRouter.request(
				new Request(`http://localhost${scenario.path}`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(scenario.body),
				})
			);

			expect(response.status).toBe(200);
		}
	});

	it("rejects unrelated visitors for seen, typing, and rating updates", async () => {
		const { conversationRouter } = await conversationRouterModulePromise;
		const sharedContext = {
			db: {},
			website: {
				id: "site-1",
				organizationId: "org-1",
				defaultLanguage: "en",
				autoTranslateEnabled: false,
			},
			organization: { id: "org-1" },
			visitorIdHeader: visitorId,
		};

		for (const scenario of [
			{
				path: "/conv-1/seen",
				body: { visitorId },
				conversation: createConversationRecord({ visitorId: otherVisitorId }),
			},
			{
				path: "/conv-1/typing",
				body: { visitorId, isTyping: true, visitorPreview: "hello" },
				conversation: createConversationRecord({ visitorId: otherVisitorId }),
			},
			{
				path: "/conv-1/rating",
				body: { visitorId, rating: 5 },
				conversation: createConversationRecord({
					visitorId: otherVisitorId,
					status: "resolved",
				}),
			},
		]) {
			canVisitorAccessConversationMock.mockResolvedValueOnce(false);
			safelyExtractRequestDataMock.mockResolvedValueOnce({
				...sharedContext,
				body: scenario.body,
			});
			getConversationByIdWithLastMessageMock.mockResolvedValueOnce(
				scenario.conversation
			);

			const response = await conversationRouter.request(
				new Request(`http://localhost${scenario.path}`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(scenario.body),
				})
			);

			expect(response.status).toBe(404);
		}
	});

	it("returns a plain-text attachment for private export requests", async () => {
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PRIVATE },
			organization: { id: "org-1" },
			website: {
				id: "site-1",
				organizationId: "org-1",
				slug: "acme",
				teamId: "team-1",
			},
			query: {},
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/conv-1/export", {
				method: "GET",
			})
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(
			"text/plain; charset=utf-8"
		);
		expect(response.headers.get("Content-Disposition")).toBe(
			'attachment; filename="conversation-conv-1.txt"'
		);
		expect(await response.text()).toContain("Conversation Export");
		expect(buildConversationExportMock).toHaveBeenCalledTimes(1);
	});

	it("merges conversation metadata through the private patch route", async () => {
		const updatedConversation = createConversationRecord({
			metadata: {
				orderId: "ord_123",
				priority: "vip",
				mrr: 299,
			},
		});
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PRIVATE },
			organization: { id: "org-1" },
			website: {
				id: "site-1",
				organizationId: "org-1",
				teamId: "team-1",
			},
			body: {
				metadata: {
					orderId: "ord_123",
					priority: "vip",
					mrr: 299,
				},
			},
		});
		mergeConversationMetadataMock.mockResolvedValue(updatedConversation);

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/conv-1/metadata", {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					metadata: {
						orderId: "ord_123",
						priority: "vip",
						mrr: 299,
					},
				}),
			})
		);
		const payload = (await response.json()) as {
			conversation: { metadata?: Record<string, unknown> | null };
		};

		expect(response.status).toBe(200);
		expect(mergeConversationMetadataMock).toHaveBeenCalledWith(
			{},
			{
				conversation: createConversationRecord(),
				metadata: {
					orderId: "ord_123",
					priority: "vip",
					mrr: 299,
				},
			}
		);
		expect(payload.conversation.metadata).toEqual({
			orderId: "ord_123",
			priority: "vip",
			mrr: 299,
		});
	});

	it("updates conversation priority through the private patch route", async () => {
		const updatedConversation = createConversationRecord({
			priority: "high",
			prioritySource: "user",
		});
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PRIVATE, linkedUserId: "user-1" },
			organization: { id: "org-1" },
			website: {
				id: "site-1",
				organizationId: "org-1",
				teamId: "team-1",
			},
			body: {
				priority: "high",
			},
		});
		updateConversationPriorityMock.mockResolvedValue(updatedConversation);

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/conv-1/priority", {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					priority: "high",
				}),
			})
		);
		const payload = (await response.json()) as {
			conversation: { priority?: string; prioritySource?: string | null };
		};

		expect(response.status).toBe(200);
		expect(updateConversationPriorityMock).toHaveBeenCalledWith(
			{},
			{
				conversation: createConversationRecord(),
				priority: "high",
				actorUserId: "user-1",
			}
		);
		expect(payload.conversation.priority).toBe("high");
		expect(payload.conversation.prioritySource).toBe("user");
	});

	it("updates conversation sentiment through the private patch route", async () => {
		const updatedConversation = createConversationRecord({
			sentiment: null,
			sentimentConfidence: null,
			sentimentSource: "user",
		});
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PRIVATE, linkedUserId: "user-1" },
			organization: { id: "org-1" },
			website: {
				id: "site-1",
				organizationId: "org-1",
				teamId: "team-1",
			},
			body: {
				sentiment: null,
			},
		});
		updateConversationSentimentMock.mockResolvedValue(updatedConversation);

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/conv-1/sentiment", {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					sentiment: null,
				}),
			})
		);
		const payload = (await response.json()) as {
			conversation: {
				sentiment?: string | null;
				sentimentConfidence?: number | null;
				sentimentSource?: string | null;
			};
		};

		expect(response.status).toBe(200);
		expect(updateConversationSentimentMock).toHaveBeenCalledWith(
			{},
			{
				conversation: createConversationRecord(),
				sentiment: null,
				actorUserId: "user-1",
			}
		);
		expect(payload.conversation.sentiment).toBeNull();
		expect(payload.conversation.sentimentConfidence).toBeNull();
		expect(payload.conversation.sentimentSource).toBe("user");
	});

	it("requires an acting teammate for private priority updates", async () => {
		resolvePrivateApiKeyActorUserMock.mockImplementationOnce(async () => {
			throw new AuthValidationError(400, "Actor user is required");
		});
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PRIVATE, linkedUserId: null },
			organization: { id: "org-1" },
			website: {
				id: "site-1",
				organizationId: "org-1",
				teamId: "team-1",
			},
			body: {
				priority: "urgent",
			},
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/conv-1/priority", {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					priority: "urgent",
				}),
			})
		);

		expect(response.status).toBe(400);
		expect(await response.text()).toContain("Actor user is required");
		expect(updateConversationPriorityMock).toHaveBeenCalledTimes(0);
	});

	it("rejects public API keys for full export requests", async () => {
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PUBLIC },
			organization: { id: "org-1" },
			website: {
				id: "site-1",
				organizationId: "org-1",
				slug: "acme",
				teamId: "team-1",
			},
			visitorIdHeader: visitorId,
			query: {},
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/conv-1/export", {
				method: "GET",
			})
		);

		expect(response.status).toBe(403);
		expect(buildConversationExportMock).toHaveBeenCalledTimes(0);
	});

	it("rejects public API keys for private metadata updates", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PUBLIC },
			organization: { id: "org-1" },
			website: {
				id: "site-1",
				organizationId: "org-1",
				teamId: "team-1",
			},
			body: {
				metadata: {
					orderId: "ord_123",
				},
			},
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/conv-1/metadata", {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					metadata: {
						orderId: "ord_123",
					},
				}),
			})
		);

		expect(response.status).toBe(403);
		expect(mergeConversationMetadataMock).toHaveBeenCalledTimes(0);
	});

	it("rejects public API keys for private priority updates", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PUBLIC },
			organization: { id: "org-1" },
			website: {
				id: "site-1",
				organizationId: "org-1",
				teamId: "team-1",
			},
			body: {
				priority: "low",
			},
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/conv-1/priority", {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					priority: "low",
				}),
			})
		);

		expect(response.status).toBe(403);
		expect(updateConversationPriorityMock).toHaveBeenCalledTimes(0);
	});
});

afterAll(() => {
	mock.restore();
});
