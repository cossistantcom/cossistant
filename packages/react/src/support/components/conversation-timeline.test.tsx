import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import type { ConversationSeen } from "@plasma/types/schemas";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

type MockTimelineState = {
	groupedMessages: {
		items: unknown[];
		lastReadMessageMap: Map<string, string>;
	};
	seenData: ConversationSeen[];
	processing: {
		message: string | null;
		tool: {
			toolName: string;
			state: "partial" | "result" | "error";
		} | null;
	} | null;
	typingParticipants: Array<{ id: string; type: "team_member" | "ai" }>;
};

const useConversationTimelineMock = mock(() => currentTimelineState);
const useTypingSoundMock = mock(() => {});
const useSupportTextMock = mock(
	() => (key: string) =>
		key === "common.fallbacks.supportTeam" ? "Support team" : key
);

mock.module("../../hooks/use-conversation-timeline", () => ({
	useConversationTimeline: useConversationTimelineMock,
}));

mock.module("../../hooks/use-typing-sound", () => ({
	useTypingSound: useTypingSoundMock,
}));

mock.module("../../primitives/conversation-timeline", () => ({
	ConversationTimeline: ({
		children,
	}: {
		children?:
			| React.ReactNode
			| ((props: { isEmpty: boolean }) => React.ReactNode);
	}) =>
		React.createElement(
			"div",
			{ "data-timeline-shell": "true" },
			typeof children === "function" ? children({ isEmpty: true }) : children
		),
	ConversationTimelineContainer: ({
		children,
	}: {
		children?: React.ReactNode;
	}) =>
		React.createElement("div", { "data-timeline-container": "true" }, children),
}));

mock.module("../text", () => ({
	useSupportText: useSupportTextMock,
}));

mock.module("./typing-indicator", () => ({
	TypingIndicator: ({
		participants,
	}: {
		participants: Array<{ id: string; type: string }>;
	}) =>
		React.createElement("div", {
			"data-typing-indicator": participants
				.map((participant) => `${participant.type}:${participant.id}`)
				.join(","),
		}),
}));

const conversationTimelineModulePromise = import("./conversation-timeline");

let currentTimelineState: MockTimelineState;

function createMessageItem(
	overrides: Partial<TimelineItem> = {}
): TimelineItem {
	return {
		id: "message-1",
		conversationId: "conv-1",
		organizationId: "org-1",
		visibility: "public",
		type: "message",
		text: "Hello",
		parts: [{ type: "text", text: "Hello" }],
		userId: null,
		visitorId: "visitor-1",
		aiAgentId: null,
		createdAt: "2026-03-09T10:00:00.000Z",
		deletedAt: null,
		...overrides,
	};
}

async function renderTimeline({
	availableAIAgents = [],
	availableHumanAgents = [],
}: {
	availableAIAgents?: Array<{ id: string; name: string; image: string | null }>;
	availableHumanAgents?: Array<{
		id: string;
		name: string | null;
		image: string | null;
		lastSeenAt: string | null;
	}>;
} = {}) {
	const { ConversationTimelineList } = await conversationTimelineModulePromise;

	return renderToStaticMarkup(
		React.createElement(ConversationTimelineList, {
			conversationId: "conv-1",
			items: [] satisfies TimelineItem[],
			availableAIAgents,
			availableHumanAgents,
			currentVisitorId: "visitor-1",
		})
	);
}

