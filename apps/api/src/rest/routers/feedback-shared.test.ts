import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const createFeedbackMock = mock(
	async (db: unknown, data: Record<string, unknown>) =>
		createFeedbackEntry({
			conversationId:
				typeof data.conversationId === "string" ? data.conversationId : null,
			visitorId: typeof data.visitorId === "string" ? data.visitorId : null,
			contactId: typeof data.contactId === "string" ? data.contactId : null,
			rating: typeof data.rating === "number" ? data.rating : 5,
			topic: typeof data.topic === "string" ? data.topic : null,
			comment: typeof data.comment === "string" ? data.comment : null,
			trigger: typeof data.trigger === "string" ? data.trigger : null,
			source: typeof data.source === "string" ? data.source : "widget",
		})
);
const updateFeedbackConversationIdMock = mock(
	async (_db: unknown, params: { conversationId: string }) =>
		createFeedbackEntry({ conversationId: params.conversationId })
);
const upsertConversationMock = mock(async () => ({
	status: "created" as const,
	conversation: createConversationRecord(),
}));
const getConversationHeaderMock = mock(async () => ({ id: "conv-feedback" }));
const getDefaultParticipantsMock = mock(async () => ["user-owner"]);
const addConversationParticipantsMock = mock(async () => ["participant-1"]);
const createMessageTimelineItemMock = mock(async () => ({
	item: {
		id: "msg-feedback",
		conversationId: "conv-feedback",
		createdAt: "2026-03-11T03:00:00.000Z",
	},
	actor: { type: "visitor" as const, visitorId: "visitor-1" },
}));
const triggerMessageNotificationWorkflowMock = mock(async () => {});
const triggerVisitorSentMessageWorkflowMock = mock(async () => {});
const emitConversationCreatedEventMock = mock(async () => {});
const trackConversationMetricForVisitorMock = mock(async () => {});

function installFeedbackSharedMocks() {
	mock.module("@api/db/queries/feedback", () => ({
		createFeedback: createFeedbackMock,
		updateFeedbackConversationId: updateFeedbackConversationIdMock,
	}));

	mock.module("@api/db/queries/conversation", () => ({
		getConversationHeader: getConversationHeaderMock,
		upsertConversation: upsertConversationMock,
	}));

	mock.module("@api/utils/participant-helpers", () => ({
		addConversationParticipants: addConversationParticipantsMock,
		getDefaultParticipants: getDefaultParticipantsMock,
	}));

	mock.module("@api/utils/timeline-item", () => ({
		createMessageTimelineItem: createMessageTimelineItemMock,
	}));

	mock.module("@api/utils/send-message-with-notification", () => ({
		triggerMessageNotificationWorkflow: triggerMessageNotificationWorkflowMock,
		triggerVisitorSentMessageWorkflow: triggerVisitorSentMessageWorkflowMock,
	}));

	mock.module("@api/utils/conversation-realtime", () => ({
		emitConversationCreatedEvent: emitConversationCreatedEventMock,
	}));

	mock.module("@api/lib/tinybird-sdk", () => ({
		trackConversationMetricForVisitor: trackConversationMetricForVisitorMock,
	}));
}

async function loadFeedbackSharedModule() {
	mock.restore();
	installFeedbackSharedMocks();
	return import(`./feedback-shared?feedback-shared-test=${Math.random()}`);
}

function createFeedbackEntry(overrides: Record<string, unknown> = {}) {
	return {
		id: "feedback-1",
		organizationId: "org-1",
		websiteId: "site-1",
		conversationId: null,
		visitorId: "visitor-1",
		contactId: "contact-1",
		rating: 5,
		topic: "Bug",
		comment: "The drawer closes unexpectedly",
		trigger: "dashboard_topbar",
		source: "widget",
		createdAt: "2026-03-11T03:00:00.000Z",
		updatedAt: "2026-03-11T03:00:00.000Z",
		deletedAt: null,
		...overrides,
	};
}

function createConversationRecord() {
	return {
		id: "conv-feedback",
		organizationId: "org-1",
		websiteId: "site-1",
		visitorId: "visitor-1",
		title: null,
		visitorTitle: null,
		visitorTitleLanguage: null,
		visitorLanguage: null,
		translationActivatedAt: null,
		translationChargedAt: null,
		channel: "widget",
		status: "open",
		createdAt: "2026-03-11T03:00:01.000Z",
		updatedAt: "2026-03-11T03:00:01.000Z",
		deletedAt: null,
	};
}

function createDb() {
	const where = mock(async () => []);
	const set = mock(() => ({ where }));
	const update = mock(() => ({ set }));

	return {
		db: { update },
		update,
		set,
		where,
	};
}

