import { beforeEach, describe, expect, it, mock } from "bun:test";
import { ConversationEventType } from "@cossistant/types/enums";
import type { RealtimeEvent } from "@cossistant/types/realtime-events";
import type { EventContext } from "./router";
import { routeEvent } from "./router";

const sendToWebsite = mock<NonNullable<EventContext["sendToWebsite"]>>();
const sendToVisitor = mock<NonNullable<EventContext["sendToVisitor"]>>();
const sendToConnection = mock<NonNullable<EventContext["sendToConnection"]>>();

describe("routeEvent", () => {
	beforeEach(() => {
		sendToWebsite.mockReset();
		sendToVisitor.mockReset();
		sendToConnection.mockReset();
	});

	it("routes presence updates to website connections", async () => {
		const event: RealtimeEvent<"userPresenceUpdate"> = {
			type: "userPresenceUpdate",
			payload: {
				websiteId: "website-789",
				organizationId: "org-1",
				userId: "user-123",
				visitorId: null,
				status: "online",
				lastSeen: new Date().toISOString(),
			},
		};

		await routeEvent(event, {
			connectionId: "conn-123",
			websiteId: "website-789",
			sendToWebsite,
			sendToVisitor,
			sendToConnection,
		});

		expect(sendToWebsite).toHaveBeenCalledTimes(1);
		expect(sendToWebsite.mock.calls[0]).toEqual([
			"website-789",
			event,
			{ exclude: "conn-123" },
		]);
		expect(sendToVisitor).not.toHaveBeenCalled();
	});

	it("routes visitor events to dashboards", async () => {
		const event: RealtimeEvent<"visitorConnected"> = {
			type: "visitorConnected",
			payload: {
				websiteId: "website-abc",
				organizationId: "org-1",
				visitorId: "visitor-123",
				userId: null,
				connectionId: "conn-456",
			},
		};

		await routeEvent(event, {
			connectionId: "conn-456",
			websiteId: "website-abc",
			sendToWebsite,
			sendToVisitor,
			sendToConnection,
		});

		expect(sendToWebsite).toHaveBeenCalledTimes(1);
		expect(sendToWebsite.mock.calls[0]).toEqual([
			"website-abc",
			event,
			undefined,
		]);
	});

	it("routes visitor presence updates to website connections only", async () => {
		const event: RealtimeEvent<"visitorPresenceUpdate"> = {
			type: "visitorPresenceUpdate",
			payload: {
				websiteId: "website-live",
				organizationId: "org-live",
				visitorId: "visitor-123",
				userId: null,
				sessionId: "session-123",
				activityType: "heartbeat",
				currentPage: {
					url: "https://app.example.com/pricing",
					path: "/pricing",
					title: "Pricing",
					referrerUrl: "https://google.com",
					updatedAt: new Date().toISOString(),
				},
				attribution: null,
			},
		};

		await routeEvent(event, {
			connectionId: "conn-live",
			websiteId: "website-live",
			visitorId: "visitor-123",
			sendToWebsite,
			sendToVisitor,
			sendToConnection,
		});

		expect(sendToWebsite).toHaveBeenCalledTimes(1);
		expect(sendToWebsite.mock.calls[0]).toEqual([
			"website-live",
			event,
			undefined,
		]);
		expect(sendToVisitor).not.toHaveBeenCalled();
	});
});

