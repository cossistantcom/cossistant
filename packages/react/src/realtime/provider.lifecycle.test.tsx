import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { RealtimeAuthConfig } from "@cossistant/core/realtime-client";
import * as React from "react";
import { Window } from "../../../../apps/web/node_modules/happy-dom";
import { RealtimeProvider, useRealtimeConnection } from "./provider";
import { useRealtime } from "./use-realtime";

type RootHandle = {
	render(node: React.ReactNode): void;
	unmount(): void;
};

const installedGlobalKeys = [
	"window",
	"self",
	"document",
	"navigator",
	"Document",
	"DocumentFragment",
	"Element",
	"Event",
	"EventTarget",
	"HTMLElement",
	"MouseEvent",
	"Node",
	"SyntaxError",
	"Text",
	"getComputedStyle",
	"IS_REACT_ACT_ENVIRONMENT",
	"WebSocket",
] as const;

let activeRoot: RootHandle | null = null;
let mountNode: HTMLElement | null = null;
let windowInstance: Window | null = null;

function setGlobalValue(key: string, value: unknown) {
	Object.defineProperty(globalThis, key, {
		configurable: true,
		value,
		writable: true,
	});
}

function installDomGlobals(window: Window) {
	(window as Window & { SyntaxError?: typeof Error }).SyntaxError = Error;
	setGlobalValue("window", window);
	setGlobalValue("self", window);
	setGlobalValue("document", window.document);
	setGlobalValue("navigator", window.navigator);
	setGlobalValue("Document", window.Document);
	setGlobalValue("DocumentFragment", window.DocumentFragment);
	setGlobalValue("Element", window.Element);
	setGlobalValue("Event", window.Event);
	setGlobalValue("EventTarget", window.EventTarget);
	setGlobalValue("HTMLElement", window.HTMLElement);
	setGlobalValue("MouseEvent", window.MouseEvent);
	setGlobalValue("Node", window.Node);
	setGlobalValue("SyntaxError", Error);
	setGlobalValue("Text", window.Text);
	setGlobalValue("getComputedStyle", window.getComputedStyle.bind(window));
	setGlobalValue("IS_REACT_ACT_ENVIRONMENT", true);
}

// -- Mock WebSocket ---------------------------------------------------------

type MockWebSocketInstance = {
	url: string;
	readyState: number;
	onopen: ((event: Event) => void) | null;
	onclose: ((event: CloseEvent) => void) | null;
	onmessage: ((event: MessageEvent) => void) | null;
	onerror: ((event: Event) => void) | null;
	close: ReturnType<typeof mock>;
	send: ReturnType<typeof mock>;
	simulateOpen(): void;
	simulateMessage(data: string): void;
};

let mockSockets: MockWebSocketInstance[] = [];

function createMockWebSocket(url: string): MockWebSocketInstance {
	const instance: MockWebSocketInstance = {
		url,
		readyState: 0,
		onopen: null,
		onclose: null,
		onmessage: null,
		onerror: null,
		close: mock(function (this: MockWebSocketInstance) {
			this.readyState = 3;
		}),
		send: mock(() => {}),
		simulateOpen() {
			this.readyState = 1;
			this.onopen?.({} as Event);
		},
		simulateMessage(data: string) {
			this.onmessage?.({ data } as MessageEvent);
		},
	};
	mockSockets.push(instance);
	return instance;
}

function installMockWebSocket() {
	setGlobalValue(
		"WebSocket",
		class MockWS {
			static readonly CONNECTING = 0;
			static readonly OPEN = 1;
			static readonly CLOSING = 2;
			static readonly CLOSED = 3;

			constructor(url: string) {
				const inst = createMockWebSocket(url);
				return inst as unknown as WebSocket;
			}
		}
	);
}

function lastSocket(): MockWebSocketInstance {
	const socket = mockSockets[mockSockets.length - 1];
	if (!socket) {
		throw new Error("No mock sockets created");
	}
	return socket;
}

// -- Harness ----------------------------------------------------------------

const VISITOR_AUTH: RealtimeAuthConfig = {
	kind: "visitor",
	visitorId: "vis_123",
	websiteId: "ws_456",
	publicKey: "pk_test",
};

const EVENT_MESSAGE = JSON.stringify({
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
});

async function render(node: React.ReactNode) {
	const { act } = await import("react");
	const { createRoot } = await import("react-dom/client");

	mountNode = document.createElement("div");
	document.body.appendChild(mountNode);
	activeRoot = createRoot(mountNode);

	await act(async () => {
		activeRoot?.render(node);
	});
}

async function rerender(node: React.ReactNode) {
	const { act } = await import("react");
	await act(async () => {
		activeRoot?.render(node);
	});
}

async function flushMacrotasks() {
	const { act } = await import("react");
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 10));
	});
}

function getBySlot(slot: string): HTMLElement {
	const element = document.querySelector<HTMLElement>(`[data-slot="${slot}"]`);

	if (!element) {
		throw new Error(`Could not find [data-slot="${slot}"]`);
	}

	return element;
}

