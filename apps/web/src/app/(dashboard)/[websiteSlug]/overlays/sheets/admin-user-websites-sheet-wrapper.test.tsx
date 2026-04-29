import { describe, expect, it, mock } from "bun:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/link", () => ({
	default: ({
		children,
		href,
	}: {
		children: React.ReactNode;
		href: string;
	}) => <a href={href}>{children}</a>,
}));

mock.module("@/components/ui/alert", () => ({
	Alert: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	AlertDescription: ({ children }: { children: React.ReactNode }) => (
		<p>{children}</p>
	),
	AlertTitle: ({ children }: { children: React.ReactNode }) => (
		<strong>{children}</strong>
	),
}));

mock.module("@/components/ui/avatar", () => ({
	Avatar: ({ fallbackName }: { fallbackName: string }) => (
		<span data-slot="avatar">{fallbackName}</span>
	),
}));

mock.module("@/components/ui/badge", () => ({
	Badge: ({ children }: { children: React.ReactNode }) => (
		<span data-slot="badge">{children}</span>
	),
}));

mock.module("@/components/ui/scroll-area", () => ({
	ScrollArea: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
}));

mock.module("@/components/ui/sheet", () => ({
	Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SheetContent: ({ children }: { children: React.ReactNode }) => (
		<section>{children}</section>
	),
	SheetDescription: ({ children }: { children: React.ReactNode }) => (
		<p>{children}</p>
	),
	SheetHeader: ({ children }: { children: React.ReactNode }) => (
		<header>{children}</header>
	),
	SheetTitle: ({ children }: { children: React.ReactNode }) => (
		<h2>{children}</h2>
	),
}));

mock.module("@/components/ui/spinner", () => ({
	Spinner: () => <span>Loading</span>,
}));

mock.module("@/components/ui/website-image", () => ({
	WebsiteImage: ({ name }: { name: string }) => (
		<span data-slot="website-image">{name}</span>
	),
}));

const modulePromise = import("./admin-user-websites-sheet-wrapper");

describe("AdminUserWebsitesSheet", () => {
	it("renders the selected user's organizations and websites inside a sheet", async () => {
		const { AdminUserWebsitesSheet } = await modulePromise;

		const html = renderToStaticMarkup(
			<AdminUserWebsitesSheet
				isError={false}
				isLoading={false}
				onOpenChange={() => {}}
				open
				organizations={[
					{
						id: "org-1",
						name: "Acme",
						slug: "acme",
						role: "admin",
						joinedAt: "2026-04-01T10:00:00.000Z",
						websites: [
							{
								id: "site-1",
								name: "Acme Support",
								slug: "acme-support",
								domain: "acme.com",
								logoUrl: null,
								accessSource: "organization",
								createdAt: "2026-04-02T10:00:00.000Z",
							},
						],
					},
				]}
				user={{
					id: "user-1",
					name: "Ada Lovelace",
					email: "ada@example.com",
					image: null,
					role: "user",
					banned: false,
					banReason: null,
					banExpires: null,
					createdAt: "2026-04-01T10:00:00.000Z",
					updatedAt: "2026-04-01T10:00:00.000Z",
					lastSeenAt: null,
				}}
			/>
		);

		expect(html).toContain("User websites");
		expect(html).toContain("ada@example.com");
		expect(html).toContain("Acme");
		expect(html).toContain("Acme Support");
		expect(html).toContain("acme.com");
		expect(html).toContain('href="/acme-support"');
	});
});
