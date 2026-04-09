"use client";

import type { VisitorPresenceProfile } from "@cossistant/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	ONLINE_NOW_REFRESH_INTERVAL_MS,
	type OnlineEntity,
	useOnlineNow,
} from "@/data/use-online-now";
import { useTRPC } from "@/lib/trpc/client";

type ProfilesByVisitorId = Record<string, VisitorPresenceProfile>;
const MAX_VISITOR_IDS_PER_PROFILE_QUERY = 500;

export type LiveVisitorEntity = OnlineEntity & {
	contactId: string | null;
	email: string | null;
};

function toNullableString(value: string | null | undefined) {
	if (!value) {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function mergeLiveVisitorEntities({
	entities,
	profilesByVisitorId,
}: {
	entities: readonly OnlineEntity[];
	profilesByVisitorId?: ProfilesByVisitorId | null;
}): LiveVisitorEntity[] {
	return entities.map((entity) => {
		const profile = profilesByVisitorId?.[entity.entity_id];
		const profileName = toNullableString(profile?.contactName);
		const profileImage = toNullableString(profile?.contactImage);
		const profileEmail = toNullableString(profile?.contactEmail);
		const profileCity = toNullableString(profile?.city);

		return {
			...entity,
			name: profileName ?? entity.name,
			image: profileImage ?? entity.image,
			city: entity.city ?? profileCity,
			latitude: entity.latitude ?? profile?.latitude ?? null,
			longitude: entity.longitude ?? profile?.longitude ?? null,
			contactId: profile?.contactId ?? null,
			email: profileEmail,
		};
	});
}

function chunkVisitorIds(visitorIds: readonly string[]) {
	const chunks: string[][] = [];

	for (
		let startIndex = 0;
		startIndex < visitorIds.length;
		startIndex += MAX_VISITOR_IDS_PER_PROFILE_QUERY
	) {
		chunks.push(
			visitorIds.slice(
				startIndex,
				startIndex + MAX_VISITOR_IDS_PER_PROFILE_QUERY
			)
		);
	}

	return chunks;
}

export function useLiveVisitorsData({
	websiteSlug,
	enabled = true,
}: {
	websiteSlug: string;
	enabled?: boolean;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const onlineNowQuery = useOnlineNow({
		enabled,
		websiteSlug,
	});

	const visitorIds = useMemo(
		() =>
			Array.from(
				new Set(
					(onlineNowQuery.data ?? [])
						.filter((entity) => entity.entity_type === "visitor")
						.map((entity) => entity.entity_id)
				)
			),
		[onlineNowQuery.data]
	);

	const presenceProfilesQuery = useQuery({
		queryKey: ["live-visitors", "presence-profiles", websiteSlug, visitorIds],
		queryFn: async () => {
			if (visitorIds.length === 0) {
				return null;
			}

			try {
				const profilesByVisitorId: ProfilesByVisitorId = {};
				const visitorIdChunks = chunkVisitorIds(visitorIds);

				for (const visitorIdChunk of visitorIdChunks) {
					const response = await queryClient.fetchQuery(
						trpc.visitor.listPresenceProfiles.queryOptions({
							websiteSlug,
							visitorIds: visitorIdChunk,
						})
					);

					Object.assign(profilesByVisitorId, response.profilesByVisitorId);
				}

				return { profilesByVisitorId };
			} catch (error) {
				console.error("[LiveVisitors] Failed to fetch presence profiles", {
					error,
					visitorCount: visitorIds.length,
					websiteSlug,
				});
				return null;
			}
		},
		enabled: enabled && visitorIds.length > 0,
		staleTime: ONLINE_NOW_REFRESH_INTERVAL_MS,
		refetchInterval: ONLINE_NOW_REFRESH_INTERVAL_MS,
		refetchOnReconnect: true,
		refetchOnWindowFocus: true,
	});

	const data = useMemo(
		() =>
			mergeLiveVisitorEntities({
				entities: onlineNowQuery.data ?? [],
				profilesByVisitorId: presenceProfilesQuery.data?.profilesByVisitorId,
			}),
		[onlineNowQuery.data, presenceProfilesQuery.data?.profilesByVisitorId]
	);

	return {
		data,
		isError: onlineNowQuery.isError,
		isFetching: onlineNowQuery.isFetching || presenceProfilesQuery.isFetching,
		isLoading:
			onlineNowQuery.isLoading ||
			(visitorIds.length > 0 &&
				presenceProfilesQuery.isLoading &&
				(onlineNowQuery.data?.length ?? 0) === 0),
	};
}
