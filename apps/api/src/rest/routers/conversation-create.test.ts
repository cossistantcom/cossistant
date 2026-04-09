import { beforeEach, describe, expect, it, mock } from "bun:test";

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
const upsertConversationMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);
const getConversationHeaderMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);

const getDefaultParticipantsMock = mock((async () => []) as (
	...args: unknown[]
) => Promise<string[]>);
const addConversationParticipantsMock = mock((async () => []) as (
	...args: unknown[]
) => Promise<string[]>);
const createMessageTimelineItemMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);
const createTimelineItemMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);
const resolveMessageTimelineActorMock = mock(
	(
		item: {
			userId?: string | null;
			visitorId?: string | null;
			aiAgentId?: string | null;
		},
		fallbackVisitorId?: string | null
	) => {
		if (item.userId) {
			return { type: "user", userId: item.userId } as const;
		}
		if (item.aiAgentId) {
			return { type: "ai_agent", aiAgentId: item.aiAgentId } as const;
		}
		if (item.visitorId) {
			return { type: "visitor", visitorId: item.visitorId } as const;
		}
		if (fallbackVisitorId) {
			return { type: "visitor", visitorId: fallbackVisitorId } as const;
		}
		return null;
	}
);
const triggerMessageNotificationWorkflowMock = mock((async () => {}) as (
	...args: unknown[]
) => Promise<void>);
const emitConversationCreatedEventMock = mock((async () => {}) as (
	...args: unknown[]
) => Promise<void>);

mock.module("@api/utils/validate", () => ({
	safelyExtractRequestData: safelyExtractRequestDataMock,
	safelyExtractRequestQuery: safelyExtractRequestQueryMock,
	validateResponse: validateResponseMock,
}));

mock.module("@api/db/queries", () => ({
	getVisitor: getVisitorMock,
}));

mock.module("@api/db/queries/conversation", () => ({
	upsertConversation: upsertConversationMock,
	getConversationHeader: getConversationHeaderMock,
	getConversationByIdWithLastMessage: mock(async () => null),
	getConversationSeenData: mock(async () => []),
	getConversationTimelineItems: mock(async () => ({
		items: [],
		nextCursor: null,
		hasNextPage: false,
	})),
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
}));

mock.module("@api/db/queries/feedback", () => ({
	createFeedback: mock(async () => ({})),
}));

mock.module("@api/utils/participant-helpers", () => ({
	getDefaultParticipants: getDefaultParticipantsMock,
	addConversationParticipants: addConversationParticipantsMock,
}));

mock.module("@api/utils/timeline-item", () => ({
	createMessageTimelineItem: createMessageTimelineItemMock,
	createTimelineItem: createTimelineItemMock,
	resolveMessageTimelineActor: resolveMessageTimelineActorMock,
}));

mock.module("@api/utils/send-message-with-notification", () => ({
	triggerMessageNotificationWorkflow: triggerMessageNotificationWorkflowMock,
}));

mock.module("@api/utils/conversation-realtime", () => ({
	emitConversationCreatedEvent: emitConversationCreatedEventMock,
	emitConversationSeenEvent: mock(async () => {}),
	emitConversationTypingEvent: mock(async () => {}),
}));

mock.module("@api/lib/plans/access", () => ({
	getPlanForWebsite: mock(async () => ({})),
}));

mock.module("@api/lib/hard-limits/dashboard", () => ({
	getDashboardConversationLockCutoff: mock(async () => null),
	resolveDashboardHardLimitPolicy: mock(() => ({})),
	applyDashboardConversationHardLimit: mock(
		({ conversation }: { conversation: unknown }) => conversation
	),
}));

mock.module("@api/services/presence", () => ({
	markVisitorPresence: mock(async () => {}),
}));

mock.module("@api/db/mutations/conversation", () => ({
	markConversationAsSeenByVisitor: mock(async () => ({
		conversationId: "conv-1",
		lastSeenAt: "2026-02-26T00:00:00.000Z",
	})),
}));

mock.module("@api/utils/geo-helpers", () => ({
	extractGeoFromVisitor: mock(() => ({})),
}));

mock.module("@api/lib/tinybird-sdk", () => ({
	trackConversationMetric: mock(() => {}),
	trackConversationMetricForVisitor: mock(async () => {}),
}));

mock.module("../middleware", () => ({
	protectedPublicApiKeyMiddleware: [],
}));

const conversationRouterModulePromise = import("./conversation");

function createValidConversationPostRequest() {
	return new Request("http://localhost/", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			defaultTimelineItems: [],
			channel: "widget",
		}),
	});
}

