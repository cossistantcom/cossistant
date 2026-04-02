import { beforeEach, describe, expect, it } from "bun:test";
import type { Conversation } from "@plasma/types";
import type { ListConversationsResponse } from "@plasma/types/api/conversation";
import { CossistantClient } from "../client";
import {
	createConversationsStore,
	getConversationById,
	getConversations,
} from "./conversations-store";

function createMockConversation(
	overrides: Partial<Conversation> = {}
): Conversation {
	const base: Conversation = {
		id: "conv-1",
		title: "Support conversation",
		createdAt: "2024-01-01T00:00:00.000Z",
		updatedAt: "2024-01-01T00:00:00.000Z",
		visitorId: "visitor-1",
		websiteId: "site-1",
		status: "open",
		deletedAt: null,
		lastTimelineItem: undefined,
	};

	const conversation: Conversation = { ...base, ...overrides };
	const defaultLastTimelineItem: Conversation["lastTimelineItem"] = {
		id: "item-1",
		conversationId: conversation.id,
		organizationId: "org-1",
		type: "message",
		text: "Hello",
		parts: [{ type: "text", text: "Hello" }],
		visibility: "public",
		userId: "user-1",
		aiAgentId: null,
		visitorId: conversation.visitorId,
		createdAt: "2024-01-01T00:00:00.000Z",
		deletedAt: null,
	};

	return {
		...conversation,
		lastTimelineItem:
			overrides.lastTimelineItem === undefined
				? defaultLastTimelineItem
				: overrides.lastTimelineItem,
	};
}

function createPagination(
	overrides: Partial<ListConversationsResponse["pagination"]> = {}
): ListConversationsResponse["pagination"] {
	return {
		page: 1,
		limit: 10,
		total: 1,
		totalPages: 1,
		hasMore: false,
		...overrides,
	};
}

function createListResponse(
	conversations: Conversation[],
	overrides: Partial<ListConversationsResponse["pagination"]> = {}
): ListConversationsResponse {
	return {
		conversations,
		pagination: createPagination({ ...overrides, total: conversations.length }),
	};
}

describe("conversations store", () => {
	it("ingests lists and merges conversations", () => {
		const store = createConversationsStore();
		const first = createMockConversation({ id: "conv-a" });
		const second = createMockConversation({ id: "conv-b", title: "Billing" });

		store.ingestList(createListResponse([first, second]));

		let state = store.getState();
		expect(state.ids).toEqual(["conv-a", "conv-b"]);
		expect(state.byId[first.id]).toEqual(first);

		const updatedSecond = createMockConversation({
			id: "conv-b",
			title: "Billing follow-up",
			updatedAt: "2024-01-02T00:00:00.000Z",
		});

		store.ingestList(createListResponse([updatedSecond], { page: 1 }));
		state = store.getState();
		expect(state.byId[updatedSecond.id]).toEqual(updatedSecond);
		expect(state.ids[0]).toBe(updatedSecond.id);
	});

	it("avoids emitting when the payload is identical", () => {
		const store = createConversationsStore();
		const conversation = createMockConversation();
		const payload = createListResponse([conversation]);

		store.ingestList(payload);
		const state = store.getState();
		store.ingestList(payload);
		expect(store.getState()).toBe(state);
	});

	it("ingests single conversations", () => {
		const store = createConversationsStore();
		const conversation = createMockConversation({ id: "conv-new" });

		store.ingestConversation(conversation);

		const state = store.getState();
		expect(state.byId[conversation.id]).toEqual(conversation);
		expect(state.ids).toContain(conversation.id);
	});

	it("exposes selectors for lists and individual conversations", () => {
		const store = createConversationsStore();
		const first = createMockConversation({ id: "conv-1" });
		const second = createMockConversation({ id: "conv-2" });

		store.ingestList(createListResponse([first, second]));

		const conversations = getConversations(store);
		expect(conversations.map((conversation) => conversation.id)).toEqual([
			"conv-1",
			"conv-2",
		]);
		expect(getConversationById(store, "conv-1")).toEqual(first);
		expect(getConversationById(store, "missing")).toBeUndefined();
	});
});

describe("CossistantClient conversation integration", () => {
	const config = {
		apiUrl: "https://api.example.com",
		wsUrl: "wss://api.example.com",
		publicKey: "pk_test",
	} as const;
	let client: CossistantClient;

	beforeEach(() => {
		client = new CossistantClient(config);
	});

	it("updates the store after listing conversations", async () => {
		const conversation = createMockConversation({ id: "conv-list" });
		const response = createListResponse([conversation]);

		// @ts-expect-error test override
		client.restClient = {
			listConversations: async () => response,
		};

		await client.listConversations();

		const state = client.conversationsStore.getState();
		expect(state.byId[conversation.id]).toEqual(conversation);
		expect(state.ids).toContain(conversation.id);
	});

	it("updates the store after fetching a single conversation", async () => {
		const conversation = createMockConversation({ id: "conv-one" });
		const response = { conversation } satisfies { conversation: Conversation };

		// @ts-expect-error test override
		client.restClient = {
			getConversation: async () => response,
		};

		await client.getConversation({ conversationId: conversation.id });

		const stored = client.conversationsStore.getState().byId[conversation.id];
		expect(stored).toEqual(conversation);
	});

	it("updates the store after creating a conversation", async () => {
		const conversation = createMockConversation({ id: "conv-create" });
		const response = { conversation, initialMessages: [] } satisfies {
			conversation: Conversation;
			initialMessages: unknown[];
		};

		// @ts-expect-error test override
		client.restClient = {
			createConversation: async () => response,
		};

		await client.createConversation();

		const stored = client.conversationsStore.getState().byId[conversation.id];
		expect(stored).toEqual(conversation);
	});
});
