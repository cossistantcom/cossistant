"use client";

import type { AnyRealtimeEvent } from "@cossistant/types/realtime-events";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useSyncExternalStore,
} from "react";
import { useSupport } from "../../provider";

type SubscribeHandler = (event: AnyRealtimeEvent) => void;

type WebSocketContextValue = {
	isConnected: boolean;
	isConnecting: boolean;
	error: Error | null;
	send: (event: AnyRealtimeEvent) => void;
	sendRaw: (data: string) => void;
	subscribe: (handler: SubscribeHandler) => () => void;
	/**
	 * Latest event received on the connection. Read-on-demand: updating it does
	 * not re-render consumers. Use `subscribe` to react to incoming events.
	 */
	lastEvent: AnyRealtimeEvent | null;
	connectionId: string | null;
	reconnect: () => void;
	visitorId: string | null;
	websiteId: string | null;
	userId: string | null;
};

type WebSocketProviderProps = {
	children: React.ReactNode;
	/**
	 * @deprecated Ignored. The connection is owned by the support controller;
	 * configure `publicKey` on `SupportProvider` instead.
	 */
	publicKey?: string;
	websiteId?: string;
	visitorId?: string;
	/**
	 * @deprecated Ignored. The connection is owned by the support controller;
	 * configure `wsUrl` on `SupportProvider` instead.
	 */
	wsUrl?: string;
	/**
	 * @deprecated Ignored. The connection is owned by the support controller;
	 * configure `autoConnect` on `SupportProvider` instead.
	 */
	autoConnect?: boolean;
	onConnect?: () => void;
	onDisconnect?: () => void;
	onError?: (error: Error) => void;
};

const WebSocketContext = createContext<WebSocketContextValue | null>(null);
const DISCONNECTED_STATE = {
	status: "disconnected" as const,
	error: null,
	connectionId: null,
};

/**
 * Support-specific realtime provider that authenticates visitors using the
 * core client's RealtimeClient and keeps the connection alive with presence pings.
 */
export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
	children,
	websiteId,
	visitorId,
	onConnect,
	onDisconnect,
	onError,
}) => {
	const { client, website } = useSupport();
	const realtime = client?.realtime ?? null;

	// Subscribe to connection state
	const connectionState = useSyncExternalStore(
		useCallback(
			(onStoreChange: () => void) =>
				realtime?.onStateChange(onStoreChange) ?? (() => {}),
			[realtime]
		),
		() => realtime?.getState() ?? DISCONNECTED_STATE,
		() => realtime?.getState() ?? DISCONNECTED_STATE
	);

	// Track last event via subscription. A ref (not state) so a busy socket does
	// not re-render every context consumer per event.
	const lastEventRef = useRef<AnyRealtimeEvent | null>(null);

	useEffect(() => {
		if (!realtime) {
			return;
		}
		return realtime.subscribe((event) => {
			lastEventRef.current = event;
		});
	}, [realtime]);

	// Forward connection lifecycle callbacks, always invoking the latest props.
	const onConnectRef = useRef(onConnect);
	const onDisconnectRef = useRef(onDisconnect);
	const onErrorRef = useRef(onError);

	useEffect(() => {
		onConnectRef.current = onConnect;
		onDisconnectRef.current = onDisconnect;
		onErrorRef.current = onError;
	}, [onConnect, onDisconnect, onError]);

	useEffect(() => {
		if (!realtime) {
			return;
		}

		let lastStatus = realtime.getState().status;
		let lastError = realtime.getState().error;

		return realtime.onStateChange((state) => {
			if (lastStatus !== "connected" && state.status === "connected") {
				onConnectRef.current?.();
			}

			if (lastStatus === "connected" && state.status !== "connected") {
				onDisconnectRef.current?.();
			}

			if (state.error && state.error !== lastError) {
				onErrorRef.current?.(state.error);
			}

			lastStatus = state.status;
			lastError = state.error;
		});
	}, [realtime]);

	// Stable send/subscribe callbacks
	const send = useCallback(
		(event: AnyRealtimeEvent) => {
			realtime?.send(event);
		},
		[realtime]
	);

	const sendRaw = useCallback(
		(data: string) => {
			realtime?.sendRaw(data);
		},
		[realtime]
	);

	const subscribe = useCallback(
		(handler: SubscribeHandler) => realtime?.subscribe(handler) ?? (() => {}),
		[realtime]
	);

	const reconnect = useCallback(() => {
		realtime?.reconnect();
	}, [realtime]);

	const resolvedVisitorId = useMemo(
		() => visitorId ?? website?.visitor?.id ?? null,
		[visitorId, website]
	);

	const resolvedWebsiteId = useMemo(
		() => websiteId ?? website?.id ?? null,
		[websiteId, website]
	);

	const value = useMemo<WebSocketContextValue>(
		() => ({
			isConnected: connectionState.status === "connected",
			isConnecting: connectionState.status === "connecting",
			error: connectionState.error,
			send,
			sendRaw,
			subscribe,
			get lastEvent() {
				return lastEventRef.current;
			},
			connectionId: connectionState.connectionId,
			reconnect,
			visitorId: resolvedVisitorId,
			websiteId: resolvedWebsiteId,
			userId: null,
		}),
		[
			connectionState,
			send,
			sendRaw,
			subscribe,
			reconnect,
			resolvedVisitorId,
			resolvedWebsiteId,
		]
	);

	return (
		<WebSocketContext.Provider value={value}>
			{children}
		</WebSocketContext.Provider>
	);
};

/**
 * Accessor for the support websocket context.
 * Throws if used outside WebSocketProvider.
 */
export const useWebSocket = (): WebSocketContextValue => {
	const context = useContext(WebSocketContext);
	if (!context) {
		throw new Error("useWebSocket must be used within WebSocketProvider");
	}
	return context;
};

/**
 * Safe accessor for the support websocket context.
 * Returns null if used outside WebSocketProvider instead of throwing.
 */
export const useWebSocketSafe = (): WebSocketContextValue | null =>
	useContext(WebSocketContext);

export type { WebSocketContextValue, WebSocketProviderProps };
export type { RealtimeEvent } from "@cossistant/types/realtime-events";