function createDbHarness(params: {
	timelineItemRows?: Array<Record<string, unknown> | null>;
}) {
	let readIndex = 0;
	const rows = params.timelineItemRows ?? [];

	const limitMock = mock(async () => {
		const next = rows[readIndex];
		readIndex++;
		return next ? [next] : [];
	});
	const whereMock = mock(() => ({ limit: limitMock }));
	const fromMock = mock(() => ({ where: whereMock }));
	const selectMock = mock(() => ({ from: fromMock }));

	return {
		db: {
			select: selectMock,
		},
	};
}

const baseWebsite = { id: "site-1", organizationId: "org-1" };
const baseOrganization = { id: "org-1" };
const baseVisitor = { id: "visitor-1" };
const baseConversation = {
	id: "conv-1",
	organizationId: "org-1",
	websiteId: "site-1",
	visitorId: "visitor-1",
	status: "open",
	createdAt: "2026-02-26T00:00:00.000Z",
	updatedAt: "2026-02-26T00:00:00.000Z",
	deletedAt: null,
	title: null,
	visitorRating: null,
	visitorRatingAt: null,
};

describe("POST /v1/conversations", () => {
	beforeEach(() => {
		safelyExtractRequestDataMock.mockReset();
		safelyExtractRequestQueryMock.mockReset();
		validateResponseMock.mockReset();
		getVisitorMock.mockReset();
		upsertConversationMock.mockReset();
		getConversationHeaderMock.mockReset();
		getDefaultParticipantsMock.mockReset();
		addConversationParticipantsMock.mockReset();
		createMessageTimelineItemMock.mockReset();
		createTimelineItemMock.mockReset();
		resolveMessageTimelineActorMock.mockReset();
		triggerMessageNotificationWorkflowMock.mockReset();
		emitConversationCreatedEventMock.mockReset();

		validateResponseMock.mockImplementation((value) => value);
		getVisitorMock.mockResolvedValue(baseVisitor);
		getConversationHeaderMock.mockResolvedValue(null);
		getDefaultParticipantsMock.mockResolvedValue([]);
		addConversationParticipantsMock.mockResolvedValue([]);
		createMessageTimelineItemMock.mockResolvedValue({
			item: {
				id: "msg-1",
				type: "message",
				conversationId: "conv-1",
				organizationId: "org-1",
				visibility: "public",
				text: "hello",
				parts: [{ type: "text", text: "hello" }],
				userId: null,
				visitorId: "visitor-1",
				aiAgentId: null,
				createdAt: "2026-02-26T00:00:00.000Z",
				deletedAt: null,
				tool: null,
			},
			actor: { type: "visitor", visitorId: "visitor-1" },
		});
		createTimelineItemMock.mockResolvedValue({
			id: "item-1",
			type: "event",
			conversationId: "conv-1",
			organizationId: "org-1",
			visibility: "public",
			text: null,
			parts: [],
			userId: null,
			visitorId: null,
			aiAgentId: null,
			createdAt: "2026-02-26T00:00:00.000Z",
			deletedAt: null,
			tool: null,
		});
		resolveMessageTimelineActorMock.mockImplementation(
			(
				item: {
					userId?: string | null;
					visitorId?: string | null;
					aiAgentId?: string | null;
				},
				fallbackVisitorId?: string | null
			) => {
				if (item.userId) {
					return { type: "user", userId: item.userId } as const;
				}
				if (item.aiAgentId) {
					return { type: "ai_agent", aiAgentId: item.aiAgentId } as const;
				}
				if (item.visitorId) {
					return { type: "visitor", visitorId: item.visitorId } as const;
				}
				if (fallbackVisitorId) {
					return { type: "visitor", visitorId: fallbackVisitorId } as const;
				}
				return null;
			}
		);
		triggerMessageNotificationWorkflowMock.mockResolvedValue(undefined);
		emitConversationCreatedEventMock.mockResolvedValue(undefined);
	});

	it("returns 200 for existing same-owner conversation without crashing", async () => {
		const dbHarness = createDbHarness({});
		safelyExtractRequestDataMock.mockResolvedValue({
			db: dbHarness.db,
			website: baseWebsite,
			organization: baseOrganization,
			visitorIdHeader: "visitor-1",
			body: {
				conversationId: "conv-1",
				visitorId: "visitor-1",
				defaultTimelineItems: [],
				channel: "widget",
			},
		});
		upsertConversationMock.mockResolvedValue({
			status: "existing",
			conversation: baseConversation,
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			createValidConversationPostRequest()
		);
		const payload = (await response.json()) as {
			conversation: { id: string };
			initialTimelineItems: unknown[];
		};

		expect(response.status).toBe(200);
		expect(payload.conversation.id).toBe("conv-1");
		expect(payload.initialTimelineItems).toEqual([]);
	});

	it("returns 409 when conversationId belongs to another owner tuple", async () => {
		const dbHarness = createDbHarness({});
		safelyExtractRequestDataMock.mockResolvedValue({
			db: dbHarness.db,
			website: baseWebsite,
			organization: baseOrganization,
			visitorIdHeader: "visitor-1",
			body: {
				conversationId: "conv-1",
				visitorId: "visitor-1",
				defaultTimelineItems: [],
				channel: "widget",
			},
		});
		upsertConversationMock.mockResolvedValue({
			status: "conflict",
			reason: "ownership_mismatch",
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			createValidConversationPostRequest()
		);
		const payload = (await response.json()) as { code: string; error: string };

		expect(response.status).toBe(409);
		expect(payload.code).toBe("CONVERSATION_ID_CONFLICT");
		expect(payload.error).toContain("Conversation ID already exists");
	});

	it("reuses existing default message item in same conversation without re-triggering workflow", async () => {
		const existingMessage = {
			id: "msg-1",
			type: "message",
			conversationId: "conv-1",
			organizationId: "org-1",
			visibility: "public",
			text: "hello",
			parts: [{ type: "text", text: "hello" }],
			userId: null,
			visitorId: "visitor-1",
			aiAgentId: null,
			createdAt: "2026-02-26T00:00:00.000Z",
			deletedAt: null,
			tool: null,
		};
		const dbHarness = createDbHarness({
			timelineItemRows: [existingMessage],
		});
		safelyExtractRequestDataMock.mockResolvedValue({
			db: dbHarness.db,
			website: baseWebsite,
			organization: baseOrganization,
			visitorIdHeader: "visitor-1",
			body: {
				conversationId: "conv-1",
				visitorId: "visitor-1",
				defaultTimelineItems: [
					{
						id: "msg-1",
						type: "message",
						text: "hello",
						parts: [{ type: "text", text: "hello" }],
						visibility: "public",
						userId: null,
						visitorId: "visitor-1",
						aiAgentId: null,
						createdAt: "2026-02-26T00:00:00.000Z",
						deletedAt: null,
					},
				],
				channel: "widget",
			},
		});
		upsertConversationMock.mockResolvedValue({
			status: "existing",
			conversation: baseConversation,
		});
		createMessageTimelineItemMock.mockRejectedValueOnce({
			code: "23505",
			message: "duplicate key value violates unique constraint",
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			createValidConversationPostRequest()
		);
		const payload = (await response.json()) as {
			initialTimelineItems: Array<{ id: string }>;
		};

		expect(response.status).toBe(200);
		expect(payload.initialTimelineItems.map((item) => item.id)).toEqual([
			"msg-1",
		]);
		expect(createMessageTimelineItemMock).toHaveBeenCalledTimes(1);
		expect(triggerMessageNotificationWorkflowMock).not.toHaveBeenCalled();
	});

	it("returns 409 when default timeline item id already exists in another conversation", async () => {
		const collidingMessage = {
			id: "msg-1",
			type: "message",
			conversationId: "conv-other",
			organizationId: "org-1",
			visibility: "public",
			text: "hello",
			parts: [{ type: "text", text: "hello" }],
			userId: null,
			visitorId: "visitor-1",
			aiAgentId: null,
			createdAt: "2026-02-26T00:00:00.000Z",
			deletedAt: null,
			tool: null,
		};
		const dbHarness = createDbHarness({
			timelineItemRows: [collidingMessage],
		});
		safelyExtractRequestDataMock.mockResolvedValue({
			db: dbHarness.db,
			website: baseWebsite,
			organization: baseOrganization,
			visitorIdHeader: "visitor-1",
			body: {
				conversationId: "conv-1",
				visitorId: "visitor-1",
				defaultTimelineItems: [
					{
						id: "msg-1",
						type: "message",
						text: "hello",
						parts: [{ type: "text", text: "hello" }],
						visibility: "public",
						userId: null,
						visitorId: "visitor-1",
						aiAgentId: null,
						createdAt: "2026-02-26T00:00:00.000Z",
						deletedAt: null,
					},
				],
				channel: "widget",
			},
		});
		upsertConversationMock.mockResolvedValue({
			status: "existing",
			conversation: baseConversation,
		});
		createMessageTimelineItemMock.mockRejectedValueOnce({
			code: "23505",
			message: "duplicate key value violates unique constraint",
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			createValidConversationPostRequest()
		);
		const payload = (await response.json()) as { code: string; error: string };

		expect(response.status).toBe(409);
		expect(payload.code).toBe("TIMELINE_ITEM_ID_CONFLICT");
		expect(payload.error).toContain("collision");
		expect(createMessageTimelineItemMock).toHaveBeenCalledTimes(1);
		expect(triggerMessageNotificationWorkflowMock).not.toHaveBeenCalled();
	});

	it("keeps retries idempotent for defaults without an item id", async () => {
		let storedMessage: Record<string, unknown> | null = null;
		const limitMock = mock(async () => (storedMessage ? [storedMessage] : []));
		const whereMock = mock(() => ({ limit: limitMock }));
		const fromMock = mock(() => ({ where: whereMock }));
		const selectMock = mock(() => ({ from: fromMock }));
		const db = {
			select: selectMock,
		};
		safelyExtractRequestDataMock.mockResolvedValue({
			db,
			website: baseWebsite,
			organization: baseOrganization,
			visitorIdHeader: "visitor-1",
			body: {
				conversationId: "conv-1",
				visitorId: "visitor-1",
				defaultTimelineItems: [
					{
						type: "message",
						text: "hello",
						parts: [{ type: "text", text: "hello" }],
						visibility: "public",
						userId: null,
						visitorId: "visitor-1",
						aiAgentId: null,
						createdAt: "2026-02-26T00:00:00.000Z",
						deletedAt: null,
					},
				],
				channel: "widget",
			},
		});
		upsertConversationMock.mockResolvedValue({
			status: "existing",
			conversation: baseConversation,
		});
		createMessageTimelineItemMock
			.mockImplementationOnce(async (params) => {
				const input = params as { id: string };
				storedMessage = {
					id: input.id,
					type: "message",
					conversationId: "conv-1",
					organizationId: "org-1",
					visibility: "public",
					text: "hello",
					parts: [{ type: "text", text: "hello" }],
					userId: null,
					visitorId: "visitor-1",
					aiAgentId: null,
					createdAt: "2026-02-26T00:00:00.000Z",
					deletedAt: null,
					tool: null,
				};
				return {
					item: storedMessage,
					actor: { type: "visitor", visitorId: "visitor-1" },
				};
			})
			.mockRejectedValueOnce({
				code: "23505",
				message: "duplicate key value violates unique constraint",
			});

		const { conversationRouter } = await conversationRouterModulePromise;
		const first = await conversationRouter.request(
			createValidConversationPostRequest()
		);
		const second = await conversationRouter.request(
			createValidConversationPostRequest()
		);
		const firstPayload = (await first.json()) as {
			initialTimelineItems: Array<{ id: string }>;
		};
		const secondPayload = (await second.json()) as {
			initialTimelineItems: Array<{ id: string }>;
		};
		const firstCreateArgs = createMessageTimelineItemMock.mock.calls[0]?.[0] as
			| { id?: string }
			| undefined;
		const generatedId = firstCreateArgs?.id;
		if (!generatedId) {
			throw new Error("Expected generated timeline item id");
		}

		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(createMessageTimelineItemMock).toHaveBeenCalledTimes(2);
		expect(firstPayload.initialTimelineItems[0]?.id).toBe(generatedId);
		expect(secondPayload.initialTimelineItems[0]?.id).toBe(generatedId);
		expect(triggerMessageNotificationWorkflowMock).toHaveBeenCalledTimes(1);
	});

	it("recovers when create hits unique violation race and resolves existing item", async () => {
		const racedMessage = {
			id: "msg-race-1",
			type: "message",
			conversationId: "conv-1",
			organizationId: "org-1",
			visibility: "public",
			text: "hello",
			parts: [{ type: "text", text: "hello" }],
			userId: null,
			visitorId: "visitor-1",
			aiAgentId: null,
			createdAt: "2026-02-26T00:00:00.000Z",
			deletedAt: null,
			tool: null,
		};
		const dbHarness = createDbHarness({
			timelineItemRows: [racedMessage],
		});
		safelyExtractRequestDataMock.mockResolvedValue({
			db: dbHarness.db,
			website: baseWebsite,
			organization: baseOrganization,
			visitorIdHeader: "visitor-1",
			body: {
				conversationId: "conv-1",
				visitorId: "visitor-1",
				defaultTimelineItems: [
					{
						id: "msg-race-1",
						type: "message",
						text: "hello",
						parts: [{ type: "text", text: "hello" }],
						visibility: "public",
						userId: null,
						visitorId: "visitor-1",
						aiAgentId: null,
						createdAt: "2026-02-26T00:00:00.000Z",
						deletedAt: null,
					},
				],
				channel: "widget",
			},
		});
		upsertConversationMock.mockResolvedValue({
			status: "existing",
			conversation: baseConversation,
		});
		createMessageTimelineItemMock.mockRejectedValueOnce({
			code: "23505",
			message: "duplicate key value violates unique constraint",
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			createValidConversationPostRequest()
		);
		const payload = (await response.json()) as {
			initialTimelineItems: Array<{ id: string }>;
		};

		expect(response.status).toBe(200);
		expect(payload.initialTimelineItems.map((item) => item.id)).toEqual([
			"msg-race-1",
		]);
		expect(createMessageTimelineItemMock).toHaveBeenCalledTimes(1);
		expect(triggerMessageNotificationWorkflowMock).not.toHaveBeenCalled();
	});
});
