import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const animatedBeamSource = readFileSync(
	new URL("./components/animated-beam.tsx", import.meta.url),
	"utf8"
);
const toolsGraphicSource = readFileSync(
	new URL("./components/benefits/tools.tsx", import.meta.url),
	"utf8"
);
const topbarSource = readFileSync(
	new URL("./components/topbar/index.tsx", import.meta.url),
	"utf8"
);
const lazyMobileMenuSource = readFileSync(
	new URL("./components/topbar/lazy-mobile-menu.tsx", import.meta.url),
	"utf8"
);
const dashboardButtonSource = readFileSync(
	new URL("./components/topbar/dashboard-button.tsx", import.meta.url),
	"utf8"
);
const testTimelineSource = readFileSync(
	new URL(
		"../../components/test-ui/timeline/dashboard-conversation-timeline-list.tsx",
		import.meta.url
	),
	"utf8"
);

describe("landing hydration guards", () => {
	it("keeps framework links in deterministic server markup", () => {
		expect(pageSource).not.toContain("TooltipOnHover");

		for (const { href, label } of [
			{ href: "https://react.dev", label: "React website" },
			{ href: "https://nextjs.org", label: "Next.js website" },
			{ href: "https://tailwindcss.com", label: "Tailwind CSS website" },
			{ href: "https://ui.shadcn.com", label: "shadcn/ui website" },
		]) {
			expect(pageSource).toContain(`aria-label="${label}"`);
			expect(pageSource).toContain(`href="${href}"`);
		}

		expect(pageSource.match(/rel="noreferrer"/g)).toHaveLength(4);
	});

	it("does not randomize beam timing during render", () => {
		expect(animatedBeamSource).toContain("duration = 5");
		expect(animatedBeamSource).not.toMatch(/duration\s*=\s*Math\.random\s*\(/);

		const durations = Array.from(
			toolsGraphicSource.matchAll(/duration=\{(\d+(?:\.\d+)?)\}/g),
			(match) => Number(match[1])
		);

		expect(durations).toHaveLength(6);
		expect(new Set(durations).size).toBeGreaterThan(1);
	});

	it("keeps top-bar browser state out of the hydration render", () => {
		expect(topbarSource).toContain("<LazyTopbarMobileMenu");
		expect(lazyMobileMenuSource).toContain(
			'import dynamic from "next/dynamic"'
		);
		expect(lazyMobileMenuSource).toContain("{ ssr: false }");
		expect(dashboardButtonSource).toContain(
			"isPending={!hasMounted || isPending}"
		);
		expect(dashboardButtonSource).toContain(
			"isSignedIn={hasMounted && !!session?.user}"
		);
	});

	it("formats demo conversation dates and timestamps deterministically", () => {
		expect(testTimelineSource).toContain('date.toLocaleDateString("en-US", {');
		expect(testTimelineSource).toContain('date.toLocaleTimeString("en-US", {');
		expect(testTimelineSource).toContain('timeZone: "UTC"');
		expect(testTimelineSource).toContain("formatDate={formatTestUiDate}");
		expect(testTimelineSource).toContain(
			"formatTimestamp={formatTestUiTimestamp}"
		);
	});
});
