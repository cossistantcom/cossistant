import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { CossistantClient } from "@cossistant/core";
import type { AnyRealtimeEvent } from "@cossistant/types/realtime-events";
import type * as React from "react";
import { Window } from "../../../../../apps/web/node_modules/happy-dom";
import { type CossistantContextValue, SupportContext } from "../../provider";
import {
	useWebSocket,
	type WebSocketContextValue,
	WebSocketProvider,
} from "./websocket";

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

// -- Fake realtime client ----------------------------------------------------

type RealtimeStatus = "disconnected" | "connecting" | "connected";

type RealtimeState = {
	status: RealtimeStatus;
	error: Error | null;
	connectionId: string | null;
};

function createFakeRealtime() {
	let state: RealtimeState = {
		status: "disconnected",
		error: null,
		connectionId: null,
	};
	const stateListeners = new Set<(next: RealtimeState) => void>();
	const eventHandlers = new Set<(event: AnyRealtimeEvent) => void>();

	return {
		getState: () => state,
		onStateChange(listener: (next: RealtimeState) => void) {
			stateListeners.add(listener);
			return () => {
				stateListeners.delete(listener);
			};
		},
		subscribe(handler: (event: AnyRealtimeEvent) => void) {
			eventHandlers.add(handler);
			return () => {
				eventHandlers.delete(handler);
			};
		},
		send: mock(() => {}),
		sendRaw: mock(() => {}),
		reconnect: mock(() => {}),
		setState(next: Partial<RealtimeState>) {
			state = { ...state, ...next };
			for (const listener of stateListeners) {
				listener(state);
			}
		},
		dispatchEvent(event: AnyRealtimeEvent) {
			for (const handler of eventHandlers) {
				handler(event);
			}
		},
	};
}

type FakeRealtime = ReturnType<typeof createFakeRealtime>;

function createSupportContextValue(
	realtime: FakeRealtime
): CossistantContextValue {
	return {
		website: null,
		defaultMessages: [],
		quickOptions: [],
		setDefaultMessages: () => {},
		setQuickOptions: () => {},
		unreadCount: 0,
		setUnreadCount: () => {},
		isLoading: false,
		error: null,
		configurationError: null,
		client: { realtime } as unknown as CossistantClient,
		isOpen: false,
		open: () => {},
		close: () => {},
		toggle: () => {},
	};
}

const EVENT: AnyRealtimeEvent = {
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
} as unknown as AnyRealtimeEvent;

let probeRenderCount = 0;
let latestContext: WebSocketContextValue | null = null;

function WebSocketProbe() {
	const context = useWebSocket();
	probeRenderCount += 1;
	latestContext = context;

	return (
		<div data-slot="ws-status">
			{context.isConnected ? "connected" : "idle"}
		</div>
	);
}

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

describe("WebSocketProvider", () => {
	beforeEach(() => {
		activeRoot = null;
		mountNode = null;
		probeRenderCount = 0;
		latestContext = null;
		windowInstance = new Window({
			url: "https://example.com",
		});
		installDomGlobals(windowInstance);
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

	it("forwards onConnect/onDisconnect/onError to consumers", async () => {
		const realtime = createFakeRealtime();
		const onConnect = mock(() => {});
		const onDisconnect = mock(() => {});
		const onError = mock(() => {});

		await render(
			<SupportContext.Provider value={createSupportContextValue(realtime)}>
				<WebSocketProvider
					onConnect={onConnect}
					onDisconnect={onDisconnect}
					onError={onError}
				>
					<WebSocketProbe />
				</WebSocketProvider>
			</SupportContext.Provider>
		);

		const { act } = await import("react");

		await act(async () => {
			realtime.setState({ status: "connected" });
		});
		expect(onConnect).toHaveBeenCalledTimes(1);
		expect(onDisconnect).not.toHaveBeenCalled();

		const failure = new Error("socket failure");
		await act(async () => {
			realtime.setState({ status: "disconnected", error: failure });
		});
		expect(onDisconnect).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError.mock.calls[0]?.[0]).toBe(failure);
	});

	it("delivers events without re-rendering context consumers", async () => {
		const realtime = createFakeRealtime();

		await render(
			<SupportContext.Provider value={createSupportContextValue(realtime)}>
				<WebSocketProvider>
					<WebSocketProbe />
				</WebSocketProvider>
			</SupportContext.Provider>
		);

		const { act } = await import("react");
		await act(async () => {
			realtime.setState({ status: "connected" });
		});

		const received: string[] = [];
		const unsubscribe = latestContext?.subscribe((event) => {
			received.push(event.type);
		});
		const rendersBeforeEvent = probeRenderCount;

		await act(async () => {
			realtime.dispatchEvent(EVENT);
		});

		expect(received).toEqual(["conversationUpdated"]);
		expect(probeRenderCount).toBe(rendersBeforeEvent);
		expect(latestContext?.lastEvent?.type).toBe("conversationUpdated");

		unsubscribe?.();
	});
});
