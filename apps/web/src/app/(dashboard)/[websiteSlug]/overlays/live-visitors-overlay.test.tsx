import { describe, expect, it, mock } from "bun:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const avatarProps: Array<{
	fallbackName: string;
	lastOnlineAt?: string | null;
	status?: string;
	tooltipContent?: React.ReactNode | null;
	url?: string | null;
}> = [];
const closeLiveVisitorsOverlayCalls: string[] = [];
const openVisitorDetailCalls: string[] = [];
const prefetchDetailCalls: Array<{
	id: string;
	type: "contact" | "visitor";
}> = [];
const liveVisitorsOverlayState = {
	isOpen: false,
};
const liveVisitorsQueryState: {
	data:
		| Array<{
				contactId: string | null;
				email: string | null;
				attribution_channel: string | null;
				city: string | null;
				country_code: string | null;
				entity_id: string;
				entity_type: "user" | "visitor";
				image: string;
				last_seen: string;
				latitude: number | null;
				longitude: number | null;
				name: string;
				page_path: string | null;
		  }>
		| undefined;
	isError: boolean;
	isFetching: boolean;
	isLoading: boolean;
} = {
	data: [],
	isError: false,
	isFetching: false,
	isLoading: false,
};
const rowButtonClickHandlers: Array<() => void> = [];
const rowButtonFocusHandlers: Array<() => void> = [];
const rowButtonMouseEnterHandlers: Array<() => void> = [];

mock.module("next/link", () => ({
	default: ({
		children,
		href,
	}: {
		children: React.ReactNode;
		href: string;
	}) => <a href={href}>{children}</a>,
}));

mock.module("@/components/ui/avatar", () => ({
	Avatar: ({
		fallbackName,
		lastOnlineAt,
		status,
		tooltipContent,
		url,
	}: {
		fallbackName: string;
		lastOnlineAt?: string | null;
		status?: string;
		tooltipContent?: React.ReactNode | null;
		url?: string | null;
	}) => {
		avatarProps.push({
			fallbackName,
			lastOnlineAt,
			status,
			tooltipContent,
			url,
		});

		return (
			<div
				data-fallback-name={fallbackName}
				data-last-online-at={lastOnlineAt ?? ""}
				data-slot="mock-avatar"
				data-status={status ?? ""}
				data-url={url ?? ""}
			/>
		);
	},
}));

mock.module("@/components/globe", () => ({
	Globe: ({
		rotationSpeed,
		visitors,
	}: {
		rotationSpeed?: number;
		visitors?: Array<{
			facehashSeed?: string | null;
			id: string;
			name: string;
			pageLabel?: string | null;
		}>;
	}) => (
		<div
			data-rotation-speed={rotationSpeed == null ? "" : String(rotationSpeed)}
			data-slot="mock-globe"
		>
			{visitors?.map((visitor) => (
				<div
					data-facehash-seed={visitor.facehashSeed ?? ""}
					data-id={visitor.id}
					data-name={visitor.name}
					data-page-label={visitor.pageLabel ?? ""}
					data-slot="mock-globe-visitor"
					key={visitor.id}
				/>
			))}
		</div>
	),
}));

mock.module("@/components/inbox-analytics", () => ({
	InboxAnalyticsDesktopHeaderActions: ({
		actionIconName,
		actionLabel,
	}: {
		actionIconName: string;
		actionLabel: string;
	}) => (
		<div
			data-action-icon={actionIconName}
			data-action-label={actionLabel}
			data-slot="mock-inbox-analytics-desktop-header-actions"
		/>
	),
	InboxAnalyticsDisplay: ({
		livePresence,
		rangeDays,
	}: {
		livePresence?: {
			count: number | null;
		};
		rangeDays: number;
	}) => (
		<div
			data-live-count={livePresence?.count ?? "none"}
			data-range-days={rangeDays}
			data-slot="mock-inbox-analytics-display"
		/>
	),
	useInboxAnalyticsController: () => ({
		data: null,
		isError: false,
		isLoading: false,
		rangeDays: 7,
		setRangeDays: () => {},
	}),
}));

mock.module("@/components/ui/button", () => ({
	Button: ({
		children,
		onClick,
		onFocus,
		onMouseEnter,
		...props
	}: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
		if (onClick) {
			rowButtonClickHandlers.push(() => {
				onClick({
					preventDefault() {},
					stopPropagation() {},
				} as never);
			});
		}
		if (onFocus) {
			rowButtonFocusHandlers.push(() => {
				onFocus({
					preventDefault() {},
					stopPropagation() {},
				} as never);
			});
		}
		if (onMouseEnter) {
			rowButtonMouseEnterHandlers.push(() => {
				onMouseEnter({
					preventDefault() {},
					stopPropagation() {},
				} as never);
			});
		}

		return (
			<button {...props} type={props.type ?? "button"}>
				{children}
			</button>
		);
	},
}));

