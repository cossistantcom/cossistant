import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { InboxAnalyticsResponse } from "@plasma/types";
import { renderToStaticMarkup } from "react-dom/server";

let capturedControllerState: Record<string, unknown> | null = null;

let inboxAnalyticsQueryState = {
	data: null as InboxAnalyticsResponse | null,
	isError: false,
	isFetching: false,
	isLoading: false,
};

let onlineNowQueryState = {
	data: [] as Array<{ entity_id: string; entity_type: string }>,
	isFetching: false,
	isLoading: false,
};

const useInboxAnalyticsMock = mock(
	((_: { websiteSlug: string; rangeDays: number; enabled?: boolean }) =>
		inboxAnalyticsQueryState) as (args: {
		websiteSlug: string;
		rangeDays: number;
		enabled?: boolean;
	}) => typeof inboxAnalyticsQueryState
);
const useOnlineNowMock = mock(
	((_: { websiteSlug: string; minutes?: number; enabled?: boolean }) =>
		onlineNowQueryState) as (args: {
		websiteSlug: string;
		minutes?: number;
		enabled?: boolean;
	}) => typeof onlineNowQueryState
);

mock.module("@/data/use-inbox-analytics", () => ({
	useInboxAnalytics: useInboxAnalyticsMock,
}));

mock.module("@/data/use-online-now", () => ({
	ONLINE_NOW_QUERY_KEY_PREFIX: ["tinybird", "online-now"] as const,
	getOnlineNowQueryKeyPrefix: (websiteSlug: string) =>
		["tinybird", "online-now", websiteSlug] as const,
	isVisitorOnlineEntity: (entity: { entity_type: string }) =>
		entity.entity_type === "visitor",
	useOnlineNow: useOnlineNowMock,
}));

const modulePromise = import("./inbox-analytics");

describe("InboxAnalytics", () => {
	beforeEach(() => {
		capturedControllerState = null;
		useInboxAnalyticsMock.mockClear();
		useOnlineNowMock.mockClear();
		inboxAnalyticsQueryState = {
			data: null,
			isError: false,
			isFetching: false,
			isLoading: false,
		};
		onlineNowQueryState = {
			data: [],
			isFetching: false,
			isLoading: false,
		};
	});

	it("keeps live presence fetching separate from historical analytics loading", async () => {
		onlineNowQueryState = {
			data: [
				{ entity_id: "entity_1", entity_type: "visitor" },
				{ entity_id: "entity_2", entity_type: "user" },
				{ entity_id: "entity_3", entity_type: "visitor" },
			],
			isFetching: true,
			isLoading: false,
		};

		const { useInboxAnalyticsController } = await modulePromise;

		function ControllerProbe() {
			capturedControllerState = useInboxAnalyticsController({
				websiteSlug: "acme",
			}) as Record<string, unknown>;
			return null;
		}

		renderToStaticMarkup(<ControllerProbe />);

		expect(capturedControllerState).not.toBeNull();
		expect(capturedControllerState?.isLoading).toBe(false);
		expect(capturedControllerState?.livePresence).toEqual({
			count: 2,
			isFetching: true,
			isLoading: false,
		});
	});

	it("keeps unique visitors separate from the live presence count", async () => {
		inboxAnalyticsQueryState = {
			data: {
				range: {
					rangeDays: 7,
					currentStart: "2026-03-21T00:00:00.000Z",
					currentEnd: "2026-03-28T00:00:00.000Z",
					previousStart: "2026-03-14T00:00:00.000Z",
					previousEnd: "2026-03-21T00:00:00.000Z",
				},
				current: {
					medianResponseTimeSeconds: 120,
					medianResolutionTimeSeconds: 1800,
					aiHandledRate: 60,
					satisfactionIndex: 75,
					uniqueVisitors: 987,
				},
				previous: {
					medianResponseTimeSeconds: 150,
					medianResolutionTimeSeconds: 2100,
					aiHandledRate: 55,
					satisfactionIndex: 70,
					uniqueVisitors: 654,
				},
			},
			isError: false,
			isFetching: false,
			isLoading: false,
		};
		onlineNowQueryState = {
			data: [
				{ entity_id: "entity_1", entity_type: "visitor" },
				{ entity_id: "entity_2", entity_type: "visitor" },
				{ entity_id: "entity_3", entity_type: "user" },
			],
			isFetching: false,
			isLoading: false,
		};

		const { useInboxAnalyticsController } = await modulePromise;

		function ControllerProbe() {
			capturedControllerState = useInboxAnalyticsController({
				websiteSlug: "acme",
			}) as Record<string, unknown>;
			return null;
		}

		renderToStaticMarkup(<ControllerProbe />);

		const inboxAnalyticsArgs = useInboxAnalyticsMock.mock.calls[0]?.[0] as
			| {
					websiteSlug: string;
					rangeDays: number;
					enabled: boolean;
			  }
			| undefined;
		const onlineNowArgs = useOnlineNowMock.mock.calls[0]?.[0] as
			| {
					websiteSlug: string;
					enabled: boolean;
			  }
			| undefined;

		expect(inboxAnalyticsArgs).toEqual({
			websiteSlug: "acme",
			rangeDays: 7,
			enabled: true,
		});
		expect(onlineNowArgs).toEqual({
			websiteSlug: "acme",
			enabled: true,
		});
		expect(
			(capturedControllerState?.data as InboxAnalyticsResponse | null)?.current
				.uniqueVisitors
		).toBe(987);
		expect(capturedControllerState?.livePresence).toEqual({
			count: 2,
			isFetching: false,
			isLoading: false,
		});
	});
});