describe("persistFeedbackSubmission", () => {
	beforeEach(() => {
		createFeedbackMock.mockClear();
		updateFeedbackConversationIdMock.mockClear();
		upsertConversationMock.mockClear();
		getConversationHeaderMock.mockClear();
		getDefaultParticipantsMock.mockClear();
		addConversationParticipantsMock.mockClear();
		createMessageTimelineItemMock.mockClear();
		triggerMessageNotificationWorkflowMock.mockClear();
		triggerVisitorSentMessageWorkflowMock.mockClear();
		emitConversationCreatedEventMock.mockClear();
		trackConversationMetricForVisitorMock.mockClear();
	});

	it("creates a conversation, links feedback, creates a timeline item, and notifies participants", async () => {
		const { persistFeedbackSubmission } = await loadFeedbackSharedModule();
		const { db } = createDb();

		const result = await persistFeedbackSubmission({
			db: db as never,
			organizationId: "org-1",
			websiteId: "site-1",
			website: {
				defaultParticipantIds: [],
				organizationId: "org-1",
			},
			visitorId: "visitor-1",
			contactId: "contact-1",
			rating: 5,
			topic: "Bug",
			comment: "The drawer closes unexpectedly",
			trigger: "dashboard_topbar",
			source: "widget",
		});

		expect(result.entry.conversationId).toBe("conv-feedback");
		expect(createFeedbackMock).toHaveBeenCalledWith(
			db,
			expect.objectContaining({ conversationId: undefined })
		);
		expect(upsertConversationMock).toHaveBeenCalledWith(
			db,
			expect.objectContaining({
				organizationId: "org-1",
				websiteId: "site-1",
				visitorId: "visitor-1",
				channel: "widget",
			})
		);
		expect(addConversationParticipantsMock).toHaveBeenCalledWith(
			db,
			expect.objectContaining({
				conversationId: "conv-feedback",
				userIds: ["user-owner"],
				reason: "Default participant",
			})
		);
		expect(updateFeedbackConversationIdMock).toHaveBeenCalledWith(db, {
			id: "feedback-1",
			websiteId: "site-1",
			conversationId: "conv-feedback",
		});
		expect(createMessageTimelineItemMock).toHaveBeenCalledWith(
			expect.objectContaining({
				db,
				conversationId: "conv-feedback",
				conversationOwnerVisitorId: "visitor-1",
				visitorId: "visitor-1",
				text: "The drawer closes unexpectedly",
				createdAt: new Date("2026-03-11T03:00:00.000Z"),
				extraParts: [
					{
						type: "feedback",
						feedbackId: "feedback-1",
						rating: 5,
						topic: "Bug",
						trigger: "dashboard_topbar",
						source: "widget",
					},
				],
			})
		);
		expect(triggerVisitorSentMessageWorkflowMock).toHaveBeenCalledWith({
			conversationId: "conv-feedback",
			messageId: "msg-feedback",
			websiteId: "site-1",
			organizationId: "org-1",
			visitorId: "visitor-1",
		});
		expect(triggerMessageNotificationWorkflowMock).not.toHaveBeenCalled();
		expect(emitConversationCreatedEventMock).toHaveBeenCalledTimes(1);
	});

	it("adds a feedback timeline item to an existing conversation without creating another conversation", async () => {
		const { persistFeedbackSubmission } = await loadFeedbackSharedModule();
		const { db, set } = createDb();

		await persistFeedbackSubmission({
			db: db as never,
			organizationId: "org-1",
			websiteId: "site-1",
			conversationId: "conv-existing",
			visitorId: "visitor-1",
			conversationOwnerVisitorId: "visitor-old",
			rating: 4,
			source: "widget",
		});

		expect(upsertConversationMock).not.toHaveBeenCalled();
		expect(updateFeedbackConversationIdMock).not.toHaveBeenCalled();
		expect(createMessageTimelineItemMock).toHaveBeenCalledWith(
			expect.objectContaining({
				conversationId: "conv-existing",
				conversationOwnerVisitorId: "visitor-old",
				visitorId: "visitor-1",
				text: "left a 4 star review",
				extraParts: [
					expect.objectContaining({
						rating: 4,
					}),
				],
			})
		);
		expect(set).toHaveBeenCalledWith(
			expect.objectContaining({
				lastMessageAt: "2026-03-11T03:00:00.000Z",
				updatedAt: "2026-03-11T03:00:00.000Z",
			})
		);
		expect(emitConversationCreatedEventMock).not.toHaveBeenCalled();
	});

	it("syncs resolved conversation ratings to the feedback timestamp", async () => {
		const { persistFeedbackSubmission } = await loadFeedbackSharedModule();
		const { db, set } = createDb();

		await persistFeedbackSubmission({
			db: db as never,
			organizationId: "org-1",
			websiteId: "site-1",
			conversationId: "conv-existing",
			visitorId: "visitor-1",
			rating: 5,
			source: "widget",
			syncConversationRating: true,
		});

		expect(set).toHaveBeenCalledWith(
			expect.objectContaining({
				visitorRating: 5,
				visitorRatingAt: "2026-03-11T03:00:00.000Z",
				updatedAt: "2026-03-11T03:00:00.000Z",
			})
		);
	});
});

afterAll(() => {
	mock.restore();
});
