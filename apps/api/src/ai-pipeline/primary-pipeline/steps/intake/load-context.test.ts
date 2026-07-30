import { beforeEach, describe, expect, it, mock } from "bun:test";
import * as actualVisitorQueries from "@api/db/queries/visitor";
import type {
	ConversationTranscriptEntry,
	RoleAwareMessage,
	SegmentedConversationEntry,
	SegmentedConversationMessage,
} from "../../contracts";

const getConversationByIdMock = mock(async () => null);
const getMessageMetadataMock = mock(async () => null);
const getCompleteVisitorWithContactMock = mock(async () => null);
type MockTimelineContext = {
	conversationHistory: ConversationTranscriptEntry[];
	decisionMessages: SegmentedConversationMessage[];
	generationEntries: SegmentedConversationEntry[];
	triggerMessage: RoleAwareMessage | null;
	hasLaterHumanMessage: boolean;
	hasLaterAiMessage: boolean;
};

const buildTriggerCenteredTimelineContextMock = mock(
	(async (): Promise<MockTimelineContext> => ({
		conversationHistory: [],
		decisionMessages: [],
		generationEntries: [],
		triggerMessage: null,
		hasLaterHumanMessage: false,
		hasLaterAiMessage: false,
	})) as (...args: unknown[]) => Promise<MockTimelineContext>
);

const whereMock = mock(async () => []);
const fromMock = mock((_table: unknown) => ({ where: whereMock }));
const selectMock = mock((_fields: unknown) => ({ from: fromMock }));

mock.module("@api/db/queries/conversation", () => ({
	getConversationById: getConversationByIdMock,
	getMessageMetadata: getMessageMetadataMock,
}));

// mock.module replaces the whole module, so spread the real exports and
// override only what this test drives. Otherwise any other query the module
// graph imports disappears and linking fails.
mock.module("@api/db/queries/visitor", () => ({
	...actualVisitorQueries,
	getCompleteVisitorWithContact: getCompleteVisitorWithContactMock,
}));

mock.module("./history", () => ({
	buildTriggerCenteredTimelineContext: buildTriggerCenteredTimelineContextMock,
}));

const modulePromise = import("./load-context");

describe("loadIntakeContext", () => {
	beforeEach(() => {
		getConversationByIdMock.mockReset();
		getMessageMetadataMock.mockReset();
		getCompleteVisitorWithContactMock.mockReset();
		buildTriggerCenteredTimelineContextMock.mockReset();
		selectMock.mockReset();
		fromMock.mockReset();
		whereMock.mockReset();

		buildTriggerCenteredTimelineContextMock.mockResolvedValue({
			conversationHistory: [
				{
					messageId: "msg-1",
					content: "Initial question",
					senderType: "visitor",
					senderId: "visitor-1",
					senderName: null,
					timestamp: "2026-03-04T10:00:00.000Z",
					visibility: "public",
				},
				{
					messageId: "msg-2",
					content: "Following up",
					senderType: "visitor",
					senderId: "visitor-1",
					senderName: null,
					timestamp: "2026-03-04T10:00:01.000Z",
					visibility: "public",
				},
				{
					messageId: "msg-3",
					content: "I already answered this publicly.",
					senderType: "human_agent",
					senderId: "user-1",
					senderName: "Support Agent",
					timestamp: "2026-03-04T10:00:02.000Z",
					visibility: "public",
				},
			],
			decisionMessages: [
				{
					messageId: "msg-1",
					content: "Initial question",
					senderType: "visitor",
					senderId: "visitor-1",
					senderName: null,
					timestamp: "2026-03-04T10:00:00.000Z",
					visibility: "public",
					segment: "before_trigger",
				},
				{
					messageId: "msg-2",
					content: "Following up",
					senderType: "visitor",
					senderId: "visitor-1",
					senderName: null,
					timestamp: "2026-03-04T10:00:01.000Z",
					visibility: "public",
					segment: "trigger",
				},
				{
					messageId: "msg-3",
					content: "I already answered this publicly.",
					senderType: "human_agent",
					senderId: "user-1",
					senderName: "Support Agent",
					timestamp: "2026-03-04T10:00:02.000Z",
					visibility: "public",
					segment: "after_trigger",
				},
			],
			generationEntries: [
				{
					messageId: "msg-1",
					content: "Initial question",
					senderType: "visitor",
					senderId: "visitor-1",
					senderName: null,
					timestamp: "2026-03-04T10:00:00.000Z",
					visibility: "public",
					segment: "before_trigger",
				},
				{
					messageId: "msg-2",
					content: "Following up",
					senderType: "visitor",
					senderId: "visitor-1",
					senderName: null,
					timestamp: "2026-03-04T10:00:01.000Z",
					visibility: "public",
					segment: "trigger",
				},
				{
					kind: "tool",
					itemId: "tool-1",
					toolName: "searchKnowledgeBase",
					content:
						'[PRIVATE][TOOL:searchKnowledgeBase] Found 1 relevant source query="follow up"',
					timestamp: "2026-03-04T10:00:01.500Z",
					visibility: "private",
					segment: "after_trigger",
				},
				{
					messageId: "msg-3",
					content: "I already answered this publicly.",
					senderType: "human_agent",
					senderId: "user-1",
					senderName: "Support Agent",
					timestamp: "2026-03-04T10:00:02.000Z",
					visibility: "public",
					segment: "after_trigger",
				},
			],
			triggerMessage: {
				messageId: "msg-2",
				content: "Following up",
				senderType: "visitor",
				senderId: "visitor-1",
				senderName: null,
				timestamp: "2026-03-04T10:00:01.000Z",
				visibility: "public",
			},
			hasLaterHumanMessage: true,
			hasLaterAiMessage: false,
		});
		getCompleteVisitorWithContactMock.mockResolvedValue(null);
		whereMock.mockResolvedValue([]);
		fromMock.mockImplementation((_table: unknown) => ({ where: whereMock }));
		selectMock.mockImplementation((_fields: unknown) => ({ from: fromMock }));
	});

	it("loads trigger-centered context with later-message awareness", async () => {
		const { loadIntakeContext } = await modulePromise;

		const result = await loadIntakeContext(
			{
				// No website record: loadIntakeContext then leaves auto-translate
				// off, which is the behaviour these assertions were written against.
				query: { website: { findFirst: async () => {} } },
				select: selectMock,
			} as never,
			{
				conversationId: "conv-1",
				organizationId: "org-1",
				websiteId: "site-1",
				visitorId: "visitor-1",
				conversation: {
					id: "conv-1",
					organizationId: "org-1",
					websiteId: "site-1",
					visitorId: "visitor-1",
					escalatedAt: null,
					escalationHandledAt: null,
					escalationReason: null,
				} as never,
				triggerMetadata: {
					id: "msg-2",
					createdAt: "2026-03-04T10:00:01.000Z",
					conversationId: "conv-1",
					text: "Following up",
				},
			}
		);

		expect(buildTriggerCenteredTimelineContextMock).toHaveBeenCalledWith(
			expect.anything(),
			{
				conversationId: "conv-1",
				organizationId: "org-1",
				websiteId: "site-1",
				triggerMessageId: "msg-2",
				triggerMessageCreatedAt: "2026-03-04T10:00:01.000Z",
			}
		);
		expect(result.triggerMessage?.messageId).toBe("msg-2");
		expect(result.triggerMessageText).toBe("Following up");
		expect(result.decisionMessages).toHaveLength(3);
		expect(result.generationEntries).toHaveLength(4);
		expect(result.hasLaterHumanMessage).toBe(true);
		expect(result.hasLaterAiMessage).toBe(false);
	});
});
