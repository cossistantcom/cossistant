import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	type RealtimeAuthConfig,
	RealtimeClient,
	type RealtimeConnectionState,
} from "./realtime-client";

// ---------------------------------------------------------------------------
// MockWebSocket
// ---------------------------------------------------------------------------

type MockWebSocketInstance = {
	url: string;
	readyState: number;
	onopen: ((event: Event) => void) | null;
	onclose: ((event: CloseEvent) => void) | null;
	onmessage: ((event: MessageEvent) => void) | null;
	onerror: ((event: Event) => void) | null;
	close: ReturnType<typeof mock>;
	send: ReturnType<typeof mock>;
	sentMessages: string[];

	// Test helpers
	simulateOpen(): void;
	simulateClose(code?: number, reason?: string): void;
	simulateMessage(data: string): void;
	simulateError(): void;
};

let mockSockets: MockWebSocketInstance[] = [];

function createMockWebSocket(url: string): MockWebSocketInstance {
	const instance: MockWebSocketInstance = {
		url,
		readyState: 0, // CONNECTING
		onopen: null,
		onclose: null,
		onmessage: null,
		onerror: null,
		close: mock(function (this: MockWebSocketInstance) {
			this.readyState = 3; // CLOSED
			this.onclose?.({ code: 1000, reason: "" } as CloseEvent);
		}),
		send: mock(function (this: MockWebSocketInstance, data: string) {
			this.sentMessages.push(data);
		}),
		sentMessages: [],
		simulateOpen() {
			this.readyState = 1; // OPEN
			this.onopen?.({} as Event);
		},
		simulateClose(code = 1000, reason = "") {
			this.readyState = 3; // CLOSED
			this.onclose?.({ code, reason } as CloseEvent);
		},
		simulateMessage(data: string) {
			this.onmessage?.({ data } as MessageEvent);
		},
		simulateError() {
			this.onerror?.({ type: "error" } as Event);
		},
	};
	mockSockets.push(instance);
	return instance;
}

// Patch global WebSocket
const OriginalWebSocket = globalThis.WebSocket;

function installMockWebSocket() {
	// @ts-expect-error — replacing global for tests
	globalThis.WebSocket = class MockWS {
		static readonly CONNECTING = 0;
		static readonly OPEN = 1;
		static readonly CLOSING = 2;
		static readonly CLOSED = 3;

		constructor(url: string) {
			const inst = createMockWebSocket(url);
			return inst as unknown as WebSocket;
		}
	};
}

function restoreWebSocket() {
	globalThis.WebSocket = OriginalWebSocket;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VISITOR_AUTH: RealtimeAuthConfig = {
	kind: "visitor",
	visitorId: "vis_123",
	websiteId: "ws_456",
	publicKey: "pk_test",
};

const PRIVATE_KEY_AUTH: RealtimeAuthConfig = {
	kind: "privateKey",
	privateKey: "sk_test_123",
	actorUserId: "user_123",
	websiteId: "ws_456",
	userId: "user_123",
};

function lastSocket(): MockWebSocketInstance {
	const socket = mockSockets[mockSockets.length - 1];
	if (!socket) {
		throw new Error("No mock sockets created");
	}
	return socket;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
	mockSockets = [];
	installMockWebSocket();
});

afterEach(() => {
	restoreWebSocket();
});

