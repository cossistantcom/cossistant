"use client";

import type { RealtimeAuthConfig } from "@plasma/core";
import type { AnyRealtimeEvent } from "@plasma/types/realtime-events";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
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
	lastEvent: AnyRealtimeEvent | null;
	connectionId: string | null;
	reconnect: () => void;
	visitorId: string | null;
	websiteId: string | null;
	userId: string | null;
};

type WebSocketProviderProps = {
	children: React.ReactNode;
	publicKey?: string;
	websiteId?: string;
	visitorId?: string;
	wsUrl?: string;
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
	wsUrl: _wsUrl,
	onConnect: _onConnect,
	onDisconnect: _onDisconnect,
	onError: _onError,
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

	// Track last event via subscription
	const [lastEvent, setLastEvent] = useState<AnyRealtimeEvent | null>(null);

	useEffect(() => {
		if (!realtime) {
			return;
		}
		return realtime.subscribe((event) => setLastEvent(event));
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
			lastEvent,
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
			lastEvent,
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
export type { RealtimeEvent } from "@plasma/types/realtime-events";
