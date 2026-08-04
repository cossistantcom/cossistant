import { describe, expect, it, mock } from "bun:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";

let authState: {
	data: { user?: { id: string } } | null;
	isPending: boolean;
} = {
	data: null,
	isPending: true,
};

mock.module("next/link", () => ({
	default: ({
		children,
		href,
		...props
	}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
		children: React.ReactNode;
		href: string;
	}) => (
		<a href={href} {...props}>
			{children}
		</a>
	),
}));

mock.module("@/components/ui/button", () => ({
	Button: ({
		children,
		className,
		variant,
		size,
		asChild,
		...props
	}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
		asChild?: boolean;
		size?: string;
		variant?: string;
	}) => (
		<button className={className} {...props}>
			{children}
		</button>
	),
	buttonVariants: ({ variant }: { variant?: string } = {}) =>
		`button-${variant ?? "default"}`,
}));

mock.module("@/components/ui/topbar-button", () => ({
	topbarButtonLinkClassName: "topbar-button",
	TopbarButton: ({
		children,
		href,
	}: {
		children: React.ReactNode;
		href: string;
	}) => (
		<a data-slot="topbar-button" href={href}>
			{children}
		</a>
	),
}));

mock.module("@/lib/auth/client", () => ({
	authClient: {
		useSession: () => authState,
	},
}));

mock.module("./cta-button", () => ({
	CtaButton: () => (
		<a data-slot="cta-button" href="/sign-up">
			Sign up
		</a>
	),
}));

const modulePromise = import("./dashboard-button");

async function renderDashboardButton() {
	const { DashboardButton } = await modulePromise;
	return renderToStaticMarkup(<DashboardButton />);
}

async function renderDashboardButtonLiveContent(
	isPending: boolean,
	isSignedIn: boolean
) {
	const { DashboardButtonLiveContent } = await modulePromise;
	return renderToStaticMarkup(
		<DashboardButtonLiveContent isPending={isPending} isSignedIn={isSignedIn} />
	);
}

const stableShellSlots = [
	'data-slot="dashboard-button-shell"',
	'data-slot="dashboard-button-reserve"',
	'data-slot="dashboard-button-reserve-login"',
	'data-slot="dashboard-button-reserve-signup"',
	'data-slot="dashboard-button-live"',
];

describe("DashboardButton", () => {
	it("keeps the stable auth shell while pending", async () => {
		authState = {
			data: null,
			isPending: true,
		};

		const html = await renderDashboardButton();

		for (const slot of stableShellSlots) {
			expect(html).toContain(slot);
		}
		expect(html).toContain('data-slot="dashboard-button-state-pending"');
		expect(html).toContain('data-slot="dashboard-button-skeleton"');
		expect(html).not.toContain('href="/login"');
		expect(html).not.toContain('href="/select"');
	});

	it("keeps the server render pending when auth is already signed out", async () => {
		authState = {
			data: null,
			isPending: false,
		};

		const html = await renderDashboardButton();

		for (const slot of stableShellSlots) {
			expect(html).toContain(slot);
		}
		expect(html).toContain('data-slot="dashboard-button-state-pending"');
		expect(html).not.toContain('href="/login"');
		expect(html).not.toContain('href="/sign-up"');
		expect(html).not.toContain('href="/select"');
	});

	it("renders login and sign up from the hydrated signed-out state", async () => {
		const html = await renderDashboardButtonLiveContent(false, false);

		expect(html).toContain('data-slot="dashboard-button-state-signed-out"');
		expect(html).toContain('href="/login"');
		expect(html).toContain('href="/sign-up"');
		expect(html).not.toContain('href="/select"');
	});

	it("renders the dashboard link from the hydrated signed-in state", async () => {
		const html = await renderDashboardButtonLiveContent(false, true);

		expect(html).toContain('data-slot="dashboard-button-state-signed-in"');
		expect(html).toContain('href="/select"');
		expect(html).not.toContain('href="/login"');
	});
});
