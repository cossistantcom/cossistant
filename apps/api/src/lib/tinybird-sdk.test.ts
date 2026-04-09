import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { flattenVisitorTrackingContext } from "./visitor-attribution";

const findVisitorForWebsiteMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);

mock.module("@api/db/queries/visitor", () => ({
	findVisitorForWebsite: findVisitorForWebsiteMock,
	updateVisitorForWebsite: async () => null,
}));

const originalFetch = globalThis.fetch;
let currentModule: Awaited<ReturnType<typeof loadTinybirdSdk>> | null = null;

function loadTinybirdSdk() {
	return import(`./tinybird-sdk.ts?test=${Math.random()}`);
}

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
});

afterEach(async () => {
	if (currentModule?.flushAllEvents) {
		await currentModule.flushAllEvents();
		currentModule = null;
	}
	globalThis.fetch = originalFetch;
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
			currentModule = await loadTinybirdSdk();
			const { trackVisitorEvent, flushAllEvents } = currentModule;

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
			currentModule = await loadTinybirdSdk();
			const { flushAllEvents, trackVisitorActivity } = currentModule;

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
			currentModule = await loadTinybirdSdk();
			const { flushAllEvents, trackConversationMetricForVisitor } =
				currentModule;

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
});