describe("timelineItemCreated handler", () => {
	beforeEach(() => {
		sendToWebsite.mockReset();
		sendToVisitor.mockReset();
		sendToConnection.mockReset();
	});

	it("forwards timeline items to dashboards and the matching visitor", async () => {
		const event: RealtimeEvent<"timelineItemCreated"> = {
			type: "timelineItemCreated",
			payload: {
				websiteId: "site-1",
				organizationId: "org-1",
				userId: "user-1",
				visitorId: "visitor-1",
				conversationId: "conv-1",
				item: {
					id: "item-1",
					conversationId: "conv-1",
					organizationId: "org-1",
					type: "message",
					text: "hello",
					parts: [{ type: "text", text: "hello" }],
					userId: "user-1",
					aiAgentId: null,
					visitorId: "visitor-1",
					visibility: "public",
					createdAt: new Date().toISOString(),
					deletedAt: null,
				},
			},
		};

		await routeEvent(event, {
			connectionId: "conn-1",
			websiteId: "site-1",
			visitorId: "visitor-1",
			sendToWebsite,
			sendToVisitor,
			sendToConnection,
		});

		expect(sendToWebsite).toHaveBeenCalledTimes(1);
		expect(sendToWebsite.mock.calls[0]).toEqual(["site-1", event]);
		expect(sendToVisitor).toHaveBeenCalledTimes(1);
		expect(sendToVisitor.mock.calls[0]).toEqual(["visitor-1", event]);
	});

	it("fans out contact-scoped timeline items with recipient-targeted payloads", async () => {
		const event: RealtimeEvent<"timelineItemCreated"> = {
			type: "timelineItemCreated",
			payload: {
				websiteId: "site-1",
				organizationId: "org-1",
				userId: "user-1",
				visitorId: "visitor-old",
				conversationId: "conv-1",
				item: {
					id: "item-1",
					conversationId: "conv-1",
					organizationId: "org-1",
					type: "message",
					text: "agent reply",
					parts: [{ type: "text", text: "agent reply" }],
					userId: "user-1",
					aiAgentId: null,
					visitorId: null,
					visibility: "public",
					createdAt: new Date().toISOString(),
					deletedAt: null,
				},
			},
		};

		await routeEvent(event, {
			connectionId: "conn-1",
			websiteId: "site-1",
			visitorId: "visitor-old",
			visitorIds: ["visitor-old", "visitor-new"],
			sendToWebsite,
			sendToVisitor,
			sendToConnection,
		});

		expect(sendToWebsite).toHaveBeenCalledTimes(1);
		expect(sendToWebsite.mock.calls[0]).toEqual(["site-1", event]);
		expect(sendToVisitor).toHaveBeenCalledTimes(2);
		expect(sendToVisitor.mock.calls[0]).toEqual(["visitor-old", event]);
		expect(sendToVisitor.mock.calls[1]?.[0]).toBe("visitor-new");
		expect(sendToVisitor.mock.calls[1]?.[1]).toMatchObject({
			type: "timelineItemCreated",
			payload: {
				visitorId: "visitor-new",
				item: {
					visitorId: null,
				},
			},
		});
	});

	it("falls back to context visitor when timeline item has no visitorId", async () => {
		const event: RealtimeEvent<"timelineItemCreated"> = {
			type: "timelineItemCreated",
			payload: {
				websiteId: "site-ctx",
				organizationId: "org-ctx",
				userId: "user-2",
				visitorId: "visitor-from-context",
				conversationId: "conv-ctx",
				item: {
					id: "item-ctx-1",
					conversationId: "conv-ctx",
					organizationId: "org-ctx",
					type: "message",
					text: "from agent",
					parts: [{ type: "text", text: "from agent" }],
					userId: "user-2",
					aiAgentId: null,
					visitorId: null,
					visibility: "public",
					createdAt: new Date().toISOString(),
					deletedAt: null,
				},
			},
		};

		await routeEvent(event, {
			connectionId: "conn-ctx",
			websiteId: "site-ctx",
			visitorId: "visitor-from-context",
			sendToWebsite,
			sendToVisitor,
			sendToConnection,
		});

		expect(sendToWebsite).toHaveBeenCalledTimes(1);
		expect(sendToVisitor).toHaveBeenCalledTimes(1);
		expect(sendToVisitor.mock.calls[0]).toEqual([
			"visitor-from-context",
			event,
		]);
	});

	it("does not forward private tool timeline items to visitors", async () => {
		const event: RealtimeEvent<"timelineItemCreated"> = {
			type: "timelineItemCreated",
			payload: {
				websiteId: "site-tools",
				organizationId: "org-tools",
				userId: null,
				visitorId: "visitor-tools",
				conversationId: "conv-tools",
				item: {
					id: "tool-private-1",
					conversationId: "conv-tools",
					organizationId: "org-tools",
					type: "tool",
					text: "Running sendMessage",
					parts: [
						{
							type: "tool-sendMessage",
							toolCallId: "call-1",
							toolName: "sendMessage",
							input: { text: "hello" },
							state: "partial",
						},
					],
					userId: null,
					aiAgentId: "ai-1",
					visitorId: "visitor-tools",
					visibility: "private",
					createdAt: new Date().toISOString(),
					deletedAt: null,
					tool: "sendMessage",
				},
			},
		};

		await routeEvent(event, {
			connectionId: "conn-tools",
			websiteId: "site-tools",
			visitorId: "visitor-tools",
			visitorIds: ["visitor-tools", "visitor-linked"],
			sendToWebsite,
			sendToVisitor,
			sendToConnection,
		});

		expect(sendToWebsite).toHaveBeenCalledTimes(1);
		expect(sendToVisitor).toHaveBeenCalledTimes(0);
	});

	it("forwards public tool timeline items to visitors", async () => {
		const event: RealtimeEvent<"timelineItemCreated"> = {
			type: "timelineItemCreated",
			payload: {
				websiteId: "site-tools",
				organizationId: "org-tools",
				userId: null,
				visitorId: "visitor-tools",
				conversationId: "conv-tools",
				item: {
					id: "tool-public-1",
					conversationId: "conv-tools",
					organizationId: "org-tools",
					type: "tool",
					text: "Looking in knowledge base...",
					parts: [
						{
							type: "tool-searchKnowledgeBase",
							toolCallId: "call-2",
							toolName: "searchKnowledgeBase",
							input: { query: "pricing" },
							state: "partial",
						},
					],
					userId: null,
					aiAgentId: "ai-1",
					visitorId: "visitor-tools",
					visibility: "public",
					createdAt: new Date().toISOString(),
					deletedAt: null,
					tool: "searchKnowledgeBase",
				},
			},
		};

		await routeEvent(event, {
			connectionId: "conn-tools",
			websiteId: "site-tools",
			visitorId: "visitor-tools",
			sendToWebsite,
			sendToVisitor,
			sendToConnection,
		});

		expect(sendToWebsite).toHaveBeenCalledTimes(1);
		expect(sendToVisitor).toHaveBeenCalledTimes(1);
		expect(sendToVisitor.mock.calls[0]).toEqual(["visitor-tools", event]);
	});
});

