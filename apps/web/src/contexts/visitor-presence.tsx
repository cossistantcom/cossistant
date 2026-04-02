"use client";

import type { VisitorPresenceEntry } from "@plasma/types";
import { createContext, useContext, useMemo } from "react";
import { useVisitorPresenceData } from "@/data/use-visitor-presence";

type VisitorPresenceContextValue = {
	visitors: VisitorPresenceEntry[];
	presenceByVisitorId: Map<string, VisitorPresenceEntry>;
	onlineCount: number;
	awayCount: number;
	isLoading: boolean;
	isFetching: boolean;
	refetch: () => Promise<VisitorPresenceEntry[] | undefined>;
};

const VisitorPresenceContext =
	createContext<VisitorPresenceContextValue | null>(null);

export function VisitorPresenceProvider({
	children,
	websiteSlug,
}: {
	children: React.ReactNode;
	websiteSlug: string;
}) {
	const query = useVisitorPresenceData({ websiteSlug });

	const visitors = query.data?.visitors ?? [];

	const presenceByVisitorId = useMemo(() => {
		const map = new Map<string, VisitorPresenceEntry>();

		for (const visitor of visitors) {
			map.set(visitor.id, visitor);
		}

		return map;
	}, [visitors]);

	const value = useMemo<VisitorPresenceContextValue>(
		() => ({
			visitors,
			presenceByVisitorId,
			onlineCount: query.data?.totals.online ?? 0,
			awayCount: query.data?.totals.away ?? 0,
			isLoading: query.isLoading,
			isFetching: query.isFetching,
			refetch: async () => {
				const result = await query.refetch();
				return result.data?.visitors;
			},
		}),
		[
			visitors,
			presenceByVisitorId,
			query.data?.totals.away,
			query.data?.totals.online,
			query.isFetching,
			query.isLoading,
			query.refetch,
		]
	);

	return (
		<VisitorPresenceContext.Provider value={value}>
			{children}
		</VisitorPresenceContext.Provider>
	);
}

export function useVisitorPresence(): VisitorPresenceContextValue {
	const context = useContext(VisitorPresenceContext);

	if (!context) {
		throw new Error(
			"useVisitorPresence must be used within a VisitorPresenceProvider"
		);
	}

	return context;
}

export function useVisitorPresenceById(
	visitorId: string | null | undefined
): VisitorPresenceEntry | null {
	const { presenceByVisitorId } = useVisitorPresence();

	if (!visitorId) {
		return null;
	}

	return presenceByVisitorId.get(visitorId) ?? null;
}
