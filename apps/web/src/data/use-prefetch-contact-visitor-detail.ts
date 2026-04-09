"use client";

import type { RouterOutputs } from "@api/trpc/types";
import { useQueryNormalizer } from "@normy/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTRPC } from "@/lib/trpc/client";

type VisitorDetail = RouterOutputs["conversation"]["getVisitorById"];
type ContactDetail = RouterOutputs["contact"]["get"];

export type ContactVisitorDetailPrefetchTarget =
	| {
			type: "contact";
			id: string;
	  }
	| {
			type: "visitor";
			id: string;
	  };

type HookOptions = {
	websiteSlug: string;
};

function getUniqueVisitorIds(contactDetail: ContactDetail | null | undefined) {
	return Array.from(
		new Set((contactDetail?.visitors ?? []).map((visitor) => visitor.id))
	);
}

export function usePrefetchContactVisitorDetail({ websiteSlug }: HookOptions) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const queryNormalizer = useQueryNormalizer();

	const normalizeData = useCallback(
		(data: unknown) => {
			if (!data) {
				return;
			}

			queryNormalizer.setNormalizedData(
				data as Parameters<typeof queryNormalizer.setNormalizedData>[0]
			);
		},
		[queryNormalizer]
	);

	const prefetchVisitorDetail = useCallback(
		async (visitorId: string) => {
			const visitorQueryOptions = trpc.conversation.getVisitorById.queryOptions(
				{
					visitorId,
					websiteSlug,
				}
			);
			const cachedVisitor = queryClient.getQueryData<VisitorDetail>(
				visitorQueryOptions.queryKey
			);

			if (
				queryClient.getQueryState(visitorQueryOptions.queryKey)?.dataUpdatedAt
			) {
				normalizeData(cachedVisitor);
				return cachedVisitor ?? null;
			}

			const visitor = await queryClient.fetchQuery(visitorQueryOptions);
			normalizeData(visitor);

			return visitor ?? null;
		},
		[normalizeData, queryClient, trpc, websiteSlug]
	);

	const prefetchContactDetail = useCallback(
		async (contactId: string) => {
			const contactQueryOptions = trpc.contact.get.queryOptions({
				contactId,
				websiteSlug,
			});
			let contactDetail = queryClient.getQueryData<ContactDetail>(
				contactQueryOptions.queryKey
			);

			if (
				!queryClient.getQueryState(contactQueryOptions.queryKey)?.dataUpdatedAt
			) {
				contactDetail = await queryClient.fetchQuery(contactQueryOptions);
			}

			const visitorIds = getUniqueVisitorIds(contactDetail);

			await Promise.allSettled(
				visitorIds.map(async (visitorId) => {
					try {
						await prefetchVisitorDetail(visitorId);
					} catch (error) {
						console.warn("[DetailPrefetch] Failed to prefetch visitor detail", {
							contactId,
							error,
							visitorId,
							websiteSlug,
						});
					}
				})
			);

			return contactDetail ?? null;
		},
		[prefetchVisitorDetail, queryClient, trpc, websiteSlug]
	);

	const prefetchDetail = useCallback(
		async (target: ContactVisitorDetailPrefetchTarget) => {
			if (target.type === "contact") {
				await prefetchContactDetail(target.id);
				return;
			}

			await prefetchVisitorDetail(target.id);
		},
		[prefetchContactDetail, prefetchVisitorDetail]
	);

	return {
		prefetchDetail,
	};
}
