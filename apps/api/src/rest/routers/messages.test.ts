import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { APIKeyType } from "@cossistant/types";

const safelyExtractRequestDataMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);
const validateResponseMock = mock(<T>(value: T) => value);
const getConversationByIdMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const canVisitorAccessConversationMock = mock(
	(async () => false) as (...args: unknown[]) => Promise<boolean>
);
const getVisitorMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const getActiveVisitorForWebsiteMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const getPlanForWebsiteMock = mock((async () => ({
	features: { "auto-translate": false },
})) as (...args: unknown[]) => Promise<unknown>);
const isAutomaticTranslationEnabledMock = mock(() => false);
const prepareInboundVisitorTranslationMock = mock((async () => ({
	visitorLanguage: null,
	translationPart: null,
	translationResult: {
		status: "skipped" as const,
		reason: "missing_language" as const,
		sourceLanguage: null,
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
		targetLanguage: null,
	},
})) as (...args: unknown[]) => Promise<unknown>);
const finalizeConversationTranslationMock = mock((async () => ({
	status: "noop" as const,
})) as (...args: unknown[]) => Promise<unknown>);
const createMessageTimelineItemMock = mock((async () => ({
	item: {
		id: "msg-1",
		conversationId: "conv-1",
		organizationId: "org-1",
		type: "message",
		text: "hello",
		parts: [{ type: "text", text: "hello" }],
		visibility: "public",
		userId: null,
		aiAgentId: null,
		visitorId: "visitor-1",
		createdAt: "2026-04-10T08:00:00.000Z",
		deletedAt: null,
		tool: null,
	},
	actor: { type: "visitor", visitorId: "visitor-1" },
})) as (...args: unknown[]) => Promise<unknown>);
const createTimelineItemMock = mock((async () => ({
	id: "item-1",
	conversationId: "conv-1",
	organizationId: "org-1",
	type: "event",
	text: null,
	parts: [],
	visibility: "public",
	userId: null,
	aiAgentId: null,
	visitorId: "visitor-1",
	createdAt: "2026-04-10T08:00:00.000Z",
	deletedAt: null,
	tool: null,
})) as (...args: unknown[]) => Promise<unknown>);
const isUserParticipantMock = mock(
	(async () => true) as (...args: unknown[]) => Promise<boolean>
);
const addConversationParticipantMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const createParticipantJoinedEventMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const triggerMessageNotificationWorkflowMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const markConversationAsSeenMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const emitConversationSeenEventMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const markUserPresenceMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const markVisitorPresenceMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const resolvePrivateApiKeyActorUserMock = mock((async () => ({
	userId: "user-1",
	member: {
		id: "member-1",
		userId: "user-1",
	},
	source: "linked_key",
})) as (...args: unknown[]) => Promise<unknown>);

mock.module("@api/utils/validate", () => ({
	safelyExtractRequestData: safelyExtractRequestDataMock,
	safelyExtractRequestQuery: mock(async () => ({})),
	validateResponse: validateResponseMock,
}));

mock.module("@api/db/queries/conversation", () => ({
	getConversationById: getConversationByIdMock,
}));

mock.module("@api/db/queries/conversation-access", () => ({
	canVisitorAccessConversation: canVisitorAccessConversationMock,
	getActiveVisitorForWebsite: getActiveVisitorForWebsiteMock,
	getConversationDeliveryVisitorIds: mock(async () => []),
	getConversationVisibleVisitorIds: mock(async () => []),
	resolveVisitorConversationScope: mock(async () => null),
}));

mock.module("@api/db/queries", () => ({
	getVisitor: getVisitorMock,
}));

mock.module("@api/lib/plans/access", () => ({
	getPlanForWebsite: getPlanForWebsiteMock,
}));

mock.module("@api/lib/private-api-key-actor", () => ({
	resolvePrivateApiKeyActorUser: resolvePrivateApiKeyActorUserMock,
}));