describe("ConversationTimelineList live activity", () => {
	beforeEach(() => {
		currentTimelineState = {
			groupedMessages: {
				items: [],
				lastReadMessageMap: new Map(),
			},
			seenData: [],
			processing: null,
			typingParticipants: [],
		};

		useConversationTimelineMock.mockClear();
		useTypingSoundMock.mockClear();
		useSupportTextMock.mockClear();
	});

	it("keeps tool activity in the timeline and typing as the last item", async () => {
		currentTimelineState = {
			...currentTimelineState,
			groupedMessages: {
				...currentTimelineState.groupedMessages,
				items: [
					{
						type: "timeline_tool",
						tool: "searchKnowledgeBase",
						item: {
							id: "tool-1",
							conversationId: "conv-1",
							organizationId: "org-1",
							visibility: "public",
							type: "tool",
							text: "Searching knowledge base...",
							parts: [
								{
									type: "tool-searchKnowledgeBase",
									toolCallId: "call-1",
									toolName: "searchKnowledgeBase",
									input: { query: "pricing" },
									state: "partial",
								},
							],
							userId: null,
							visitorId: null,
							aiAgentId: "ai-1",
							createdAt: "2026-03-08T10:00:00.000Z",
							deletedAt: null,
							tool: "searchKnowledgeBase",
						},
					},
				],
			},
			processing: {
				message: "Searching knowledge base...",
				tool: {
					toolName: "searchKnowledgeBase",
					state: "partial",
				},
			},
			typingParticipants: [{ id: "ai-1", type: "ai" }],
		};

		const html = await renderTimeline();

		expect(html).toContain("Searching knowledge base...");
		expect(html).toContain('data-tool-execution-indicator-slot="true"');
		expect(html).toContain('data-typing-indicator="ai:ai-1"');
		expect(html.indexOf("Searching knowledge base...")).toBeLessThan(
			html.indexOf("data-typing-indicator")
		);
		expect(useTypingSoundMock).toHaveBeenCalledWith(true, {
			volume: 1,
			playbackRate: 1.3,
		});
	});

	it("renders the existing typing indicator when only the AI is typing", async () => {
		currentTimelineState = {
			...currentTimelineState,
			typingParticipants: [{ id: "ai-1", type: "ai" }],
		};

		const html = await renderTimeline();

		expect(html).not.toContain("Searching knowledge base...");
		expect(html).toContain('data-typing-indicator="ai:ai-1"');
		expect(useTypingSoundMock).toHaveBeenCalledWith(true, {
			volume: 1,
			playbackRate: 1.3,
		});
	});

	it("does not render the removed processing footer", async () => {
		currentTimelineState = {
			...currentTimelineState,
			processing: {
				message: "Analyzing conversation...",
				tool: {
					toolName: "updateSentiment",
					state: "partial",
				},
			},
		};

		const html = await renderTimeline();

		expect(html).not.toContain("Analyzing conversation...");
		expect(useTypingSoundMock).toHaveBeenCalledWith(false, {
			volume: 1,
			playbackRate: 1.3,
		});
	});

	it("keeps human typing visible when a team member is typing", async () => {
		currentTimelineState = {
			...currentTimelineState,
			typingParticipants: [{ id: "user-1", type: "team_member" }],
		};

		const html = await renderTimeline();

		expect(html).toContain('data-typing-indicator="team_member:user-1"');
		expect(useTypingSoundMock).toHaveBeenCalledWith(true, {
			volume: 1,
			playbackRate: 1.3,
		});
	});

	it("suppresses the terminal arrow for standalone single tool rows", async () => {
		currentTimelineState = {
			...currentTimelineState,
			groupedMessages: {
				...currentTimelineState.groupedMessages,
				items: [
					{
						type: "timeline_tool",
						tool: "searchKnowledgeBase",
						item: {
							id: "tool-standalone",
							conversationId: "conv-1",
							organizationId: "org-1",
							visibility: "public",
							type: "tool",
							text: "Finished knowledge base search",
							parts: [
								{
									type: "tool-searchKnowledgeBase",
									toolCallId: "call-standalone",
									toolName: "searchKnowledgeBase",
									input: { query: "pricing" },
									state: "result",
								},
							],
							userId: null,
							visitorId: null,
							aiAgentId: "ai-1",
							createdAt: "2026-03-08T10:00:00.000Z",
							deletedAt: null,
							tool: "searchKnowledgeBase",
						},
					},
				],
			},
		};

		const html = await renderTimeline();

		expect(html).toContain("Finished knowledge base search");
		expect(html).not.toContain('data-tool-execution-indicator="arrow"');
		expect(html).not.toContain('data-tool-execution-indicator-slot="true"');
	});

	it("suppresses the terminal arrow for single-tool activity groups", async () => {
		currentTimelineState = {
			...currentTimelineState,
			groupedMessages: {
				...currentTimelineState.groupedMessages,
				items: [
					{
						type: "activity_group",
						senderId: "ai-1",
						senderType: "ai",
						items: [
							{
								id: "tool-grouped",
								conversationId: "conv-1",
								organizationId: "org-1",
								visibility: "public",
								type: "tool",
								text: "Finished knowledge base search",
								parts: [
									{
										type: "tool-searchKnowledgeBase",
										toolCallId: "call-grouped",
										toolName: "searchKnowledgeBase",
										input: { query: "pricing" },
										state: "result",
									},
								],
								userId: null,
								visitorId: null,
								aiAgentId: "ai-1",
								createdAt: "2026-03-08T10:00:00.000Z",
								deletedAt: null,
								tool: "searchKnowledgeBase",
							},
						],
						firstItemId: "tool-grouped",
						lastItemId: "tool-grouped",
						firstItemTime: new Date("2026-03-08T10:00:00.000Z"),
						lastItemTime: new Date("2026-03-08T10:00:00.000Z"),
						hasEvent: false,
						hasTool: true,
					},
				],
			},
		};

		const html = await renderTimeline({
			availableAIAgents: [{ id: "ai-1", name: "AI", image: null }],
		});

		expect(html).toContain("Finished knowledge base search");
		expect(html).not.toContain('data-tool-execution-indicator="arrow"');
		expect(html).not.toContain('data-tool-execution-indicator-slot="true"');
	});

	it("renders read receipts when seen state updates without changing conversation props", async () => {
		const visitorMessage = createMessageItem();

		currentTimelineState = {
			...currentTimelineState,
			groupedMessages: {
				...currentTimelineState.groupedMessages,
				items: [
					{
						type: "message_group",
						items: [visitorMessage],
						firstMessageId: visitorMessage.id,
						lastMessageId: visitorMessage.id,
						firstMessageTime: new Date(visitorMessage.createdAt),
						lastMessageTime: new Date(visitorMessage.createdAt),
						senderId: "visitor-1",
						senderType: "visitor",
					},
				],
			},
		};

		const firstHtml = await renderTimeline({
			availableHumanAgents: [
				{
					id: "user-1",
					name: "Alex",
					image: null,
					lastSeenAt: null,
				},
			],
		});

		expect(firstHtml).not.toContain('aria-label="Seen by');

		currentTimelineState = {
			...currentTimelineState,
			groupedMessages: {
				...currentTimelineState.groupedMessages,
				lastReadMessageMap: new Map([
					["user-1", "message-1"],
					["visitor-1", "message-1"],
				]),
			},
			seenData: [
				{
					id: "seen-user-1",
					conversationId: "conv-1",
					userId: "user-1",
					visitorId: null,
					aiAgentId: null,
					lastSeenAt: "2026-03-09T10:30:00.000Z",
					createdAt: "2026-03-09T10:30:00.000Z",
					updatedAt: "2026-03-09T10:30:00.000Z",
					deletedAt: null,
				},
				{
					id: "seen-visitor-1",
					conversationId: "conv-1",
					userId: null,
					visitorId: "visitor-1",
					aiAgentId: null,
					lastSeenAt: "2026-03-09T10:31:00.000Z",
					createdAt: "2026-03-09T10:31:00.000Z",
					updatedAt: "2026-03-09T10:31:00.000Z",
					deletedAt: null,
				},
			],
		};

		const secondHtml = await renderTimeline({
			availableHumanAgents: [
				{
					id: "user-1",
					name: "Alex",
					image: null,
					lastSeenAt: null,
				},
			],
		});

		expect(secondHtml).toContain('title="Seen by Alex');
		expect(secondHtml).not.toContain("visitor-1");
	});
});
