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

/**
 * Support-specific realtime provider that authenticates visitors using the
 * core client's RealtimeClient and keeps the connection alive with presence pings.
 */
export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
	children,
	publicKey,
	websiteId,
	visitorId,
	wsUrl: _wsUrl,
	autoConnect = true,
	onConnect: _onConnect,
	onDisconnect: _onDisconnect,
	onError,
}) => {
	const { client } = useSupport();
	const realtime = client?.realtime ?? null;

	// Build auth config
	const auth = useMemo<RealtimeAuthConfig | null>(() => {
		const normalizedVisitorId = visitorId?.trim();
		if (!normalizedVisitorId) {
			return null;
		}
		return {
			kind: "visitor",
			visitorId: normalizedVisitorId,
			websiteId: websiteId?.trim() || null,
			publicKey: publicKey?.trim() || null,
		};
	}, [visitorId, websiteId, publicKey]);

	// Connect/disconnect
	useEffect(() => {
		if (!realtime) {
			return;
		}

		if (autoConnect && auth) {
			realtime.connect(auth);
		} else {
			realtime.disconnect();
		}
	}, [realtime, auth, autoConnect]);

	// Subscribe to connection state
	const connectionState = useSyncExternalStore(
		useCallback(
			(onStoreChange: () => void) =>
				realtime?.onStateChange(onStoreChange) ?? (() => {}),
			[realtime]
		),
		() =>
			realtime?.getState() ?? {
				status: "disconnected" as const,
				error: null,
				connectionId: null,
			},
		() =>
			realtime?.getState() ?? {
				status: "disconnected" as const,
				error: null,
				connectionId: null,
			}
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
			visitorId: visitorId ?? null,
			websiteId: websiteId ?? null,
			userId: null,
		}),
		[
			connectionState,
			send,
			sendRaw,
			subscribe,
			lastEvent,
			reconnect,
			visitorId,
			websiteId,
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
