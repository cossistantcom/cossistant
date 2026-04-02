import { describe, expect, it } from "bun:test";
import type * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UsageBar } from "./usage-bar";

function renderUsageBar(
	props: Partial<React.ComponentProps<typeof UsageBar>> = {}
) {
	return renderToStaticMarkup(
		<UsageBar current={25} label="Messages" limit={100} {...props} />
	);
}

describe("UsageBar", () => {
	it("renders a segmented meter for finite usage", () => {
		const html = renderUsageBar();

		expect(html).toContain('data-slot="usage-bar-meter"');
		expect(html).toContain('data-slot="usage-bar-track"');
		expect(html).toContain('data-slot="usage-bar-fill"');
		expect(html).toContain('role="progressbar"');
		expect(html).toContain('aria-label="Messages usage"');
		expect(html).toContain('aria-valuemax="100"');
		expect(html).toContain('aria-valuenow="25"');
		expect(html).toContain("width:max(25%, var(--usage-bar-min-fill))");
	});

	it("keeps a minimum visible fill for very small nonzero usage", () => {
		const html = renderUsageBar({ current: 1, limit: 1000 });

		expect(html).toContain("width:max(0.1%, var(--usage-bar-min-fill))");
	});

	it("switches to limit-reached styling at the limit", () => {
		const html = renderUsageBar({ current: 100, limit: 100 });

		expect(html).toContain("text-plasma-orange");
	});

	it("does not render the meter for unlimited usage", () => {
		const html = renderUsageBar({ limit: null });

		expect(html).not.toContain('data-slot="usage-bar-meter"');
	});

	it("does not render the meter when showBar is false", () => {
		const html = renderUsageBar({ showBar: false });

		expect(html).not.toContain('data-slot="usage-bar-meter"');
	});

	it("renders a safe empty track for disabled limits", () => {
		const html = renderUsageBar({ current: 10, limit: false });

		expect(html).toContain('data-slot="usage-bar-meter"');
		expect(html).not.toContain('role="progressbar"');
		expect(html).toContain("width:0%");
	});
});