describe("conversationSeen handler", () => {
	beforeEach(() => {
		sendToWebsite.mockReset();
		sendToVisitor.mockReset();
		sendToConnection.mockReset();
	});

	it("broadcasts to dashboards and conversation visitor", async () => {
		const event: RealtimeEvent<"conversationSeen"> = {
			type: "conversationSeen",
			payload: {
				websiteId: "site-seen",
				organizationId: "org-seen",
				conversationId: "conv-seen-1",
				userId: "user-actor",
				visitorId: null,
				aiAgentId: null,
				lastSeenAt: new Date().toISOString(),
				actorType: "user",
				actorId: "user-actor",
			},
		};

		await routeEvent(event, {
			connectionId: "conn-seen",
			websiteId: "site-seen",
			visitorId: "visitor-xyz",
			sendToWebsite,
			sendToVisitor,
			sendToConnection,
		});

		expect(sendToWebsite).toHaveBeenCalledTimes(1);
		expect(sendToWebsite.mock.calls[0]).toEqual(["site-seen", event]);
		expect(sendToVisitor).toHaveBeenCalledTimes(1);
		expect(sendToVisitor.mock.calls[0]).toEqual(["visitor-xyz", event]);
	});

	it("emits to actor visitor when visitor sees conversation", async () => {
		const visitorId = "visitor-actor";
		const event: RealtimeEvent<"conversationSeen"> = {
			type: "conversationSeen",
			payload: {
				websiteId: "site-seen",
				organizationId: "org-seen",
				conversationId: "conv-seen-2",
				userId: null,
				visitorId,
				aiAgentId: null,
				lastSeenAt: new Date().toISOString(),
				actorType: "visitor",
				actorId: visitorId,
			},
		};

		await routeEvent(event, {
			connectionId: "conn-seen",
			websiteId: "site-seen",
			visitorId,
			sendToWebsite,
			sendToVisitor,
			sendToConnection,
		});

		expect(sendToWebsite).toHaveBeenCalledTimes(1);
		expect(sendToVisitor).toHaveBeenCalledTimes(1);
		expect(sendToVisitor.mock.calls[0]).toEqual([visitorId, event]);
	});
});