let probeRenderCount = 0;
let latestConnection: ReturnType<typeof useRealtimeConnection> | null = null;

function ConnectionProbe() {
	const connection = useRealtimeConnection();
	probeRenderCount += 1;
	latestConnection = connection;

	return (
		<div data-slot="status">
			{connection.isConnected ? "connected" : "idle"}
		</div>
	);
}

function UseRealtimeProbe({ onEvent }: { onEvent: (type: string) => void }) {
	useRealtime({
		events: {
			conversationUpdated: (_data, meta) => {
				onEvent(meta.event.type);
			},
		},
		websiteId: "ws_456",
	});

	return <div data-slot="use-realtime" />;
}

describe("RealtimeProvider lifecycle", () => {
	beforeEach(() => {
		activeRoot = null;
		mountNode = null;
		mockSockets = [];
		probeRenderCount = 0;
		latestConnection = null;
		windowInstance = new Window({
			url: "https://example.com",
		});
		installDomGlobals(windowInstance);
		installMockWebSocket();
	});

	afterEach(async () => {
		const { act } = await import("react");

		if (activeRoot) {
			await act(async () => {
				activeRoot?.unmount();
			});
		}

		mountNode?.remove();
		activeRoot = null;
		mountNode = null;
		windowInstance = null;

		for (const key of installedGlobalKeys) {
			Reflect.deleteProperty(globalThis, key);
		}
	});

	it("survives StrictMode effect replay and still connects", async () => {
		await render(
			<React.StrictMode>
				<RealtimeProvider auth={VISITOR_AUTH} wsUrl="wss://example.test/ws">
					<ConnectionProbe />
				</RealtimeProvider>
			</React.StrictMode>
		);

		// Let the deferred disposal timeout fire if it was not cancelled
		await flushMacrotasks();

		expect(mockSockets).toHaveLength(1);

		const { act } = await import("react");
		await act(async () => {
			lastSocket().simulateOpen();
		});

		expect(getBySlot("status").textContent).toBe("connected");
	});

	it("destroys the client after a real unmount", async () => {
		await render(
			<React.StrictMode>
				<RealtimeProvider auth={VISITOR_AUTH} wsUrl="wss://example.test/ws">
					<ConnectionProbe />
				</RealtimeProvider>
			</React.StrictMode>
		);

		const { act } = await import("react");
		await act(async () => {
			lastSocket().simulateOpen();
		});

		const socket = lastSocket();

		await act(async () => {
			activeRoot?.unmount();
		});
		activeRoot = null;

		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(socket.close).toHaveBeenCalled();
	});

	it("invokes the latest onConnect callback after prop updates", async () => {
		const firstOnConnect = mock(() => {});
		const secondOnConnect = mock(() => {});

		await render(
			<RealtimeProvider
				auth={VISITOR_AUTH}
				onConnect={firstOnConnect}
				wsUrl="wss://example.test/ws"
			>
				<ConnectionProbe />
			</RealtimeProvider>
		);

		await rerender(
			<RealtimeProvider
				auth={VISITOR_AUTH}
				onConnect={secondOnConnect}
				wsUrl="wss://example.test/ws"
			>
				<ConnectionProbe />
			</RealtimeProvider>
		);

		const { act } = await import("react");
		await act(async () => {
			lastSocket().simulateOpen();
		});

		expect(firstOnConnect).not.toHaveBeenCalled();
		expect(secondOnConnect).toHaveBeenCalledTimes(1);
	});

	it("delivers events without re-rendering context consumers", async () => {
		await render(
			<RealtimeProvider auth={VISITOR_AUTH} wsUrl="wss://example.test/ws">
				<ConnectionProbe />
			</RealtimeProvider>
		);

		const { act } = await import("react");
		await act(async () => {
			lastSocket().simulateOpen();
		});

		const received: string[] = [];
		const unsubscribe = latestConnection?.subscribe((event) => {
			received.push(event.type);
		});
		const rendersBeforeEvent = probeRenderCount;

		await act(async () => {
			lastSocket().simulateMessage(EVENT_MESSAGE);
		});

		expect(received).toEqual(["conversationUpdated"]);
		expect(probeRenderCount).toBe(rendersBeforeEvent);
		expect(latestConnection?.lastEvent?.type).toBe("conversationUpdated");

		unsubscribe?.();
	});

	it("keeps useRealtime handlers subscribed across connection state changes", async () => {
		const receivedTypes: string[] = [];

		await render(
			<RealtimeProvider auth={VISITOR_AUTH} wsUrl="wss://example.test/ws">
				<UseRealtimeProbe
					onEvent={(type) => {
						receivedTypes.push(type);
					}}
				/>
			</RealtimeProvider>
		);

		const { act } = await import("react");

		// Connection state change re-renders the provider; the handler
		// subscription must survive it and keep delivering events.
		await act(async () => {
			lastSocket().simulateOpen();
		});

		await act(async () => {
			lastSocket().simulateMessage(EVENT_MESSAGE);
		});

		expect(receivedTypes).toEqual(["conversationUpdated"]);
	});
});
