import type React from "react";

/**
 * Previously bridged websocket events into the core client stores.
 * Event routing is now handled by CossistantClient.handleRealtimeEvent()
 * in @plasma/core, so this component is a no-op passthrough retained
 * for tree compatibility.
 */
export function SupportRealtimeProvider({
	children,
}: {
	children: React.ReactNode;
}): React.ReactElement {
	return <>{children}</>;
}
