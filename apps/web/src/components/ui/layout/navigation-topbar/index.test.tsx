import { describe, expect, it, mock } from "bun:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const registeredHotkeys: Array<{
	handler: (...args: any[]) => void;
	keys: string | string[];
}> = [];
const renderedButtonHandlers: Array<() => void> = [];
const routerPushCalls: string[] = [];
const closeDetailCalls: string[] = [];
const closeLiveVisitorsCalls: string[] = [];
const setIsChangelogOpenCalls: boolean[] = [];

let pathname = "/acme/inbox";
let isChangelogOpen = false;
let isLiveVisitorsOverlayOpen = false;
let activeDetail:
	| { type: "contact"; contactId: string }
	| {
			type: "visitor";
			visitorId: string;
	  }
	| null = null;

mock.module("react-hotkeys-hook", () => ({
	useHotkeys: (keys: string | string[], handler: (...args: any[]) => void) => {
		registeredHotkeys.push({ handler, keys });
	},
}));

mock.module("next/navigation", () => ({
	usePathname: () => pathname,
	useRouter: () => ({
		push: (href: string) => {
			routerPushCalls.push(href);
		},
	}),
}));

mock.module("next/link", () => ({
	default: ({
		children,
		href,
	}: {
		children: React.ReactNode;
		href: string;
	}) => <a href={href}>{children}</a>,
}));

mock.module("motion/react", () => ({
	AnimatePresence: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
	motion: {
		div: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	},
}));

mock.module("@tanstack/react-query", () => ({
	useQuery: () => ({
		data: {
			onboardingCompletedAt: "2026-03-10T00:00:00.000Z",
		},
	}),
}));

mock.module("@plasma/next/support", () => {
	function Support({ children }: { children: React.ReactNode }) {
		return <div>{children}</div>;
	}

	Support.Trigger = ({
		children,
	}: {
		children:
			| ((props: Record<string, never>) => React.ReactNode)
			| React.ReactNode;
	}) => <div>{typeof children === "function" ? children({}) : children}</div>;

	return { Support };
});

mock.module("@/components/changelog-notification", () => ({
	ChangelogNotification: ({
		children,
		open,
	}: {
		children: React.ReactNode;
		open: boolean;
	}) => <div data-changelog-open={String(open)}>{children}</div>,
}));

mock.module("@/components/support/custom-trigger", () => ({
	DashboardTriggerContent: () => <span>Support</span>,
}));

