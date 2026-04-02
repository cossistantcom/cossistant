import type { AnyRealtimeEvent } from "@plasma/types/realtime-events";
import { useEffect } from "react";
import { useWebSocket } from "../support/context/websocket";

export type UseRealtimeSupportOptions = {
	onEvent?: (event: AnyRealtimeEvent) => void;
};

export type UseRealtimeSupportResult = {
	isConnected: boolean;
	isConnecting: boolean;
	error: Error | null;
	send: (event: AnyRealtimeEvent) => void;
	lastEvent: AnyRealtimeEvent | null;
	/** @deprecated Use `lastEvent` instead. */
	lastMessage: AnyRealtimeEvent | null;
	subscribe: (handler: (event: AnyRealtimeEvent) => void) => () => void;
};

/**
 * Subscribes to websocket updates pushed by the provider-level
 * `WebSocketProvider`. Delegates low-level connection state while optionally
 * invoking the consumer supplied `onEvent` handler for every realtime event.
 */
export function useRealtimeSupport(
	options: UseRealtimeSupportOptions = {}
): UseRealtimeSupportResult {
	const { onEvent } = options;
	const { isConnected, isConnecting, error, send, subscribe, lastEvent } =
		useWebSocket();

	// Subscribe to WebSocket events
	useEffect(() => {
		if (onEvent) {
			const unsubscribe = subscribe(onEvent);

			return unsubscribe;
		}
	}, [onEvent, subscribe]);

	return {
		isConnected,
		isConnecting,
		error,
		send,
		subscribe,
		lastEvent,
		lastMessage: lastEvent,
	};
}
