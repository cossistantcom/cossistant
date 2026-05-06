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

const updateConversationHeaderInCacheMock = mock(
	(
		_queryClient: unknown,
		_queryKey: readonly unknown[],
		_conversationId: string,
		_updater: unknown
	) => {}
);

const invalidateActiveConversationClarificationQueryMock = mock(
	(
		_queryClient: unknown,
		_params: {
			websiteSlug: string;
			conversationId: string;
		}
	) => {}
);

mock.module("@/data/conversation-header-cache", () => ({
	forEachConversationHeadersQuery: forEachConversationHeadersQueryMock,
	updateConversationHeaderInCache: updateConversationHeaderInCacheMock,
}));

mock.module("@/data/knowledge-clarification-cache", () => ({
	invalidateActiveConversationClarificationQuery:
		invalidateActiveConversationClarificationQueryMock,
}));

const conversationUpdatedModulePromise = import("./conversation-updated");

describe("handleConversationUpdated", () => {
	beforeEach(() => {
		forEachConversationHeadersQueryMock.mockClear();
		updateConversationHeaderInCacheMock.mockClear();
		invalidateActiveConversationClarificationQueryMock.mockClear();
	});

	it("applies all supported realtime update fields to cached conversation headers", async () => {
		const normalizedHeader = {
			id: "conv-1",
			title: "Old title",
			titleSource: null as "ai" | "user" | null,
			status: "open",
			deletedAt: null,
			priority: "normal",
			prioritySource: null,
			viewIds: [],
			sentiment: "neutral",
			sentimentConfidence: 0.4,
			sentimentSource: null,
			escalatedAt: null,
			escalationReason: null,
			resolvedAt: null,
			resolvedByUserId: null,
			resolvedByAiAgentId: null,
			resolutionTime: null,
			aiPausedUntil: null,
			activeClarification: null,
		};

		const setNormalizedDataMock = mock((() => {}) as (value: unknown) => void);
		const getObjectByIdMock = mock(
			(() => normalizedHeader) as (id: string) => unknown
		);
		const invalidateQueriesMock = mock((async () => {}) as (
			input: unknown
		) => Promise<void>);

		const { handleConversationUpdated } =
			await conversationUpdatedModulePromise;

		handleConversationUpdated({
			event: {
				type: "conversationUpdated",
				payload: {
					websiteId: "site-1",
					organizationId: "org-1",
					visitorId: "visitor-1",
					userId: null,
					conversationId: "conv-1",
					updates: {
						title: "New title",
						titleSource: "ai",
						escalatedAt: "2025-01-01T00:00:00.000Z",
						escalationReason: "Need human",
						status: "resolved",
						deletedAt: "2025-01-02T00:00:00.000Z",
						priority: "urgent",
						prioritySource: "user",
						viewIds: ["view-1", "view-2"],
						sentiment: "frustrated",
						sentimentConfidence: 0.93,
						sentimentSource: "user",
						resolvedAt: "2025-01-03T00:00:00.000Z",
						resolvedByUserId: "user-1",
						resolvedByAiAgentId: "ai-1",
						resolutionTime: 120,
						aiPausedUntil: "2025-01-04T00:00:00.000Z",
						activeClarification: {
							requestId: "01JKCLARIFICATION0000000001",
							status: "awaiting_answer",
							topicSummary: "Clarify seat billing.",
							question: "Does the billing change immediately?",
							stepIndex: 2,
							maxSteps: 5,
							progress: null,
							updatedAt: "2025-01-05T00:00:00.000Z",
						},
					},
					aiAgentId: "ai-1",
				},
			} as never,
			context: {
				queryClient: {
					invalidateQueries: invalidateQueriesMock,
				} as never,
				queryNormalizer: {
					getObjectById: getObjectByIdMock,
					setNormalizedData: setNormalizedDataMock,
				} as never,
				website: {
					id: "site-1",
					slug: "acme",
				},
				userId: "user-1",
			} as never,
		});

		expect(updateConversationHeaderInCacheMock).toHaveBeenCalledTimes(1);
		const updater = updateConversationHeaderInCacheMock.mock.calls[0]?.[3] as (
			header: typeof normalizedHeader
		) => typeof normalizedHeader;
		const updatedViaCacheUpdater = updater(normalizedHeader);
		expect(updatedViaCacheUpdater).toMatchObject({
			title: "New title",
			titleSource: "ai",
			escalatedAt: "2025-01-01T00:00:00.000Z",
			escalationReason: "Need human",
			status: "resolved",
			deletedAt: "2025-01-02T00:00:00.000Z",
			priority: "urgent",
			prioritySource: "user",
			viewIds: ["view-1", "view-2"],
			sentiment: "frustrated",
			sentimentConfidence: 0.93,
			sentimentSource: "user",
			resolvedAt: "2025-01-03T00:00:00.000Z",
			resolvedByUserId: "user-1",
			resolvedByAiAgentId: "ai-1",
			resolutionTime: 120,
			aiPausedUntil: "2025-01-04T00:00:00.000Z",
			activeClarification: {
				requestId: "01JKCLARIFICATION0000000001",
				status: "awaiting_answer",
				topicSummary: "Clarify seat billing.",
				question: "Does the billing change immediately?",
				stepIndex: 2,
				maxSteps: 5,
				progress: null,
				updatedAt: "2025-01-05T00:00:00.000Z",
			},
		});

		expect(setNormalizedDataMock).toHaveBeenCalledTimes(1);
		expect(setNormalizedDataMock.mock.calls[0]?.[0]).toMatchObject({
			title: "New title",
			titleSource: "ai",
			status: "resolved",
			priority: "urgent",
			prioritySource: "user",
			viewIds: ["view-1", "view-2"],
			sentiment: "frustrated",
			sentimentConfidence: 0.93,
			sentimentSource: "user",
			resolvedByAiAgentId: "ai-1",
			aiPausedUntil: "2025-01-04T00:00:00.000Z",
			activeClarification: {
				requestId: "01JKCLARIFICATION0000000001",
				status: "awaiting_answer",
				topicSummary: "Clarify seat billing.",
				question: "Does the billing change immediately?",
				stepIndex: 2,
				maxSteps: 5,
				progress: null,
				updatedAt: "2025-01-05T00:00:00.000Z",
			},
		});
		expect(invalidateQueriesMock).toHaveBeenCalledTimes(0);
		expect(
			invalidateActiveConversationClarificationQueryMock
		).toHaveBeenCalledTimes(1);
		expect(
			invalidateActiveConversationClarificationQueryMock.mock.calls[0]?.[1]
		).toEqual({
			websiteSlug: "acme",
			conversationId: "conv-1",
		});
	});

	it("keeps retry-required clarification updates and invalidation intact", async () => {
		const normalizedHeader = {
			id: "conv-1",
			title: "Old title",
			titleSource: null as "ai" | "user" | null,
			status: "open",
			deletedAt: null,
			priority: "normal",
			viewIds: [],
			sentiment: "neutral",
			sentimentConfidence: 0.4,
			escalatedAt: null,
			escalationReason: null,
			resolvedAt: null,
			resolvedByUserId: null,
			resolvedByAiAgentId: null,
			resolutionTime: null,
			aiPausedUntil: null,
			activeClarification: {
				requestId: "01JKCLARIFICATION0000000001",
				status: "analyzing",
				topicSummary: "Clarify account deletion.",
				question: null,
				stepIndex: 1,
				maxSteps: 3,
				progress: null,
				updatedAt: "2025-01-04T00:00:00.000Z",
			},
		};

		const setNormalizedDataMock = mock((() => {}) as (value: unknown) => void);
		const getObjectByIdMock = mock(
			(() => normalizedHeader) as (id: string) => unknown
		);
		const invalidateQueriesMock = mock((async () => {}) as (
			input: unknown
		) => Promise<void>);

		const { handleConversationUpdated } =
			await conversationUpdatedModulePromise;

		handleConversationUpdated({
			event: {
				type: "conversationUpdated",
				payload: {
					websiteId: "site-1",
					organizationId: "org-1",
					visitorId: "visitor-1",
					userId: null,
					conversationId: "conv-1",
					updates: {
						activeClarification: {
							requestId: "01JKCLARIFICATION0000000001",
							status: "retry_required",
							topicSummary: "Clarify account deletion.",
							question: null,
							stepIndex: 1,
							maxSteps: 3,
							progress: null,
							updatedAt: "2025-01-05T00:00:00.000Z",
						},
					},
					aiAgentId: null,
				},
			} as never,
			context: {
				queryClient: {
					invalidateQueries: invalidateQueriesMock,
				} as never,
				queryNormalizer: {
					getObjectById: getObjectByIdMock,
					setNormalizedData: setNormalizedDataMock,
				} as never,
				website: {
					id: "site-1",
					slug: "acme",
				},
				userId: "user-1",
			} as never,
		});

		const updater = updateConversationHeaderInCacheMock.mock.calls[0]?.[3] as (
			header: typeof normalizedHeader
		) => typeof normalizedHeader;
		expect(updater(normalizedHeader).activeClarification).toEqual({
			requestId: "01JKCLARIFICATION0000000001",
			status: "retry_required",
			topicSummary: "Clarify account deletion.",
			question: null,
			stepIndex: 1,
			maxSteps: 3,
			progress: null,
			updatedAt: "2025-01-05T00:00:00.000Z",
		});
		expect(
			invalidateActiveConversationClarificationQueryMock
		).toHaveBeenCalledTimes(1);
		expect(
			invalidateActiveConversationClarificationQueryMock.mock.calls[0]?.[1]
		).toEqual({
			websiteSlug: "acme",
			conversationId: "conv-1",
		});
		expect(invalidateQueriesMock).toHaveBeenCalledTimes(0);
	});

	it("keeps progress-only clarification updates in cache without invalidating the detail query", async () => {
		const normalizedHeader = {
			id: "conv-1",
			title: "Old title",
			titleSource: null as "ai" | "user" | null,
			status: "open",
			deletedAt: null,
			priority: "normal",
			viewIds: [],
			sentiment: "neutral",
			sentimentConfidence: 0.4,
			escalatedAt: null,
			escalationReason: null,
			resolvedAt: null,
			resolvedByUserId: null,
			resolvedByAiAgentId: null,
			resolutionTime: null,
			aiPausedUntil: null,
			activeClarification: {
				requestId: "01JKCLARIFICATION0000000001",
				status: "analyzing",
				topicSummary: "Clarify account deletion.",
				question: null,
				stepIndex: 1,
				maxSteps: 3,
				progress: null,
				updatedAt: "2025-01-05T00:00:00.000Z",
			},
		};

		const setNormalizedDataMock = mock((() => {}) as (value: unknown) => void);
		const getObjectByIdMock = mock(
			(() => normalizedHeader) as (id: string) => unknown
		);
		const invalidateQueriesMock = mock((async () => {}) as (
			input: unknown
		) => Promise<void>);

		const { handleConversationUpdated } =
			await conversationUpdatedModulePromise;

		handleConversationUpdated({
			event: {
				type: "conversationUpdated",
				payload: {
					websiteId: "site-1",
					organizationId: "org-1",
					visitorId: "visitor-1",
					userId: null,
					conversationId: "conv-1",
					updates: {
						activeClarification: {
							requestId: "01JKCLARIFICATION0000000001",
							status: "analyzing",
							topicSummary: "Clarify account deletion.",
							question: null,
							stepIndex: 1,
							maxSteps: 3,
							progress: {
								phase: "reviewing_evidence",
								label: "Reviewing what we know",
								detail: "Cross-checking conversation context.",
								attempt: 1,
								toolName: "kb_search",
								startedAt: "2025-01-05T00:00:01.000Z",
							},
							updatedAt: "2025-01-05T00:00:00.000Z",
						},
					},
					aiAgentId: null,
				},
			} as never,
			context: {
				queryClient: {
					invalidateQueries: invalidateQueriesMock,
				} as never,
				queryNormalizer: {
					getObjectById: getObjectByIdMock,
					setNormalizedData: setNormalizedDataMock,
				} as never,
				website: {
					id: "site-1",
					slug: "acme",
				},
				userId: "user-1",
			} as never,
		});

		const updater = updateConversationHeaderInCacheMock.mock.calls[0]?.[3] as (
			header: typeof normalizedHeader
		) => typeof normalizedHeader;
		expect(
			updater(normalizedHeader).activeClarification?.progress
		).toMatchObject({
			phase: "reviewing_evidence",
			label: "Reviewing what we know",
			detail: "Cross-checking conversation context.",
			attempt: 1,
			toolName: "kb_search",
			startedAt: "2025-01-05T00:00:01.000Z",
		});
		expect(
			invalidateActiveConversationClarificationQueryMock
		).toHaveBeenCalledTimes(0);
		expect(invalidateQueriesMock).toHaveBeenCalledTimes(0);
	});

	it("invalidates headers queries when the conversation is not in normalized cache", async () => {
		forEachConversationHeadersQueryMock.mockImplementation(
			(_queryClient, _websiteSlug, callback) => {
				callback(["query-a"]);
				callback(["query-b"]);
			}
		);

		const setNormalizedDataMock = mock((() => {}) as (value: unknown) => void);
		const getObjectByIdMock = mock((() => {}) as (id: string) => unknown);
		const invalidateQueriesMock = mock((async () => {}) as (
			input: unknown
		) => Promise<void>);

		const { handleConversationUpdated } =
			await conversationUpdatedModulePromise;

		handleConversationUpdated({
			event: {
				type: "conversationUpdated",
				payload: {
					websiteId: "site-1",
					organizationId: "org-1",
					visitorId: "visitor-1",
					userId: null,
					conversationId: "conv-missing",
					updates: {
						status: "spam",
					},
					aiAgentId: "ai-1",
				},
			} as never,
			context: {
				queryClient: {
					invalidateQueries: invalidateQueriesMock,
				} as never,
				queryNormalizer: {
					getObjectById: getObjectByIdMock,
					setNormalizedData: setNormalizedDataMock,
				} as never,
				website: {
					id: "site-1",
					slug: "acme",
				},
				userId: "user-1",
			} as never,
		});

		expect(updateConversationHeaderInCacheMock).toHaveBeenCalledTimes(0);
		expect(setNormalizedDataMock).toHaveBeenCalledTimes(0);
		expect(invalidateQueriesMock).toHaveBeenCalledTimes(2);
		expect(invalidateQueriesMock.mock.calls[0]?.[0]).toEqual({
			queryKey: ["query-a"],
			exact: true,
		});
		expect(invalidateQueriesMock.mock.calls[1]?.[0]).toEqual({
			queryKey: ["query-b"],
			exact: true,
		});
	});

	it("keeps locked preview fields redacted while allowing title updates", async () => {
		const normalizedHeader = {
			id: "conv-1",
			title: "Old title",
			titleSource: null as "ai" | "user" | null,
			status: "open",
			deletedAt: null,
			priority: "normal",
			escalatedAt: null,
			escalationReason: null,
			resolvedAt: null,
			resolvedByUserId: null,
			resolvedByAiAgentId: null,
			resolutionTime: null,
			lastTimelineItem: null,
			lastMessageTimelineItem: null,
			lastMessageAt: null,
			dashboardLocked: true,
			dashboardLockReason: "conversation_limit" as const,
		};

		const setNormalizedDataMock = mock((() => {}) as (value: unknown) => void);
		const getObjectByIdMock = mock(
			(() => normalizedHeader) as (id: string) => unknown
		);
		const invalidateQueriesMock = mock((async () => {}) as (
			input: unknown
		) => Promise<void>);

		const { handleConversationUpdated } =
			await conversationUpdatedModulePromise;

		handleConversationUpdated({
			event: {
				type: "conversationUpdated",
				payload: {
					websiteId: "site-1",
					organizationId: "org-1",
					visitorId: "visitor-1",
					userId: null,
					conversationId: "conv-1",
					updates: {
						title: "New locked title",
						titleSource: "ai",
						status: "resolved",
					},
					aiAgentId: "ai-1",
				},
			} as never,
			context: {
				queryClient: {
					invalidateQueries: invalidateQueriesMock,
				} as never,
				queryNormalizer: {
					getObjectById: getObjectByIdMock,
					setNormalizedData: setNormalizedDataMock,
				} as never,
				website: {
					id: "site-1",
					slug: "acme",
				},
				userId: "user-1",
			} as never,
		});

		const updater = updateConversationHeaderInCacheMock.mock.calls[0]?.[3] as (
			header: typeof normalizedHeader
		) => typeof normalizedHeader;
		const updatedViaCacheUpdater = updater(normalizedHeader);

		expect(updatedViaCacheUpdater.title).toBe("New locked title");
		expect(updatedViaCacheUpdater.titleSource).toBe("ai");
		expect(updatedViaCacheUpdater.lastTimelineItem).toBeNull();
		expect(updatedViaCacheUpdater.lastMessageTimelineItem).toBeNull();
		expect(updatedViaCacheUpdater.lastMessageAt).toBeNull();
		expect(updatedViaCacheUpdater.dashboardLocked).toBe(true);
		expect(updatedViaCacheUpdater.dashboardLockReason).toBe(
			"conversation_limit"
		);
	});
});
