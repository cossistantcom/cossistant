import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
	createTypingStore,
	setTypingState as setStoreTypingState,
	type TypingStore,
} from "@cossistant/core";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
	setTypingState as setSharedTypingState,
	typingStoreSingleton,
} from "../realtime/typing-store";

let currentClient: { typingStore: TypingStore } | null = null;

const useSupportMock = mock(() => ({
	client: currentClient,
}));

mock.module("../provider", () => ({
	useSupport: useSupportMock,
}));

const modulePromise = import("./use-conversation-typing");

function clearSharedTypingStore() {
	for (const conversationId of Object.keys(
		typingStoreSingleton.getState().conversations
	)) {
		typingStoreSingleton.clearConversation(conversationId);
	}
}

async function renderTyping(
	conversationId = "conv-1",
	options: {
		excludeVisitorId?: string | null;
		excludeUserId?: string | null;
		excludeAiAgentId?: string | null;
	} = {}
) {
	const { useConversationTyping } = await modulePromise;
	let result: ReturnType<typeof useConversationTyping> = [];

	function Harness() {
		result = useConversationTyping(conversationId, options);
		return null;
	}

	renderToStaticMarkup(React.createElement(Harness));

	return result;
}

describe("useConversationTyping", () => {
	beforeEach(() => {
		currentClient = null;
		useSupportMock.mockClear();
		clearSharedTypingStore();
	});

	it("falls back to the shared typing store when the provider client is absent", async () => {
		setSharedTypingState({
			conversationId: "conv-1",
			actorType: "visitor",
			actorId: "visitor-1",
			isTyping: true,
			preview: "Hello from the dashboard",
		});

		const entries = await renderTyping();

		expect(entries).toEqual([
			{
				actorType: "visitor",
				actorId: "visitor-1",
				preview: "Hello from the dashboard",
				updatedAt: entries[0]?.updatedAt,
			},
		]);
	});

	it("ignores the current user while keeping visitor and AI typing entries", async () => {
		let now = 0;
		const typingStore = createTypingStore(undefined, {
			now: () => {
				now += 1;
				return now;
			},
		});

		currentClient = { typingStore };

		setStoreTypingState(typingStore, {
			conversationId: "conv-1",
			actorType: "visitor",
			actorId: "visitor-1",
			isTyping: true,
			preview: "I am typing",
		});
		setStoreTypingState(typingStore, {
			conversationId: "conv-1",
			actorType: "user",
			actorId: "user-1",
			isTyping: true,
			preview: null,
		});
		setStoreTypingState(typingStore, {
			conversationId: "conv-1",
			actorType: "ai_agent",
			actorId: "ai-1",
			isTyping: true,
			preview: null,
		});

		const entries = await renderTyping("conv-1", {
			excludeUserId: "user-1",
		});

		expect(
			entries.map((entry) => ({
				actorType: entry.actorType,
				actorId: entry.actorId,
				preview: entry.preview,
			}))
		).toEqual([
			{
				actorType: "visitor",
				actorId: "visitor-1",
				preview: "I am typing",
			},
			{
				actorType: "ai_agent",
				actorId: "ai-1",
				preview: null,
			},
		]);
	});
});
