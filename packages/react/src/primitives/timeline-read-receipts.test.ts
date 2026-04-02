import { describe, expect, it } from "bun:test";
import type { ConversationSeen } from "@plasma/types/schemas";
import {
	getTimelineLastReaderIds,
	resolveTimelineReadReceiptReaders,
} from "./timeline-read-receipts";

function createSeen(
	overrides: Partial<ConversationSeen> = {}
): ConversationSeen {
	return {
		id: "seen-1",
		conversationId: "conv-1",
		userId: "user-1",
		visitorId: null,
		aiAgentId: null,
		lastSeenAt: "2026-03-09T10:00:00.000Z",
		createdAt: "2026-03-09T10:00:00.000Z",
		updatedAt: "2026-03-09T10:00:00.000Z",
		deletedAt: null,
		...overrides,
	};
}

describe("timeline read receipts", () => {
	it("collects last reader ids for a specific message", () => {
		const lastReaderIds = getTimelineLastReaderIds(
			"message-2",
			new Map([
				["user-1", "message-2"],
				["ai-1", "message-2"],
				["visitor-1", "message-1"],
			])
		);

		expect(lastReaderIds).toEqual(["user-1", "ai-1"]);
	});

	it("filters the current viewer and sender ids, dedupes readers, and keeps latest seen metadata", () => {
		const result = resolveTimelineReadReceiptReaders({
			itemId: "message-2",
			lastReadItemIds: new Map([
				["user-1", "message-2"],
				["user-1", "message-2"],
				["ai-1", "message-2"],
				["visitor-1", "message-2"],
			]),
			seenData: [
				createSeen({
					id: "seen-user-old",
					lastSeenAt: "2026-03-09T09:00:00.000Z",
				}),
				createSeen({
					id: "seen-user-new",
					lastSeenAt: "2026-03-09T11:00:00.000Z",
				}),
				createSeen({
					id: "seen-ai",
					userId: null,
					aiAgentId: "ai-1",
					lastSeenAt: "2026-03-09T11:30:00.000Z",
				}),
				createSeen({
					id: "seen-visitor",
					userId: null,
					visitorId: "visitor-1",
					lastSeenAt: "2026-03-09T11:45:00.000Z",
				}),
			],
			currentViewerId: "visitor-1",
			senderIds: ["user-1"],
			resolveParticipant: ({ actorType, id, lastSeenAt }) => ({
				actorType,
				id,
				lastSeenAt,
			}),
		});

		expect(result.lastReaderIds).toEqual(["user-1", "ai-1", "visitor-1"]);
		expect(result.readers).toEqual([
			{
				id: "ai-1",
				actorType: "ai_agent",
				lastSeenAt: "2026-03-09T11:30:00.000Z",
				participant: {
					actorType: "ai_agent",
					id: "ai-1",
					lastSeenAt: "2026-03-09T11:30:00.000Z",
				},
			},
		]);
	});

	it("supports mixed actor types through the shared resolver", () => {
		const result = resolveTimelineReadReceiptReaders({
			itemId: "message-3",
			lastReadItemIds: new Map([
				["user-1", "message-3"],
				["ai-1", "message-3"],
				["visitor-2", "message-3"],
			]),
			seenData: [
				createSeen(),
				createSeen({
					id: "seen-ai",
					userId: null,
					aiAgentId: "ai-1",
				}),
				createSeen({
					id: "seen-visitor",
					userId: null,
					visitorId: "visitor-2",
				}),
			],
			resolveParticipant: ({ actorType, id }) => `${actorType}:${id}`,
		});

		expect(result.readers).toEqual([
			{
				id: "user-1",
				actorType: "user",
				lastSeenAt: "2026-03-09T10:00:00.000Z",
				participant: "user:user-1",
			},
			{
				id: "ai-1",
				actorType: "ai_agent",
				lastSeenAt: "2026-03-09T10:00:00.000Z",
				participant: "ai_agent:ai-1",
			},
			{
				id: "visitor-2",
				actorType: "visitor",
				lastSeenAt: "2026-03-09T10:00:00.000Z",
				participant: "visitor:visitor-2",
			},
		]);
	});
});