mock.module("@/components/ui/scroll-area", () => ({
	ScrollArea: ({
		children,
		className,
	}: {
		children: React.ReactNode;
		className?: string;
	}) => <div className={className}>{children}</div>,
}));

mock.module("@/components/ui/spinner", () => ({
	Spinner: ({ className }: { className?: string }) => (
		<div className={className}>spinner</div>
	),
}));

mock.module("@/contexts/website", () => ({
	useWebsite: () => ({
		slug: "acme",
	}),
}));

mock.module("@/data/use-live-visitors-data", () => ({
	useLiveVisitorsData: () => liveVisitorsQueryState,
}));

mock.module("@/data/use-online-now", () => ({
	isVisitorOnlineEntity: (entity: { entity_type: string }) =>
		entity.entity_type === "visitor",
}));

mock.module("@/data/use-prefetch-contact-visitor-detail", () => ({
	usePrefetchContactVisitorDetail: () => ({
		prefetchDetail: (target: { id: string; type: "contact" | "visitor" }) => {
			prefetchDetailCalls.push(target);
			return Promise.resolve();
		},
	}),
}));

mock.module("@/hooks/use-contact-visitor-detail-state", () => ({
	useContactVisitorDetailState: () => ({
		openVisitorDetail: (visitorId: string) => {
			openVisitorDetailCalls.push(visitorId);
			return Promise.resolve([]);
		},
	}),
}));

mock.module("@/hooks/use-live-visitors-overlay-state", () => ({
	useLiveVisitorsOverlayState: () => ({
		closeLiveVisitorsOverlay: () => {
			closeLiveVisitorsOverlayCalls.push("close");
			return Promise.resolve(new URLSearchParams());
		},
		...liveVisitorsOverlayState,
	}),
}));

const modulePromise = import("./live-visitors-overlay");

function resetState() {
	avatarProps.length = 0;
	closeLiveVisitorsOverlayCalls.length = 0;
	liveVisitorsOverlayState.isOpen = false;
	openVisitorDetailCalls.length = 0;
	prefetchDetailCalls.length = 0;
	liveVisitorsQueryState.data = [];
	liveVisitorsQueryState.isError = false;
	liveVisitorsQueryState.isFetching = false;
	liveVisitorsQueryState.isLoading = false;
	rowButtonClickHandlers.length = 0;
	rowButtonFocusHandlers.length = 0;
	rowButtonMouseEnterHandlers.length = 0;
}

async function renderView(
	props: Partial<{
		isLiveError: boolean;
		isLiveLoading: boolean;
		livePresence: {
			count: number | null;
			isFetching: boolean;
			isLoading: boolean;
		};
		liveVisitors: Array<{
			avatarUrl: string | null;
			attributionChannel: string | null;
			city: string | null;
			contactId: string | null;
			countryCode: string | null;
			email: string | null;
			id: string;
			lastSeen: string;
			latitude: number | null;
			longitude: number | null;
			name: string;
			pagePath: string | null;
		}>;
		onClose: () => void;
		onVisitorPrefetch: (visitorId: string) => void;
		onVisitorSelect: (visitorId: string) => void;
	}>
) {
	resetState();
	const { LiveVisitorsOverlayView } = await modulePromise;

	return renderToStaticMarkup(
		<LiveVisitorsOverlayView
			analyticsData={null}
			analyticsIsError={false}
			analyticsIsLoading={false}
			isLiveError={false}
			isLiveLoading={false}
			livePresence={
				props.livePresence ?? {
					count: 2,
					isFetching: false,
					isLoading: false,
				}
			}
			liveVisitors={[
				{
					avatarUrl: "https://example.com/visitor-1.png",
					attributionChannel: "paid_social",
					city: "Bangkok",
					contactId: "contact-1",
					countryCode: "TH",
					email: "alpha@example.com",
					id: "visitor-1",
					lastSeen: "2026-03-30T08:30:00.000Z",
					latitude: 13.7563,
					longitude: 100.5018,
					name: "Alpha Visitor",
					pagePath: "/pricing",
				},
				{
					avatarUrl: null,
					attributionChannel: null,
					city: "Chiang Mai",
					contactId: null,
					countryCode: "TH",
					email: null,
					id: "visitor-2",
					lastSeen: "2026-03-30T08:15:00.000Z",
					latitude: null,
					longitude: null,
					name: "Beta Visitor",
					pagePath: "/docs",
				},
			]}
			onClose={() => {}}
			onRangeChange={() => {}}
			onVisitorPrefetch={() => {}}
			onVisitorSelect={() => {}}
			rangeDays={7}
			{...props}
		/>
	);
}

async function renderOverlay() {
	const { LiveVisitorsOverlay } = await modulePromise;

	return renderToStaticMarkup(<LiveVisitorsOverlay />);
}

