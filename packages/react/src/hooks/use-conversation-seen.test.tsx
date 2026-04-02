import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
	applyConversationSeenEvent,
	createSeenStore,
	hydrateConversationSeen,
	type SeenStore,
} from "@plasma/core";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const useSupportMock = mock(() => ({
	client: {
		seenStore: currentStore,
	},
}));

mock.module("../provider", () => ({
	useSupport: useSupportMock,
}));

const useConversationSeenModulePromise = import("./use-conversation-seen");

let currentStore: SeenStore;

async function renderSeen(conversationId = "conv-1") {
	const { useConversationSeen } = await useConversationSeenModulePromise;
	let result: ReturnType<typeof useConversationSeen> = [];

	function Harness() {
		result = useConversationSeen(conversationId);
		return null;
	}

	renderToStaticMarkup(React.createElement(Harness));

	return result;
}

describe("useConversationSeen", () => {
	beforeEach(() => {
		currentStore = createSeenStore();
		useSupportMock.mockClear();
	});

	it("reflects hydrated seen state without changing the conversation id", async () => {
		expect(await renderSeen()).toEqual([]);

		hydrateConversationSeen(currentStore, "conv-1", [
			{
				id: "seen-1",
				conversationId: "conv-1",
				userId: "user-1",
				visitorId: null,
				aiAgentId: null,
				lastSeenAt: "2026-03-09T10:00:00.000Z",
				createdAt: "2026-03-09T10:00:00.000Z",
				updatedAt: "2026-03-09T10:00:00.000Z",
				deletedAt: null,
			},
		]);

		expect(await renderSeen()).toEqual([
			{
				id: "conv-1-user-user-1",
				conversationId: "conv-1",
				userId: "user-1",
				visitorId: null,
				aiAgentId: null,
				lastSeenAt: "2026-03-09T10:00:00.000Z",
				createdAt: "2026-03-09T10:00:00.000Z",
				updatedAt: "2026-03-09T10:00:00.000Z",
				deletedAt: null,
			},
		]);
	});

	it("surfaces realtime user reads and ignores visitor self-seen updates", async () => {
		applyConversationSeenEvent(currentStore, {
			type: "conversationSeen",
			payload: {
				websiteId: "website-1",
				organizationId: "org-1",
				conversationId: "conv-1",
				actorType: "user",
				actorId: "user-1",
				userId: "user-1",
				visitorId: null,
				aiAgentId: null,
				lastSeenAt: "2026-03-09T11:00:00.000Z",
			},
		});

		applyConversationSeenEvent(
			currentStore,
			{
				type: "conversationSeen",
				payload: {
					websiteId: "website-1",
					organizationId: "org-1",
					conversationId: "conv-1",
					actorType: "visitor",
					actorId: "visitor-1",
					userId: null,
					visitorId: "visitor-1",
					aiAgentId: null,
					lastSeenAt: "2026-03-09T11:05:00.000Z",
				},
			},
			{ ignoreVisitorId: "visitor-1" }
		);

		expect(await renderSeen()).toEqual([
			{
				id: "conv-1-user-user-1",
				conversationId: "conv-1",
				userId: "user-1",
				visitorId: null,
				aiAgentId: null,
				lastSeenAt: "2026-03-09T11:00:00.000Z",
				createdAt: "2026-03-09T11:00:00.000Z",
				updatedAt: "2026-03-09T11:00:00.000Z",
				deletedAt: null,
			},
		]);
	});
});
