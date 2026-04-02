"use client";

import { RealtimeProvider } from "@plasma/next/realtime";
import type { ReactNode } from "react";
import { useUserSession, useWebsite } from "@/contexts/website";
import { getWebSocketUrl } from "@/lib/url";

type DashboardWebSocketProviderProps = {
	children: ReactNode;
};

export function DashboardWebSocketProvider({
	children,
}: DashboardWebSocketProviderProps) {
	const { session, user } = useUserSession();
	const website = useWebsite();
	const sessionToken = session?.token ?? null;

	return (
		<RealtimeProvider
			auth={
				sessionToken
					? {
							kind: "session" as const,
							sessionToken,
							websiteId: website?.id ?? null,
							userId: user?.id ?? null,
						}
					: null
			}
			autoConnect={Boolean(sessionToken)}
			onError={(error) => {
				console.error("[DashboardRealtime] WebSocket error", error);
			}}
			wsUrl={getWebSocketUrl()}
		>
			{children}
		</RealtimeProvider>
	);
}
