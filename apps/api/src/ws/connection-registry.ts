import type { AnyRealtimeEvent } from "@plasma/types/realtime-events";
import type { ServerWebSocket } from "bun";
import type { DispatchOptions } from "./router";

export type RawSocket = ServerWebSocket & { connectionId?: string };

export type LocalConnectionRecord = {
	socket: RawSocket;
	websiteId?: string;
	organizationId?: string;
	userId?: string;
	visitorId?: string;
};

/**
 * Primary connection store - maps connectionId to connection record
 */
export const localConnections = new Map<string, LocalConnectionRecord>();

/**
 * Index: websiteId -> Set of connectionIds
 * Used for O(1) lookup when dispatching to all connections for a website
 */
const connectionsByWebsiteId = new Map<string, Set<string>>();

/**
 * Index: visitorId -> Set of connectionIds
 * Used for O(1) lookup when dispatching to all connections for a visitor
 */
const connectionsByVisitorId = new Map<string, Set<string>>();

/**
 * Adds a connection to the registry and updates indexes.
 * Should be called when a connection is established.
 *
 * If the connectionId already exists, cleans up stale references from
 * previous websiteId/visitorId sets before registering the new record.
 */
export function registerConnection(
	connectionId: string,
	record: LocalConnectionRecord
): void {
	// Check for existing record and clean up stale index references
	const existingRecord = localConnections.get(connectionId);
	if (existingRecord) {
		// Remove from previous website index if websiteId changed
		if (
			existingRecord.websiteId &&
			existingRecord.websiteId !== record.websiteId
		) {
			const prevWebsiteConnections = connectionsByWebsiteId.get(
				existingRecord.websiteId
			);
			if (prevWebsiteConnections) {
				prevWebsiteConnections.delete(connectionId);
				if (prevWebsiteConnections.size === 0) {
					connectionsByWebsiteId.delete(existingRecord.websiteId);
				}
			}
		}

		// Remove from previous visitor index if visitorId changed
		if (
			existingRecord.visitorId &&
			existingRecord.visitorId !== record.visitorId
		) {
			const prevVisitorConnections = connectionsByVisitorId.get(
				existingRecord.visitorId
			);
			if (prevVisitorConnections) {
				prevVisitorConnections.delete(connectionId);
				if (prevVisitorConnections.size === 0) {
					connectionsByVisitorId.delete(existingRecord.visitorId);
				}
			}
		}
	}

	localConnections.set(connectionId, record);

	// Update website index
	if (record.websiteId) {
		let websiteConnections = connectionsByWebsiteId.get(record.websiteId);
		if (!websiteConnections) {
			websiteConnections = new Set();
			connectionsByWebsiteId.set(record.websiteId, websiteConnections);
		}
		websiteConnections.add(connectionId);
	}

	// Update visitor index
	if (record.visitorId) {
		let visitorConnections = connectionsByVisitorId.get(record.visitorId);
		if (!visitorConnections) {
			visitorConnections = new Set();
			connectionsByVisitorId.set(record.visitorId, visitorConnections);
		}
		visitorConnections.add(connectionId);
	}
}

/**
 * Removes a connection from the registry and updates indexes.
 * Should be called when a connection is closed.
 */
export function unregisterConnection(connectionId: string): void {
	const record = localConnections.get(connectionId);

	if (record) {
		// Remove from website index
		if (record.websiteId) {
			const websiteConnections = connectionsByWebsiteId.get(record.websiteId);
			if (websiteConnections) {
				websiteConnections.delete(connectionId);
				if (websiteConnections.size === 0) {
					connectionsByWebsiteId.delete(record.websiteId);
				}
			}
		}

		// Remove from visitor index
		if (record.visitorId) {
			const visitorConnections = connectionsByVisitorId.get(record.visitorId);
			if (visitorConnections) {
				visitorConnections.delete(connectionId);
				if (visitorConnections.size === 0) {
					connectionsByVisitorId.delete(record.visitorId);
				}
			}
		}
	}

	localConnections.delete(connectionId);
}

/**
 * Gets the count of active connections (for monitoring/debugging)
 */
export function getConnectionStats(): {
	totalConnections: number;
	uniqueWebsites: number;
	uniqueVisitors: number;
} {
	return {
		totalConnections: localConnections.size,
		uniqueWebsites: connectionsByWebsiteId.size,
		uniqueVisitors: connectionsByVisitorId.size,
	};
}

function createExcludePredicate(
	options?: DispatchOptions
): ((connectionId: string) => boolean) | undefined {
	if (!options?.exclude) {
		return;
	}

	const excludeIds = Array.isArray(options.exclude)
		? new Set(options.exclude)
		: new Set<string>([options.exclude]);

	return (connectionId: string) => excludeIds.has(connectionId);
}

function sendEventToSocket(
	record: LocalConnectionRecord,
	serializedEvent: string
): void {
	try {
		record.socket.send(serializedEvent);
	} catch (error) {
		console.error("[WebSocket] Failed to send event:", error);
	}
}

export function dispatchEventToLocalConnection(
	connectionId: string,
	event: AnyRealtimeEvent
): void {
	const connection = localConnections.get(connectionId);
	if (!connection) {
		return;
	}

	const serializedEvent = JSON.stringify(event);
	sendEventToSocket(connection, serializedEvent);
}

/**
 * Dispatches an event to all connections for a specific visitor.
 * Uses indexed lookup for O(1) access to visitor's connections.
 */
export function dispatchEventToLocalVisitor(
	visitorId: string,
	event: AnyRealtimeEvent,
	options?: DispatchOptions
): void {
	// O(1) lookup using visitor index
	const visitorConnectionIds = connectionsByVisitorId.get(visitorId);
	if (!visitorConnectionIds || visitorConnectionIds.size === 0) {
		return;
	}

	const shouldExclude = createExcludePredicate(options);
	const serializedEvent = JSON.stringify(event);

	for (const connectionId of visitorConnectionIds) {
		if (shouldExclude?.(connectionId)) {
			continue;
		}

		const connection = localConnections.get(connectionId);
		if (!connection) {
			// Connection was removed but index not yet cleaned up - skip
			continue;
		}

		sendEventToSocket(connection, serializedEvent);
	}
}

/**
 * Dispatches an event to all dashboard/user connections for a specific website.
 * Uses indexed lookup for O(1) access to website's connections.
 */
export function dispatchEventToLocalWebsite(
	websiteId: string,
	event: AnyRealtimeEvent,
	options?: DispatchOptions
): void {
	// O(1) lookup using website index
	const websiteConnectionIds = connectionsByWebsiteId.get(websiteId);
	if (!websiteConnectionIds || websiteConnectionIds.size === 0) {
		return;
	}

	const shouldExclude = createExcludePredicate(options);
	const serializedEvent = JSON.stringify(event);

	for (const connectionId of websiteConnectionIds) {
		if (shouldExclude?.(connectionId)) {
			continue;
		}

		const connection = localConnections.get(connectionId);
		if (!connection) {
			// Connection was removed but index not yet cleaned up - skip
			continue;
		}

		// Only dashboard/user connections should receive website events
		if (!connection.userId) {
			continue;
		}

		sendEventToSocket(connection, serializedEvent);
	}
}
