import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ConversationRecord } from "./conversation";

const createConversationEventMock = mock(async () => null);
const createTimelineItemMock = mock(async () => null);

mock.module("@api/utils/conversation-event", () => ({
	createConversationEvent: createConversationEventMock,
}));

mock.module("@api/utils/timeline-item", () => ({
	createTimelineItem: createTimelineItemMock,
}));

const conversationMutationsModulePromise = import("./conversation");

type ConversationRow = ConversationRecord;

function buildConversationRow(
	overrides: Partial<ConversationRow> = {}
): ConversationRow {
	return {
		id: "conv-1",
		status: "open",
		priority: "normal",
		prioritySource: null,
		organizationId: "org-1",
		visitorId: "visitor-1",
		websiteId: "site-1",
		sentiment: null,
		sentimentConfidence: null,
		sentimentSource: null,
		channel: "widget",
		title: null,
		visitorTitle: null,
		visitorTitleLanguage: null,
		visitorLanguage: null,
		metadata: null,
		titleSource: null,
		translationActivatedAt: null,
		translationChargedAt: null,
		resolutionTime: null,
		visitorRating: null,
		visitorRatingAt: null,
		startedAt: null,
		firstResponseAt: null,
		resolvedAt: null,
		lastMessageAt: null,
		lastMessageBy: null,
		resolvedByUserId: null,
		resolvedByAiAgentId: null,
		escalatedAt: null,
		escalatedByAiAgentId: null,
		escalationReason: null,
		escalationHandledAt: null,
		escalationHandledByUserId: null,
		aiPausedUntil: null,
		aiAgentLastProcessedMessageId: null,
		aiAgentLastProcessedMessageCreatedAt: null,
		createdAt: "2026-04-10T00:00:00.000Z",
		updatedAt: "2026-04-10T00:00:00.000Z",
		deletedAt: null,
		...overrides,
	};
}

function createDbHarness(updatedRow: ConversationRow | null) {
	const returningMock = mock(async () =>
		updatedRow ? ([updatedRow] as unknown as Record<string, unknown>[]) : []
	);
	const whereMock = mock(() => ({
		returning: returningMock,
	}));
	const setMock = mock(() => ({
		where: whereMock,
	}));
	const updateMock = mock(() => ({
		set: setMock,
	}));

	return {
		db: {
			update: updateMock,
		},
		updateMock,
		setMock,
	};
}

beforeEach(() => {
	createConversationEventMock.mockReset();
	createTimelineItemMock.mockReset();
	createConversationEventMock.mockResolvedValue(null);
	createTimelineItemMock.mockResolvedValue(null);
});

describe("mergeConversationMetadata", () => {
	it("merges metadata into an empty conversation metadata object", async () => {
		const updated = buildConversationRow({
			metadata: {
				orderId: "ord_123",
				priority: "vip",
				mrr: 299,
			},
		});
		const harness = createDbHarness(updated);
		const { mergeConversationMetadata } =
			await conversationMutationsModulePromise;

		const result = await mergeConversationMetadata(harness.db as never, {
			conversation: buildConversationRow(),
			metadata: {
				orderId: "ord_123",
				priority: "vip",
				mrr: 299,
			},
		});

		expect(harness.setMock).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: {
					orderId: "ord_123",
					priority: "vip",
					mrr: 299,
				},
				updatedAt: expect.any(String),
			})
		);
		expect(result).toEqual(updated);
	});

	it("preserves existing keys while overwriting provided keys", async () => {
		const updated = buildConversationRow({
			metadata: {
				orderId: "ord_123",
				priority: "vip",
				segment: "enterprise",
				flagged: null,
			},
		});
		const harness = createDbHarness(updated);
		const { mergeConversationMetadata } =
			await conversationMutationsModulePromise;

		await mergeConversationMetadata(harness.db as never, {
			conversation: buildConversationRow({
				metadata: {
					orderId: "ord_123",
					priority: "standard",
					segment: "enterprise",
				},
			}),
			metadata: {
				priority: "vip",
				flagged: null,
			},
		});

		expect(harness.setMock).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: {
					orderId: "ord_123",
					priority: "vip",
					segment: "enterprise",
					flagged: null,
				},
				updatedAt: expect.any(String),
			})
		);
	});
});

describe("manual conversation metadata ownership", () => {
	it("lets same-value priority updates claim user ownership", async () => {
		const updated = buildConversationRow({
			priority: "normal",
			prioritySource: "user",
		});
		const harness = createDbHarness(updated);
		const { updateConversationPriority } =
			await conversationMutationsModulePromise;

		const result = await updateConversationPriority(harness.db as never, {
			conversation: buildConversationRow({
				priority: "normal",
				prioritySource: null,
			}),
			priority: "normal",
			actorUserId: "user-1",
		});

		expect(harness.setMock).toHaveBeenCalledWith(
			expect.objectContaining({
				priority: "normal",
				prioritySource: "user",
				updatedAt: expect.any(String),
			})
		);
		expect(createConversationEventMock).toHaveBeenCalledTimes(1);
		expect(result).toEqual(updated);
	});

	it("lets same-value sentiment updates claim user ownership and clear confidence", async () => {
		const updated = buildConversationRow({
			sentiment: "neutral",
			sentimentConfidence: null,
			sentimentSource: "user",
		});
		const harness = createDbHarness(updated);
		const { updateConversationSentiment } =
			await conversationMutationsModulePromise;

		const result = await updateConversationSentiment(harness.db as never, {
			conversation: buildConversationRow({
				sentiment: "neutral",
				sentimentConfidence: 0.9,
				sentimentSource: null,
			}),
			sentiment: "neutral",
			actorUserId: "user-1",
		});

		expect(harness.setMock).toHaveBeenCalledWith(
			expect.objectContaining({
				sentiment: "neutral",
				sentimentConfidence: null,
				sentimentSource: "user",
				updatedAt: expect.any(String),
			})
		);
		expect(createTimelineItemMock).toHaveBeenCalledTimes(1);
		expect(result).toEqual(updated);
	});

	it("does not rewrite priority when the same value is already user-owned", async () => {
		const existing = buildConversationRow({
			priority: "high",
			prioritySource: "user",
		});
		const harness = createDbHarness(buildConversationRow());
		const { updateConversationPriority } =
			await conversationMutationsModulePromise;

		const result = await updateConversationPriority(harness.db as never, {
			conversation: existing,
			priority: "high",
			actorUserId: "user-1",
		});

		expect(harness.updateMock).not.toHaveBeenCalled();
		expect(createConversationEventMock).not.toHaveBeenCalled();
		expect(result).toEqual(existing);
	});

	it("does not rewrite sentiment when the same unknown value is already user-owned", async () => {
		const existing = buildConversationRow({
			sentiment: null,
			sentimentConfidence: null,
			sentimentSource: "user",
		});
		const harness = createDbHarness(buildConversationRow());
		const { updateConversationSentiment } =
			await conversationMutationsModulePromise;

		const result = await updateConversationSentiment(harness.db as never, {
			conversation: existing,
			sentiment: null,
			actorUserId: "user-1",
		});

		expect(harness.updateMock).not.toHaveBeenCalled();
		expect(createTimelineItemMock).not.toHaveBeenCalled();
		expect(result).toEqual(existing);
	});
});
