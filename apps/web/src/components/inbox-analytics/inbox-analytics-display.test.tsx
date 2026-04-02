import { describe, expect, it } from "bun:test";
import type { InboxAnalyticsResponse } from "@plasma/types";
import { renderToStaticMarkup } from "react-dom/server";
import { InboxAnalyticsDisplay } from "./inbox-analytics-display";

const analyticsData = {
	current: {
		medianResponseTimeSeconds: 125,
		medianResolutionTimeSeconds: 3600,
		aiHandledRate: 80,
		satisfactionIndex: 73,
		uniqueVisitors: 987,
	},
	previous: {
		medianResponseTimeSeconds: 250,
		medianResolutionTimeSeconds: 5400,
		aiHandledRate: 60,
		satisfactionIndex: 68,
		uniqueVisitors: 321,
	},
} as InboxAnalyticsResponse;

const livePresence = {
	count: 1234,
	isFetching: true,
	isLoading: false,
};

function getLivePresenceSection(html: string) {
	const match = html.match(
		/<section[^>]*data-slot="inbox-analytics-live-presence"[\s\S]*?<\/section>/
	);

	if (!match) {
		throw new Error("Live presence section not found");
	}

	return match[0];
}

describe("InboxAnalyticsDisplay", () => {
	it("renders the inline desktop layout with the live metric before analytics", () => {
		const html = renderToStaticMarkup(
			<InboxAnalyticsDisplay
				controlSize="sm"
				data={analyticsData}
				livePresence={livePresence}
				onRangeChange={() => {}}
				rangeDays={14}
			/>
		);

		expect(html).toContain('data-layout="inline"');
		expect(html).toContain('data-slot="inbox-analytics-live-presence"');
		expect(html).toContain('data-slot="inbox-analytics-live-count"');
		expect(html).toContain('aria-label="Live visitors"');
		expect(html).toContain("Live visitors");
		expect(html).toContain('data-slot="inbox-analytics-live-dot"');
		expect(html).toContain('data-slot="inbox-analytics-live-dot-pulse"');
		expect(html).toContain("bg-emerald-600");
		expect(html).toContain("1,234");
		expect(html).toContain("987");
		expect(html).toContain("Median response time");
		expect(
			html.indexOf('data-slot="inbox-analytics-live-presence"')
		).toBeLessThan(html.indexOf("Median response time"));
		expect(
			getLivePresenceSection(html).indexOf(
				'data-slot="inbox-analytics-live-dot"'
			)
		).toBeLessThan(
			getLivePresenceSection(html).indexOf(
				'data-slot="inbox-analytics-live-count"'
			)
		);
		expect(getLivePresenceSection(html)).not.toContain(
			'data-slot="inbox-analytics-delta"'
		);
		expect(html).toContain("2m 5s");
		expect(html).toContain("1h");
		expect(html).toContain("80%");
		expect(html).toContain('aria-label="Analytics date range"');
		expect(html).toContain(">30d<");
		expect(html).toContain("shrink-0");
	});

	it("can render the inline desktop layout without the control", () => {
		const html = renderToStaticMarkup(
			<InboxAnalyticsDisplay
				data={analyticsData}
				onRangeChange={() => {}}
				rangeDays={14}
				showControl={false}
			/>
		);

		expect(html).toContain('data-layout="inline"');
		expect(html).toContain("Median response time");
		expect(html).not.toContain('aria-label="Analytics date range"');
	});

	it("renders the sheet layout with stacked metrics", () => {
		const html = renderToStaticMarkup(
			<InboxAnalyticsDisplay
				controlSize="default"
				data={analyticsData}
				layout="sheet"
				livePresence={livePresence}
				onRangeChange={() => {}}
				rangeDays={30}
			/>
		);

		expect(html).toContain('data-layout="sheet"');
		expect(html).toContain('data-slot="inbox-analytics-live-presence"');
		expect(html).toContain('data-slot="inbox-analytics-live-count"');
		expect(html).toContain('aria-label="Live visitors"');
		expect(html).toContain("Live visitors");
		expect(html).toContain('data-slot="inbox-analytics-live-dot"');
		expect(html).toContain('data-slot="inbox-analytics-live-dot-pulse"');
		expect(html).toContain("bg-emerald-600");
		expect(
			getLivePresenceSection(html).indexOf(
				'data-slot="inbox-analytics-live-dot"'
			)
		).toBeLessThan(
			getLivePresenceSection(html).indexOf(
				'data-slot="inbox-analytics-live-count"'
			)
		);
		expect(getLivePresenceSection(html)).not.toContain(
			'data-slot="inbox-analytics-delta"'
		);
		expect(html).toContain("Unique visitors");
		expect(html).toContain("1,234");
		expect(html).toContain("rounded-[10px]");
		expect(html).not.toContain("w-[188px]");
	});

	it("keeps fallback values when analytics data is unavailable", () => {
		const html = renderToStaticMarkup(
			<InboxAnalyticsDisplay
				data={null}
				isError
				layout="sheet"
				onRangeChange={() => {}}
				rangeDays={7}
			/>
		);

		expect(html).toContain('data-error="true"');
		expect(html).toContain("Median response time");
		expect(html).toContain("—");
	});
});
