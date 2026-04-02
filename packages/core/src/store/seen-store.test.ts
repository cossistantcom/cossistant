import { beforeEach, describe, expect, it } from "bun:test";
import type { RealtimeEvent } from "@plasma/types/realtime-events";
import type { ConversationSeen } from "@plasma/types/schemas";
import {
	applyConversationSeenEvent,
	createSeenStore,
	hydrateConversationSeen,
	type SeenStore,
	upsertConversationSeen,
} from "./seen-store";

function createEntry(
	overrides: Partial<ConversationSeen> = {}
): ConversationSeen {
	const base: ConversationSeen = {
		id: "seen-1",
		conversationId: "conv-1",
		userId: "user-1",
		visitorId: null,
		aiAgentId: null,
		lastSeenAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
		createdAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
		updatedAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
		deletedAt: null,
	};

	return { ...base, ...overrides };
}

describe("seen store", () => {
	let store: SeenStore;

	function getEntries(conversationId: string) {
		return store.getState().conversations[conversationId] ?? {};
	}

	beforeEach(() => {
		store = createSeenStore();
	});

	it("upserts new entries and ignores stale timestamps", () => {
		const lastSeen = "2024-01-01T00:00:00.000Z";
		upsertConversationSeen(store, {
			conversationId: "conv-1",
			actorType: "user",
			actorId: "user-1",
			lastSeenAt: lastSeen,
		});

		expect(Object.keys(getEntries("conv-1"))).toHaveLength(1);

		upsertConversationSeen(store, {
			conversationId: "conv-1",
			actorType: "user",
			actorId: "user-1",
			lastSeenAt: "2023-12-31T23:59:59.000Z",
		});

		const entries = getEntries("conv-1");
		expect(Object.keys(entries)).toHaveLength(1);
		const entry = entries["conv-1:user:user-1"];
		const lastSeenDate = new Date(lastSeen);

		expect(new Date(entry?.lastSeenAt || new Date()).getTime()).toBe(
			lastSeenDate.getTime()
		);
	});

	it("hydrates conversations from API payloads", () => {
		const payload: ConversationSeen[] = [
			createEntry({ id: "seen-1", userId: "user-2" }),
			createEntry({
				id: "seen-2",
				userId: null,
				visitorId: "visitor-1",
				updatedAt: new Date("2024-01-01T01:00:00.000Z").toISOString(),
				lastSeenAt: new Date("2024-01-01T01:00:00.000Z").toISOString(),
			}),
		];

		hydrateConversationSeen(store, "conv-1", payload);

		const entries = getEntries("conv-1");
		expect(Object.keys(entries)).toHaveLength(2);
		expect(entries["conv-1:user:user-2"]?.actorType).toBe("user");
		expect(entries["conv-1:visitor:visitor-1"]?.actorType).toBe("visitor");
		expect(entries["conv-1:visitor:visitor-1"]?.lastSeenAt).toBe(
			payload[1]?.lastSeenAt
		);
	});

	it("ignores stale hydrate payloads when state is newer", () => {
		const recent = new Date("2024-01-02T00:00:00.000Z").toISOString();
		const older = new Date("2024-01-01T00:00:00.000Z").toISOString();

		upsertConversationSeen(store, {
			conversationId: "conv-1",
			actorType: "user",
			actorId: "user-1",
			lastSeenAt: recent,
		});

		hydrateConversationSeen(store, "conv-1", [
			createEntry({
				id: "seen-older",
				userId: "user-1",
				lastSeenAt: older,
				updatedAt: older,
			}),
		]);

		const entries = getEntries("conv-1");
		expect(entries["conv-1:user:user-1"]?.lastSeenAt).toBe(recent);
	});

	it("updates entries when hydrate payload is more recent", () => {
		const older = new Date("2024-01-01T00:00:00.000Z").toISOString();
		const newer = new Date("2024-01-03T00:00:00.000Z").toISOString();

		upsertConversationSeen(store, {
			conversationId: "conv-1",
			actorType: "user",
			actorId: "user-1",
			lastSeenAt: older,
		});

		hydrateConversationSeen(store, "conv-1", [
			createEntry({
				id: "seen-newer",
				userId: "user-1",
				lastSeenAt: newer,
				updatedAt: newer,
			}),
		]);

		const entries = getEntries("conv-1");
		expect(entries["conv-1:user:user-1"]?.lastSeenAt).toBe(newer);
	});

	it("ignores hydrate updates when payload has no changes", () => {
		const payload = [createEntry({ id: "seen-3", userId: "user-4" })];

		hydrateConversationSeen(store, "conv-2", payload);

		const initialEntries = store.getState().conversations["conv-2"];

		hydrateConversationSeen(store, "conv-2", payload);

		expect(store.getState().conversations["conv-2"]).toBe(initialEntries);
	});

	it("ignores hydrate payloads without valid actors", () => {
		hydrateConversationSeen(store, "conv-1", [
			createEntry({ userId: null, visitorId: null, aiAgentId: null }),
		]);

		expect(Object.keys(getEntries("conv-1"))).toHaveLength(0);
	});

	it("applies realtime events with ignore filters", () => {
		const event: RealtimeEvent<"conversationSeen"> = {
			type: "conversationSeen",
			payload: {
				websiteId: "site-1",
				organizationId: "org-1",
				conversationId: "conv-1",
				actorType: "visitor",
				actorId: "visitor-1",
				visitorId: "visitor-1",
				userId: null,
				aiAgentId: null,
				lastSeenAt: new Date("2024-01-01T02:00:00.000Z").toISOString(),
			},
		};

		applyConversationSeenEvent(store, event, {
			ignoreVisitorId: "visitor-1",
		});

		expect(Object.keys(getEntries("conv-1"))).toHaveLength(0);

		applyConversationSeenEvent(store, event);

		const entries = getEntries("conv-1");
		expect(Object.keys(entries)).toHaveLength(1);
		expect(entries["conv-1:visitor:visitor-1"]?.actorType).toBe("visitor");
	});

	it("applies realtime events that only include actorType/actorId", () => {
		const event: RealtimeEvent<"conversationSeen"> = {
			type: "conversationSeen",
			payload: {
				websiteId: "site-1",
				organizationId: "org-1",
				conversationId: "conv-1",
				actorType: "user",
				actorId: "user-9",
				visitorId: null,
				userId: null,
				aiAgentId: null,
				lastSeenAt: new Date("2024-01-01T03:00:00.000Z").toISOString(),
			},
		};

		applyConversationSeenEvent(store, event);

		const entries = getEntries("conv-1");
		expect(Object.keys(entries)).toHaveLength(1);
		expect(entries["conv-1:user:user-9"]?.actorType).toBe("user");
	});

	it("resolves AI actor before visitor when actorType is missing", () => {
		const event: RealtimeEvent<"conversationSeen"> = {
			type: "conversationSeen",
			payload: {
				websiteId: "site-1",
				organizationId: "org-1",
				conversationId: "conv-1",
				// Legacy payload path: routing visitorId present, actorType/actorId absent.
				visitorId: "visitor-1",
				userId: null,
				aiAgentId: "ai-1",
				lastSeenAt: new Date("2024-01-01T03:30:00.000Z").toISOString(),
			},
		};

		applyConversationSeenEvent(store, event, {
			ignoreVisitorId: "visitor-1",
		});

		const entries = getEntries("conv-1");
		expect(Object.keys(entries)).toHaveLength(1);
		expect(entries["conv-1:ai_agent:ai-1"]?.actorType).toBe("ai_agent");
	});

	it("still resolves visitor actor when only visitor identity is present", () => {
		const event: RealtimeEvent<"conversationSeen"> = {
			type: "conversationSeen",
			payload: {
				websiteId: "site-1",
				organizationId: "org-1",
				conversationId: "conv-1",
				visitorId: "visitor-only",
				userId: null,
				aiAgentId: null,
				lastSeenAt: new Date("2024-01-01T03:40:00.000Z").toISOString(),
			},
		};

		applyConversationSeenEvent(store, event);

		const entries = getEntries("conv-1");
		expect(Object.keys(entries)).toHaveLength(1);
		expect(entries["conv-1:visitor:visitor-only"]?.actorType).toBe("visitor");
	});

	it("does not ignore non-visitor actors when ignoreVisitorId is set", () => {
		const event: RealtimeEvent<"conversationSeen"> = {
			type: "conversationSeen",
			payload: {
				websiteId: "site-1",
				organizationId: "org-1",
				conversationId: "conv-1",
				actorType: "user",
				actorId: "user-2",
				visitorId: null,
				userId: "user-2",
				aiAgentId: null,
				lastSeenAt: new Date("2024-01-01T04:00:00.000Z").toISOString(),
			},
		};

		applyConversationSeenEvent(store, event, {
			ignoreVisitorId: "visitor-1",
		});

		const entries = getEntries("conv-1");
		expect(Object.keys(entries)).toHaveLength(1);
		expect(entries["conv-1:user:user-2"]?.actorType).toBe("user");
	});

	it("clears conversations", () => {
		upsertConversationSeen(store, {
			conversationId: "conv-1",
			actorType: "user",
			actorId: "user-1",
			lastSeenAt: "2024-01-01T00:00:00.000Z",
		});

		store.clear("conv-1");

		expect(store.getState().conversations["conv-1"]).toBeUndefined();
	});
});