mock.module("@api/lib/translation", () => ({
	detectMessageLanguage: mock(async () => null),
	finalizeConversationTranslation: finalizeConversationTranslationMock,
	isAutomaticTranslationEnabled: isAutomaticTranslationEnabledMock,
	prepareInboundVisitorTranslation: prepareInboundVisitorTranslationMock,
	prepareOutboundVisitorTranslation: prepareOutboundVisitorTranslationMock,
	shouldMaskTypingPreview: mock(() => false),
	syncConversationVisitorTitle: mock(async () => null),
}));

mock.module("@api/utils/timeline-item", () => ({
	createMessageTimelineItem: createMessageTimelineItemMock,
	createTimelineItem: createTimelineItemMock,
	resolveMessageTimelineActor: mock(() => null),
}));

mock.module("@api/utils/participant-helpers", () => ({
	addConversationParticipant: addConversationParticipantMock,
	addConversationParticipants: mock(async () => []),
	getDefaultParticipants: mock(async () => []),
	isUserParticipant: isUserParticipantMock,
}));

mock.module("@api/utils/conversation-events", () => ({
	createParticipantJoinedEvent: createParticipantJoinedEventMock,
}));

mock.module("@api/utils/send-message-with-notification", () => ({
	triggerMessageNotificationWorkflow: triggerMessageNotificationWorkflowMock,
}));

