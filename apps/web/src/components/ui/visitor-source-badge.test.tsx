import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { VisitorSourceBadge } from "./visitor-source-badge";

describe("VisitorSourceBadge", () => {
	it("renders an external referrer badge with a favicon image", () => {
		const html = renderToStaticMarkup(
			<VisitorSourceBadge
				attribution={{
					version: 1 as const,
					firstTouch: {
						channel: "social" as const,
						isDirect: false,
						referrer: {
							url: "https://x.com/cossistant/status/123",
							domain: "x.com",
						},
						landing: {
							url: "https://app.example.com/pricing",
							path: "/pricing",
							title: "Pricing | Cossistant",
						},
						utm: {
							source: null,
							medium: null,
							campaign: null,
							content: null,
							term: null,
						},
						clickIds: {
							gclid: null,
							gbraid: null,
							wbraid: null,
							fbclid: null,
							msclkid: null,
							ttclid: null,
							li_fat_id: null,
							twclid: null,
						},
						capturedAt: "2026-03-01T09:30:00.000Z",
					},
				}}
			/>
		);

		expect(html).toContain('data-slot="visitor-source-badge"');
		expect(html).toContain('data-slot="visitor-source-badge-favicon"');
		// Displayed at 12px (size-3) but requested at 16px so the favicon stays
		// crisp on high-DPI screens.
		expect(html).toContain('class="size-3 shrink-0 rounded-[2px]"');
		expect(html).toContain('height="16"');
		expect(html).toContain('width="16"');
		expect(html).toContain("Twitter");
	});

	it("uses a canonical favicon for popular utm aliases", () => {
		const html = renderToStaticMarkup(
			<VisitorSourceBadge
				attribution={{
					version: 1 as const,
					firstTouch: {
						channel: "social" as const,
						isDirect: false,
						referrer: {
							url: null,
							domain: null,
						},
						landing: {
							url: "https://app.example.com/pricing?utm_source=reddit&utm_medium=social",
							path: "/pricing",
							title: "Pricing | Cossistant",
						},
						utm: {
							source: "reddit",
							medium: "social",
							campaign: null,
							content: null,
							term: null,
						},
						clickIds: {
							gclid: null,
							gbraid: null,
							wbraid: null,
							fbclid: null,
							msclkid: null,
							ttclid: null,
							li_fat_id: null,
							twclid: null,
						},
						capturedAt: "2026-03-01T09:30:00.000Z",
					},
				}}
			/>
		);

		expect(html).toContain('data-slot="visitor-source-badge"');
		expect(html).toContain('data-slot="visitor-source-badge-favicon"');
		expect(html).toContain('src="https://reddit.com/favicon.ico"');
		expect(html).not.toContain('data-slot="visitor-source-badge-fallback"');
		expect(html).toContain("Reddit");
	});

	it("falls back to the globe icon when a source has no favicon domain", () => {
		const html = renderToStaticMarkup(
			<VisitorSourceBadge
				attribution={{
					version: 1 as const,
					firstTouch: {
						channel: "email" as const,
						isDirect: false,
						referrer: {
							url: null,
							domain: null,
						},
						landing: {
							url: "https://app.example.com/pricing?utm_source=email",
							path: "/pricing",
							title: "Pricing | Cossistant",
						},
						utm: {
							source: "email",
							medium: null,
							campaign: null,
							content: null,
							term: null,
						},
						clickIds: {
							gclid: null,
							gbraid: null,
							wbraid: null,
							fbclid: null,
							msclkid: null,
							ttclid: null,
							li_fat_id: null,
							twclid: null,
						},
						capturedAt: "2026-03-01T09:30:00.000Z",
					},
				}}
			/>
		);

		expect(html).toContain('data-slot="visitor-source-badge"');
		expect(html).toContain('data-slot="visitor-source-badge-fallback"');
		expect(html).not.toContain('data-slot="visitor-source-badge-favicon"');
		expect(html).toContain("Email");
	});

	it("hides direct traffic by default", () => {
		const html = renderToStaticMarkup(
			<VisitorSourceBadge
				attribution={{
					version: 1 as const,
					firstTouch: {
						channel: "direct" as const,
						isDirect: true,
						referrer: {
							url: null,
							domain: null,
						},
						landing: {
							url: "https://app.example.com",
							path: "/",
							title: "Home | Cossistant",
						},
						utm: {
							source: null,
							medium: null,
							campaign: null,
							content: null,
							term: null,
						},
						clickIds: {
							gclid: null,
							gbraid: null,
							wbraid: null,
							fbclid: null,
							msclkid: null,
							ttclid: null,
							li_fat_id: null,
							twclid: null,
						},
						capturedAt: "2026-03-01T09:30:00.000Z",
					},
				}}
			/>
		);

		expect(html).toBe("");
	});
});