mock.module("@/components/ui/button", () => ({
	Button: ({
		children,
		onClick,
		...props
	}: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
		if (onClick) {
			renderedButtonHandlers.push(() => {
				onClick({
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

mock.module("@/contexts/website", () => ({
	useWebsite: () => ({
		slug: "acme",
	}),
}));

mock.module("@/hooks/use-contact-visitor-detail-state", () => ({
	useContactVisitorDetailState: () => ({
		activeDetail,
		closeDetailPage: () => {
			closeDetailCalls.push("close");
			return Promise.resolve([]);
		},
	}),
}));

mock.module("@/hooks/use-live-visitors-overlay-state", () => ({
	useLiveVisitorsOverlayState: () => ({
		closeLiveVisitorsOverlay: () => {
			closeLiveVisitorsCalls.push("close");
			return Promise.resolve(new URLSearchParams());
		},
		isOpen: isLiveVisitorsOverlayOpen,
	}),
}));

mock.module("./use-changelog-overlay-state", () => ({
	useChangelogOverlayState: () => ({
		isChangelogOpen,
		setIsChangelogOpen: (open: boolean) => {
			isChangelogOpen = open;
			setIsChangelogOpenCalls.push(open);
		},
	}),
}));

mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		aiAgent: {
			get: {
				queryOptions: () => ({
					queryKey: ["aiAgent"],
				}),
			},
		},
	}),
}));

mock.module("../../icons", () => ({
	__esModule: true,
	default: ({ name }: { name: string }) => <span data-slot={`icon-${name}`} />,
}));

mock.module("../../logo", () => ({
	Logo: () => <span data-slot="logo" />,
}));

mock.module("../../tooltip", () => ({
	TooltipOnHover: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
}));

mock.module("./topbar-item", () => ({
	TopbarItem: ({
		children,
		href,
	}: {
		children: React.ReactNode;
		href: string;
	}) => <a href={href}>{children}</a>,
}));

const modulePromise = import("./index");

function resetState() {
	registeredHotkeys.length = 0;
	renderedButtonHandlers.length = 0;
	routerPushCalls.length = 0;
	closeDetailCalls.length = 0;
	closeLiveVisitorsCalls.length = 0;
	setIsChangelogOpenCalls.length = 0;
	pathname = "/acme/inbox";
	isChangelogOpen = false;
	isLiveVisitorsOverlayOpen = false;
	activeDetail = null;
}

async function renderTopbar(
	props: Partial<{
		changelogContent: React.ReactNode;
		latestRelease: {
			date: string;
			description: string;
			tinyExcerpt: string;
			version: string;
		} | null;
	}> = {}
) {
	const { NavigationTopbar } = await modulePromise;
	return renderToStaticMarkup(
		<NavigationTopbar
			changelogContent={<div>Latest changes</div>}
			latestRelease={{
				date: "2026-03-11",
				description: "Improved changelog overlay",
				tinyExcerpt: "New release available",
				version: "0.1.2",
			}}
			{...props}
		/>
	);
}

describe("NavigationTopbar", () => {
	it("shows the detail back button instead of the logo and closes the detail page on click", async () => {
		resetState();
		activeDetail = {
			type: "contact",
			contactId: "contact-1",
		};

		const html = await renderTopbar();

		expect(html).toContain('data-slot="icon-arrow-left"');
		expect(html).not.toContain('data-slot="logo"');

		renderedButtonHandlers[0]?.();

		expect(closeDetailCalls).toEqual(["close"]);
		expect(closeLiveVisitorsCalls).toEqual([]);
		expect(routerPushCalls).toEqual([]);
	});

	it("shows the changelog back button instead of the logo and closes the changelog on click", async () => {
		resetState();
		isChangelogOpen = true;

		const html = await renderTopbar();

		expect(html).toContain('data-slot="icon-arrow-left"');
		expect(html).not.toContain('data-slot="logo"');

		renderedButtonHandlers[0]?.();

		expect(setIsChangelogOpenCalls).toEqual([false]);
		expect(closeDetailCalls).toEqual([]);
		expect(closeLiveVisitorsCalls).toEqual([]);
		expect(routerPushCalls).toEqual([]);
	});

	it("shows the live visitors back button and closes the overlay on click", async () => {
		resetState();
		isLiveVisitorsOverlayOpen = true;

		const html = await renderTopbar({ latestRelease: null });

		expect(html).toContain('data-slot="icon-arrow-left"');
		expect(html).not.toContain('data-slot="logo"');

		renderedButtonHandlers[0]?.();

		expect(closeLiveVisitorsCalls).toEqual(["close"]);
		expect(closeDetailCalls).toEqual([]);
		expect(routerPushCalls).toEqual([]);
	});

	it("closes the detail page on Escape before any inbox navigation", async () => {
		resetState();
		pathname = "/acme/contacts";
		activeDetail = {
			type: "visitor",
			visitorId: "visitor-1",
		};

		await renderTopbar();

		const escapeHotkey = registeredHotkeys.find(
			(entry) => entry.keys === "escape"
		);

		escapeHotkey?.handler({
			preventDefault() {},
			stopPropagation() {},
		});

		expect(closeDetailCalls).toEqual(["close"]);
		expect(closeLiveVisitorsCalls).toEqual([]);
		expect(routerPushCalls).toEqual([]);
	});

	it("closes the live visitors overlay on Escape before inbox navigation", async () => {
		resetState();
		pathname = "/acme/contacts";
		isLiveVisitorsOverlayOpen = true;

		await renderTopbar();

		const escapeHotkey = registeredHotkeys.find(
			(entry) => entry.keys === "escape"
		);

		escapeHotkey?.handler({
			preventDefault() {},
			stopPropagation() {},
		});

		expect(closeLiveVisitorsCalls).toEqual(["close"]);
		expect(closeDetailCalls).toEqual([]);
		expect(routerPushCalls).toEqual([]);
	});

	it("closes the changelog on Escape before any detail-page or inbox navigation", async () => {
		resetState();
		pathname = "/acme/contacts";
		isChangelogOpen = true;
		activeDetail = {
			type: "visitor",
			visitorId: "visitor-1",
		};

		await renderTopbar();

		const escapeHotkey = registeredHotkeys.find(
			(entry) => entry.keys === "escape"
		);

		escapeHotkey?.handler({
			preventDefault() {},
			stopPropagation() {},
		});

		expect(setIsChangelogOpenCalls).toEqual([false]);
		expect(closeDetailCalls).toEqual([]);
		expect(closeLiveVisitorsCalls).toEqual([]);
		expect(routerPushCalls).toEqual([]);
	});

	it("closes the detail overlay before the live visitors overlay on Escape", async () => {
		resetState();
		pathname = "/acme/contacts";
		activeDetail = {
			type: "visitor",
			visitorId: "visitor-1",
		};
		isLiveVisitorsOverlayOpen = true;

		await renderTopbar({ latestRelease: null });

		const escapeHotkey = registeredHotkeys.find(
			(entry) => entry.keys === "escape"
		);

		escapeHotkey?.handler({
			preventDefault() {},
			stopPropagation() {},
		});

		expect(closeDetailCalls).toEqual(["close"]);
		expect(closeLiveVisitorsCalls).toEqual([]);
		expect(routerPushCalls).toEqual([]);
	});

	it("keeps the existing logo and inbox-back states when no detail page is active", async () => {
		resetState();
		const inboxHtml = await renderTopbar({ latestRelease: null });

		expect(inboxHtml).toContain('data-slot="logo"');
		expect(inboxHtml).not.toContain('data-slot="icon-arrow-left"');

		resetState();
		pathname = "/acme/contacts";
		const nonInboxHtml = await renderTopbar({ latestRelease: null });

		expect(nonInboxHtml).toContain('data-slot="icon-arrow-left"');
		expect(nonInboxHtml).not.toContain('data-slot="logo"');

		const escapeHotkey = registeredHotkeys.find(
			(entry) => entry.keys === "escape"
		);

		escapeHotkey?.handler({
			preventDefault() {},
			stopPropagation() {},
		});

		expect(routerPushCalls).toEqual(["/acme/inbox"]);
		expect(closeDetailCalls).toEqual([]);
		expect(closeLiveVisitorsCalls).toEqual([]);
	});
});
