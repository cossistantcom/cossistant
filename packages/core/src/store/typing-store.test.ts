import { beforeEach, describe, expect, it } from "bun:test";
import type { RealtimeEvent } from "@plasma/types/realtime-events";
import {
	applyConversationTypingEvent,
	clearTypingFromTimelineItem,
	clearTypingState,
	createTypingStore,
	setTypingState,
	type TypingEntry,
	type TypingStore,
} from "./typing-store";

type FakeTimerHandle = number;

type ScheduledTimer = {
	callback: () => void;
	triggerAt: number;
};

function createFakeTimers() {
	let now = 0;
	let id = 0;
	const timers = new Map<FakeTimerHandle, ScheduledTimer>();

	const schedule = (callback: () => void, delay: number) => {
		const handle = ++id;
		timers.set(handle, {
			callback,
			triggerAt: now + delay,
		});
		return handle;
	};

	const clear = (handle: FakeTimerHandle | unknown) => {
		timers.delete(handle as FakeTimerHandle);
	};

	const advance = (ms: number) => {
		now += ms;
		const due = Array.from(timers.entries()).filter(
			([, timer]) => timer.triggerAt <= now
		);

		for (const [handle, timer] of due.sort(
			(a, b) => a[1].triggerAt - b[1].triggerAt
		)) {
			timers.delete(handle);
			timer.callback();
		}
	};

	return {
		now: () => now,
		setTimeout: schedule,
		clearTimeout: clear,
		advance,
	};
}

