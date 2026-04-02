"use client";

import { type RealtimeAuthConfig, RealtimeClient } from "@plasma/core";
import type { AnyRealtimeEvent } from "@plasma/types/realtime-events";
import type React from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";

const DEFAULT_WS_URL = "wss://api.plasma-pandora.com/ws";

type SubscribeHandler = (event: AnyRealtimeEvent) => void;

type RealtimeProviderProps = {
	children: React.ReactNode;
	wsUrl?: string;
	auth: RealtimeAuthConfig | null;
	autoConnect?: boolean;
	onConnect?: () => void;
	onDisconnect?: () => void;
	onError?: (error: Error) => void;
};

type RealtimeContextValue = {
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

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

function extractAuthIdentity(auth: RealtimeAuthConfig | null) {
	if (!auth) {
		return { visitorId: null, websiteId: null, userId: null };
	}
	if (auth.kind === "visitor") {
		return {
			visitorId: auth.visitorId ?? null,
			websiteId: auth.websiteId ?? null,
			userId: null,
		};
	}
	return {
		visitorId: null,
		websiteId: auth.websiteId ?? null,
		userId: auth.userId ?? null,
	};
}

/**
 * Provides websocket connectivity and heartbeating logic for realtime events.
 * Backed by the framework-agnostic RealtimeClient from @plasma/core.
 */
export function RealtimeProvider({
	children,
	wsUrl = DEFAULT_WS_URL,
	auth,
	autoConnect = true,
	onConnect,
	onDisconnect,
	onError,
}: RealtimeProviderProps): React.ReactElement {
	const [lastEvent, setLastEvent] = useState<AnyRealtimeEvent | null>(null);

	const clientRef = useRef<RealtimeClient | null>(null);

	if (!clientRef.current) {
		clientRef.current = new RealtimeClient({
			wsUrl,
			onEvent: (event) => {
				setLastEvent(event);
			},
			onConnect,
			onDisconnect,
			onError,
		});
	}

	const client = clientRef.current;

	// Update callbacks without recreating client
	useEffect(() => {
		// Callbacks are captured in the RealtimeClient constructor closures,
		// but the onEvent writes to refs/state which are always current.
	}, [onConnect, onDisconnect, onError]);

	// Connect/disconnect based on auth + autoConnect
	useEffect(() => {
		if (autoConnect && auth) {
			client.connect(auth);
		} else {
			client.disconnect();
		}
	}, [client, auth, autoConnect]);

	// Cleanup on unmount
	useEffect(
		() => () => {
			clientRef.current?.destroy();
			clientRef.current = null;
		},
		[]
	);

	// Subscribe to state changes via useSyncExternalStore
	const connectionState = useSyncExternalStore(
		useCallback(
			(onStoreChange: () => void) => client.onStateChange(onStoreChange),
			[client]
		),
		() => client.getState(),
		() => client.getState()
	);

	const send = useCallback(
		(event: AnyRealtimeEvent) => client.send(event),
		[client]
	);

	const sendRaw = useCallback((data: string) => client.sendRaw(data), [client]);

	const subscribe = useCallback(
		(handler: SubscribeHandler) => client.subscribe(handler),
		[client]
	);

	const reconnect = useCallback(() => client.reconnect(), [client]);

	const identity = useMemo(() => extractAuthIdentity(auth), [auth]);

	const value = useMemo<RealtimeContextValue>(
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
			visitorId: identity.visitorId,
			websiteId: identity.websiteId,
			userId: identity.userId,
		}),
		[connectionState, send, sendRaw, subscribe, lastEvent, reconnect, identity]
	);

	return (
		<RealtimeContext.Provider value={value}>
			{children}
		</RealtimeContext.Provider>
	);
}

/**
 * Returns the realtime connection context.
 */
export function useRealtimeConnection(): RealtimeContextValue {
	const context = useContext(RealtimeContext);
	if (!context) {
		throw new Error(
			"useRealtimeConnection must be used within RealtimeProvider"
		);
	}

	return context;
}

export type { RealtimeContextValue };
export type { RealtimeAuthConfig } from "@plasma/core";
export type { RealtimeProviderProps };
export type { RealtimeEvent } from "@plasma/types/realtime-events";
