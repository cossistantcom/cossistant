"use client";

import type { RealtimeAuthConfig } from "@cossistant/core/realtime-client";
import { RealtimeClient } from "@cossistant/core/realtime-client";
import type { AnyRealtimeEvent } from "@cossistant/types/realtime-events";
import type React from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useSyncExternalStore,
} from "react";

const DEFAULT_WS_URL = "wss://api.cossistant.com/ws";

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
	if (auth.kind === "privateKey") {
		return {
			visitorId: null,
			websiteId: auth.websiteId ?? null,
			userId: auth.userId ?? auth.actorUserId ?? null,
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
 * Backed by the framework-agnostic RealtimeClient from @cossistant/core.
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
	const lastEventRef = useRef<AnyRealtimeEvent | null>(null);
	const onConnectRef = useRef(onConnect);
	const onDisconnectRef = useRef(onDisconnect);
	const onErrorRef = useRef(onError);

	const clientRef = useRef<RealtimeClient | null>(null);
	const pendingDisposalRef = useRef<ReturnType<
		typeof globalThis.setTimeout
	> | null>(null);

	if (!clientRef.current) {
		clientRef.current = new RealtimeClient({
			wsUrl,
			onEvent: (event) => {
				lastEventRef.current = event;
			},
			// Route through refs so the latest callback props are always invoked.
			onConnect: () => onConnectRef.current?.(),
			onDisconnect: () => onDisconnectRef.current?.(),
			onError: (error) => onErrorRef.current?.(error),
		});
	}

	const client = clientRef.current;

	// Update callbacks without recreating client
	useEffect(() => {
		onConnectRef.current = onConnect;
		onDisconnectRef.current = onDisconnect;
		onErrorRef.current = onError;
	}, [onConnect, onDisconnect, onError]);

	// Connect/disconnect based on auth + autoConnect
	useEffect(() => {
		if (autoConnect && auth) {
			client.connect(auth);
		} else {
			client.disconnect();
		}
	}, [client, auth, autoConnect]);

	// Cleanup on unmount. Disposal is deferred one macrotask so StrictMode's
	// synchronous cleanup/setup replay cancels it instead of permanently
	// destroying the client.
	useEffect(() => {
		if (pendingDisposalRef.current !== null) {
			globalThis.clearTimeout(pendingDisposalRef.current);
			pendingDisposalRef.current = null;
		}

		return () => {
			if (pendingDisposalRef.current !== null) {
				globalThis.clearTimeout(pendingDisposalRef.current);
			}

			pendingDisposalRef.current = globalThis.setTimeout(() => {
				pendingDisposalRef.current = null;
				clientRef.current?.destroy();
				clientRef.current = null;
			}, 0);
		};
	}, []);

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
			// Delivered via a ref instead of state so a busy socket does not
			// re-render every context consumer per event.
			get lastEvent() {
				return lastEventRef.current;
			},
			connectionId: connectionState.connectionId,
			reconnect,
			visitorId: identity.visitorId,
			websiteId: identity.websiteId,
			userId: identity.userId,
		}),
		[connectionState, send, sendRaw, subscribe, reconnect, identity]
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
export type { RealtimeAuthConfig } from "@cossistant/core";
export type { RealtimeProviderProps };
export type { RealtimeEvent } from "@cossistant/types/realtime-events";
