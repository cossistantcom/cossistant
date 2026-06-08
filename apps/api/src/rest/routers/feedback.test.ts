import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
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
const getActiveVisitorForWebsiteMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const getConversationByIdWithLastMessageMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const canVisitorAccessConversationMock = mock(
	(async () => false) as (...args: unknown[]) => Promise<boolean>
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
const getFeedbackByIdMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const getFeedbackSummaryMock = mock((async () => ({
	total: 0,
	averageRating: null,
	byRating: [],
	byTopic: [],
	byTrigger: [],
})) as (...args: unknown[]) => Promise<unknown>);
const persistFeedbackSubmissionMock = mock((async () => ({
	entry: null,
	ratedAt: "2026-03-11T03:00:00.000Z",
})) as (...args: unknown[]) => Promise<unknown>);

function installFeedbackRouterMocks() {
	mock.module("@api/utils/validate", () => ({
		safelyExtractRequestData: safelyExtractRequestDataMock,
		safelyExtractRequestQuery: safelyExtractRequestQueryMock,
		validateResponse: validateResponseMock,
	}));

	mock.module("@api/db/queries/visitor", () => ({
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
		getConversationByIdWithLastMessage: getConversationByIdWithLastMessageMock,
	}));

	mock.module("@api/db/queries/feedback", () => ({
		getFeedbackById: getFeedbackByIdMock,
		getFeedbackSummary: getFeedbackSummaryMock,
		listFeedback: listFeedbackMock,
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
		persistFeedbackSubmission: persistFeedbackSubmissionMock,
	}));

	mock.module("../middleware", () => ({
		protectedPublicApiKeyMiddleware: [],
		protectedPrivateApiKeyMiddleware: [],
	}));
}

async function loadFeedbackRouterModule() {
	mock.restore();
	installFeedbackRouterMocks();
	return import(`./feedback?feedback-router-test=${Math.random()}`);
}

function createFeedbackEntry() {
	return {
		id: "feedback-1",
		organizationId: "org-1",
		websiteId: "site-1",
		conversationId: "conv-1",
		visitorId: "visitor-1",
		contactId: "contact-1",
		rating: 5,
		topic: "Bug",
		comment: "The drawer closes unexpectedly",
		trigger: "billing_page",
		source: "widget",
		createdAt: "2026-03-11T03:00:00.000Z",
		updatedAt: "2026-03-11T03:00:00.000Z",
		deletedAt: null,
	};
}

describe("feedback router", () => {
	beforeEach(() => {
		safelyExtractRequestDataMock.mockReset();
		safelyExtractRequestQueryMock.mockReset();
		validateResponseMock.mockReset();
		getVisitorMock.mockReset();
		getActiveVisitorForWebsiteMock.mockReset();
		getConversationByIdWithLastMessageMock.mockReset();
		canVisitorAccessConversationMock.mockReset();
		listFeedbackMock.mockReset();
		getFeedbackByIdMock.mockReset();
		getFeedbackSummaryMock.mockReset();
		persistFeedbackSubmissionMock.mockReset();

		validateResponseMock.mockImplementation((value) => value);
		getActiveVisitorForWebsiteMock.mockResolvedValue({
			id: "visitor-1",
			websiteId: "site-1",
			organizationId: "org-1",
			contactId: "contact-1",
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
		getFeedbackSummaryMock.mockResolvedValue({
			total: 0,
			averageRating: null,
			byRating: [],
			byTopic: [],
			byTrigger: [],
		});
		persistFeedbackSubmissionMock.mockResolvedValue({
			entry: createFeedbackEntry(),
			ratedAt: "2026-03-11T03:00:00.000Z",
		});
	});

	it("returns 400 when a public feedback submission has no valid visitor", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			apiKey: { keyType: APIKeyType.PUBLIC },
			db: {},
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			body: {
				rating: 4,
			},
			visitorIdHeader: undefined,
		});
		getVisitorMock.mockResolvedValue(null);

		const { feedbackRouter } = await loadFeedbackRouterModule();
		const response = await feedbackRouter.request(
			new Request("http://localhost/", {
				method: "POST",
			})
		);

		const payload = (await response.json()) as {
			error: string;
			message: string;
		};

		expect(response.status).toBe(400);
		expect(payload).toEqual({
			error: "BAD_REQUEST",
			message: "Visitor not found, please pass a valid visitorId",
		});
		expect(persistFeedbackSubmissionMock).toHaveBeenCalledTimes(0);
	});

	it("returns 404 when a public feedback submission targets another visitor conversation", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			apiKey: { keyType: APIKeyType.PUBLIC },
			db: {},
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			body: {
				rating: 3,
				conversationId: "conv-1",
			},
			visitorIdHeader: "visitor-1",
		});
		getVisitorMock.mockResolvedValue({
			id: "visitor-1",
			websiteId: "site-1",
			contactId: "contact-1",
		});
		getConversationByIdWithLastMessageMock.mockResolvedValue({
			id: "conv-1",
			visitorId: "visitor-2",
		});

		const { feedbackRouter } = await loadFeedbackRouterModule();
		const response = await feedbackRouter.request(
			new Request("http://localhost/", {
				method: "POST",
			})
		);

		expect(response.status).toBe(404);
		expect(persistFeedbackSubmissionMock).toHaveBeenCalledTimes(0);
	});

	it("allows public feedback on a same-contact old conversation", async () => {
		canVisitorAccessConversationMock.mockResolvedValueOnce(true);
		getActiveVisitorForWebsiteMock.mockResolvedValueOnce({
			id: "visitor-2",
			websiteId: "site-1",
			organizationId: "org-1",
			contactId: "contact-1",
			language: null,
			deletedAt: null,
		});
		safelyExtractRequestDataMock.mockResolvedValue({
			apiKey: { keyType: APIKeyType.PUBLIC },
			db: {},
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			body: {
				rating: 4,
				conversationId: "conv-1",
			},
			visitorIdHeader: "visitor-2",
		});
		getConversationByIdWithLastMessageMock.mockResolvedValue({
			id: "conv-1",
			visitorId: "visitor-1",
		});

		const { feedbackRouter } = await loadFeedbackRouterModule();
		const response = await feedbackRouter.request(
			new Request("http://localhost/", {
				method: "POST",
			})
		);

		const persistedArgs = persistFeedbackSubmissionMock.mock.calls[0]?.[0] as
			| Record<string, unknown>
			| undefined;

		expect(response.status).toBe(201);
		expect(canVisitorAccessConversationMock).toHaveBeenCalledWith(
			{},
			{
				organizationId: "org-1",
				websiteId: "site-1",
				viewerVisitorId: "visitor-2",
				conversationVisitorId: "visitor-1",
			}
		);
		expect(persistedArgs).toMatchObject({
			conversationId: "conv-1",
			visitorId: "visitor-2",
			conversationOwnerVisitorId: "visitor-1",
		});
	});

	it("returns 400 when public feedback visitor identifiers mismatch", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			apiKey: { keyType: APIKeyType.PUBLIC },
			db: {},
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			body: {
				rating: 4,
				visitorId: "visitor-body",
			},
			visitorIdHeader: "visitor-header",
		});

		const { feedbackRouter } = await loadFeedbackRouterModule();
		const response = await feedbackRouter.request(
			new Request("http://localhost/", {
				method: "POST",
			})
		);

		expect(response.status).toBe(400);
		expect(persistFeedbackSubmissionMock).toHaveBeenCalledTimes(0);
	});

	it("persists topic, comment, and trigger for public widget submissions", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			apiKey: { keyType: APIKeyType.PUBLIC },
			db: {},
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			body: {
				rating: 5,
				topic: "Bug",
				comment: "The drawer closes unexpectedly",
				trigger: "billing_page",
				source: "widget",
				conversationId: "conv-1",
			},
			visitorIdHeader: "visitor-1",
		});
		getVisitorMock.mockResolvedValue({
			id: "visitor-1",
			websiteId: "site-1",
			contactId: "contact-1",
		});
		getConversationByIdWithLastMessageMock.mockResolvedValue({
			id: "conv-1",
			visitorId: "visitor-1",
		});

		const { feedbackRouter } = await loadFeedbackRouterModule();
		const response = await feedbackRouter.request(
			new Request("http://localhost/", {
				method: "POST",
			})
		);

		const payload = (await response.json()) as {
			feedback: ReturnType<typeof createFeedbackEntry>;
		};
		const persistedArgs = persistFeedbackSubmissionMock.mock.calls[0]?.[0] as
			| Record<string, unknown>
			| undefined;

		expect(response.status).toBe(201);
		expect(persistedArgs).toMatchObject({
			db: {},
			organizationId: "org-1",
			websiteId: "site-1",
			conversationId: "conv-1",
			visitorId: "visitor-1",
			conversationOwnerVisitorId: "visitor-1",
			contactId: "contact-1",
			rating: 5,
			topic: "Bug",
			comment: "The drawer closes unexpectedly",
			trigger: "billing_page",
			source: "widget",
		});
		expect(payload.feedback.topic).toBe("Bug");
		expect(payload.feedback.trigger).toBe("billing_page");
	});

	it("returns 400 when a private feedback submission has no valid visitor", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			apiKey: { keyType: APIKeyType.PRIVATE },
			db: {},
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			body: {
				rating: 4,
				visitorId: "visitor-missing",
			},
		});
		getVisitorMock.mockResolvedValue(null);

		const { feedbackRouter } = await loadFeedbackRouterModule();
		const response = await feedbackRouter.request(
			new Request("http://localhost/", {
				method: "POST",
			})
		);

		const payload = (await response.json()) as {
			error: string;
			message: string;
		};

		expect(response.status).toBe(400);
		expect(payload).toEqual({
			error: "BAD_REQUEST",
			message: "Visitor not found, please pass a valid visitorId",
		});
		expect(persistFeedbackSubmissionMock).toHaveBeenCalledTimes(0);
	});

	it("returns 400 when a private feedback visitor does not match the conversation", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			apiKey: { keyType: APIKeyType.PRIVATE },
			db: {},
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			body: {
				rating: 4,
				conversationId: "conv-1",
				visitorId: "visitor-2",
			},
		});
		getVisitorMock.mockResolvedValue({
			id: "visitor-2",
			websiteId: "site-1",
			contactId: "contact-2",
		});
		getConversationByIdWithLastMessageMock.mockResolvedValue({
			id: "conv-1",
			visitorId: "visitor-1",
		});

		const { feedbackRouter } = await loadFeedbackRouterModule();
		const response = await feedbackRouter.request(
			new Request("http://localhost/", {
				method: "POST",
			})
		);

		const payload = (await response.json()) as {
			error: string;
			message: string;
		};

		expect(response.status).toBe(400);
		expect(payload).toEqual({
			error: "BAD_REQUEST",
			message: "Visitor does not match conversation",
		});
		expect(persistFeedbackSubmissionMock).toHaveBeenCalledTimes(0);
	});

	it("returns 404 when a private feedback submission targets an unknown conversation", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			apiKey: { keyType: APIKeyType.PRIVATE },
			db: {},
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			body: {
				rating: 4,
				conversationId: "conv-missing",
			},
		});
		getConversationByIdWithLastMessageMock.mockResolvedValue(null);

		const { feedbackRouter } = await loadFeedbackRouterModule();
		const response = await feedbackRouter.request(
			new Request("http://localhost/", {
				method: "POST",
			})
		);

		expect(response.status).toBe(404);
		expect(persistFeedbackSubmissionMock).toHaveBeenCalledTimes(0);
	});

	it("uses the conversation visitor for private feedback linked to a conversation", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			apiKey: { keyType: APIKeyType.PRIVATE },
			db: {},
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			body: {
				rating: 5,
				conversationId: "conv-1",
				contactId: "contact-from-body",
			},
		});
		getConversationByIdWithLastMessageMock.mockResolvedValue({
			id: "conv-1",
			visitorId: "visitor-1",
		});
		getVisitorMock.mockResolvedValue({
			id: "visitor-1",
			websiteId: "site-1",
			contactId: "contact-1",
		});

		const { feedbackRouter } = await loadFeedbackRouterModule();
		const response = await feedbackRouter.request(
			new Request("http://localhost/", {
				method: "POST",
			})
		);

		const persistedArgs = persistFeedbackSubmissionMock.mock.calls[0]?.[0] as
			| Record<string, unknown>
			| undefined;

		expect(response.status).toBe(201);
		expect(persistedArgs).toMatchObject({
			conversationId: "conv-1",
			visitorId: "visitor-1",
			contactId: "contact-1",
		});
	});

	it("lists feedback including topic data on the private read route", async () => {
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			website: { id: "site-1", organizationId: "org-1" },
			query: {
				trigger: "billing_page",
				source: "widget",
				conversationId: "conv-1",
				visitorId: "visitor-1",
				contactId: "contact-1",
				topic: "Bug",
				rating: 5,
				createdAtFrom: "2026-03-01T00:00:00.000Z",
				createdAtTo: "2026-04-01T00:00:00.000Z",
				order: "asc",
				page: 2,
				limit: 1,
			},
		});
		listFeedbackMock.mockResolvedValue({
			items: [createFeedbackEntry()],
			pagination: {
				page: 2,
				limit: 1,
				total: 1,
				totalPages: 1,
				hasMore: false,
			},
		});

		const { feedbackRouter } = await loadFeedbackRouterModule();
		const response = await feedbackRouter.request(
			new Request("http://localhost/?page=2&limit=1", {
				method: "GET",
			})
		);

		const payload = (await response.json()) as {
			feedback: ReturnType<typeof createFeedbackEntry>[];
			pagination: Record<string, number | boolean>;
		};

		expect(response.status).toBe(200);
		expect(listFeedbackMock).toHaveBeenCalledWith(
			{},
			{
				organizationId: "org-1",
				websiteId: "site-1",
				trigger: "billing_page",
				source: "widget",
				conversationId: "conv-1",
				visitorId: "visitor-1",
				contactId: "contact-1",
				topic: "Bug",
				rating: 5,
				createdAtFrom: "2026-03-01T00:00:00.000Z",
				createdAtTo: "2026-04-01T00:00:00.000Z",
				order: "asc",
				page: 2,
				limit: 1,
			}
		);
		expect(payload.feedback[0]?.topic).toBe("Bug");
		expect(payload.pagination).toMatchObject({
			page: 2,
			limit: 1,
			total: 1,
			totalPages: 1,
			hasMore: false,
		});
	});

	it("summarizes feedback with private filters", async () => {
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			website: { id: "site-1", organizationId: "org-1" },
			query: {
				contactId: "contact-1",
				topic: "Bug",
				rating: 5,
				createdAtFrom: "2026-03-01T00:00:00.000Z",
				createdAtTo: "2026-04-01T00:00:00.000Z",
			},
		});
		getFeedbackSummaryMock.mockResolvedValue({
			total: 3,
			averageRating: 4.33,
			byRating: [{ rating: 5, count: 2 }],
			byTopic: [{ topic: "Bug", count: 3 }],
			byTrigger: [{ trigger: "billing_page", count: 3 }],
		});

		const { feedbackRouter } = await loadFeedbackRouterModule();
		const response = await feedbackRouter.request(
			new Request("http://localhost/summary", {
				method: "GET",
			})
		);
		const payload = (await response.json()) as {
			total: number;
			averageRating: number;
		};

		expect(response.status).toBe(200);
		expect(getFeedbackSummaryMock).toHaveBeenCalledWith(
			{},
			{
				organizationId: "org-1",
				websiteId: "site-1",
				trigger: undefined,
				source: undefined,
				conversationId: undefined,
				visitorId: undefined,
				contactId: "contact-1",
				topic: "Bug",
				rating: 5,
				createdAtFrom: "2026-03-01T00:00:00.000Z",
				createdAtTo: "2026-04-01T00:00:00.000Z",
			}
		);
		expect(payload.total).toBe(3);
		expect(payload.averageRating).toBe(4.33);
	});
});

afterAll(() => {
	mock.restore();
});
