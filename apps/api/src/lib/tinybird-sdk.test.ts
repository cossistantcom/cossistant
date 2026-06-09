import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { flattenVisitorTrackingContext } from "./visitor-attribution";

const findVisitorForWebsiteMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const tinybirdIngestMock = mock(async () => {});
const tinybirdQueryMock = mock(
	async (_pipe: string, _params: Record<string, string>) => ({
		data: [] as unknown[],
	})
);

mock.module("@api/db/queries/visitor", () => ({
	findVisitorForWebsite: findVisitorForWebsiteMock,
	updateVisitorForWebsite: async () => null,
}));

mock.module("@tinybirdco/sdk", () => ({
	createTinybirdApi: () => ({
		ingest: tinybirdIngestMock,
		query: tinybirdQueryMock,
	}),
}));

const mockEnv = {
	TINYBIRD_ENABLED: true,
	TINYBIRD_HOST: "https://tinybird.example",
	TINYBIRD_TOKEN: "tb-token",
};

mock.module("@api/env", () => ({
	env: mockEnv,
}));

async function importTinybirdSdk(querySuffix: string) {
	return import(`./tinybird-sdk.ts?${querySuffix}`);
}

const originalFetch = globalThis.fetch;

function createTrackingContext() {
	return {
		attribution: {
			version: 1 as const,
			firstTouch: {
				channel: "paid" as const,
				isDirect: false,
				referrer: {
					url: "https://google.com",
					domain: "google.com",
				},
				landing: {
					url: "https://app.example.com/pricing?utm_source=google&utm_medium=cpc&gclid=gclid_123",
					path: "/pricing",
					title: "Pricing | Cossistant",
				},
				utm: {
					source: "google",
					medium: "cpc",
					campaign: "brand",
					content: "hero",
					term: null,
				},
				clickIds: {
					gclid: "gclid_123",
					gbraid: null,
					wbraid: null,
					fbclid: null,
					msclkid: null,
					ttclid: null,
					li_fat_id: null,
					twclid: null,
				},
				capturedAt: "2026-03-12T10:00:00.000Z",
			},
		},
		currentPage: {
			url: "https://app.example.com/pricing?utm_source=google&utm_medium=cpc&gclid=gclid_123",
			path: "/pricing",
			title: "Pricing | Cossistant",
			referrerUrl: "https://google.com",
			updatedAt: "2026-03-12T10:00:01.000Z",
		},
	};
}

beforeEach(() => {
	findVisitorForWebsiteMock.mockReset();
	tinybirdIngestMock.mockReset();
	tinybirdQueryMock.mockReset();
	tinybirdQueryMock.mockResolvedValue({ data: [] });
});

afterEach(async () => {
	const { flushAllEvents } = await importTinybirdSdk(
		`cleanup=${Math.random()}`
	);
	await flushAllEvents();
	globalThis.fetch = originalFetch;
	mockEnv.TINYBIRD_ENABLED = true;
});

describe("tinybird analytics queries", () => {
	it("queries unique visitors with an explicit website_id", async () => {
		tinybirdQueryMock.mockResolvedValue({
			data: [
				{ period: "current", unique_visitors: 42 },
				{ period: "previous", unique_visitors: 21 },
			],
		});
		const { queryUniqueVisitors } = await importTinybirdSdk(
			`unique-visitors=${Math.random()}`
		);

		const params = {
			website_id: "site-1",
			date_from: "2026-05-25T00:00:00.000Z",
			date_to: "2026-06-01T00:00:00.000Z",
			prev_date_from: "2026-05-18T00:00:00.000Z",
			prev_date_to: "2026-05-25T00:00:00.000Z",
		};
		const result = await queryUniqueVisitors(params);

		expect(result.data).toEqual([
			{ period: "current", unique_visitors: 42 },
			{ period: "previous", unique_visitors: 21 },
		]);
		expect(tinybirdQueryMock).toHaveBeenCalledWith("unique_visitors", params);
	});

	it("aggregates weekly digest stats from inbox analytics and unique visitors", async () => {
		tinybirdQueryMock.mockImplementation(
			async (pipe: string, _params: Record<string, string>) => {
				if (pipe === "inbox_analytics") {
					return {
						data: [
							{
								event_type: "conversation_started",
								median_duration: null,
								event_count: 12,
								period: "current",
							},
							{
								event_type: "conversation_resolved",
								median_duration: 300,
								event_count: 10,
								period: "current",
							},
							{
								event_type: "ai_resolved",
								median_duration: null,
								event_count: 5,
								period: "current",
							},
							{
								event_type: "first_response",
								median_duration: 120,
								event_count: 7,
								period: "current",
							},
							{
								event_type: "conversation_started",
								median_duration: null,
								event_count: 8,
								period: "previous",
							},
							{
								event_type: "conversation_resolved",
								median_duration: 600,
								event_count: 4,
								period: "previous",
							},
							{
								event_type: "ai_resolved",
								median_duration: null,
								event_count: 1,
								period: "previous",
							},
							{
								event_type: "first_response",
								median_duration: 240,
								event_count: 3,
								period: "previous",
							},
						],
					};
				}

				return {
					data: [
						{ period: "current", unique_visitors: 75 },
						{ period: "previous", unique_visitors: 50 },
					],
				};
			}
		);
		const { queryWeeklyDigestStats } = await importTinybirdSdk(
			`weekly-digest=${Math.random()}`
		);
		const params = {
			website_id: "site-1",
			date_from: "2026-05-25T00:00:00.000Z",
			date_to: "2026-06-01T00:00:00.000Z",
			prev_date_from: "2026-05-18T00:00:00.000Z",
			prev_date_to: "2026-05-25T00:00:00.000Z",
		};

		const result = await queryWeeklyDigestStats(params);

		expect(tinybirdQueryMock.mock.calls).toEqual([
			["inbox_analytics", params],
			["unique_visitors", params],
		]);
		expect(result).toEqual({
			current: {
				conversations: 12,
				uniqueVisitors: 75,
				aiHandledRate: 50,
				medianFirstResponseSeconds: 120,
				medianResolutionSeconds: 300,
			},
			previous: {
				conversations: 8,
				uniqueVisitors: 50,
				aiHandledRate: 25,
				medianFirstResponseSeconds: 240,
				medianResolutionSeconds: 600,
			},
		});
	});
});