describe("LiveVisitorsOverlayView", () => {
	it("renders the live visitor list, prefetches on hover and focus, derives globe markers from coordinate-bearing visitors, and opens detail on row click", async () => {
		const selectedVisitorIds: string[] = [];
		const prefetchedVisitorIds: string[] = [];
		const html = await renderView({
			onVisitorPrefetch: (visitorId) => {
				prefetchedVisitorIds.push(visitorId);
			},
			onVisitorSelect: (visitorId) => {
				selectedVisitorIds.push(visitorId);
			},
		});

		expect(html).toContain('data-slot="live-visitors-overlay"');
		expect(html).toContain('data-slot="mock-inbox-analytics-display"');
		expect(html).toContain(
			'data-slot="mock-inbox-analytics-desktop-header-actions"'
		);
		expect(html).toContain('data-action-icon="x"');
		expect(html).toContain('data-action-label="Close live visitors overlay"');
		expect(html).toContain('data-live-count="2"');
		expect(html).toContain('data-slot="live-visitors-list"');
		expect(html).toContain(">Alpha Visitor<");
		expect(html).toContain(">/pricing<");
		expect(html).toContain(">Beta Visitor<");
		expect(html).toContain(">/docs<");
		expect(html.match(/data-slot="mock-globe-visitor"/g)?.length).toBe(1);
		expect(html).toContain('data-id="visitor-1"');
		expect(html).toContain('data-facehash-seed="Alpha Visitor"');
		expect(html).toContain('data-rotation-speed="4"');
		expect(html).not.toContain('data-id="visitor-2" data-name=');
		expect(html).not.toContain(">Live globe<");
		expect(html).not.toContain(
			"All currently connected visitors with known coordinates."
		);

		rowButtonMouseEnterHandlers[0]?.();
		rowButtonFocusHandlers[0]?.();
		rowButtonClickHandlers[0]?.();

		expect(prefetchedVisitorIds).toEqual(["visitor-1", "visitor-1"]);
		expect(selectedVisitorIds).toEqual(["visitor-1"]);
		expect(avatarProps[0]).toMatchObject({
			fallbackName: "Alpha Visitor",
			lastOnlineAt: "2026-03-30T08:30:00.000Z",
			status: "online",
			tooltipContent: null,
			url: "https://example.com/visitor-1.png",
		});
	});

	it("renders the empty state when there are no live visitors", async () => {
		const html = await renderView({
			livePresence: {
				count: 0,
				isFetching: false,
				isLoading: false,
			},
			liveVisitors: [],
		});

		expect(html).toContain("No live connected visitors right now.");
		expect(html).toContain('data-slot="live-visitors-empty-state"');
	});
});

describe("LiveVisitorsOverlay", () => {
	it("generates fallback visitor names for blank live names, prefetches on row hover/focus, and passes the conversation-style avatar inputs", async () => {
		const { generateVisitorName } = await import("@/lib/visitors");

		resetState();
		liveVisitorsOverlayState.isOpen = true;
		liveVisitorsQueryState.data = [
			{
				attribution_channel: null,
				city: null,
				contactId: null,
				country_code: null,
				email: null,
				entity_id: "visitor-blank",
				entity_type: "visitor",
				image: "",
				last_seen: "2026-03-31T08:30:00.000Z",
				latitude: 13.7563,
				longitude: 100.5018,
				name: "   ",
				page_path: "/pricing",
			},
		];

		const html = await renderOverlay();
		const generatedName = generateVisitorName("visitor-blank");

		expect(html).toContain(`>${generatedName}<`);
		expect(html).toContain(`data-facehash-seed="${generatedName}"`);
		expect(avatarProps[0]).toMatchObject({
			fallbackName: generatedName,
			lastOnlineAt: "2026-03-31T08:30:00.000Z",
			status: "online",
			tooltipContent: null,
			url: null,
		});

		rowButtonMouseEnterHandlers[0]?.();
		rowButtonFocusHandlers[0]?.();
		rowButtonClickHandlers[0]?.();

		expect(prefetchDetailCalls).toEqual([
			{ id: "visitor-blank", type: "visitor" },
			{ id: "visitor-blank", type: "visitor" },
		]);
		expect(openVisitorDetailCalls).toEqual(["visitor-blank"]);
	});

	it("renders identified live contacts immediately while keeping visitor-mode detail opening", async () => {
		resetState();
		liveVisitorsOverlayState.isOpen = true;
		liveVisitorsQueryState.data = [
			{
				attribution_channel: "referral",
				city: "Bangkok",
				contactId: "contact-9",
				country_code: "TH",
				email: "identified@example.com",
				entity_id: "visitor-identified",
				entity_type: "visitor",
				image: "https://example.com/identified.png",
				last_seen: "2026-03-31T08:30:00.000Z",
				latitude: 13.7563,
				longitude: 100.5018,
				name: "Identified Contact",
				page_path: "/pricing",
			},
		];

		const html = await renderOverlay();

		expect(html).toContain(">Identified Contact<");
		expect(avatarProps[0]).toMatchObject({
			fallbackName: "Identified Contact",
			url: "https://example.com/identified.png",
		});

		rowButtonClickHandlers[0]?.();

		expect(openVisitorDetailCalls).toEqual(["visitor-identified"]);
	});
});
