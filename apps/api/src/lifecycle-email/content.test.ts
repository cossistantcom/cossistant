import { describe, expect, it } from "bun:test";
import { buildLifecycleEmail } from "./content";
import { LIFECYCLE_EMAIL_KEYS } from "./types";

function buildWeeklyDigestEmail(stats: {
	current: {
		conversations: number;
		uniqueVisitors: number;
		aiHandledRate: number | null;
		medianFirstResponseSeconds: number | null;
		medianResolutionSeconds: number | null;
	};
	previous: {
		conversations: number;
		uniqueVisitors: number;
		aiHandledRate: number | null;
		medianFirstResponseSeconds: number | null;
		medianResolutionSeconds: number | null;
	};
}) {
	return buildLifecycleEmail({
		appUrl: "https://app.cossistant.com/",
		event: {
			emailKey: LIFECYCLE_EMAIL_KEYS.WEEKLY_DIGEST,
			metadata: {
				websiteName: "Acme Docs",
				websiteSlug: "acme-docs",
			},
		},
		organizationName: "Acme Org",
		recipientName: "Anthony Riera",
		weeklyDigestStats: stats,
	});
}

describe("weekly digest lifecycle email content", () => {
	it("uses the website name as the exact subject and renders Tinybird deltas", () => {
		const email = buildWeeklyDigestEmail({
			current: {
				conversations: 123,
				uniqueVisitors: 318,
				aiHandledRate: 64,
				medianFirstResponseSeconds: 252,
				medianResolutionSeconds: 90,
			},
			previous: {
				conversations: 100,
				uniqueVisitors: 346,
				aiHandledRate: 58,
				medianFirstResponseSeconds: 307,
				medianResolutionSeconds: 120,
			},
		});

		expect(email.subject).toBe("Acme Docs");
		expect(email.text).toContain("Here is your Cossistant week for Acme Docs");
		expect(email.text).toContain("Conversations: 123 (+23% vs last week)");
		expect(email.text).toContain("Unique visitors: 318 (-8% vs last week)");
		expect(email.text).toContain("AI handled: 64% (+6 pts vs last week)");
		expect(email.text).toContain(
			"Median first response: 4m 12s (-18% vs last week)"
		);
		expect(email.text).toContain(
			"Median resolution: 1m 30s (-25% vs last week)"
		);
		expect(email.text).toContain("https://app.cossistant.com/acme-docs/inbox");
	});

	it("formats previous-zero and missing-duration cases", () => {
		const email = buildWeeklyDigestEmail({
			current: {
				conversations: 5,
				uniqueVisitors: 0,
				aiHandledRate: null,
				medianFirstResponseSeconds: null,
				medianResolutionSeconds: 30,
			},
			previous: {
				conversations: 0,
				uniqueVisitors: 0,
				aiHandledRate: null,
				medianFirstResponseSeconds: 10,
				medianResolutionSeconds: 0,
			},
		});

		expect(email.text).toContain("Conversations: 5 (new vs last week)");
		expect(email.text).toContain("Unique visitors: 0 (0% vs last week)");
		expect(email.text).toContain("AI handled: -");
		expect(email.text).toContain("Median first response: -");
		expect(email.text).toContain("Median resolution: 30s (new vs last week)");
	});

	it("keeps quiet-week copy and still includes real comparison rows", () => {
		const email = buildWeeklyDigestEmail({
			current: {
				conversations: 0,
				uniqueVisitors: 8,
				aiHandledRate: null,
				medianFirstResponseSeconds: null,
				medianResolutionSeconds: null,
			},
			previous: {
				conversations: 4,
				uniqueVisitors: 10,
				aiHandledRate: 50,
				medianFirstResponseSeconds: 120,
				medianResolutionSeconds: 300,
			},
		});

		expect(email.subject).toBe("Acme Docs");
		expect(email.text).toContain("Quiet week for Acme Docs in Cossistant.");
		expect(email.text).toContain("Conversations: 0 (-100% vs last week)");
		expect(email.text).toContain("Unique visitors: 8 (-20% vs last week)");
		expect(email.text).toContain("Median first response: -");
	});
});

describe("limit warning lifecycle email content", () => {
	it("links website limit warnings to the plan settings page", () => {
		const email = buildLifecycleEmail({
			appUrl: "https://app.cossistant.com/",
			event: {
				emailKey: LIFECYCLE_EMAIL_KEYS.LIMIT_WARNING,
				metadata: {
					websiteName: "Acme Docs",
					websiteSlug: "acme-docs",
					limitName: "contact",
					limitUsed: 23,
					limitValue: 25,
					limitUnit: "contacts",
				},
			},
			organizationName: "Acme Org",
			recipientName: "Anthony Riera",
		});

		expect(email.text).toContain(
			"https://app.cossistant.com/acme-docs/settings/plan"
		);
		expect(email.text).not.toContain("/settings/billing");
	});
});
