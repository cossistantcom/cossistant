import { describe, expect, it, mock } from "bun:test";
import type { CreateConversationResponseBody } from "@cossistant/types/api/conversation";
import { ConversationStatus } from "@cossistant/types/enums";
import type { RealtimeEvent } from "@cossistant/types/realtime-events";
import { CossistantClient } from "./client";

const visitorId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

function createCreateConversationResponse(params: {
	conversationId: string;
	visitorId: string;
	messageId: string;
	createdAt: string;
}): CreateConversationResponseBody {
	return {
		conversation: {
			id: params.conversationId,
			title: "New conversation",
			createdAt: params.createdAt,
			updatedAt: params.createdAt,
			visitorId: params.visitorId,
			websiteId: "site_123",
			channel: "widget",
			status: ConversationStatus.OPEN,
			deletedAt: null,
		},
		initialTimelineItems: [
			{
				id: params.messageId,
				conversationId: params.conversationId,
				organizationId: "org_123",
				type: "message",
				text: "Hello",
				parts: [{ type: "text", text: "Hello" }],
				visibility: "public",
				tool: null,
				userId: null,
				visitorId: params.visitorId,
				aiAgentId: null,
				createdAt: params.createdAt,
				deletedAt: null,
			},
		],
	};
}

describe("CossistantClient.isConversationPending", () => {
	it("returns false for null and unknown IDs", () => {
		const client = new CossistantClient({
			apiUrl: "https://api.example.com",
			publicKey: "pk_test",
		});

		expect(client.isConversationPending(null)).toBe(false);
		expect(client.isConversationPending(undefined)).toBe(false);
		expect(client.isConversationPending("conv_unknown")).toBe(false);
	});

	it("returns true after initiateConversation is called", () => {
		const client = new CossistantClient({
			apiUrl: "https://api.example.com",
			publicKey: "pk_test",
		});

		client.setWebsiteContext("site_123", visitorId);
		client.initiateConversation({
			conversationId: "conv_pending",
			visitorId,
			websiteId: "site_123",
		});

		expect(client.isConversationPending("conv_pending")).toBe(true);
	});

	it("returns false after pending conversation is created via sendMessage", async () => {
		const client = new CossistantClient({
			apiUrl: "https://api.example.com",
			publicKey: "pk_test",
		});
		client.setWebsiteContext("site_123", visitorId);

		const originalFetch = globalThis.fetch;
		const createdAt = new Date().toISOString();
		const conversationId = "conv_pending";
		const messageId = "msg_123";

		const fetchMock = mock(async () => {
			const response = createCreateConversationResponse({
				conversationId,
				visitorId,
				messageId,
				createdAt,
			});

			return new Response(JSON.stringify(response), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		});

		globalThis.fetch = fetchMock as typeof fetch;

		try {
			client.initiateConversation({
				conversationId,
				visitorId,
				websiteId: "site_123",
			});
			expect(client.isConversationPending(conversationId)).toBe(true);

			await client.sendMessage({
				conversationId,
				createIfPending: true,
				item: {
					id: messageId,
					text: "Hello",
					type: "message",
					visibility: "public",
					visitorId,
				},
			});

			expect(client.isConversationPending(conversationId)).toBe(false);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("keeps one message copy when server preserves optimistic message id", async () => {
		const client = new CossistantClient({
			apiUrl: "https://api.example.com",
			publicKey: "pk_test",
		});
		client.setWebsiteContext("site_123", visitorId);

		const originalFetch = globalThis.fetch;
		const createdAt = new Date().toISOString();
		const conversationId = "conv_preserved";
		const optimisticMessageId = "msg_client_ulid";

		const fetchMock = mock(async () => {
			const response = createCreateConversationResponse({
				conversationId,
				visitorId,
				messageId: optimisticMessageId,
				createdAt,
			});

			return new Response(JSON.stringify(response), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		});

		globalThis.fetch = fetchMock as typeof fetch;

		try {
			client.initiateConversation({
				conversationId,
				visitorId,
				websiteId: "site_123",
			});

			await client.sendMessage({
				conversationId,
				createIfPending: true,
				item: {
					id: optimisticMessageId,
					text: "Hello",
					type: "message",
					visibility: "public",
					visitorId,
				},
			});

			const timelineState = client.timelineItemsStore.getState();
			const items = timelineState.conversations[conversationId]?.items ?? [];
			const optimisticCopies = items.filter(
				(item) => item.id === optimisticMessageId
			);

			expect(optimisticCopies).toHaveLength(1);
			expect(client.isConversationPending(conversationId)).toBe(false);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("falls back to server items when response ids differ from optimistic id", async () => {
		const client = new CossistantClient({
			apiUrl: "https://api.example.com",
			publicKey: "pk_test",
		});
		client.setWebsiteContext("site_123", visitorId);

		const originalFetch = globalThis.fetch;
		const createdAt = new Date().toISOString();
		const conversationId = "conv_fallback";
		const optimisticMessageId = "msg_client_ulid";
		const serverMessageId = "msg_server_ulid";

		const fetchMock = mock(async () => {
			const response = createCreateConversationResponse({
				conversationId,
				visitorId,
				messageId: serverMessageId,
				createdAt,
			});

			return new Response(JSON.stringify(response), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		});

		globalThis.fetch = fetchMock as typeof fetch;

		try {
			client.initiateConversation({
				conversationId,
				visitorId,
				websiteId: "site_123",
			});

			await client.sendMessage({
				conversationId,
				createIfPending: true,
				item: {
					id: optimisticMessageId,
					text: "Hello",
					type: "message",
					visibility: "public",
					visitorId,
				},
			});

			const timelineState = client.timelineItemsStore.getState();
			const items = timelineState.conversations[conversationId]?.items ?? [];

			expect(items.some((item) => item.id === optimisticMessageId)).toBe(false);
			expect(items.filter((item) => item.id === serverMessageId)).toHaveLength(
				1
			);
			expect(client.isConversationPending(conversationId)).toBe(false);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

describe("CossistantClient realtime activity state", () => {
	it("hydrates feedback-started conversations and their timeline items from realtime", () => {
		const client = new CossistantClient({
			apiUrl: "https://api.example.com",
			publicKey: "pk_test",
		});
		client.setWebsiteContext("site_123", visitorId);

		const feedbackItem = {
			id: "msg-feedback",
			conversationId: "conv-feedback",
			organizationId: "org_123",
			type: "message" as const,
			text: "The drawer closes unexpectedly",
			parts: [
				{ type: "text" as const, text: "The drawer closes unexpectedly" },
				{
					type: "feedback" as const,
					feedbackId: "feedback-1",
					rating: 5,
					topic: "Bug",
					trigger: "dashboard_topbar",
					source: "widget",
				},
			],
			visibility: "public" as const,
			tool: null,
			userId: null,
			visitorId,
			aiAgentId: null,
			createdAt: "2026-03-11T03:00:00.000Z",
			deletedAt: null,
		};

		const conversationCreatedEvent: RealtimeEvent<"conversationCreated"> = {
			type: "conversationCreated",
			payload: {
				websiteId: "site_123",
				organizationId: "org_123",
				visitorId,
				userId: null,
				conversationId: "conv-feedback",
				conversation: {
					id: "conv-feedback",
					title: undefined,
					visitorTitle: null,
					visitorTitleLanguage: null,
					visitorLanguage: null,
					translationActivatedAt: null,
					translationChargedAt: null,
					createdAt: "2026-03-11T03:00:01.000Z",
					updatedAt: "2026-03-11T03:00:01.000Z",
					visitorId,
					websiteId: "site_123",
					channel: "widget",
					status: ConversationStatus.OPEN,
					deletedAt: null,
					lastTimelineItem: feedbackItem,
				},
			},
		};
		const timelineItemCreatedEvent: RealtimeEvent<"timelineItemCreated"> = {
			type: "timelineItemCreated",
			payload: {
				websiteId: "site_123",
				organizationId: "org_123",
				visitorId,
				userId: null,
				conversationId: "conv-feedback",
				item: feedbackItem,
			},
		};

		client.handleRealtimeEvent(timelineItemCreatedEvent);

		expect(
			client.timelineItemsStore.getState().conversations["conv-feedback"]?.items
		).toHaveLength(1);
		expect(
			client.conversationsStore.getState().byId["conv-feedback"]
		).toBeUndefined();

		client.handleRealtimeEvent(conversationCreatedEvent);

		expect(
			client.conversationsStore.getState().byId["conv-feedback"]
				?.lastTimelineItem
		).toMatchObject({
			id: "msg-feedback",
			text: "The drawer closes unexpectedly",
		});
		expect(
			client.timelineItemsStore.getState().conversations["conv-feedback"]?.items
		).toHaveLength(1);
	});

	it("tracks and clears processing progress from realtime events", () => {
		const client = new CossistantClient({
			apiUrl: "https://api.example.com",
			publicKey: "pk_test",
		});
		client.setWebsiteContext("site_123", visitorId);

		const progressEvent: RealtimeEvent<"aiAgentProcessingProgress"> = {
			type: "aiAgentProcessingProgress",
			payload: {
				websiteId: "site_123",
				organizationId: "org_123",
				visitorId,
				userId: null,
				conversationId: "conv-rt",
				aiAgentId: "ai-1",
				workflowRunId: "wf-1",
				phase: "tool",
				message: "Searching knowledge base...",
				tool: {
					toolCallId: "call-1",
					toolName: "searchKnowledgeBase",
					state: "partial",
				},
				audience: "all",
			},
		};

		client.handleRealtimeEvent(progressEvent);

		expect(
			client.processingStore.getState().conversations["conv-rt"]
		).toMatchObject({
			conversationId: "conv-rt",
			workflowRunId: "wf-1",
			message: "Searching knowledge base...",
			tool: {
				toolName: "searchKnowledgeBase",
				state: "partial",
			},
		});

		const completedEvent: RealtimeEvent<"aiAgentProcessingCompleted"> = {
			type: "aiAgentProcessingCompleted",
			payload: {
				websiteId: "site_123",
				organizationId: "org_123",
				visitorId,
				userId: null,
				conversationId: "conv-rt",
				aiAgentId: "ai-1",
				workflowRunId: "wf-1",
				status: "success",
				action: "respond",
				reason: "Sent reply",
				audience: "all",
			},
		};

		client.handleRealtimeEvent(completedEvent);

		expect(
			client.processingStore.getState().conversations["conv-rt"]
		).toBeUndefined();
	});

	it("updates existing tool timeline items from timelineItemUpdated", () => {
		const client = new CossistantClient({
			apiUrl: "https://api.example.com",
			publicKey: "pk_test",
		});
		client.setWebsiteContext("site_123", visitorId);

		const createdEvent: RealtimeEvent<"timelineItemCreated"> = {
			type: "timelineItemCreated",
			payload: {
				websiteId: "site_123",
				organizationId: "org_123",
				visitorId,
				userId: null,
				conversationId: "conv-tools",
				item: {
					id: "tool-1",
					conversationId: "conv-tools",
					organizationId: "org_123",
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
					visibility: "public",
					tool: "searchKnowledgeBase",
					userId: null,
					visitorId: null,
					aiAgentId: "ai-1",
					createdAt: "2026-03-08T10:00:00.000Z",
					deletedAt: null,
				},
			},
		};

		client.handleRealtimeEvent(createdEvent);

		const updatedEvent: RealtimeEvent<"timelineItemUpdated"> = {
			type: "timelineItemUpdated",
			payload: {
				websiteId: "site_123",
				organizationId: "org_123",
				visitorId,
				userId: null,
				conversationId: "conv-tools",
				item: {
					id: "tool-1",
					conversationId: "conv-tools",
					organizationId: "org_123",
					type: "tool",
					text: "Found 2 sources",
					parts: [
						{
							type: "tool-searchKnowledgeBase",
							toolCallId: "call-1",
							toolName: "searchKnowledgeBase",
							input: { query: "pricing" },
							state: "result",
							output: {
								success: true,
								data: { totalFound: 2, articles: [] },
							},
						},
					],
					visibility: "public",
					tool: "searchKnowledgeBase",
					userId: null,
					visitorId: null,
					aiAgentId: "ai-1",
					createdAt: "2026-03-08T10:00:00.000Z",
					deletedAt: null,
				},
			},
		};

		client.handleRealtimeEvent(updatedEvent);

		const items =
			client.timelineItemsStore.getState().conversations["conv-tools"]?.items ??
			[];
		expect(items).toHaveLength(1);
		expect(items[0]?.text).toBe("Found 2 sources");
		expect(items[0]?.parts[0]).toMatchObject({
			state: "result",
		});
	});

	it("clears processing and typing when a public AI message is created", () => {
		const client = new CossistantClient({
			apiUrl: "https://api.example.com",
			publicKey: "pk_test",
		});
		client.setWebsiteContext("site_123", visitorId);

		client.processingStore.upsert({
			conversationId: "conv-clear",
			workflowRunId: "wf-2",
			aiAgentId: "ai-1",
			phase: "tool",
			message: "Searching knowledge base...",
			tool: {
				toolCallId: "call-2",
				toolName: "searchKnowledgeBase",
				state: "partial",
			},
			audience: "all",
		});
		client.typingStore.setTyping({
			conversationId: "conv-clear",
			actorType: "ai_agent",
			actorId: "ai-1",
			isTyping: true,
		});

		const messageEvent: RealtimeEvent<"timelineItemCreated"> = {
			type: "timelineItemCreated",
			payload: {
				websiteId: "site_123",
				organizationId: "org_123",
				visitorId,
				userId: null,
				conversationId: "conv-clear",
				item: {
					id: "msg-ai-1",
					conversationId: "conv-clear",
					organizationId: "org_123",
					type: "message",
					text: "Here is the answer",
					parts: [{ type: "text", text: "Here is the answer" }],
					visibility: "public",
					tool: null,
					userId: null,
					visitorId: null,
					aiAgentId: "ai-1",
					createdAt: "2026-03-08T10:05:00.000Z",
					deletedAt: null,
				},
			},
		};

		client.handleRealtimeEvent(messageEvent);

		expect(
			client.processingStore.getState().conversations["conv-clear"]
		).toBeUndefined();
		expect(
			client.typingStore.getState().conversations["conv-clear"]
		).toBeUndefined();
	});
});
