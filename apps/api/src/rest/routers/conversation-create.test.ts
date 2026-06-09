import { beforeEach, describe, expect, it, mock } from "bun:test";

type TranslationPartMock = {
	type: "translation";
	text: string;
	sourceLanguage: string;
	targetLanguage: string;
	audience: "team" | "visitor";
	mode: "auto" | "manual";
	modelId: string;
};

type InboundTranslationResultMock =
	| {
			status: "not_needed" | "skipped";
			reason: string;
			sourceLanguage: string | null;
			targetLanguage: string | null;
	  }
	| {
			status: "translated";
			text: string;
			sourceLanguage: string;
			targetLanguage: string;
			modelId: string;
	  };

type OutboundTranslationResultMock =
	| {
			status: "skipped";
			reason: string;
			sourceLanguage: string;
			targetLanguage: string | null;
	  }
	| {
			status: "translated";
			text: string;
			sourceLanguage: string;
			targetLanguage: string;
			modelId: string;
	  };

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
const canVisitorAccessConversationMock = mock(
	(async () => false) as (...args: unknown[]) => Promise<boolean>
);
const getActiveVisitorForWebsiteMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const upsertConversationMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);
const getConversationHeaderMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
type TimelineLookupHarness = {
	select?: () => {
		from: (...args: unknown[]) => {
			where: (...args: unknown[]) => {
				limit: (count: number) => Promise<unknown[]>;
			};
		};
	};
};

async function readTimelineItemFromHarness(db: unknown) {
	const rows = await (db as TimelineLookupHarness)
		.select?.()
		.from({})
		.where({})
		.limit(1);
	return rows?.[0] ?? null;
}