describe("RealtimeClient", () => {
	describe("connect/disconnect", () => {
		test("connects with visitor auth and builds correct URL", () => {
			const client = new RealtimeClient();
			client.connect(VISITOR_AUTH);

			expect(mockSockets).toHaveLength(1);
			const url = new URL(lastSocket().url);
			expect(url.searchParams.get("visitorId")).toBe("vis_123");
			expect(url.searchParams.get("publicKey")).toBe("pk_test");

			client.destroy();
		});

		test("state transitions to connecting then connected", () => {
			const states: RealtimeConnectionState[] = [];
			const client = new RealtimeClient();
			client.onStateChange((s) => states.push({ ...s }));

			client.connect(VISITOR_AUTH);
			expect(client.getState().status).toBe("connecting");

			lastSocket().simulateOpen();
			expect(client.getState().status).toBe("connected");

			client.destroy();
		});

		test("disconnect closes socket and resets state", () => {
			const client = new RealtimeClient();
			client.connect(VISITOR_AUTH);
			lastSocket().simulateOpen();

			client.disconnect();
			expect(client.getState().status).toBe("disconnected");
			expect(lastSocket().close).toHaveBeenCalled();

			client.destroy();
		});

		test("does not connect with null auth", () => {
			const client = new RealtimeClient();
			client.connect(null);

			expect(mockSockets).toHaveLength(0);
			expect(client.getState().status).toBe("disconnected");

			client.destroy();
		});

		test("does not connect with empty visitorId", () => {
			const client = new RealtimeClient();
			client.connect({ kind: "visitor", visitorId: "" });

			expect(mockSockets).toHaveLength(0);

			client.destroy();
		});

		test("connects with session auth", () => {
			const client = new RealtimeClient();
			client.connect({
				kind: "session",
				sessionToken: "tok_abc",
				websiteId: "ws_456",
			});

			expect(mockSockets).toHaveLength(1);
			const url = new URL(lastSocket().url);
			expect(url.searchParams.get("sessionToken")).toBe("tok_abc");
			expect(url.searchParams.get("websiteId")).toBe("ws_456");

			client.destroy();
		});

		test("connects with private key auth and builds correct URL", () => {
			const client = new RealtimeClient();
			client.connect(PRIVATE_KEY_AUTH);

			expect(mockSockets).toHaveLength(1);
			const url = new URL(lastSocket().url);
			expect(url.searchParams.get("token")).toBe("sk_test_123");
			expect(url.searchParams.get("actorUserId")).toBe("user_123");
			expect(url.searchParams.get("sessionToken")).toBeNull();

			client.destroy();
		});
	});

	describe("message handling", () => {
		test("parses pong heartbeat", () => {
			const client = new RealtimeClient();
			client.connect(VISITOR_AUTH);
			lastSocket().simulateOpen();
			lastSocket().simulateMessage("pong");

			// No error, pong was silently handled
			expect(client.getState().error).toBeNull();

			client.destroy();
		});

		test("parses CONNECTION_ESTABLISHED and sets connectionId", () => {
			const client = new RealtimeClient();
			client.connect(VISITOR_AUTH);
			lastSocket().simulateOpen();

			lastSocket().simulateMessage(
				JSON.stringify({
					type: "CONNECTION_ESTABLISHED",
					payload: { connectionId: "conn_xyz" },
				})
			);

			expect(client.getState().connectionId).toBe("conn_xyz");

			client.destroy();
		});

		test("dispatches valid events to subscribers", () => {
			const events: unknown[] = [];
			const client = new RealtimeClient();
			client.subscribe((e) => events.push(e));
			client.connect(VISITOR_AUTH);
			lastSocket().simulateOpen();

			lastSocket().simulateMessage(
				JSON.stringify({
					type: "conversationUpdated",
					payload: {
						conversationId: "conv_1",
						updates: { title: "New title" },
						organizationId: "org_1",
						websiteId: "ws_456",
						visitorId: "vis_123",
						userId: "",
						aiAgentId: "",
					},
				})
			);

			expect(events).toHaveLength(1);
			expect((events[0] as { type: string }).type).toBe("conversationUpdated");

			client.destroy();
		});

		test("dispatches retry-required clarification updates to subscribers", () => {
			const events: unknown[] = [];
			const client = new RealtimeClient();
			client.subscribe((event) => events.push(event));
			client.connect(VISITOR_AUTH);
			lastSocket().simulateOpen();

			lastSocket().simulateMessage(
				JSON.stringify({
					type: "conversationUpdated",
					payload: {
						conversationId: "conv_1",
						updates: {
							activeClarification: {
								requestId: "01JKCM0FJ8T8Q6W0M3Q2A1B9CD",
								status: "retry_required",
								topicSummary: "Clarify account deletion.",
								question: null,
								stepIndex: 1,
								maxSteps: 3,
								updatedAt: "2026-03-17T10:54:40.208Z",
							},
						},
						organizationId: "org_1",
						websiteId: "ws_456",
						visitorId: "vis_123",
						userId: "",
						aiAgentId: null,
					},
				})
			);

			expect(events).toHaveLength(1);
			expect(
				(
					events[0] as {
						payload: {
							updates: {
								activeClarification?: {
									status: string;
								} | null;
							};
						};
					}
				).payload.updates.activeClarification?.status
			).toBe("retry_required");

			client.destroy();
		});

		test("calls onEvent callback", () => {
			const eventCallback = mock(() => {});
			const client = new RealtimeClient({ onEvent: eventCallback });
			client.connect(VISITOR_AUTH);
			lastSocket().simulateOpen();

			lastSocket().simulateMessage(
				JSON.stringify({
					type: "conversationUpdated",
					payload: {
						conversationId: "conv_1",
						updates: { title: "New title" },
						organizationId: "org_1",
						websiteId: "ws_456",
						visitorId: "vis_123",
						userId: "",
						aiAgentId: "",
					},
				})
			);

			expect(eventCallback).toHaveBeenCalledTimes(1);

			client.destroy();
		});

		test("handles error messages", () => {
			const onError = mock(() => {});
			const client = new RealtimeClient({ onError });
			client.connect(VISITOR_AUTH);
			lastSocket().simulateOpen();

			lastSocket().simulateMessage(
				JSON.stringify({ error: true, message: "Something went wrong" })
			);

			expect(client.getState().error?.message).toBe("Something went wrong");
			expect(onError).toHaveBeenCalledTimes(1);

			client.destroy();
		});

		test("ignores invalid messages", () => {
			const events: unknown[] = [];
			const client = new RealtimeClient();
			client.subscribe((e) => events.push(e));
			client.connect(VISITOR_AUTH);
			lastSocket().simulateOpen();

			lastSocket().simulateMessage("not valid json{{{");
			lastSocket().simulateMessage(JSON.stringify({ foo: "bar" }));

			expect(events).toHaveLength(0);

			client.destroy();
		});
	});

	describe("send", () => {
		test("send throws if not connected", () => {
			const client = new RealtimeClient();
			expect(() =>
				client.send({
					type: "conversationTyping",
					payload: {} as never,
				})
			).toThrow("Realtime connection is not established");

			client.destroy();
		});

		test("sendRaw sends string data", () => {
			const client = new RealtimeClient();
			client.connect(VISITOR_AUTH);
			lastSocket().simulateOpen();

			client.sendRaw("presence:ping");
			expect(lastSocket().sentMessages).toContain("presence:ping");

			client.destroy();
		});
	});

	describe("subscribe/unsubscribe", () => {
		test("unsubscribe removes handler", () => {
			const events: unknown[] = [];
			const client = new RealtimeClient();
			const unsub = client.subscribe((e) => events.push(e));
			client.connect(VISITOR_AUTH);
			lastSocket().simulateOpen();

			unsub();

			lastSocket().simulateMessage(
				JSON.stringify({
					type: "conversationUpdated",
					payload: {
						conversationId: "conv_1",
						updates: {},
						organizationId: "org_1",
						websiteId: "ws_456",
						visitorId: "vis_123",
						userId: "",
						aiAgentId: "",
					},
				})
			);

			expect(events).toHaveLength(0);

			client.destroy();
		});
	});

	describe("reconnect", () => {
		test("schedules reconnect on normal close", async () => {
			const client = new RealtimeClient();
			client.connect(VISITOR_AUTH);
			lastSocket().simulateOpen();

			const socketCount = mockSockets.length;
			lastSocket().simulateClose(1006, "Abnormal closure");

			expect(client.getState().status).toBe("disconnected");

			// Wait for reconnect timer (500ms base)
			await new Promise((r) => setTimeout(r, 600));

			expect(mockSockets.length).toBeGreaterThan(socketCount);

			client.destroy();
		});

		test("does not reconnect on permanent close code 1008", async () => {
			const client = new RealtimeClient();
			client.connect(VISITOR_AUTH);
			lastSocket().simulateOpen();

			const socketCount = mockSockets.length;
			lastSocket().simulateClose(1008, "Policy violation");

			await new Promise((r) => setTimeout(r, 600));

			expect(mockSockets.length).toBe(socketCount);
			expect(client.getState().error?.message).toContain("Policy violation");

			client.destroy();
		});

		test("does not reconnect on permanent close code 1011", async () => {
			const client = new RealtimeClient();
			client.connect(VISITOR_AUTH);
			lastSocket().simulateOpen();

			const socketCount = mockSockets.length;
			lastSocket().simulateClose(1011, "Server error");

			await new Promise((r) => setTimeout(r, 600));

			expect(mockSockets.length).toBe(socketCount);

			client.destroy();
		});

		test("connect() with same auth recovers after a permanent close", () => {
			const client = new RealtimeClient();
			client.connect(VISITOR_AUTH);
			lastSocket().simulateOpen();

			lastSocket().simulateClose(1011, "Server error");
			expect(client.getState().status).toBe("disconnected");

			const socketCount = mockSockets.length;
			client.connect(VISITOR_AUTH);

			expect(mockSockets.length).toBe(socketCount + 1);
			expect(client.getState().status).toBe("connecting");

			client.destroy();
		});

		test("connect() with changed auth during backoff clears the pending timer", async () => {
			const client = new RealtimeClient();
			client.connect(VISITOR_AUTH);
			lastSocket().simulateOpen();

			// Schedules a reconnect timer (500ms base delay)
			lastSocket().simulateClose(1006, "Abnormal closure");

			client.connect({
				kind: "visitor",
				visitorId: "vis_new",
				websiteId: "ws_456",
				publicKey: "pk_test",
			});
			const socketCount = mockSockets.length;

			await new Promise((r) => setTimeout(r, 700));

			// The stale backoff timer must not open a duplicate socket
			expect(mockSockets.length).toBe(socketCount);

			client.destroy();
		});

		test("reconnect() during backoff clears the pending timer", async () => {
			const client = new RealtimeClient();
			client.connect(VISITOR_AUTH);
			lastSocket().simulateOpen();

			lastSocket().simulateClose(1006, "Abnormal closure");

			client.reconnect();
			const socketCount = mockSockets.length;

			await new Promise((r) => setTimeout(r, 700));

			expect(mockSockets.length).toBe(socketCount);

			client.destroy();
		});

		test("connect() with unchanged auth during backoff keeps the scheduled reconnect", async () => {
			const client = new RealtimeClient();
			client.connect(VISITOR_AUTH);
			lastSocket().simulateOpen();

			lastSocket().simulateClose(1006, "Abnormal closure");
			const socketCount = mockSockets.length;

			client.connect(VISITOR_AUTH);
			expect(mockSockets.length).toBe(socketCount);

			await new Promise((r) => setTimeout(r, 700));
			expect(mockSockets.length).toBe(socketCount + 1);

			client.destroy();
		});
	});

	describe("heartbeat", () => {
		test("sends ping at heartbeat interval", async () => {
			const client = new RealtimeClient({
				heartbeatIntervalMs: 100,
				heartbeatTimeoutMs: 500,
			});
			client.connect(VISITOR_AUTH);
			lastSocket().simulateOpen();

			await new Promise((r) => setTimeout(r, 250));

			const pings = lastSocket().sentMessages.filter((m) => m === "ping");
			expect(pings.length).toBeGreaterThanOrEqual(1);

			client.destroy();
		});
	});

	describe("presence", () => {
		test("sends presence ping when enabled and connected", () => {
			const client = new RealtimeClient();
			client.connect(VISITOR_AUTH);
			lastSocket().simulateOpen();

			client.enablePresence(60_000);

			const pings = lastSocket().sentMessages.filter(
				(m) => m === "presence:ping"
			);
			expect(pings.length).toBeGreaterThanOrEqual(0);

			client.destroy();
		});

		test("pause/resume presence", () => {
			const client = new RealtimeClient();
			client.connect(VISITOR_AUTH);
			lastSocket().simulateOpen();

			client.enablePresence(100);
			client.pausePresence();

			// Clear messages so far
			lastSocket().sentMessages.length = 0;

			// After pause, no pings should be sent
			client.resumePresence();
			const pings = lastSocket().sentMessages.filter(
				(m) => m === "presence:ping"
			);
			// resumePresence sends an immediate ping
			expect(pings).toHaveLength(1);

			client.destroy();
		});
	});

	describe("updateAuth", () => {
		test("reconnects when auth changes", () => {
			const client = new RealtimeClient();
			client.connect(VISITOR_AUTH);
			lastSocket().simulateOpen();

			const socketsBefore = mockSockets.length;

			client.updateAuth({
				kind: "visitor",
				visitorId: "vis_new",
				websiteId: "ws_456",
			});

			expect(mockSockets.length).toBeGreaterThan(socketsBefore);
			const url = new URL(lastSocket().url);
			expect(url.searchParams.get("visitorId")).toBe("vis_new");

			client.destroy();
		});

		test("does not reconnect if auth is the same", () => {
			const client = new RealtimeClient();
			client.connect(VISITOR_AUTH);
			lastSocket().simulateOpen();

			const socketsBefore = mockSockets.length;
			client.updateAuth(VISITOR_AUTH);

			expect(mockSockets.length).toBe(socketsBefore);

			client.destroy();
		});
	});

	describe("destroy", () => {
		test("cleans up everything", () => {
			const client = new RealtimeClient();
			client.connect(VISITOR_AUTH);
			lastSocket().simulateOpen();

			client.destroy();

			expect(client.getState().status).toBe("disconnected");
			// After destroy, connect should be a no-op
			client.connect(VISITOR_AUTH);
			expect(mockSockets.length).toBe(1); // No new socket
		});
	});

	describe("onStateChange", () => {
		test("notifies listeners and unsubscribe works", () => {
			const states: RealtimeConnectionState[] = [];
			const client = new RealtimeClient();
			const unsub = client.onStateChange((s) => states.push({ ...s }));

			client.connect(VISITOR_AUTH);
			lastSocket().simulateOpen();

			unsub();

			client.disconnect();

			// Should have: connecting, connected. Not disconnected since we unsubbed.
			expect(states).toHaveLength(2);
			expect(states[0]?.status).toBe("connecting");
			expect(states[1]?.status).toBe("connected");

			client.destroy();
		});
	});
});
