"use client";

import {
	calculateResponseTimeScore,
	calculateSatisfactionIndex,
	type InboxAnalyticsResponse,
} from "@plasma/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { InboxAnalyticsRangeDays } from "@/components/inbox-analytics";
import { queryTinybirdPipe, useTinybirdToken } from "@/lib/tinybird";
import { useTRPC } from "@/lib/trpc/client";

const STALE_TIME = 300_000;

type InboxAnalyticsRow = {
	event_type: string;
	median_duration: number | null;
	event_count: number;
	period: "current" | "previous";
};

type UniqueVisitorsRow = {
	unique_visitors: number;
	period: "current" | "previous";
};

type SatisfactionSignals = {
	ratingScore: number | null;
	sentimentScore: number | null;
};

type ParseMetricsOptions = {
	hideSatisfactionIndex?: boolean;
	period: "current" | "previous";
	satisfactionSignals: SatisfactionSignals | null;
};

function toNumberOrNull(value: unknown): number | null {
	if (value === null || value === undefined) {
		return null;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

export function computeDateRanges(rangeDays: number, maxRetentionDays: number) {
	const now = new Date();
	const currentEnd = now;
	const currentStart = new Date(
		now.getTime() - rangeDays * 24 * 60 * 60 * 1000
	);
	const previousEnd = currentStart;
	const previousStart = new Date(
		previousEnd.getTime() - rangeDays * 24 * 60 * 60 * 1000
	);

	const retentionCutoff = new Date(
		now.getTime() - maxRetentionDays * 24 * 60 * 60 * 1000
	);

	const effectiveCurrentStart = new Date(
		Math.max(currentStart.getTime(), retentionCutoff.getTime())
	);
	const effectivePreviousStart = new Date(
		Math.max(previousStart.getTime(), retentionCutoff.getTime())
	);

	return {
		currentStart,
		currentEnd,
		previousStart,
		previousEnd,
		effectiveCurrentStart,
		effectivePreviousStart,
	};
}

export function parseMetricsFromTinybird(
	analyticsRows: InboxAnalyticsRow[],
	visitorsRows: UniqueVisitorsRow[],
	{
		hideSatisfactionIndex = false,
		period,
		satisfactionSignals,
	}: ParseMetricsOptions
) {
	const periodData = analyticsRows.filter((row) => row.period === period);

	const firstResponseRow = periodData.find(
		(row) => row.event_type === "first_response"
	);
	const conversationResolvedRow = periodData.find(
		(row) => row.event_type === "conversation_resolved"
	);
	const aiResolvedRow = periodData.find(
		(row) => row.event_type === "ai_resolved"
	);
	const conversationStartedRow = periodData.find(
		(row) => row.event_type === "conversation_started"
	);

	const medianResponseTimeSeconds = toNumberOrNull(
		firstResponseRow?.median_duration
	);
	const medianResolutionTimeSeconds = toNumberOrNull(
		conversationResolvedRow?.median_duration
	);

	const totalResolved = Number(conversationResolvedRow?.event_count ?? 0);
	const aiResolved = Number(aiResolvedRow?.event_count ?? 0);
	const aiHandledRate =
		totalResolved > 0 ? (aiResolved / totalResolved) * 100 : null;

	const totalConversations = Number(
		conversationStartedRow?.event_count ?? totalResolved
	);
	const resolutionScore =
		totalConversations > 0 ? (totalResolved / totalConversations) * 100 : null;

	const currentVisitors = visitorsRows.find((row) => row.period === period);
	const uniqueVisitors = Number(currentVisitors?.unique_visitors ?? 0);

	const responseTimeScore = calculateResponseTimeScore(
		medianResponseTimeSeconds
	);

	const satisfactionIndex = hideSatisfactionIndex
		? null
		: calculateSatisfactionIndex({
				ratingScore: satisfactionSignals?.ratingScore ?? null,
				sentimentScore: satisfactionSignals?.sentimentScore ?? null,
				responseTimeScore,
				resolutionScore,
			});

	return {
		medianResponseTimeSeconds,
		medianResolutionTimeSeconds,
		aiHandledRate,
		satisfactionIndex,
		uniqueVisitors,
	};
}

export function useInboxAnalytics({
	websiteSlug,
	rangeDays,
	enabled = true,
}: {
	websiteSlug: string;
	rangeDays: InboxAnalyticsRangeDays;
	enabled?: boolean;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { data: tokenData } = useTinybirdToken(websiteSlug, {
		staleTimeMs: STALE_TIME,
	});

	return useQuery<InboxAnalyticsResponse>({
		queryKey: ["inbox-analytics", websiteSlug, rangeDays, tokenData?.token],
		queryFn: async () => {
			if (!tokenData) {
				throw new Error("Tinybird token not available");
			}
			const { token, host, maxRetentionDays } = tokenData;

			const ranges = computeDateRanges(rangeDays, maxRetentionDays);
			const hasFullPreviousSatisfactionWindow =
				ranges.effectivePreviousStart.getTime() ===
				ranges.previousStart.getTime();

			const [
				analyticsRows,
				visitorsRows,
				currentSatisfactionSignals,
				previousSatisfactionSignals,
			] = await Promise.all([
				queryTinybirdPipe<InboxAnalyticsRow>(
					"inbox_analytics",
					{
						date_from: ranges.effectiveCurrentStart.toISOString(),
						date_to: ranges.currentEnd.toISOString(),
						prev_date_from: ranges.effectivePreviousStart.toISOString(),
						prev_date_to: ranges.previousEnd.toISOString(),
					},
					token,
					host
				),

				queryTinybirdPipe<UniqueVisitorsRow>(
					"unique_visitors",
					{
						date_from: ranges.effectiveCurrentStart.toISOString(),
						date_to: ranges.currentEnd.toISOString(),
						prev_date_from: ranges.effectivePreviousStart.toISOString(),
						prev_date_to: ranges.previousEnd.toISOString(),
					},
					token,
					host
				),

				queryClient
					.fetchQuery(
						trpc.website.getSatisfactionSignals.queryOptions({
							websiteSlug,
							dateFrom: ranges.effectiveCurrentStart.toISOString(),
							dateTo: ranges.currentEnd.toISOString(),
						})
					)
					.catch(() => null),

				hasFullPreviousSatisfactionWindow
					? queryClient
							.fetchQuery(
								trpc.website.getSatisfactionSignals.queryOptions({
									websiteSlug,
									dateFrom: ranges.previousStart.toISOString(),
									dateTo: ranges.previousEnd.toISOString(),
								})
							)
							.catch(() => null)
					: Promise.resolve(null),
			]);

			const current = parseMetricsFromTinybird(analyticsRows, visitorsRows, {
				period: "current",
				satisfactionSignals: currentSatisfactionSignals,
			});
			const previous = parseMetricsFromTinybird(analyticsRows, visitorsRows, {
				period: "previous",
				satisfactionSignals: previousSatisfactionSignals,
				hideSatisfactionIndex:
					!hasFullPreviousSatisfactionWindow ||
					previousSatisfactionSignals === null,
			});

			return {
				range: {
					rangeDays,
					currentStart: ranges.currentStart.toISOString(),
					currentEnd: ranges.currentEnd.toISOString(),
					previousStart: ranges.previousStart.toISOString(),
					previousEnd: ranges.previousEnd.toISOString(),
				},
				current,
				previous,
			};
		},
		enabled: enabled && !!tokenData,
		staleTime: STALE_TIME,
		refetchInterval: STALE_TIME,
	});
}