const getConversationTimelineItemByIdForOrganizationMock = mock(
	readTimelineItemFromHarness as (...args: unknown[]) => Promise<unknown>
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
const detectVisitorMessageLanguageMock = mock(
	(_params: { hintLanguage?: string | null; text?: string | null } = {}) =>
		null as string | null
);
const isAutomaticTranslationEnabledMock = mock(() => false);
const prepareInboundVisitorTranslationMock = mock(
	async (
		params: { visitorLanguageHint?: string | null } = {}
	): Promise<{
		visitorLanguage: string | null;
		translationPart: TranslationPartMock | null;
		translationResult: InboundTranslationResultMock;
	}> => ({
		visitorLanguage: params.visitorLanguageHint ?? null,
		translationPart: null,
		translationResult: {
			status: "skipped" as const,
			reason: "missing_language" as const,
			sourceLanguage: params.visitorLanguageHint ?? null,
			targetLanguage: "en",
		},
	})
);
const prepareOutboundVisitorTranslationMock = mock(
	async (params: {
		sourceLanguage: string;
		visitorLanguage?: string | null;
	}): Promise<{
		sourceLanguage: string;
		translationPart: TranslationPartMock | null;
		translationResult: OutboundTranslationResultMock;
	}> => ({
		sourceLanguage: params.sourceLanguage,
		translationPart: null,
		translationResult: {
			status: "skipped" as const,
			reason: "missing_language" as const,
			sourceLanguage: params.sourceLanguage,
			targetLanguage: null,
		},
	})
);
const finalizeConversationTranslationMock = mock((async () => ({
	status: "noop" as const,
})) as (...args: unknown[]) => Promise<unknown>);
const syncConversationVisitorTitleMock = mock((async () => ({
	visitorTitle: null,
	visitorTitleLanguage: null,
})) as (...args: unknown[]) => Promise<unknown>);
const getPlanForWebsiteMock = mock((async () => ({
	features: {
		"auto-translate": false,
	},
})) as (...args: unknown[]) => Promise<unknown>);

mock.module("@api/utils/validate", () => ({
	safelyExtractRequestData: safelyExtractRequestDataMock,
	safelyExtractRequestQuery: safelyExtractRequestQueryMock,
	validateResponse: validateResponseMock,
}));

mock.module("@api/db/queries", () => ({
	getVisitor: getVisitorMock,
}));

mock.module("@api/db/queries/conversation-access", () => ({
	canVisitorAccessConversation: canVisitorAccessConversationMock,
	getActiveVisitorForWebsite: getActiveVisitorForWebsiteMock,
	getConversationDeliveryVisitorIds: mock(async () => []),
	getConversationVisibleVisitorIds: mock(async () => []),
	resolveVisitorConversationScope: mock(async () => null),
}));

mock.module("@api/db/queries/conversation", () => ({
	upsertConversation: upsertConversationMock,
	getConversationById: mock(async () => null),
	getConversationTimelineItemByIdForOrganization:
		getConversationTimelineItemByIdForOrganizationMock,
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
	listConversationsHeaders: mock(async () => ({
		items: [],
		nextCursor: null,
	})),
}));

mock.module("@api/db/queries/feedback", () => ({
	createFeedback: mock(async () => ({})),
	listFeedback: mock(async () => []),
	updateFeedbackConversationId: mock(async () => null),
}));

mock.module("@api/utils/participant-helpers", () => ({
	addConversationParticipant: mock(async () => null),
	getDefaultParticipants: getDefaultParticipantsMock,
	addConversationParticipants: addConversationParticipantsMock,
	isUserParticipant: mock(() => false),
}));

mock.module("@api/utils/timeline-item", () => ({
	createMessageTimelineItem: createMessageTimelineItemMock,
	createTimelineItem: createTimelineItemMock,
	resolveMessageTimelineActor: resolveMessageTimelineActorMock,
}));

mock.module("@api/utils/send-message-with-notification", () => ({
	enqueueAiAgentMessageTrigger: mock(async () => {}),
	triggerMessageNotificationWorkflow: triggerMessageNotificationWorkflowMock,
	triggerMemberSentMessageWorkflow: mock(async () => {}),
	triggerVisitorSentMessageWorkflow: mock(async () => {}),
}));

mock.module("@api/utils/conversation-realtime", () => ({
	emitConversationCreatedEvent: emitConversationCreatedEventMock,
	emitConversationSeenEvent: mock(async () => {}),
	emitConversationTypingEvent: mock(async () => {}),
}));

mock.module("@api/lib/translation", () => ({
	detectVisitorMessageLanguage: detectVisitorMessageLanguageMock,
	finalizeConversationTranslation: finalizeConversationTranslationMock,
	isAutomaticTranslationEnabled: isAutomaticTranslationEnabledMock,
	prepareInboundVisitorTranslation: prepareInboundVisitorTranslationMock,
	prepareOutboundVisitorTranslation: prepareOutboundVisitorTranslationMock,
	shouldMaskTypingPreview: mock(() => false),
	syncConversationVisitorTitle: syncConversationVisitorTitleMock,
}));

mock.module("@api/ai-pipeline/shared/safety/kill-switch", () => ({
	isAiPausedForConversation: mock(async () => false),
	pauseAiForConversation: mock(async () => null),
	recordOutboundPublicAiMessageAndMaybePause: mock(async () => ({
		paused: false,
		messageCount: 1,
	})),
	resumeAiForConversation: mock(async () => null),
}));

mock.module("@api/realtime/emitter", () => ({
	realtime: {
		emit: mock(async () => {}),
	},
}));

mock.module("@api/lib/plans/access", () => ({
	getPlanForWebsite: getPlanForWebsiteMock,
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
	archiveConversation: mock(async () => null),
	joinEscalation: mock(async () => null),
	markConversationAsNotSpam: mock(async () => null),
	markConversationAsRead: mock(async () => ({
		conversation: null,
		lastSeenAt: null,
	})),
	markConversationAsSeenByVisitor: mock(async () => ({
		conversationId: "conv-1",
		lastSeenAt: "2026-02-26T00:00:00.000Z",
	})),
	markConversationAsSpam: mock(async () => null),
	markConversationAsUnread: mock(async () => null),
	mergeConversationMetadata: mock(async () => null),
	reopenConversation: mock(async () => null),
	resolveConversation: mock(async () => null),
	unarchiveConversation: mock(async () => null),
	updateConversationPriority: mock(async () => null),
	updateConversationSentiment: mock(async () => null),
	updateConversationTitle: mock(async () => null),
}));

mock.module("@api/utils/geo-helpers", () => ({
	extractGeoFromVisitor: mock(() => ({})),
}));

mock.module("@api/lib/tinybird-sdk", () => ({
	trackConversationMetric: mock(() => {}),
	trackConversationMetricForVisitor: mock(() => {}),
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

const baseWebsite = {
	id: "site-1",
	organizationId: "org-1",
	defaultLanguage: "en",
	autoTranslateEnabled: true,
};
const baseOrganization = { id: "org-1" };
const baseVisitor = { id: "visitor-1", language: null };
const baseConversation = {
	id: "conv-1",
	organizationId: "org-1",
	websiteId: "site-1",
	visitorId: "visitor-1",
	channel: "widget",
	metadata: null,
	status: "open",
	visitorTitle: null,
	visitorTitleLanguage: null,
	visitorLanguage: null,
	translationActivatedAt: null,
	translationChargedAt: null,
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
		canVisitorAccessConversationMock.mockReset();
		getActiveVisitorForWebsiteMock.mockReset();
		upsertConversationMock.mockReset();
		getConversationHeaderMock.mockReset();
		getConversationTimelineItemByIdForOrganizationMock.mockReset();
		getDefaultParticipantsMock.mockReset();
		addConversationParticipantsMock.mockReset();
		createMessageTimelineItemMock.mockReset();
		createTimelineItemMock.mockReset();
		resolveMessageTimelineActorMock.mockReset();
		triggerMessageNotificationWorkflowMock.mockReset();
		emitConversationCreatedEventMock.mockReset();
		detectVisitorMessageLanguageMock.mockReset();
		isAutomaticTranslationEnabledMock.mockReset();
		prepareInboundVisitorTranslationMock.mockReset();
		prepareOutboundVisitorTranslationMock.mockReset();
		finalizeConversationTranslationMock.mockReset();
		syncConversationVisitorTitleMock.mockReset();
		getPlanForWebsiteMock.mockReset();

		validateResponseMock.mockImplementation((value) => value);
		getVisitorMock.mockResolvedValue(baseVisitor);
		canVisitorAccessConversationMock.mockResolvedValue(true);
		getActiveVisitorForWebsiteMock.mockResolvedValue(baseVisitor);
		getConversationHeaderMock.mockResolvedValue(null);
		getConversationTimelineItemByIdForOrganizationMock.mockImplementation(
			readTimelineItemFromHarness
		);
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
		detectVisitorMessageLanguageMock.mockImplementation(() => null);
		isAutomaticTranslationEnabledMock.mockReturnValue(false);
		prepareInboundVisitorTranslationMock.mockImplementation(
			async (params: { visitorLanguageHint?: string | null } = {}) => ({
				visitorLanguage: params.visitorLanguageHint ?? null,
				translationPart: null,
				translationResult: {
					status: "skipped" as const,
					reason: "missing_language" as const,
					sourceLanguage: params.visitorLanguageHint ?? null,
					targetLanguage: "en",
				},
			})
		);
		prepareOutboundVisitorTranslationMock.mockImplementation(
			async (params: {
				sourceLanguage: string;
				visitorLanguage?: string | null;
			}) => ({
				sourceLanguage: params.sourceLanguage,
				translationPart: null,
				translationResult: {
					status: "skipped" as const,
					reason: "missing_language" as const,
					sourceLanguage: params.sourceLanguage,
					targetLanguage: null,
				},
			})
		);
		finalizeConversationTranslationMock.mockResolvedValue({
			status: "noop" as const,
		});
		syncConversationVisitorTitleMock.mockResolvedValue({
			visitorTitle: null,
			visitorTitleLanguage: null,
		});
		getPlanForWebsiteMock.mockResolvedValue({
			features: {
				"auto-translate": false,
			},
		});
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

	it("defaults response channel to widget when the conversation record is missing it", async () => {
		const dbHarness = createDbHarness({});
		const { channel: _channel, ...conversationWithoutChannel } =
			baseConversation;
		safelyExtractRequestDataMock.mockResolvedValue({
			db: dbHarness.db,
			website: baseWebsite,
			organization: baseOrganization,
			visitorIdHeader: "visitor-1",
			body: {
				conversationId: "conv-1",
				visitorId: "visitor-1",
				defaultTimelineItems: [],
			},
		});
		upsertConversationMock.mockResolvedValue({
			status: "created",
			conversation: conversationWithoutChannel,
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			createValidConversationPostRequest()
		);
		const payload = (await response.json()) as {
			conversation: { channel: string };
		};

		expect(response.status).toBe(200);
		expect(payload.conversation.channel).toBe("widget");
	});

	it("passes public metadata on create and returns it in the conversation payload", async () => {
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
				metadata: {
					orderId: "ord_123",
					priority: "vip",
					mrr: 299,
					flagged: true,
					lastRefundAt: null,
				},
			},
		});
		upsertConversationMock.mockResolvedValue({
			status: "created",
			conversation: {
				...baseConversation,
				metadata: {
					orderId: "ord_123",
					priority: "vip",
					mrr: 299,
					flagged: true,
					lastRefundAt: null,
				},
			},
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			createValidConversationPostRequest()
		);
		const payload = (await response.json()) as {
			conversation: {
				channel: string;
				metadata: Record<string, unknown> | null;
			};
			initialTimelineItems: unknown[];
		};

		expect(response.status).toBe(200);
		expect(upsertConversationMock).toHaveBeenCalledWith(
			dbHarness.db,
			expect.objectContaining({
				channel: "widget",
				metadata: {
					orderId: "ord_123",
					priority: "vip",
					mrr: 299,
					flagged: true,
					lastRefundAt: null,
				},
			})
		);
		expect(payload.conversation.metadata).toEqual({
			orderId: "ord_123",
			priority: "vip",
			mrr: 299,
			flagged: true,
			lastRefundAt: null,
		});
		expect(payload.conversation.channel).toBe("widget");
	});

	it("returns 400 when a default timeline item createdAt is more than 5 minutes in the future", async () => {
		const dbHarness = createDbHarness({});
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
						type: "message",
						text: "hello",
						parts: [{ type: "text", text: "hello" }],
						visibility: "public",
						userId: null,
						visitorId: "visitor-1",
						aiAgentId: null,
						createdAt: "3026-02-26T00:00:00.000Z",
						deletedAt: null,
					},
				],
				channel: "widget",
			},
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			createValidConversationPostRequest()
		);
		const payload = (await response.json()) as {
			error: string;
			message: string;
		};

		expect(response.status).toBe(400);
		expect(payload).toEqual({
			error: "BAD_REQUEST",
			message:
				"defaultTimelineItems[0].createdAt cannot be more than 5 minutes in the future.",
		});
		expect(getVisitorMock).not.toHaveBeenCalled();
		expect(upsertConversationMock).not.toHaveBeenCalled();
		expect(createMessageTimelineItemMock).not.toHaveBeenCalled();
	});

	it("falls back to the server timestamp when a default timeline item omits createdAt", async () => {
		const dbHarness = createDbHarness({});
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
						type: "message",
						text: "hello",
						parts: [{ type: "text", text: "hello" }],
						visibility: "public",
						userId: null,
						visitorId: "visitor-1",
						aiAgentId: null,
						deletedAt: null,
					},
				],
				channel: "widget",
			},
		});
		upsertConversationMock.mockResolvedValue({
			status: "created",
			conversation: baseConversation,
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			createValidConversationPostRequest()
		);

		expect(response.status).toBe(200);
		expect(createMessageTimelineItemMock).toHaveBeenCalledWith(
			expect.objectContaining({
				createdAt: undefined,
			})
		);
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

	it("adds a team translation part to the first visitor bootstrap message", async () => {
		const dbHarness = createDbHarness({});
		isAutomaticTranslationEnabledMock.mockReturnValue(true);
		detectVisitorMessageLanguageMock.mockImplementation(
			(params: { hintLanguage?: string | null; text?: string | null } = {}) =>
				params.text?.includes("Hola") ? "es" : null
		);
		prepareInboundVisitorTranslationMock.mockResolvedValue({
			visitorLanguage: "es",
			translationPart: {
				type: "translation",
				text: "Hello team",
				sourceLanguage: "es",
				targetLanguage: "en",
				audience: "team",
				mode: "auto",
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
		finalizeConversationTranslationMock.mockResolvedValue({
			status: "activated",
			visitorLanguage: "es",
			translationActivatedAt: "2026-02-26T00:00:01.000Z",
			translationChargedAt: "2026-02-26T00:00:01.000Z",
			visitorTitle: null,
			visitorTitleLanguage: "es",
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
						type: "message",
						text: "Hola, necesito ayuda",
						parts: [{ type: "text", text: "Hola, necesito ayuda" }],
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
			status: "created",
			conversation: baseConversation,
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			createValidConversationPostRequest()
		);

		expect(response.status).toBe(200);
		const createCall = createMessageTimelineItemMock.mock.calls[0]?.[0] as
			| { extraParts?: unknown[] }
			| undefined;
		expect(createCall?.extraParts).toContainEqual({
			type: "translation",
			text: "Hello team",
			sourceLanguage: "es",
			targetLanguage: "en",
			audience: "team",
			mode: "auto",
			modelId: "test-model",
		});
		expect(finalizeConversationTranslationMock).toHaveBeenCalledTimes(1);
		expect(finalizeConversationTranslationMock).toHaveBeenCalledWith(
			expect.objectContaining({
				hasTranslationPart: true,
				visitorLanguage: "es",
				emitRealtime: false,
			})
		);
	});

	it("uses inferred visitor language for earlier AI bootstrap replies", async () => {
		const dbHarness = createDbHarness({});
		isAutomaticTranslationEnabledMock.mockReturnValue(true);
		detectVisitorMessageLanguageMock.mockImplementation(
			(params: { hintLanguage?: string | null; text?: string | null } = {}) =>
				params.text?.includes("Hola") ? "es" : null
		);
		prepareOutboundVisitorTranslationMock.mockResolvedValue({
			sourceLanguage: "en",
			translationPart: {
				type: "translation",
				text: "Bienvenido",
				sourceLanguage: "en",
				targetLanguage: "es",
				audience: "visitor",
				mode: "auto",
				modelId: "test-model",
			},
			translationResult: {
				status: "translated",
				text: "Bienvenido",
				sourceLanguage: "en",
				targetLanguage: "es",
				modelId: "test-model",
			},
		});
		prepareInboundVisitorTranslationMock.mockResolvedValue({
			visitorLanguage: "es",
			translationPart: {
				type: "translation",
				text: "Hello",
				sourceLanguage: "es",
				targetLanguage: "en",
				audience: "team",
				mode: "auto",
				modelId: "test-model",
			},
			translationResult: {
				status: "translated",
				text: "Hello",
				sourceLanguage: "es",
				targetLanguage: "en",
				modelId: "test-model",
			},
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
						type: "message",
						text: "Welcome to Cossistant",
						parts: [{ type: "text", text: "Welcome to Cossistant" }],
						visibility: "public",
						userId: null,
						visitorId: null,
						aiAgentId: "ai-1",
						createdAt: "2026-02-26T00:00:00.000Z",
						deletedAt: null,
					},
					{
						type: "message",
						text: "Hola, necesito ayuda",
						parts: [{ type: "text", text: "Hola, necesito ayuda" }],
						visibility: "public",
						userId: null,
						visitorId: "visitor-1",
						aiAgentId: null,
						createdAt: "2026-02-26T00:00:01.000Z",
						deletedAt: null,
					},
				],
				channel: "widget",
			},
		});
		upsertConversationMock.mockResolvedValue({
			status: "created",
			conversation: baseConversation,
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			createValidConversationPostRequest()
		);

		expect(response.status).toBe(200);
		expect(prepareOutboundVisitorTranslationMock).toHaveBeenCalledWith(
			expect.objectContaining({
				text: "Welcome to Cossistant",
				visitorLanguage: "es",
			})
		);
		const firstCreateCall = createMessageTimelineItemMock.mock.calls[0]?.[0] as
			| { extraParts?: unknown[] }
			| undefined;
		expect(firstCreateCall?.extraParts).toContainEqual({
			type: "translation",
			text: "Bienvenido",
			sourceLanguage: "en",
			targetLanguage: "es",
			audience: "visitor",
			mode: "auto",
			modelId: "test-model",
		});
		expect(finalizeConversationTranslationMock).toHaveBeenCalledTimes(1);
	});

	it("lets an English first visitor message override a French browser language during bootstrap", async () => {
		const dbHarness = createDbHarness({});
		getVisitorMock.mockResolvedValue({ id: "visitor-1", language: "fr" });
		isAutomaticTranslationEnabledMock.mockReturnValue(true);
		detectVisitorMessageLanguageMock.mockImplementation(
			(params: { hintLanguage?: string | null; text?: string | null } = {}) =>
				params.text?.includes("Hello, I need help") ? "en" : null
		);
		prepareInboundVisitorTranslationMock.mockImplementation(
			async (params: { visitorLanguageHint?: string | null } = {}) => ({
				visitorLanguage: params.visitorLanguageHint ?? null,
				translationPart: null,
				translationResult: {
					status: "not_needed" as const,
					reason: "same_language" as const,
					sourceLanguage: params.visitorLanguageHint ?? null,
					targetLanguage: "en",
				},
			})
		);
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
						type: "message",
						text: "Welcome to Cossistant",
						parts: [{ type: "text", text: "Welcome to Cossistant" }],
						visibility: "public",
						userId: null,
						visitorId: null,
						aiAgentId: "ai-1",
						createdAt: "2026-02-26T00:00:00.000Z",
						deletedAt: null,
					},
					{
						type: "message",
						text: "Hello, I need help",
						parts: [{ type: "text", text: "Hello, I need help" }],
						visibility: "public",
						userId: null,
						visitorId: "visitor-1",
						aiAgentId: null,
						createdAt: "2026-02-26T00:00:01.000Z",
						deletedAt: null,
					},
				],
				channel: "widget",
			},
		});
		upsertConversationMock.mockResolvedValue({
			status: "created",
			conversation: baseConversation,
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			createValidConversationPostRequest()
		);

		expect(response.status).toBe(200);
		expect(upsertConversationMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				visitorLanguage: null,
			})
		);
		expect(prepareOutboundVisitorTranslationMock).toHaveBeenCalledWith(
			expect.objectContaining({
				text: "Welcome to Cossistant",
				visitorLanguage: "en",
			})
		);
		expect(prepareOutboundVisitorTranslationMock).not.toHaveBeenCalledWith(
			expect.objectContaining({
				visitorLanguage: "fr",
			})
		);
		expect(finalizeConversationTranslationMock).toHaveBeenCalledWith(
			expect.objectContaining({
				visitorLanguage: "en",
				hasTranslationPart: false,
				emitRealtime: false,
			})
		);
	});

	it("returns finalized translation state in the create response and created event", async () => {
		const dbHarness = createDbHarness({});
		isAutomaticTranslationEnabledMock.mockReturnValue(true);
		detectVisitorMessageLanguageMock.mockImplementation(
			(params: { hintLanguage?: string | null; text?: string | null } = {}) =>
				params.text?.includes("Hola") ? "es" : null
		);
		prepareInboundVisitorTranslationMock.mockResolvedValue({
			visitorLanguage: "es",
			translationPart: {
				type: "translation",
				text: "Hello team",
				sourceLanguage: "es",
				targetLanguage: "en",
				audience: "team",
				mode: "auto",
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
		finalizeConversationTranslationMock.mockResolvedValue({
			status: "activated",
			visitorLanguage: "es",
			translationActivatedAt: "2026-02-26T00:00:01.000Z",
			translationChargedAt: "2026-02-26T00:00:01.000Z",
			visitorTitle: "Pregunta de soporte",
			visitorTitleLanguage: "es",
		});
		getConversationHeaderMock.mockResolvedValue({
			id: "conv-1",
			lastTimelineItem: null,
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
						type: "message",
						text: "Hola, necesito ayuda",
						parts: [{ type: "text", text: "Hola, necesito ayuda" }],
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
			status: "created",
			conversation: baseConversation,
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			createValidConversationPostRequest()
		);
		const payload = (await response.json()) as {
			conversation: {
				visitorLanguage: string | null;
				translationActivatedAt: string | null;
				translationChargedAt: string | null;
				visitorTitle: string | null;
				visitorTitleLanguage: string | null;
			};
		};

		expect(response.status).toBe(200);
		expect(finalizeConversationTranslationMock).toHaveBeenCalledTimes(1);
		expect(payload.conversation).toMatchObject({
			visitorLanguage: "es",
			translationActivatedAt: "2026-02-26T00:00:01.000Z",
			translationChargedAt: "2026-02-26T00:00:01.000Z",
			visitorTitle: "Pregunta de soporte",
			visitorTitleLanguage: "es",
		});
		expect(emitConversationCreatedEventMock).toHaveBeenCalledWith(
			expect.objectContaining({
				conversation: expect.objectContaining({
					visitorLanguage: "es",
					translationActivatedAt: "2026-02-26T00:00:01.000Z",
					translationChargedAt: "2026-02-26T00:00:01.000Z",
					visitorTitle: "Pregunta de soporte",
					visitorTitleLanguage: "es",
				}),
			})
		);
	});
});