describe("tinybird visitor tracking", () => {
	it("flushes page_view events to the visitor_events datasource with flattened attribution", async () => {
		const fetchMock = mock(
			async () =>
				new Response(JSON.stringify({ ok: true }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				})
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		const { attribution, currentPage } = createTrackingContext();
		const { trackVisitorEvent, flushAllEvents } = await importTinybirdSdk(
			`page-view=${Math.random()}`
		);

		trackVisitorEvent({
			website_id: "site-1",
			visitor_id: "visitor-1",
			event_type: "page_view",
			...flattenVisitorTrackingContext({ attribution, currentPage }),
		});
		await flushAllEvents();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0]).toBeDefined();
		const [url, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url).toContain("/v0/events?name=visitor_events");

		const payload = JSON.parse(String(init.body).trim()) as {
			event_type: string;
			page_url: string;
			attribution_channel: string;
			attribution_gclid: string;
		};
		expect(payload.event_type).toBe("page_view");
		expect(payload.page_url).toBe(
			"https://app.example.com/pricing?utm_source=google&utm_medium=cpc&gclid=gclid_123"
		);
		expect(payload.attribution_channel).toBe("paid");
		expect(payload.attribution_gclid).toBe("gclid_123");
	});

	it("flushes live visitor activity events to the visitor_activity_events datasource", async () => {
		const fetchMock = mock(
			async () =>
				new Response(JSON.stringify({ ok: true }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				})
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		const { attribution, currentPage } = createTrackingContext();
		const { flushAllEvents, trackVisitorActivity } = await importTinybirdSdk(
			`activity=${Math.random()}`
		);

		trackVisitorActivity({
			website_id: "site-1",
			visitor_id: "visitor-1",
			session_id: "session-1",
			event_type: "route_change",
			...flattenVisitorTrackingContext({ attribution, currentPage }),
		});
		await flushAllEvents();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url).toContain("/v0/events?name=visitor_activity_events");

		const payload = JSON.parse(String(init.body).trim()) as {
			event_type: string;
			session_id: string;
			page_path: string;
			attribution_channel: string;
		};
		expect(payload.event_type).toBe("route_change");
		expect(payload.session_id).toBe("session-1");
		expect(payload.page_path).toBe("/pricing");
		expect(payload.attribution_channel).toBe("paid");
	});

	it("enriches conversation metrics from the stored visitor attribution", async () => {
		const fetchMock = mock(
			async () =>
				new Response(JSON.stringify({ ok: true }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				})
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		const { attribution, currentPage } = createTrackingContext();
		findVisitorForWebsiteMock.mockResolvedValue({
			attribution,
			currentPage,
		});
		const { flushAllEvents, trackConversationMetricForVisitor } =
			await importTinybirdSdk(`conversation=${Math.random()}`);

		await trackConversationMetricForVisitor({} as never, {
			website_id: "site-1",
			visitor_id: "visitor-1",
			conversation_id: "conversation-1",
			event_type: "conversation_started",
		});
		await flushAllEvents();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0]).toBeDefined();
		const [url, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url).toContain("/v0/events?name=conversation_metrics");

		const payload = JSON.parse(String(init.body).trim()) as {
			conversation_id: string;
			duration_seconds: number;
			page_path: string;
			attribution_channel: string;
			attribution_referrer_domain: string;
		};
		expect(payload.conversation_id).toBe("conversation-1");
		expect(payload.duration_seconds).toBe(0);
		expect(payload.page_path).toBe("/pricing");
		expect(payload.attribution_channel).toBe("paid");
		expect(payload.attribution_referrer_domain).toBe("google.com");
	});

	it("skips event ingestion entirely when Tinybird is disabled", async () => {
		mockEnv.TINYBIRD_ENABLED = false;
		const fetchMock = mock(async () => {
			throw new Error("fetch should not be called when Tinybird is disabled");
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		const { flushAllEvents, trackPresence, trackVisitorActivity } =
			await importTinybirdSdk(`disabled=${Math.random()}`);

		trackPresence({
			website_id: "site-1",
			entity_id: "visitor-1",
			entity_type: "visitor",
		});
		trackVisitorActivity({
			website_id: "site-1",
			visitor_id: "visitor-1",
			event_type: "heartbeat",
		});
		await flushAllEvents();

		expect(fetchMock).not.toHaveBeenCalled();
	});
});