describe("typing store", () => {
	let timers: ReturnType<typeof createFakeTimers>;
	let store: TypingStore;

	const getEntries = (conversationId: string): TypingEntry[] => {
		const conversation = store.getState().conversations[conversationId];
		return conversation ? Object.values(conversation) : [];
	};

	beforeEach(() => {
		timers = createFakeTimers();
		store = createTypingStore(undefined, {
			now: timers.now,
			setTimeout: timers.setTimeout,
			clearTimeout: timers.clearTimeout,
			defaultTtlMs: 500,
		});
	});

	it("tracks typing state with TTL", () => {
		setTypingState(store, {
			conversationId: "conv-1",
			actorType: "visitor",
			actorId: "visitor-1",
			isTyping: true,
			preview: "Hello",
		});

		let entries = getEntries("conv-1");
		expect(entries).toHaveLength(1);
		expect(entries[0]?.preview).toBe("Hello");

		timers.advance(400);
		entries = getEntries("conv-1");
		expect(entries).toHaveLength(1);

		timers.advance(200);
		entries = getEntries("conv-1");
		expect(entries).toHaveLength(0);
	});

	it("removes entries when typing stops", () => {
		setTypingState(store, {
			conversationId: "conv-1",
			actorType: "user",
			actorId: "user-1",
			isTyping: true,
		});

		clearTypingState(store, {
			conversationId: "conv-1",
			actorType: "user",
			actorId: "user-1",
		});

		expect(getEntries("conv-1")).toHaveLength(0);
	});

	it("clears timers when conversation is cleared", () => {
		setTypingState(store, {
			conversationId: "conv-1",
			actorType: "ai_agent",
			actorId: "bot-1",
			isTyping: true,
		});

		store.clearConversation("conv-1");
		timers.advance(1000);

		expect(getEntries("conv-1")).toHaveLength(0);
	});

	it("applies realtime events and respects ignore filters", () => {
		const event: RealtimeEvent<"conversationTyping"> = {
			type: "conversationTyping",
			payload: {
				websiteId: "site-1",
				organizationId: "org-1",
				conversationId: "conv-1",
				visitorId: "visitor-1",
				userId: null,
				aiAgentId: null,
				visitorPreview: "Hi",
				isTyping: true,
			},
		};

		applyConversationTypingEvent(store, event, {
			ignoreVisitorId: "visitor-1",
		});

		expect(getEntries("conv-1")).toHaveLength(0);

		applyConversationTypingEvent(store, event);
		const entries = getEntries("conv-1");
		expect(entries).toHaveLength(1);
		expect(entries[0]?.preview).toBe("Hi");
	});

	it("clears typing when a timeline item is created", () => {
		setTypingState(store, {
			conversationId: "conv-1",
			actorType: "visitor",
			actorId: "visitor-1",
			isTyping: true,
		});

		const timelineItemEvent: RealtimeEvent<"timelineItemCreated"> = {
			type: "timelineItemCreated",
			payload: {
				conversationId: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				userId: null,
				visitorId: "visitor-1",
				item: {
					id: "item-1",
					conversationId: "conv-1",
					organizationId: "org-1",
					type: "message",
					text: "hello",
					parts: [{ type: "text", text: "hello" }],
					userId: null,
					aiAgentId: null,
					visitorId: "visitor-1",
					visibility: "public",
					createdAt: new Date().toISOString(),
					deletedAt: null,
				},
			},
		};

		clearTypingFromTimelineItem(store, timelineItemEvent);
		expect(getEntries("conv-1")).toHaveLength(0);
	});

	it("correctly identifies AI agent typing even when visitorId is present", () => {
		// This tests a real scenario where the event payload includes
		// visitorId (for routing) alongside aiAgentId (for actor identification)
		const event: RealtimeEvent<"conversationTyping"> = {
			type: "conversationTyping",
			payload: {
				websiteId: "site-1",
				organizationId: "org-1",
				conversationId: "conv-1",
				visitorId: "visitor-1", // Present for routing purposes
				userId: null,
				aiAgentId: "bot-1", // AI agent is typing
				visitorPreview: null,
				isTyping: true,
			},
		};

		applyConversationTypingEvent(store, event);

		const entries = getEntries("conv-1");
		expect(entries).toHaveLength(1);
		expect(entries[0]?.actorType).toBe("ai_agent");
		expect(entries[0]?.actorId).toBe("bot-1");
	});

	it("respects ignoreAiAgentId filter for AI agent typing", () => {
		const event: RealtimeEvent<"conversationTyping"> = {
			type: "conversationTyping",
			payload: {
				websiteId: "site-1",
				organizationId: "org-1",
				conversationId: "conv-1",
				visitorId: "visitor-1",
				userId: null,
				aiAgentId: "bot-1",
				visitorPreview: null,
				isTyping: true,
			},
		};

		applyConversationTypingEvent(store, event, {
			ignoreAiAgentId: "bot-1",
		});

		expect(getEntries("conv-1")).toHaveLength(0);
	});

	it("clears AI typing when AI message arrives", () => {
		// Set up AI typing state
		setTypingState(store, {
			conversationId: "conv-1",
			actorType: "ai_agent",
			actorId: "bot-1",
			isTyping: true,
		});

		// Verify AI is typing
		let entries = getEntries("conv-1");
		expect(entries).toHaveLength(1);
		expect(entries[0]?.actorType).toBe("ai_agent");

		// AI sends a message - typing should NOT be cleared
		const aiMessageEvent: RealtimeEvent<"timelineItemCreated"> = {
			type: "timelineItemCreated",
			payload: {
				conversationId: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				userId: null,
				visitorId: null,
				item: {
					id: "item-1",
					conversationId: "conv-1",
					organizationId: "org-1",
					type: "message",
					text: "Hello! I can help with that.",
					parts: [{ type: "text", text: "Hello! I can help with that." }],
					userId: null,
					aiAgentId: "bot-1", // AI sent this message
					visitorId: null,
					visibility: "public",
					createdAt: new Date().toISOString(),
					deletedAt: null,
				},
			},
		};

		clearTypingFromTimelineItem(store, aiMessageEvent);

		// AI typing should be cleared once the public AI message lands
		entries = getEntries("conv-1");
		expect(entries).toHaveLength(0);
	});

	it("clears all typing when visitor message arrives", () => {
		// Set up AI typing state
		setTypingState(store, {
			conversationId: "conv-1",
			actorType: "ai_agent",
			actorId: "bot-1",
			isTyping: true,
		});

		// Verify AI is typing
		expect(getEntries("conv-1")).toHaveLength(1);

		// Visitor sends a new message - should clear ALL typing
		const visitorMessageEvent: RealtimeEvent<"timelineItemCreated"> = {
			type: "timelineItemCreated",
			payload: {
				conversationId: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				userId: null,
				visitorId: "visitor-1",
				item: {
					id: "item-2",
					conversationId: "conv-1",
					organizationId: "org-1",
					type: "message",
					text: "Thanks!",
					parts: [{ type: "text", text: "Thanks!" }],
					userId: null,
					aiAgentId: null,
					visitorId: "visitor-1", // Visitor sent this
					visibility: "public",
					createdAt: new Date().toISOString(),
					deletedAt: null,
				},
			},
		};

		clearTypingFromTimelineItem(store, visitorMessageEvent);

		// All typing should be cleared
		expect(getEntries("conv-1")).toHaveLength(0);
	});

	it("clears AI typing when user message arrives", () => {
		// Set up AI typing state
		setTypingState(store, {
			conversationId: "conv-1",
			actorType: "ai_agent",
			actorId: "bot-1",
			isTyping: true,
		});

		// Human agent sends a message - should clear ALL typing
		const userMessageEvent: RealtimeEvent<"timelineItemCreated"> = {
			type: "timelineItemCreated",
			payload: {
				conversationId: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				userId: "user-1",
				visitorId: null,
				item: {
					id: "item-3",
					conversationId: "conv-1",
					organizationId: "org-1",
					type: "message",
					text: "Let me help you with that.",
					parts: [{ type: "text", text: "Let me help you with that." }],
					userId: "user-1", // Human agent sent this
					aiAgentId: null,
					visitorId: null,
					visibility: "public",
					createdAt: new Date().toISOString(),
					deletedAt: null,
				},
			},
		};

		clearTypingFromTimelineItem(store, userMessageEvent);

		// All typing should be cleared
		expect(getEntries("conv-1")).toHaveLength(0);
	});

	it("clears all typing when AI message arrives", () => {
		// Set up both AI and visitor typing
		setTypingState(store, {
			conversationId: "conv-1",
			actorType: "ai_agent",
			actorId: "bot-1",
			isTyping: true,
		});
		setTypingState(store, {
			conversationId: "conv-1",
			actorType: "visitor",
			actorId: "visitor-1",
			isTyping: true,
		});

		// Both should be typing
		expect(getEntries("conv-1")).toHaveLength(2);

		// AI sends a message
		const aiMessageEvent: RealtimeEvent<"timelineItemCreated"> = {
			type: "timelineItemCreated",
			payload: {
				conversationId: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				userId: null,
				visitorId: null,
				item: {
					id: "item-4",
					conversationId: "conv-1",
					organizationId: "org-1",
					type: "message",
					text: "Here's the answer",
					parts: [{ type: "text", text: "Here's the answer" }],
					userId: null,
					aiAgentId: "bot-1",
					visitorId: null,
					visibility: "public",
					createdAt: new Date().toISOString(),
					deletedAt: null,
				},
			},
		};

		clearTypingFromTimelineItem(store, aiMessageEvent);

		// All typing should be cleared
		const entries = getEntries("conv-1");
		expect(entries).toHaveLength(0);
	});
});