describe("conversationTyping handler", () => {
	beforeEach(() => {
		sendToWebsite.mockReset();
		sendToVisitor.mockReset();
		sendToConnection.mockReset();
	});

	it("broadcasts typing state to dashboards and visitors", async () => {
		const event: RealtimeEvent<"conversationTyping"> = {
			type: "conversationTyping",
			payload: {
				websiteId: "site-typing",
				organizationId: "org-typing",
				conversationId: "conv-typing",
				userId: "user-123",
				visitorId: null,
				aiAgentId: null,
				isTyping: true,
				visitorPreview: null,
			},
		};

		await routeEvent(event, {
			connectionId: "conn-typing",
			websiteId: "site-typing",
			visitorId: "visitor-owner",
			sendToWebsite,
			sendToVisitor,
			sendToConnection,
		});

		expect(sendToWebsite).toHaveBeenCalledTimes(1);
		expect(sendToWebsite.mock.calls[0]).toEqual(["site-typing", event]);
		expect(sendToVisitor).toHaveBeenCalledTimes(1);
		expect(sendToVisitor.mock.calls[0]).toEqual(["visitor-owner", event]);
	});
});

describe("conversationEventCreated handler", () => {
	beforeEach(() => {
		sendToWebsite.mockReset();
		sendToVisitor.mockReset();
		sendToConnection.mockReset();
	});

	it("broadcasts timeline events to dashboards and visitor", async () => {
		const event: RealtimeEvent<"conversationEventCreated"> = {
			type: "conversationEventCreated",
			payload: {
				websiteId: "site-event",
				organizationId: "org-event",
				conversationId: "conv-event",
				userId: null,
				visitorId: null,
				aiAgentId: null,
				event: {
					id: "evt-1",
					conversationId: "conv-event",
					organizationId: "org-event",
					type: ConversationEventType.STATUS_CHANGED,
					actorUserId: "user-1",
					actorAiAgentId: null,
					targetUserId: null,
					targetAiAgentId: null,
					message: null,
					metadata: null,
					createdAt: "2024-01-01T00:00:00.000Z",
					updatedAt: "2024-01-01T00:00:00.000Z",
					deletedAt: null,
				},
			},
		};

		await routeEvent(event, {
			connectionId: "conn-event",
			websiteId: "site-event",
			visitorId: "visitor-event",
			sendToWebsite,
			sendToVisitor,
			sendToConnection,
		});

		expect(sendToWebsite).toHaveBeenCalledTimes(1);
		expect(sendToWebsite.mock.calls[0]).toEqual(["site-event", event]);
		expect(sendToVisitor).toHaveBeenCalledTimes(1);
		expect(sendToVisitor.mock.calls[0]).toEqual(["visitor-event", event]);
	});
});

describe("conversationCreated handler", () => {
	beforeEach(() => {
		sendToWebsite.mockReset();
		sendToVisitor.mockReset();
		sendToConnection.mockReset();
	});

	it("broadcasts new conversations to dashboards and visitor", async () => {
		const event: RealtimeEvent<"conversationCreated"> = {
			type: "conversationCreated",
			payload: {
				websiteId: "site-created",
				organizationId: "org-created",
				conversationId: "conv-created",
				userId: null,
				visitorId: "visitor-created",
				conversation: {
					id: "conv-created",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					visitorId: "visitor-created",
					websiteId: "site-created",
					channel: "widget",
					status: "open",
					deletedAt: null,
					lastTimelineItem: undefined,
				},
				header: {
					id: "conv-created",
					status: "open",
					priority: "normal",
					prioritySource: null,
					organizationId: "org-created",
					visitorId: "visitor-created",
					visitor: {
						id: "visitor-created",
						lastSeenAt: null,
						blockedAt: null,
						blockedByUserId: null,
						isBlocked: false,
						contact: null,
					},
					websiteId: "site-created",
					channel: "widget",
					title: null,
					titleSource: null,
					sentiment: null,
					sentimentConfidence: null,
					sentimentSource: null,
					resolutionTime: null,
					startedAt: new Date().toISOString(),
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
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null,
					lastMessageAt: null,
					lastSeenAt: null,
					visitorRating: null,
					visitorRatingAt: null,
					lastTimelineItem: null,
					lastMessageTimelineItem: null,
					activeClarification: null,
					viewIds: [],
					seenData: [],
				},
			},
		};

		await routeEvent(event, {
			connectionId: "conn-created",
			websiteId: "site-created",
			sendToWebsite,
			sendToVisitor,
			sendToConnection,
		});

		expect(sendToWebsite).toHaveBeenCalledTimes(1);
		expect(sendToWebsite.mock.calls[0]).toEqual(["site-created", event]);
		expect(sendToVisitor).toHaveBeenCalledTimes(1);
		expect(sendToVisitor.mock.calls[0]).toEqual(["visitor-created", event]);
	});
});

