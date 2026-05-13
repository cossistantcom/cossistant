import { describe, expect, it, mock } from "bun:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const registeredHotkeys: Array<{
	handler: (...args: any[]) => void;
	keys: string | string[];
}> = [];
const renderedButtonHandlers: Array<() => void> = [];
const routerPushCalls: string[] = [];
const routerRefreshCalls: string[] = [];
const closeDetailCalls: string[] = [];
const closeLiveVisitorsCalls: string[] = [];
const closeSupportOverlayCalls: string[] = [];
const setIsChangelogOpenCalls: boolean[] = [];
const stopImpersonatingCalls: string[] = [];
const authStoreNotifyCalls: string[] = [];
const toastSuccessCalls: string[] = [];
const toastErrorCalls: string[] = [];

let pathname = "/acme/inbox";
let isChangelogOpen = false;
let isLiveVisitorsOverlayOpen = false;
let isSupportOverlayOpen = false;
let currentUserRole: string | null = null;
let sessionData: { session: { impersonatedBy: string | null } } | null = {
	session: { impersonatedBy: null },
};
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
		refresh: () => {
			routerRefreshCalls.push("refresh");
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
	useMutation: (options: { onSuccess?: () => void } = {}) => ({
		isPending: false,
		mutate: () => {
			stopImpersonatingCalls.push("stop");
			options.onSuccess?.();
		},
	}),
	useQuery: (options?: { queryKey?: unknown[] }) => {
		if (options?.queryKey?.[0] === "user.me") {
			return {
				data: {
					role: currentUserRole,
				},
			};
		}

		return {
			data: {
				onboardingCompletedAt: "2026-03-10T00:00:00.000Z",
			},
		};
	},
}));

mock.module("@cossistant/react/feedback", () => ({
	useFeedbackForm: () => ({
		availableTopics: [],
		canSubmit: false,
		comment: "",
		done: () => {},
		fields: {
			comment: {
				error: null,
				handleBlur: () => {},
				isDirty: false,
				isMissing: false,
				isTouched: false,
			},
			rating: {
				displayValue: null,
				error: null,
				handleBlur: () => {},
				isDirty: false,
				isMissing: false,
				isTouched: false,
				selectedValue: "",
			},
			topic: {
				error: null,
				handleBlur: () => {},
				isDirty: false,
				isMissing: false,
				isTouched: false,
			},
		},
		handleCommentChange: () => {},
		handleOpenChange: () => {},
		handleRatingHoverChange: () => {},
		handleRatingSelect: () => {},
		handleSubmit: async () => {},
		handleTopicChange: () => {},
		hasSubmitted: false,
		hoveredRating: null,
		isCommentMissing: false,
		isPending: false,
		isRatingMissing: false,
		isTopicMissing: false,
		open: false,
		rating: null,
		sendAnother: () => {},
		submit: {
			canAttemptSubmit: false,
			canSubmit: false,
			disabled: true,
			label: "Rating needed",
		},
		submitError: null,
		topic: "",
	}),
	useSubmitFeedback: () => ({
		error: null,
		isPending: false,
		mutateAsync: async () => ({
			feedback: {
				id: "feedback_123",
			},
		}),
		reset: () => {},
	}),
}));

