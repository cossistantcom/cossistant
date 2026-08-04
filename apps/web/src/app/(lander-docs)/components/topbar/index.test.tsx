import { describe, expect, it, mock } from "bun:test";
import React, { cloneElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

declare global {
	var __landerDocsTestPathname: string | undefined;
}

mock.module("next/navigation", () => ({
	usePathname: () => globalThis.__landerDocsTestPathname ?? "/docs/quickstart",
}));

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
		...props
	}: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
		<button {...props} type={props.type ?? "button"}>
			{children}
		</button>
	),
}));

mock.module("@/components/ui/logo", () => ({
	Logo: (props: React.HTMLAttributes<HTMLSpanElement>) => (
		<span data-slot="logo-mark" {...props} />
	),
	LogoText: (props: React.HTMLAttributes<HTMLSpanElement>) => (
		<span data-slot="logo-text" {...props} />
	),
}));

mock.module("@/components/ui/sheet", () => ({
	Sheet: ({ children }: { children: React.ReactNode }) => (
		<div data-slot="sheet">{children}</div>
	),
	SheetClose: ({
		asChild,
		children,
	}: {
		asChild?: boolean;
		children: React.ReactElement;
	}) =>
		asChild ? (
			cloneElement(children as React.ReactElement<Record<string, string>>, {
				"data-slot": "sheet-close",
			})
		) : (
			<button data-slot="sheet-close" type="button">
				{children}
			</button>
		),
	SheetContent: ({
		children,
		className,
	}: {
		children: React.ReactNode;
		className?: string;
	}) => (
		<div className={className} data-slot="sheet-content">
			{children}
		</div>
	),
	SheetDescription: ({ children }: { children: React.ReactNode }) => (
		<div data-slot="sheet-description">{children}</div>
	),
	SheetHeader: ({ children }: { children: React.ReactNode }) => (
		<div data-slot="sheet-header">{children}</div>
	),
	SheetTitle: ({ children }: { children: React.ReactNode }) => (
		<div data-slot="sheet-title">{children}</div>
	),
	SheetTrigger: ({ children }: { children: React.ReactNode }) => (
		<div data-slot="sheet-trigger">{children}</div>
	),
}));

mock.module("@/components/ui/topbar-button", () => ({
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

mock.module("@/lib/source", () => ({
	blog: {
		getPages: () => [],
	},
	changelog: {
		getPages: () => [],
	},
	source: {
		getPages: () => [],
		pageTree: {
			children: [],
		},
	},
}));

mock.module("../full-width-border", () => ({
	FullWidthBorder: ({ className }: { className?: string }) => (
		<div className={className} data-slot="full-width-border" />
	),
}));

mock.module("./search-bar", () => ({
	SearchBar: () => (
		<button data-slot="topbar-search-trigger" type="button">
			Search...
		</button>
	),
}));

mock.module("./lazy-mobile-menu", () => ({
	LazyTopbarMobileMenu: ({
		children,
		navigationLinks,
	}: {
		children: React.ReactNode;
		navigationLinks: ReadonlyArray<{ href: string; label: string }>;
	}) => (
		<div
			className="inset-0 h-svh w-screen rounded-none"
			data-slot="lazy-mobile-menu"
		>
			<button data-slot="topbar-mobile-menu-trigger" type="button">
				Open navigation menu
			</button>
			<div data-slot="topbar-mobile-sheet-actions">{children}</div>
			<nav data-slot="docs-mobile-navigation">
				Documentation
				{navigationLinks.map((link) => (
					<a href={link.href} key={link.href}>
						{link.label}
					</a>
				))}
			</nav>
		</div>
	),
}));

const modulePromise = import("./index");

async function renderTopBar() {
	const { TopBar } = await modulePromise;

	return renderToStaticMarkup(
		<React.StrictMode>
			<TopBar>
				<a href="/login">Log in</a>
			</TopBar>
		</React.StrictMode>
	);
}

describe("TopBar", () => {
	it("renders the mobile menu trigger in the right-side controls after search", async () => {
		globalThis.__landerDocsTestPathname = "/docs/quickstart";

		const html = await renderTopBar();

		expect(html).toContain('data-slot="topbar-controls"');
		expect(html).toContain('data-slot="topbar-search-trigger"');
		expect(html).toContain('data-slot="topbar-mobile-menu-trigger"');
		expect(html).toContain('data-slot="docs-mobile-navigation"');
		expect(html).toContain('data-slot="topbar-mobile-sheet-actions"');
		expect(html).toContain("Documentation");

		const controlsStart = html.indexOf('data-slot="topbar-controls"');
		const searchIndex = html.indexOf('data-slot="topbar-search-trigger"');
		const menuIndex = html.indexOf('data-slot="topbar-mobile-menu-trigger"');
		const mobileActionsIndex = html.indexOf(
			'data-slot="topbar-mobile-sheet-actions"'
		);
		const loginIndex = html.indexOf('href="/login"');
		const docsMobileIndex = html.indexOf('data-slot="docs-mobile-navigation"');

		expect(controlsStart).toBeGreaterThanOrEqual(0);
		expect(searchIndex).toBeGreaterThan(controlsStart);
		expect(menuIndex).toBeGreaterThan(searchIndex);
		expect(mobileActionsIndex).toBeGreaterThan(menuIndex);
		expect(loginIndex).toBeGreaterThan(mobileActionsIndex);
		expect(docsMobileIndex).toBeGreaterThan(loginIndex);
		expect(html).toContain("inset-0");
		expect(html).toContain("h-svh");
		expect(html).toContain("w-screen");
		expect(html).toContain("rounded-none");
		expect(html).not.toContain("max-h-[50svh]");
	});
});