mock.module("@api/db/mutations/conversation", () => ({
	archiveConversation: mock(async () => null),
	joinEscalation: mock(async () => null),
	markConversationAsNotSpam: mock(async () => null),
	markConversationAsRead: mock(async () => ({
		conversation: null,
		lastSeenAt: null,
	})),
	markConversationAsSeen: markConversationAsSeenMock,
	markConversationAsSeenByVisitor: mock(async () => "2026-04-07T12:00:00.000Z"),
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

mock.module("@api/utils/conversation-realtime", () => ({
	emitConversationCreatedEvent: mock(async () => null),
	emitConversationSeenEvent: emitConversationSeenEventMock,
	emitConversationTypingEvent: mock(async () => null),
	emitConversationTranslationUpdate: mock(async () => null),
}));

mock.module("@api/services/presence", () => ({
	markUserPresence: markUserPresenceMock,
	markVisitorPresence: markVisitorPresenceMock,
}));

mock.module("../middleware", () => ({
	protectedPublicApiKeyMiddleware: [],
}));

const messagesRouterModulePromise = import("./messages");

const baseConversation = {
	id: "conv-1",
	websiteId: "site-1",
	organizationId: "org-1",
	visitorId: "visitor-1",
	status: "open",
	deletedAt: null,
	visitorLanguage: null,
};

function createMessagesPostRequest(body: Record<string, unknown>) {
	return new Request("http://localhost/", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
}

describe("messages router POST /", () => {
	beforeEach(() => {
		safelyExtractRequestDataMock.mockReset();
		validateResponseMock.mockReset();
		getConversationByIdMock.mockReset();
		canVisitorAccessConversationMock.mockReset();
		getVisitorMock.mockReset();
		getActiveVisitorForWebsiteMock.mockReset();
		getPlanForWebsiteMock.mockReset();
		isAutomaticTranslationEnabledMock.mockReset();
		prepareInboundVisitorTranslationMock.mockReset();
		prepareOutboundVisitorTranslationMock.mockReset();
		finalizeConversationTranslationMock.mockReset();
		createMessageTimelineItemMock.mockReset();
		createTimelineItemMock.mockReset();
		isUserParticipantMock.mockReset();
		addConversationParticipantMock.mockReset();
		createParticipantJoinedEventMock.mockReset();
		triggerMessageNotificationWorkflowMock.mockReset();
		markConversationAsSeenMock.mockReset();
		emitConversationSeenEventMock.mockReset();
		markUserPresenceMock.mockReset();
		markVisitorPresenceMock.mockReset();
		resolvePrivateApiKeyActorUserMock.mockReset();

		validateResponseMock.mockImplementation((value) => value);
		getConversationByIdMock.mockResolvedValue(baseConversation);
		canVisitorAccessConversationMock.mockImplementation(async (_db, params) => {
			const accessParams = params as {
				viewerVisitorId: string;
				conversationVisitorId: string | null;
			};
			return (
				accessParams.viewerVisitorId === accessParams.conversationVisitorId
			);
		});
		getVisitorMock.mockResolvedValue({
			id: "visitor-1",
			websiteId: "site-1",
		});
		getActiveVisitorForWebsiteMock.mockResolvedValue({
			id: "visitor-1",
			websiteId: "site-1",
			organizationId: "org-1",
			contactId: null,
			language: null,
			deletedAt: null,
		});
		getPlanForWebsiteMock.mockResolvedValue({
			features: { "auto-translate": false },
		});
		isAutomaticTranslationEnabledMock.mockReturnValue(false);
		prepareInboundVisitorTranslationMock.mockResolvedValue({
			visitorLanguage: null,
			translationPart: null,
			translationResult: {
				status: "skipped" as const,
				reason: "missing_language" as const,
				sourceLanguage: null,
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
				targetLanguage: null,
			},
		});
		finalizeConversationTranslationMock.mockResolvedValue({
			status: "noop" as const,
		});
		createMessageTimelineItemMock.mockResolvedValue({
			item: {
				id: "msg-1",
				conversationId: "conv-1",
				organizationId: "org-1",
				type: "message",
				text: "hello",
				parts: [{ type: "text", text: "hello" }],
				visibility: "public",
				userId: null,
				aiAgentId: null,
				visitorId: "visitor-1",
				createdAt: "2026-04-10T08:00:00.000Z",
				deletedAt: null,
				tool: null,
			},
			actor: { type: "visitor", visitorId: "visitor-1" },
		});
		createTimelineItemMock.mockResolvedValue({
			id: "item-1",
			conversationId: "conv-1",
			organizationId: "org-1",
			type: "event",
			text: null,
			parts: [],
			visibility: "public",
			userId: null,
			aiAgentId: null,
			visitorId: "visitor-1",
			createdAt: "2026-04-10T08:00:00.000Z",
			deletedAt: null,
			tool: null,
		});
		isUserParticipantMock.mockResolvedValue(true);
		resolvePrivateApiKeyActorUserMock.mockResolvedValue({
			userId: "user-1",
			member: {
				id: "member-1",
				userId: "user-1",
			},
			source: "linked_key",
		});
	});

	it("returns 400 when item.createdAt is more than 5 minutes in the future", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			apiKey: { keyType: APIKeyType.PRIVATE },
			db: {},
			website: {
				id: "site-1",
				defaultLanguage: "en",
				autoTranslateEnabled: true,
			},
			organization: { id: "org-1" },
			visitorIdHeader: "visitor-1",
			body: {
				conversationId: "conv-1",
				item: {
					type: "message",
					text: "hello",
					parts: [{ type: "text", text: "hello" }],
					visibility: "public",
					visitorId: "visitor-1",
					userId: null,
					aiAgentId: null,
					createdAt: "3026-04-17T10:06:00.000Z",
				},
			},
		});

		const { messagesRouter } = await messagesRouterModulePromise;
		const response = await messagesRouter.request(
			createMessagesPostRequest({
				conversationId: "conv-1",
				item: {
					type: "message",
					text: "hello",
					parts: [{ type: "text", text: "hello" }],
					visibility: "public",
					visitorId: "visitor-1",
					userId: null,
					aiAgentId: null,
					createdAt: "3026-04-17T10:06:00.000Z",
				},
			})
		);
		const payload = (await response.json()) as {
			error: string;
			message: string;
		};

		expect(response.status).toBe(400);
		expect(payload.error).toBe("BAD_REQUEST");
		expect(payload.message).toBe(
			"item.createdAt cannot be more than 5 minutes in the future."
		);
		expect(getConversationByIdMock).not.toHaveBeenCalled();
		expect(createMessageTimelineItemMock).not.toHaveBeenCalled();
	});

	it("returns 400 when public message visitor identifiers mismatch", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			apiKey: { keyType: APIKeyType.PUBLIC },
			db: {},
			website: {
				id: "site-1",
				defaultLanguage: "en",
				autoTranslateEnabled: false,
			},
			organization: { id: "org-1" },
			visitorIdHeader: "visitor-header",
			body: {
				conversationId: "conv-1",
				item: {
					type: "message",
					text: "hello",
					parts: [{ type: "text", text: "hello" }],
					visibility: "public",
					visitorId: "visitor-body",
					userId: null,
					aiAgentId: null,
				},
			},
		});

		const { messagesRouter } = await messagesRouterModulePromise;
		const response = await messagesRouter.request(
			createMessagesPostRequest({
				conversationId: "conv-1",
				item: {
					type: "message",
					text: "hello",
					parts: [{ type: "text", text: "hello" }],
					visibility: "public",
					visitorId: "visitor-body",
					userId: null,
					aiAgentId: null,
				},
			})
		);

		expect(response.status).toBe(400);
		expect(getConversationByIdMock).not.toHaveBeenCalled();
		expect(createMessageTimelineItemMock).not.toHaveBeenCalled();
	});

	it("accepts historical item.createdAt values", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			apiKey: { keyType: APIKeyType.PRIVATE },
			db: {},
			website: {
				id: "site-1",
				defaultLanguage: "en",
				autoTranslateEnabled: true,
			},
			organization: { id: "org-1" },
			visitorIdHeader: "visitor-1",
			body: {
				conversationId: "conv-1",
				item: {
					type: "message",
					text: "hello",
					parts: [{ type: "text", text: "hello" }],
					visibility: "public",
					visitorId: "visitor-1",
					userId: null,
					aiAgentId: null,
					createdAt: "2026-04-10T08:00:00.000Z",
				},
			},
		});

		const { messagesRouter } = await messagesRouterModulePromise;
		const response = await messagesRouter.request(
			createMessagesPostRequest({
				conversationId: "conv-1",
				item: {
					type: "message",
					text: "hello",
					parts: [{ type: "text", text: "hello" }],
					visibility: "public",
					visitorId: "visitor-1",
					userId: null,
					aiAgentId: null,
					createdAt: "2026-04-10T08:00:00.000Z",
				},
			})
		);

		expect(response.status).toBe(200);
		expect(createMessageTimelineItemMock).toHaveBeenCalledWith(
			expect.objectContaining({
				createdAt: new Date("2026-04-10T08:00:00.000Z"),
			})
		);
	});

	it("rejects private user messages when body userId mismatches the resolved actor", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			apiKey: { keyType: APIKeyType.PRIVATE, linkedUserId: "user-1" },
			db: {},
			website: {
				id: "site-1",
				teamId: "team-1",
				defaultLanguage: "en",
				autoTranslateEnabled: false,
			},
			organization: { id: "org-1" },
			visitorIdHeader: null,
			body: {
				conversationId: "conv-1",
				item: {
					type: "message",
					text: "hello",
					parts: [{ type: "text", text: "hello" }],
					visibility: "public",
					userId: "user-2",
					aiAgentId: null,
				},
			},
		});

		const { messagesRouter } = await messagesRouterModulePromise;
		const response = await messagesRouter.request(
			createMessagesPostRequest({
				conversationId: "conv-1",
				item: {
					type: "message",
					text: "hello",
					parts: [{ type: "text", text: "hello" }],
					visibility: "public",
					userId: "user-2",
					aiAgentId: null,
				},
			})
		);
		const payload = (await response.json()) as {
			error: string;
			message: string;
		};

		expect(response.status).toBe(403);
		expect(payload).toEqual({
			error: "FORBIDDEN",
			message: "Body item.userId must match the resolved private API actor",
		});
		expect(resolvePrivateApiKeyActorUserMock).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: "org-1",
				websiteTeamId: "team-1",
				required: true,
			})
		);
		expect(isUserParticipantMock).not.toHaveBeenCalled();
		expect(createMessageTimelineItemMock).not.toHaveBeenCalled();
	});

	it("allows a same-contact public visitor to reply to an old conversation", async () => {
		getConversationByIdMock.mockResolvedValue({
			...baseConversation,
			visitorId: "visitor-1",
		});
		getVisitorMock.mockResolvedValue({
			id: "visitor-2",
			websiteId: "site-1",
		});
		getActiveVisitorForWebsiteMock.mockResolvedValue({
			id: "visitor-2",
			websiteId: "site-1",
			organizationId: "org-1",
			contactId: "contact-1",
			language: null,
			deletedAt: null,
		});
		canVisitorAccessConversationMock.mockResolvedValue(true);
		safelyExtractRequestDataMock.mockResolvedValue({
			apiKey: { keyType: APIKeyType.PUBLIC },
			db: {},
			website: {
				id: "site-1",
				defaultLanguage: "en",
				autoTranslateEnabled: false,
			},
			organization: { id: "org-1" },
			visitorIdHeader: "visitor-2",
			body: {
				conversationId: "conv-1",
				item: {
					type: "message",
					text: "I am back",
					parts: [{ type: "text", text: "I am back" }],
					visibility: "public",
					visitorId: "visitor-2",
					userId: null,
					aiAgentId: null,
				},
			},
		});

		const { messagesRouter } = await messagesRouterModulePromise;
		const response = await messagesRouter.request(
			createMessagesPostRequest({
				conversationId: "conv-1",
				item: {
					type: "message",
					text: "I am back",
					parts: [{ type: "text", text: "I am back" }],
					visibility: "public",
					visitorId: "visitor-2",
					userId: null,
					aiAgentId: null,
				},
			})
		);

		expect(response.status).toBe(200);
		expect(canVisitorAccessConversationMock).toHaveBeenCalledWith(
			{},
			{
				organizationId: "org-1",
				websiteId: "site-1",
				viewerVisitorId: "visitor-2",
				conversationVisitorId: "visitor-1",
			}
		);
		expect(createMessageTimelineItemMock).toHaveBeenCalledWith(
			expect.objectContaining({
				conversationId: "conv-1",
				conversationOwnerVisitorId: "visitor-1",
				visitorId: "visitor-2",
				text: "I am back",
			})
		);
	});

	it("rejects public replies from unrelated visitors", async () => {
		getConversationByIdMock.mockResolvedValue({
			...baseConversation,
			visitorId: "visitor-1",
		});
		getVisitorMock.mockResolvedValue({
			id: "visitor-2",
			websiteId: "site-1",
		});
		getActiveVisitorForWebsiteMock.mockResolvedValue({
			id: "visitor-2",
			websiteId: "site-1",
			organizationId: "org-1",
			contactId: "contact-2",
			language: null,
			deletedAt: null,
		});
		canVisitorAccessConversationMock.mockResolvedValue(false);
		safelyExtractRequestDataMock.mockResolvedValue({
			apiKey: { keyType: APIKeyType.PUBLIC },
			db: {},
			website: {
				id: "site-1",
				defaultLanguage: "en",
				autoTranslateEnabled: false,
			},
			organization: { id: "org-1" },
			visitorIdHeader: "visitor-2",
			body: {
				conversationId: "conv-1",
				item: {
					type: "message",
					text: "nope",
					parts: [{ type: "text", text: "nope" }],
					visibility: "public",
					userId: null,
					aiAgentId: null,
				},
			},
		});

		const { messagesRouter } = await messagesRouterModulePromise;
		const response = await messagesRouter.request(
			createMessagesPostRequest({
				conversationId: "conv-1",
				item: {
					type: "message",
					text: "nope",
					parts: [{ type: "text", text: "nope" }],
					visibility: "public",
					userId: null,
					aiAgentId: null,
				},
			})
		);

		expect(response.status).toBe(403);
		expect(createMessageTimelineItemMock).not.toHaveBeenCalled();
	});
});

afterAll(() => {
	mock.restore();
});
