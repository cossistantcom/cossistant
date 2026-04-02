"use client";

import {
	PRESENCE_AWAY_WINDOW_MS,
	PRESENCE_ONLINE_WINDOW_MS,
	PRESENCE_PING_INTERVAL_MS,
	type VisitorPresenceEntry,
} from "@plasma/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryTinybirdPipe, useTinybirdToken } from "@/lib/tinybird";
import { useTRPC } from "@/lib/trpc/client";

const REFRESH_INTERVAL_MS = PRESENCE_PING_INTERVAL_MS;
const ONLINE_WINDOW_MINUTES = Math.round(PRESENCE_ONLINE_WINDOW_MS / 60_000);
const AWAY_WINDOW_MINUTES = Math.round(PRESENCE_AWAY_WINDOW_MS / 60_000);
const DEFAULT_LIMIT = 100;

export const VISITOR_PRESENCE_QUERY_KEY_PREFIX = [
	"tinybird",
	"visitor-presence",
] as const;

type TinybirdVisitorPresenceRow = {
	visitor_id: string;
	status: "online" | "away" | null;
	last_seen_at: string;
	city: string | null;
	country_code: string | null;
	latitude: number | null;
	longitude: number | null;
	page_path: string | null;
	attribution_channel: string | null;
};

type PresenceProfile = {
	id: string;
	lastSeenAt: string | null;
	city: string | null;
	region: string | null;
	country: string | null;
	latitude: number | null;
	longitude: number | null;
	contactId: string | null;
	contactName: string | null;
	contactEmail: string | null;
	contactImage: string | null;
};

export type VisitorPresenceQueryData = {
	visitors: VisitorPresenceEntry[];
	totals: {
		online: number;
		away: number;
	};
};

function toNullableString(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function toNullableNumber(value: number | null | undefined): number | null {
	if (value === null || value === undefined) {
		return null;
	}

	return Number.isFinite(value) ? value : null;
}

function resolveStatus(
	status: TinybirdVisitorPresenceRow["status"],
	lastSeenAt: string,
	nowMs: number
): "online" | "away" {
	if (status === "online" || status === "away") {
		return status;
	}

	const lastSeenMs = Date.parse(lastSeenAt);
	if (
		!Number.isNaN(lastSeenMs) &&
		lastSeenMs >= nowMs - PRESENCE_ONLINE_WINDOW_MS
	) {
		return "online";
	}

	return "away";
}

function byNewestFirst(
	a: VisitorPresenceEntry,
	b: VisitorPresenceEntry
): number {
	const aMs = a.lastSeenAt
		? Date.parse(a.lastSeenAt)
		: Number.NEGATIVE_INFINITY;
	const bMs = b.lastSeenAt
		? Date.parse(b.lastSeenAt)
		: Number.NEGATIVE_INFINITY;

	return bMs - aMs;
}

export function mergeVisitorPresenceRows({
	rows,
	profilesByVisitorId,
	nowMs = Date.now(),
}: {
	rows: TinybirdVisitorPresenceRow[];
	profilesByVisitorId?: Record<string, PresenceProfile>;
	nowMs?: number;
}): VisitorPresenceQueryData {
	const visitors: VisitorPresenceEntry[] = rows.map((row) => {
		const profile = profilesByVisitorId?.[row.visitor_id];
		const name = toNullableString(profile?.contactName);
		const image = toNullableString(profile?.contactImage);
		const city = toNullableString(row.city) ?? toNullableString(profile?.city);
		const latitude =
			toNullableNumber(row.latitude) ?? toNullableNumber(profile?.latitude);
		const longitude =
			toNullableNumber(row.longitude) ?? toNullableNumber(profile?.longitude);
		const country =
			toNullableString(profile?.country) ?? toNullableString(row.country_code);

		return {
			id: row.visitor_id,
			status: resolveStatus(row.status, row.last_seen_at, nowMs),
			lastSeenAt: row.last_seen_at,
			name,
			email: toNullableString(profile?.contactEmail),
			image,
			city,
			region: toNullableString(profile?.region),
			country,
			latitude,
			longitude,
			contactId: toNullableString(profile?.contactId),
			pagePath: toNullableString(row.page_path),
			attributionChannel: toNullableString(row.attribution_channel),
		};
	});

	visitors.sort(byNewestFirst);

	let online = 0;
	let away = 0;
	for (const visitor of visitors) {
		if (visitor.status === "online") {
			online += 1;
		} else {
			away += 1;
		}
	}

	return {
		visitors,
		totals: {
			online,
			away,
		},
	};
}

export function getVisitorPresenceQueryKeyPrefix(websiteSlug: string) {
	return [...VISITOR_PRESENCE_QUERY_KEY_PREFIX, websiteSlug] as const;
}

export function useVisitorPresenceData({
	websiteSlug,
	limit = DEFAULT_LIMIT,
	enabled = true,
}: {
	websiteSlug: string;
	limit?: number;
	enabled?: boolean;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { data: tokenData } = useTinybirdToken(websiteSlug, {
		staleTimeMs: REFRESH_INTERVAL_MS,
	});

	return useQuery<VisitorPresenceQueryData>({
		queryKey: [
			...VISITOR_PRESENCE_QUERY_KEY_PREFIX,
			websiteSlug,
			ONLINE_WINDOW_MINUTES,
			AWAY_WINDOW_MINUTES,
			limit,
			tokenData?.token,
		],
		queryFn: async () => {
			if (!tokenData) {
				throw new Error("Tinybird token not available");
			}

			const { token, host } = tokenData;
			const rows = await queryTinybirdPipe<TinybirdVisitorPresenceRow>(
				"visitor_presence",
				{
					online_minutes: ONLINE_WINDOW_MINUTES,
					away_minutes: AWAY_WINDOW_MINUTES,
					limit,
				},
				token,
				host
			);

			const visitorIds = Array.from(
				new Set(rows.map((row) => row.visitor_id).filter(Boolean))
			);

			let profilesByVisitorId: Record<string, PresenceProfile> | undefined;

			if (visitorIds.length > 0) {
				try {
					const profilesResponse = await queryClient.fetchQuery(
						trpc.visitor.listPresenceProfiles.queryOptions({
							websiteSlug,
							visitorIds,
						})
					);
					profilesByVisitorId = profilesResponse.profilesByVisitorId;
				} catch (error) {
					console.error("[Presence] Failed to fetch visitor profiles", {
						websiteSlug,
						visitorCount: visitorIds.length,
						error,
					});
				}
			}

			return mergeVisitorPresenceRows({ rows, profilesByVisitorId });
		},
		enabled: enabled && !!tokenData,
		staleTime: REFRESH_INTERVAL_MS,
		refetchInterval: REFRESH_INTERVAL_MS,
		refetchOnReconnect: true,
		refetchOnWindowFocus: true,
	});
}