mock.module("@/components/changelog-notification", () => ({
	ChangelogNotification: ({
		children,
		open,
	}: {
		children: React.ReactNode;
		open: boolean;
	}) => <div data-changelog-open={String(open)}>{children}</div>,
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

mock.module("@/hooks/use-support-overlay-state", () => ({
	useSupportOverlayState: () => ({
		closeSupportOverlay: () => {
			closeSupportOverlayCalls.push("close");
			return Promise.resolve(new URLSearchParams());
		},
		isOpen: isSupportOverlayOpen,
	}),
}));

mock.module("@/lib/auth/client", () => ({
	authClient: {
		$store: {
			notify: (signal: string) => {
				authStoreNotifyCalls.push(signal);
			},
		},
		useSession: () => ({
			data: sessionData,
		}),
	},
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
		admin: {
			stopImpersonating: {
				mutationOptions: (options: unknown) => options,
			},
		},
		aiAgent: {
			get: {
				queryOptions: () => ({
					queryKey: ["aiAgent"],
				}),
			},
		},
		user: {
			me: {
				queryOptions: () => ({
					queryKey: ["user.me"],
				}),
			},
		},
	}),
}));

mock.module("sonner", () => ({
	toast: {
		error: (message: string) => {
			toastErrorCalls.push(message);
		},
		success: (message: string) => {
			toastSuccessCalls.push(message);
		},
	},
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

function resetState() {
	registeredHotkeys.length = 0;
	renderedButtonHandlers.length = 0;
	routerPushCalls.length = 0;
	routerRefreshCalls.length = 0;
	closeDetailCalls.length = 0;
	closeLiveVisitorsCalls.length = 0;
	closeSupportOverlayCalls.length = 0;
	setIsChangelogOpenCalls.length = 0;
	stopImpersonatingCalls.length = 0;
	authStoreNotifyCalls.length = 0;
	toastSuccessCalls.length = 0;
	toastErrorCalls.length = 0;
	pathname = "/acme/inbox";
	isChangelogOpen = false;
	isLiveVisitorsOverlayOpen = false;
	isSupportOverlayOpen = false;
	currentUserRole = null;
	sessionData = { session: { impersonatedBy: null } };
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
	const { NavigationTopbar } = await import(`./index?${Math.random()}`);
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

	it("shows the support back button and closes the overlay on click", async () => {
		resetState();
		isSupportOverlayOpen = true;

		const html = await renderTopbar({ latestRelease: null });

		expect(html).toContain('data-slot="icon-arrow-left"');
		expect(html).not.toContain('data-slot="logo"');

		renderedButtonHandlers[0]?.();

		expect(closeSupportOverlayCalls).toEqual(["close"]);
		expect(closeLiveVisitorsCalls).toEqual([]);
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

	it("closes the support overlay on Escape before inbox navigation", async () => {
		resetState();
		pathname = "/acme/contacts";
		isSupportOverlayOpen = true;

		await renderTopbar();

		const escapeHotkey = registeredHotkeys.find(
			(entry) => entry.keys === "escape"
		);

		escapeHotkey?.handler({
			preventDefault() {},
			stopPropagation() {},
		});

		expect(closeSupportOverlayCalls).toEqual(["close"]);
		expect(closeLiveVisitorsCalls).toEqual([]);
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

	it("closes the support overlay before the live visitors overlay on Escape", async () => {
		resetState();
		pathname = "/acme/contacts";
		isSupportOverlayOpen = true;
		isLiveVisitorsOverlayOpen = true;

		await renderTopbar({ latestRelease: null });

		const escapeHotkey = registeredHotkeys.find(
			(entry) => entry.keys === "escape"
		);

		escapeHotkey?.handler({
			preventDefault() {},
			stopPropagation() {},
		});

		expect(closeSupportOverlayCalls).toEqual(["close"]);
		expect(closeLiveVisitorsCalls).toEqual([]);
		expect(routerPushCalls).toEqual([]);
	});

	it("closes the support overlay before the detail overlay on Escape", async () => {
		resetState();
		pathname = "/acme/contacts";
		isSupportOverlayOpen = true;
		activeDetail = {
			type: "contact",
			contactId: "contact-1",
		};

		await renderTopbar({ latestRelease: null });

		const escapeHotkey = registeredHotkeys.find(
			(entry) => entry.keys === "escape"
		);

		escapeHotkey?.handler({
			preventDefault() {},
			stopPropagation() {},
		});

		expect(closeSupportOverlayCalls).toEqual(["close"]);
		expect(closeDetailCalls).toEqual([]);
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

	it("renders dashboard feedback without the legacy support control", async () => {
		resetState();

		const html = await renderTopbar({ latestRelease: null });

		expect(html).toContain("Feedback?");
		expect(html).not.toContain("Support");
	});

	it("shows the admin link only for global admins", async () => {
		resetState();
		currentUserRole = "admin";

		const adminHtml = await renderTopbar({ latestRelease: null });

		expect(adminHtml).toContain('href="/acme/admin"');

		resetState();
		currentUserRole = "user";

		const userHtml = await renderTopbar({ latestRelease: null });

		expect(userHtml).not.toContain('href="/acme/admin"');
	});

	it("shows and wires the impersonation stop control", async () => {
		resetState();
		sessionData = {
			session: {
				impersonatedBy: "admin-user",
			},
		};

		const html = await renderTopbar({ latestRelease: null });

		expect(html).toContain("Impersonating");

		renderedButtonHandlers[0]?.();

		expect(stopImpersonatingCalls).toEqual(["stop"]);
		expect(authStoreNotifyCalls).toEqual(["$sessionSignal"]);
		expect(toastSuccessCalls).toEqual(["Stopped impersonating"]);
		expect(routerRefreshCalls).toEqual(["refresh"]);
	});
});