describe("conversationUpdated handler", () => {
	beforeEach(() => {
		sendToWebsite.mockReset();
		sendToVisitor.mockReset();
		sendToConnection.mockReset();
	});

	it("fans out public conversation updates to linked contact visitors once per visitor", async () => {
		const event: RealtimeEvent<"conversationUpdated"> = {
			type: "conversationUpdated",
			payload: {
				websiteId: "site-updated",
				organizationId: "org-updated",
				conversationId: "conv-updated",
				userId: null,
				visitorId: "visitor-old",
				updates: {
					status: "open",
				},
				aiAgentId: null,
			},
		};

		await routeEvent(event, {
			connectionId: "conn-updated",
			websiteId: "site-updated",
			visitorId: "visitor-old",
			visitorIds: ["visitor-old", "visitor-new"],
			sendToWebsite,
			sendToVisitor,
			sendToConnection,
		});

		expect(sendToWebsite).toHaveBeenCalledTimes(1);
		expect(sendToVisitor).toHaveBeenCalledTimes(2);
		expect(sendToVisitor.mock.calls[1]?.[0]).toBe("visitor-new");
		expect(sendToVisitor.mock.calls[1]?.[1]).toMatchObject({
			payload: {
				visitorId: "visitor-new",
			},
		});
	});

	it("keeps ai pause updates private to dashboard connections", async () => {
		const event: RealtimeEvent<"conversationUpdated"> = {
			type: "conversationUpdated",
			payload: {
				websiteId: "site-updated",
				organizationId: "org-updated",
				conversationId: "conv-updated",
				userId: null,
				visitorId: "visitor-updated",
				updates: {
					aiPausedUntil: "2030-01-01T00:00:00.000Z",
				},
				aiAgentId: null,
			},
		};

		await routeEvent(event, {
			connectionId: "conn-updated",
			websiteId: "site-updated",
			visitorId: "visitor-updated",
			sendToWebsite,
			sendToVisitor,
			sendToConnection,
		});

		expect(sendToWebsite).toHaveBeenCalledTimes(1);
		expect(sendToWebsite.mock.calls[0]).toEqual(["site-updated", event]);
		expect(sendToVisitor).toHaveBeenCalledTimes(0);
	});

	it("keeps clarification updates private to dashboard connections", async () => {
		const event: RealtimeEvent<"conversationUpdated"> = {
			type: "conversationUpdated",
			payload: {
				websiteId: "site-updated",
				organizationId: "org-updated",
				conversationId: "conv-updated",
				userId: null,
				visitorId: "visitor-updated",
				updates: {
					activeClarification: {
						requestId: "01JKCLARIFICATION0000000001",
						status: "awaiting_answer",
						topicSummary: "Clarify how credits roll over.",
						engagementMode: "owner",
						linkedConversationCount: 1,
						question: "Do credits survive downgrades?",
						currentSuggestedAnswers: [
							"Yes, always",
							"No, they reset",
							"It depends on the downgrade",
						],
						currentQuestionInputMode: "suggested_answers",
						currentQuestionScope: "narrow_detail",
						stepIndex: 2,
						maxSteps: 5,
						progress: null,
						updatedAt: "2030-01-01T00:00:00.000Z",
					},
				},
				aiAgentId: null,
			},
		};

		await routeEvent(event, {
			connectionId: "conn-updated",
			websiteId: "site-updated",
			visitorId: "visitor-updated",
			sendToWebsite,
			sendToVisitor,
			sendToConnection,
		});

		expect(sendToWebsite).toHaveBeenCalledTimes(1);
		expect(sendToWebsite.mock.calls[0]).toEqual(["site-updated", event]);
		expect(sendToVisitor).toHaveBeenCalledTimes(0);
	});
});
