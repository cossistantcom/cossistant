import { describe, expect, it } from "bun:test";
import type { VisitorAttribution } from "@plasma/types";
import { getVisitorAttributionDisplay } from "./visitor-attribution";

function createAttribution(params: {
	channel?: VisitorAttribution["firstTouch"]["channel"];
	isDirect?: boolean;
	referrerDomain?: string | null;
	referrerUrl?: string | null;
	utmSource?: string | null;
}): VisitorAttribution {
	return {
		version: 1,
		firstTouch: {
			channel: params.channel ?? "social",
			isDirect: params.isDirect ?? false,
			referrer: {
				url: params.referrerUrl ?? null,
				domain: params.referrerDomain ?? null,
			},
			landing: {
				url: "https://app.example.com/pricing",
				path: "/pricing",
				title: "Pricing | Cossistant",
			},
			utm: {
				source: params.utmSource ?? null,
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
	};
}

describe("getVisitorAttributionDisplay", () => {
	it("resolves a reddit utm alias to the canonical label and favicon domain", () => {
		const display = getVisitorAttributionDisplay(
			createAttribution({
				utmSource: "reddit",
			})
		);

		expect(display.sourceLabel).toBe("Reddit");
		expect(display.sourceDomain).toBe("reddit.com");
		expect(display.faviconUrl).toBe("https://reddit.com/favicon.ico");
	});

	it("normalizes twitter aliases to Twitter with an x.com favicon", () => {
		const twitterDisplay = getVisitorAttributionDisplay(
			createAttribution({
				utmSource: "twitter",
			})
		);
		const xDisplay = getVisitorAttributionDisplay(
			createAttribution({
				utmSource: "x",
			})
		);

		expect(twitterDisplay.sourceLabel).toBe("Twitter");
		expect(twitterDisplay.sourceDomain).toBe("x.com");
		expect(twitterDisplay.faviconUrl).toBe("https://x.com/favicon.ico");
		expect(xDisplay.sourceLabel).toBe("Twitter");
		expect(xDisplay.sourceDomain).toBe("x.com");
		expect(xDisplay.faviconUrl).toBe("https://x.com/favicon.ico");
	});

	it("normalizes reddit referrer domains and keeps them ahead of utm aliases", () => {
		for (const referrerDomain of ["reddit.com", "www.reddit.com"]) {
			const display = getVisitorAttributionDisplay(
				createAttribution({
					referrerDomain,
					referrerUrl: `https://${referrerDomain}/r/nextjs/comments/123`,
					utmSource: "hn",
				})
			);

			expect(display.sourceLabel).toBe("Reddit");
			expect(display.sourceDomain).toBe("reddit.com");
			expect(display.faviconUrl).toBe("https://reddit.com/favicon.ico");
			expect(display.sourceUrl).toBe(
				`https://${referrerDomain}/r/nextjs/comments/123`
			);
		}
	});

	it("normalizes x.com and twitter.com referrers to the same canonical source", () => {
		for (const referrerDomain of ["x.com", "twitter.com"]) {
			const display = getVisitorAttributionDisplay(
				createAttribution({
					referrerDomain,
					referrerUrl: `https://${referrerDomain}/cossistant/status/123`,
				})
			);

			expect(display.sourceLabel).toBe("Twitter");
			expect(display.sourceDomain).toBe("x.com");
			expect(display.faviconUrl).toBe("https://x.com/favicon.ico");
		}
	});

	it("falls back to an unmapped referrer domain when the source is not curated", () => {
		const display = getVisitorAttributionDisplay(
			createAttribution({
				channel: "referral",
				referrerDomain: "blog.example.com",
				referrerUrl: "https://blog.example.com/post",
			})
		);

		expect(display.sourceLabel).toBe("Blog Example");
		expect(display.sourceDomain).toBe("blog.example.com");
		expect(display.faviconUrl).toBe("https://blog.example.com/favicon.ico");
	});
});
